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

export default function NewProductPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [colorInput,setColorInput] = useState("");
  const [colors,setColors] = useState<string[]>([]);
  const [form, setForm] = useState({
    sku: "",
    name: "",
    category: "",
    supplier: "",
    season: "",
    wholesalePrice: "" as number | string,
    rrp: "" as number | string,
    description: "",
  });

  const [files, setFiles] = useState<FileList | null>(null);

  const update = (k: keyof typeof form, v: any) =>
    setForm((f) => ({ ...f, [k]: v }));

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload: any = {
      sku: form.sku,
      name: form.name,
      description: form.description,
      category: form.category || undefined,
      color: colors,
      supplier: form.supplier || undefined,
      season: form.season || undefined,
      wholesalePrice: form.wholesalePrice === "" ? undefined : Number(form.wholesalePrice),
      rrp: form.rrp === "" ? undefined : Number(form.rrp),
    };

    try {
      // 1) Create the product
      const { data } = await api.post("/api/products/create", payload);
      const productId = data._id as string;

      // 2) If files are chosen, upload them
      if (files && files.length > 0) {
        // limit to 5 files and check size/type on client
        const selected = Array.from(files).slice(0, 5);
        const formData = new FormData();

        for (const f of selected) {
          const isImage = f.type.startsWith("image/");
          const isVideo = f.type.startsWith("video/");

          if (!isImage && !isVideo) {
            setError(`${f.name}: only images or videos are allowed.`);
            setSaving(false);
            return;
          }
          if (isImage && f.size > 5 * 1024 * 1024) {
            setError(`${f.name} is larger than 5MB (image limit).`);
            setSaving(false);
            return;
          }
          if (isVideo && f.size > 50 * 1024 * 1024) {
            setError(`${f.name} is larger than 50MB (video limit).`);
            setSaving(false);
            return;
          }
          formData.append("file", f);
        }

        try {
          setUploading(true);
          await api.post(`/api/products/${productId}/media/upload`, formData, {
            headers: { "Content-Type": "multipart/form-data" },
          });
        } catch {
          // Don't block navigation if media upload failed
          alert("Product created, but media upload failed.");
        } finally {
          setUploading(false);
        }
      }

      alert("Product created ✅");
      router.push(`/products/${productId}`);
    } catch (err: any) {
      const msg =
        err.response?.data?.message ||
        err.response?.data?.errors?.[0]?.msg ||
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
        <Link href="/products" className="underline">Back to Products</Link>
      </div>

      <form onSubmit={onSave} className="space-y-6">
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="sku">SKU</Label>
            <Input id="sku" required value={form.sku} onChange={(e) => update("sku", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" required value={form.name} onChange={(e) => update("name", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="category">Category</Label>
            <Input id="category" value={form.category} onChange={(e) => update("category", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="supplier">Supplier</Label>
            <Input id="supplier" value={form.supplier} onChange={(e) => update("supplier", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="season">Season</Label>
            <Input id="season" value={form.season} onChange={(e) => update("season", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="color">Color(s)</Label>
            <div className="flex gap-2">
            <Input
              id="color"
              placeholder="comma separated"
              value={colorInput}
              onChange={(e) => setColorInput(e.target.value)}
            />
            <Button variant="secondary"
            onClick={()=>{
              const newColor = colorInput.trim() 
              if (newColor && !colors.includes(newColor)) {
        setColors([...colors, newColor]);
        setColorInput("");
      }
      console.log(colors)
            }}
            >Add</Button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {colors.map((list,index) =>(
                <span key={index} className="bg-blue-200 rounded-lg flex items-center justify-between p-3 gap-2">{list}
                <button onClick={() =>{
                  setColors(colors.filter(c => c!==list))
                }}><X /></button>
                </span>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="wholesalePrice">Wholesale</Label>
            <Input
              id="wholesalePrice"
              type="number"
              step="0.01"
              value={form.wholesalePrice}
              onChange={(e) => update("wholesalePrice", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="rrp">RRP</Label>
            <Input
              id="rrp"
              type="number"
              step="0.01"
              value={form.rrp}
              onChange={(e) => update("rrp", e.target.value)}
            />
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

          {/* Media uploader */}
          <div className="md:col-span-2">
            <Label htmlFor="media">Media (images/videos)</Label>
            <Input
              id="media"
              type="file"
              multiple
              accept="image/*,video/*"
              onChange={(e) => setFiles(e.target.files)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Up to 5 files. Images ≤ 5MB, Videos ≤ 50MB.
            </p>
          </div>
        </section>

        {error && <p className="text-red-600">{error}</p>}

        <div className="flex gap-2">
          <Button type="submit" disabled={saving || uploading}>
            {saving || uploading ? "Working…" : "Create product"}
          </Button>
        </div>
      </form>
    </div>
  );
}
