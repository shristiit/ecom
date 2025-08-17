"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/app/Components/textarea";
import { X } from "lucide-react";

function colorSkuSuffix(name: string) {
  // e.g., "Dark Navy" -> "DARKNAVY" -> "DARNAV" -> "DARNAV" (max 6)
  const letters = name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return letters.slice(0, 6) || "CLR";
}

export default function NewProductPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [colorInput, setColorInput] = useState("");
  const [colors, setColors] = useState<string[]>([]);

  const [form, setForm] = useState({
    // NEW: style number is required by backend
    styleNumber: "",
    // variant sku (used for the FIRST color variant)
    sku: "",
    name: "",
    category: "",
    supplier: "",
    season: "",
    wholesalePrice: "" as number | string, // £
    rrp: "" as number | string,            // £
    description: "",
  });

  const update = (k: keyof typeof form, v: any) =>
    setForm((f) => ({ ...f, [k]: v }));

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setInfo(null);

    try {
      if (!form.styleNumber.trim()) {
        throw new Error("Style Number is required");
      }
      if (!form.name.trim()) {
        throw new Error("Name is required");
      }

      const rrpNumber = form.rrp === "" ? 0 : Number(form.rrp);
      if (Number.isNaN(rrpNumber) || rrpNumber < 0) {
        throw new Error("RRP must be a non-negative number");
      }
      const wholesaleNumber =
        form.wholesalePrice === "" ? 0 : Number(form.wholesalePrice);
      if (Number.isNaN(wholesaleNumber) || wholesaleNumber < 0) {
        throw new Error("Wholesale must be a non-negative number");
      }

      // Build DeepCreate payload
      const colorList = colors.length ? colors : ["Default"];
      const style = form.styleNumber.trim().toUpperCase();

      const variants = colorList.map((c, idx) => {
        const suffix = colorSkuSuffix(c);
        const sku =
          idx === 0 && form.sku.trim()
            ? form.sku.trim().toUpperCase()
            : `${style}-${suffix}`;

        // simple unique-ish barcode per variant/size; replace with your real barcode later
        const barcode = `${style}-${suffix}-OS-${Date.now()
          .toString(36)
          .slice(-4)
          .toUpperCase()}`;

        return {
          sku,
          color: { name: c, code: undefined as string | undefined },
          media: [] as Array<{ url: string; type: "image" | "video"; isPrimary?: boolean }>,
          sizes: [
            {
              label: "OS", // One Size default; extend UI later
              barcode,
              inventory: [
                { location: "WH-DEFAULT", onHand: 0, onOrder: 0, reserved: 0 },
              ],
            },
          ],
        };
      });

      const payload = {
        product: {
          styleNumber: style,
          title: form.name.trim(),
          description: form.description || undefined,
          // backend expects MINOR units (pence)
          price: Math.round(rrpNumber * 100),
          attributes: {
            category: form.category || undefined,
            supplier: form.supplier || undefined,
            season: form.season || undefined,
            wholesalePrice: wholesaleNumber, // keep in £ for attributes (analytics)
          },
          status: "active" as const,
        },
        variants,
      };

      // Call the actual create API
      const { data: created } = await api.post("/api/products", payload);

      // created is the nested product doc; its _id is the product id
      const productId = created?._id || created?.productId;
      setInfo(
        "Created product. Note: media upload expects URLs; file uploads are not wired on this form."
      );

      // Navigate to detail page
      if (productId) {
        router.push(`/products/${productId}`);
      } else {
        // fallback to list if id not present
        router.push("/products");
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Failed to create product.";
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Create Product</h1>
        <Link href="/products" className="underline">
          Back to Products
        </Link>
      </div>

      <form onSubmit={onSave} className="space-y-6">
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* NEW: Style Number */}
          <div>
            <Label htmlFor="styleNumber">Style Number</Label>
            <Input
              id="styleNumber"
              required
              value={form.styleNumber}
              onChange={(e) => update("styleNumber", e.target.value)}
              placeholder="e.g., STY-500010"
            />
          </div>

          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              required
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Product title"
            />
          </div>

          {/* OPTIONAL: Variant SKU for first color */}
          <div>
            <Label htmlFor="sku">Variant SKU (first color)</Label>
            <Input
              id="sku"
              value={form.sku}
              onChange={(e) => update("sku", e.target.value)}
              placeholder="e.g., STY-500010-BLK"
            />
          </div>

          <div>
            <Label htmlFor="category">Category</Label>
            <Input
              id="category"
              value={form.category}
              onChange={(e) => update("category", e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="supplier">Supplier</Label>
            <Input
              id="supplier"
              value={form.supplier}
              onChange={(e) => update("supplier", e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="season">Season</Label>
            <Input
              id="season"
              value={form.season}
              onChange={(e) => update("season", e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="wholesalePrice">Wholesale (£)</Label>
            <Input
              id="wholesalePrice"
              type="number"
              step="0.01"
              value={form.wholesalePrice}
              onChange={(e) => update("wholesalePrice", e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="rrp">RRP (£)</Label>
            <Input
              id="rrp"
              type="number"
              step="0.01"
              value={form.rrp}
              onChange={(e) => update("rrp", e.target.value)}
              placeholder="e.g., 79.99"
            />
            <p className="text-xs text-muted-foreground">
              Stored as minor units (pence) in the backend.
            </p>
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={4}
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
            />
          </div>

          {/* Colors -> Variants */}
          <div className="md:col-span-2">
            <Label htmlFor="color">Color(s) → creates variants</Label>
            <div className="flex gap-2">
              <Input
                id="color"
                placeholder="type a color name then Add"
                value={colorInput}
                onChange={(e) => setColorInput(e.target.value)}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  const c = colorInput.trim();
                  if (c && !colors.includes(c)) {
                    setColors((prev) => [...prev, c]);
                  }
                  setColorInput("");
                }}
              >
                Add
              </Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {colors.map((c, idx) => (
                <span
                  key={idx}
                  className="bg-blue-200 rounded-lg flex items-center justify-between px-3 py-1 gap-2"
                >
                  {c}
                  <button
                    type="button"
                    onClick={() => setColors((prev) => prev.filter((x) => x !== c))}
                  >
                    <X />
                  </button>
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              First variant uses the SKU field (if provided). Others get auto SKUs like
              STYLE-COLOR.
            </p>
          </div>

          {/* Media note */}
          <div className="md:col-span-2">
            <Label>Media</Label>
            <p className="text-xs text-muted-foreground">
              Your backend expects media <strong>URLs</strong> per variant. File uploads are not
              wired in this form. Add media later on the product edit page.
            </p>
          </div>
        </section>

        {error && <p className="text-red-600">{error}</p>}
        {info && <p className="text-emerald-700">{info}</p>}

        <div className="flex gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Create product"}
          </Button>
        </div>
      </form>
    </div>
  );
}
