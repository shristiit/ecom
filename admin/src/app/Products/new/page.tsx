"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/app/Components/textarea";
import { Plus, Trash2, X } from "lucide-react";

/* ---------- helpers ---------- */
function colorSkuSuffix(name: string) {
  const letters = name.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return letters.slice(0, 6) || "CLR";
}
function detectMediaTypeFromName(name: string): "image" | "video" {
  const n = name.toLowerCase();
  if (/\.(mp4|mov|webm|mkv|avi|m4v)$/.test(n)) return "video";
  return "image";
}
function toMinor(pounds: number | string) {
  const n = Number(pounds);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
function rand(n = 4) {
  return Math.random().toString(36).slice(-n).toUpperCase();
}

/* ---------- types for the form ---------- */
type InvRow = { location: string; onHand: number; onOrder: number; reserved: number };
type SizeRow = { label: string; barcode: string; inventory: InvRow[] };
type VariantRow = {
  sku: string;
  status: "active" | "inactive";
  colorName: string;
  colorCode: string;
  mediaUrls: string[];       // URLs to include in deep create
  files?: FileList | null;   // optional file uploads after creation
  sizes: SizeRow[];
};

export default function NewProductPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  /* ---------- product fields ---------- */
  const [styleNumber, setStyleNumber] = useState("");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [priceGBP, setPriceGBP] = useState<string | number>("");
  const [status, setStatus] = useState<"active" | "inactive" | "draft" | "archived">("active");
  const [category, setCategory] = useState("");
  const [supplier, setSupplier] = useState("");
  const [season, setSeason] = useState("");
  const [wholesale, setWholesale] = useState<string | number>("");

  /* ---------- variants state ---------- */
  const defaultInv: InvRow = { location: "WH-DEFAULT", onHand: 0, onOrder: 0, reserved: 0 };
  const defaultSize: SizeRow = { label: "OS", barcode: "", inventory: [ { ...defaultInv } ] };
  const [variants, setVariants] = useState<VariantRow[]>([
    { sku: "", status: "active", colorName: "Default", colorCode: "", mediaUrls: [], files: null, sizes: [ { ...defaultSize } ] }
  ]);

  /* ---------- product field changes ---------- */
  function addVariant() {
    setVariants(v => [
      ...v,
      { sku: "", status: "active", colorName: "", colorCode: "", mediaUrls: [], files: null, sizes: [ { ...defaultSize } ] }
    ]);
  }
  function removeVariant(i: number) {
    setVariants(v => v.filter((_, idx) => idx !== i));
  }
  function setVariant(i: number, patch: Partial<VariantRow>) {
    setVariants(v => {
      const next = [...v];
      next[i] = { ...next[i], ...patch };
      return next;
    });
  }
  function addSize(i: number) {
    setVariants(v => {
      const next = [...v];
      next[i].sizes = [...next[i].sizes, { label: "OS", barcode: "", inventory: [ { ...defaultInv } ] }];
      return next;
    });
  }
  function removeSize(vi: number, si: number) {
    setVariants(v => {
      const next = [...v];
      next[vi].sizes = next[vi].sizes.filter((_, idx) => idx !== si);
      return next;
    });
  }
  function setSize(vi: number, si: number, patch: Partial<SizeRow>) {
    setVariants(v => {
      const next = [...v];
      next[vi].sizes[si] = { ...next[vi].sizes[si], ...patch };
      return next;
    });
  }
  function addInvRow(vi: number, si: number) {
    setVariants(v => {
      const next = [...v];
      next[vi].sizes[si].inventory = [...next[vi].sizes[si].inventory, { ...defaultInv }];
      return next;
    });
  }
  function removeInvRow(vi: number, si: number, ii: number) {
    setVariants(v => {
      const next = [...v];
      next[vi].sizes[si].inventory = next[vi].sizes[si].inventory.filter((_, idx) => idx !== ii);
      return next;
    });
  }
  function setInvRow(vi: number, si: number, ii: number, patch: Partial<InvRow>) {
    setVariants(v => {
      const next = [...v];
      const inv = next[vi].sizes[si].inventory;
      inv[ii] = { ...inv[ii], ...patch };
      return next;
    });
  }
  function addMediaUrl(vi: number, url: string) {
    const clean = url.trim();
    if (!clean) return;
    setVariants(v => {
      const next = [...v];
      if (!next[vi].mediaUrls.includes(clean)) next[vi].mediaUrls.push(clean);
      return next;
    });
  }
  function removeMediaUrl(vi: number, url: string) {
    setVariants(v => {
      const next = [...v];
      next[vi].mediaUrls = next[vi].mediaUrls.filter(u => u !== url);
      return next;
    });
  }

  /* ---------- save ---------- */
  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    setInfo(null);

    try {
      const style = styleNumber.trim().toUpperCase();
      if (!style) throw new Error("Style number is required.");
      if (!title.trim()) throw new Error("Title is required.");

      // Prepare deep payload (product + variants + sizes)
      const deepVariants = variants.map((v, idx) => {
        const suffix = colorSkuSuffix(v.colorName || "CLR");
        const autoSku = `${style}-${suffix}`;
        const sku = (v.sku || autoSku).toUpperCase();

        const sizes = v.sizes.map((s) => {
          const barcode = s.barcode?.trim() ||
            `${style}-${suffix}-${(s.label || "OS").replace(/\s+/g, "").toUpperCase()}-${rand(5)}`;
          const inventory = (s.inventory || []).map(r => ({
            location: String(r.location || "WH-DEFAULT"),
            onHand:   Math.max(0, Number(r.onHand ?? 0)),
            onOrder:  Math.max(0, Number(r.onOrder ?? 0)),
            reserved: Math.max(0, Number(r.reserved ?? 0)),
          }));
          return { label: s.label || "OS", barcode, inventory };
        });

        const media = (v.mediaUrls || []).map(url => ({
          url,
          type: detectMediaTypeFromName(url),
          isPrimary: false as boolean
        }));

        return {
          sku,
          color: { name: v.colorName || "Default", code: v.colorCode || undefined },
          status: v.status,
          media,
          sizes,
        };
      });

      const payload = {
        product: {
          styleNumber: style,
          title: title.trim(),
          description: desc || undefined,
          price: toMinor(priceGBP), // minor units (pence)
          attributes: {
            category:  category || undefined,
            supplier:  supplier || undefined,
            season:    season || undefined,
            wholesale: wholesale === "" ? undefined : Number(wholesale),
          },
          status,
        },
        variants: deepVariants,
      };

      // 1) Create deep
      const { data: created } = await api.post("/api/products", payload);

      // created is deep product doc (from your service's getDeep return)
      const productId: string | undefined = created?._id;
      if (!productId) {
        throw new Error("Create API did not return product _id.");
      }

      // Map variantId by SKU (reliable lookup)
      const idBySku = new Map<string, string>();
      (created?.variants || []).forEach((v: any) => { if (v?.sku) idBySku.set(v.sku, v._id); });

      // 2) Upload big files (optional) and attach to variants
      for (const v of variants) {
        if (!v.files || v.files.length === 0) continue;
        const variantSku = (v.sku || `${style}-${colorSkuSuffix(v.colorName || "CLR")}`).toUpperCase();
        const variantId = idBySku.get(variantSku);
        if (!variantId) continue;

        const formData = new FormData();
        Array.from(v.files).forEach((f) => formData.append("file", f));
        // No client-side size caps; rely on backend config (multer limits).
        // Expect server returns [{ url, type, ...}, ...]
        try {
          const up = await api.post(`/api/products/${productId}/media/upload`, formData, {
            headers: { "Content-Type": "multipart/form-data" },
          });
          const uploaded: Array<{ url: string; type?: "image" | "video" }> = Array.isArray(up.data) ? up.data : up.data?.files || [];
          const newMedia = [
            ...(deepVariants.find(dv => dv.sku === variantSku)?.media || []),
            ...uploaded.map((m) => ({
              url: m.url,
              type: m.type || detectMediaTypeFromName(m.url || ""),
              isPrimary: false,
            })),
          ];
          // Patch variant media
          await api.patch(`/api/products/variants/${variantId}`, { media: newMedia });
        } catch (uploadErr: any) {
          console.warn(`Media upload failed for SKU ${variantSku}:`, uploadErr?.response?.data || uploadErr?.message);
          // Non-blocking: product created even if media fails
        }
      }

      setInfo("Product created successfully.");
      router.push(`/products/${productId}`);
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Failed to create product.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Create Product</h1>
        <Link href="/products" className="underline">
          Back to Products
        </Link>
      </div>

      <form onSubmit={onSave} className="space-y-8">
        {/* --------- Product core --------- */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 border rounded p-4">
          <div>
            <Label>Style Number</Label>
            <Input value={styleNumber} onChange={(e) => setStyleNumber(e.target.value)} required placeholder="STY-500010" />
          </div>
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="Men's Running Shoe" />
          </div>
          <div>
            <Label>Price (GBP)</Label>
            <Input type="number" step="0.01" value={priceGBP} onChange={(e) => setPriceGBP(e.target.value)} placeholder="79.99" />
          </div>
          <div>
            <Label>Status</Label>
            <select className="w-full h-10 border rounded px-3" value={status} onChange={(e) => setStatus(e.target.value as any)}>
              <option value="active">active</option>
              <option value="inactive">inactive</option>
              <option value="draft">draft</option>
              <option value="archived">archived</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <Label>Description</Label>
            <Textarea rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div>
            <Label>Category</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div>
            <Label>Supplier</Label>
            <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </div>
          <div>
            <Label>Season</Label>
            <Input value={season} onChange={(e) => setSeason(e.target.value)} />
          </div>
          <div>
            <Label>Wholesale (£)</Label>
            <Input type="number" step="0.01" value={wholesale} onChange={(e) => setWholesale(e.target.value)} />
          </div>
        </section>

        {/* --------- Variants builder --------- */}
        <section className="space-y-4 border rounded p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Variants</h2>
            <Button type="button" variant="secondary" onClick={addVariant}>
              <Plus className="h-4 w-4 mr-2" /> Add variant
            </Button>
          </div>

          {variants.map((v, vi) => (
            <div key={vi} className="border rounded p-3 space-y-3 bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="font-medium">Variant {vi + 1}</div>
                <Button type="button" variant="destructive" onClick={() => removeVariant(vi)}>
                  <Trash2 className="h-4 w-4 mr-2" /> Remove
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div>
                  <Label>SKU</Label>
                  <Input
                    value={v.sku}
                    onChange={(e) => setVariant(vi, { sku: e.target.value })}
                    placeholder="auto if empty (STYLE-COLOR)"
                  />
                </div>
                <div>
                  <Label>Color name</Label>
                  <Input value={v.colorName} onChange={(e) => setVariant(vi, { colorName: e.target.value })} placeholder="Black" />
                </div>
                <div>
                  <Label>Color code</Label>
                  <Input value={v.colorCode} onChange={(e) => setVariant(vi, { colorCode: e.target.value })} placeholder="#111111" />
                </div>
                <div>
                  <Label>Status</Label>
                  <select
                    className="w-full h-10 border rounded px-3"
                    value={v.status}
                    onChange={(e) => setVariant(vi, { status: e.target.value as any })}
                  >
                    <option value="active">active</option>
                    <option value="inactive">inactive</option>
                  </select>
                </div>
                <div className="flex items-end gap-2">
                  <div
                    className="w-10 h-10 rounded border"
                    style={{ backgroundColor: v.colorCode || "#fff" }}
                    title={v.colorCode || ""}
                  />
                  <span className="text-xs text-muted-foreground">Preview</span>
                </div>
              </div>

              {/* Media URLs */}
              <div className="space-y-2">
                <Label>Media URLs</Label>
                <AddUrlRow onAdd={(url) => addMediaUrl(vi, url)} />
                <div className="flex flex-wrap gap-2">
                  {v.mediaUrls.map((u) => (
                    <span key={u} className="px-2 py-1 rounded bg-blue-100 text-xs flex items-center gap-2">
                      <a className="underline" href={u} target="_blank" rel="noreferrer">{u.length > 40 ? u.slice(0,40)+"…" : u}</a>
                      <button type="button" onClick={() => removeMediaUrl(vi, u)}><X size={14} /></button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Optional big file upload */}
              <div className="space-y-1">
                <Label>Upload files (images/videos)</Label>
                <Input
                  type="file"
                  multiple
                  accept="image/*,video/*"
                  onChange={(e) => setVariant(vi, { files: e.target.files })}
                />
                <p className="text-xs text-muted-foreground">
                  Big files allowed. Your backend must permit large multipart bodies (e.g., Multer <code>limits.fileSize</code>).
                </p>
              </div>

              {/* Sizes */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Sizes</Label>
                  <Button type="button" variant="secondary" onClick={() => addSize(vi)}>
                    <Plus className="h-4 w-4 mr-2" /> Add size
                  </Button>
                </div>

                {v.sizes.map((s, si) => (
                  <div key={si} className="border rounded p-3 bg-white space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                      <div>
                        <Label>Label</Label>
                        <Input
                          value={s.label}
                          onChange={(e) => setSize(vi, si, { label: e.target.value })}
                          placeholder="OS / S / M / UK 8"
                        />
                      </div>
                      <div className="md:col-span-2">
                        <Label>Barcode</Label>
                        <Input
                          value={s.barcode}
                          onChange={(e) => setSize(vi, si, { barcode: e.target.value })}
                          placeholder="auto if empty"
                        />
                      </div>
                      <div className="flex justify-end">
                        <Button type="button" variant="destructive" onClick={() => removeSize(vi, si)}>
                          <Trash2 className="h-4 w-4 mr-2" /> Remove size
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Inventory by location</Label>
                        <Button type="button" variant="secondary" onClick={() => addInvRow(vi, si)}>
                          <Plus className="h-4 w-4 mr-2" /> Add location
                        </Button>
                      </div>

                      {s.inventory.map((r, ii) => (
                        <div key={ii} className="grid grid-cols-1 md:grid-cols-5 gap-2">
                          <Input
                            value={r.location}
                            onChange={(e) => setInvRow(vi, si, ii, { location: e.target.value })}
                            placeholder="WH-DEFAULT"
                          />
                          <Input
                            type="number"
                            min={0}
                            value={r.onHand}
                            onChange={(e) => setInvRow(vi, si, ii, { onHand: Number(e.target.value || 0) })}
                            placeholder="onHand"
                          />
                          <Input
                            type="number"
                            min={0}
                            value={r.onOrder}
                            onChange={(e) => setInvRow(vi, si, ii, { onOrder: Number(e.target.value || 0) })}
                            placeholder="onOrder"
                          />
                          <Input
                            type="number"
                            min={0}
                            value={r.reserved}
                            onChange={(e) => setInvRow(vi, si, ii, { reserved: Number(e.target.value || 0) })}
                            placeholder="reserved"
                          />
                          <div className="flex justify-end">
                            <Button type="button" variant="destructive" onClick={() => removeInvRow(vi, si, ii)}>
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>

        {err && <p className="text-red-600">{err}</p>}
        {info && <p className="text-emerald-700">{info}</p>}

        <div className="flex gap-2">
          <Button className="bg-green-600" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Create product"}
          </Button>
        </div>
      </form>
    </div>
  );
}

/* ---------- small controlled URL adder ---------- */
function AddUrlRow({ onAdd }: { onAdd: (url: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <div className="flex gap-2">
      <Input
        placeholder="https://cdn.example.com/path/file.jpg (or .mp4)"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onAdd(val);
            setVal("");
          }
        }}
      />
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          onAdd(val);
          setVal("");
        }}
      >
        Add URL
      </Button>
    </div>
  );
}
