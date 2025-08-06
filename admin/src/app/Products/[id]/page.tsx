"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/app/Components/textarea"; 
import { Trash2 } from "lucide-react";

type Media = {
  _id: string;
  url: string;
  type: "image" | "video";
  altText?: string;
  order?: number;
};

type ProductDto = {
  _id: string;
  sku: string;
  name: string;
  category?: string;
  supplier?: string;
  season?: string;
  color?: string[];
  wholesalePrice?: number;
  rrp?: number;
  description?: string;
  media: Media[];
};

export default function ProductDetailsPage() {
  const params = useParams<{ id: string }>();
  const id = (params?.id || "") as string;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<ProductDto>({
    _id: "",
    sku: "",
    name: "",
    category: "",
    supplier: "",
    season: "",
    color: [],
    wholesalePrice: undefined,
    rrp: undefined,
    description: "",
    media: [],
  });

  const [files, setFiles] = useState<FileList | null>(null);

  const update = (k: keyof ProductDto, v: any) =>
    setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        const { data } = await api.get<ProductDto>(`/api/products/${id}`);
        setForm(data);
      } catch (err: any) {
        if (err.response?.status === 401) {
          window.location.href = "/login";
        } else if (err.response?.status === 403) {
          setError("You don't have permission to view this product.");
        } else if (err.response?.status === 404) {
          setError("Product not found.");
        } else {
          setError("Failed to load product.");
          console.error(err);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload: any = {
      sku: form.sku,
      name: form.name,
      category: form.category || undefined,
      supplier: form.supplier || undefined,
      season: form.season || undefined,
      color: Array.isArray(form.color)
        ? form.color
        : String(form.color || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
      wholesalePrice: form.wholesalePrice ?? undefined,
      rrp: form.rrp ?? undefined,
      description: form.description ?? undefined,
    };

    try {
      const { data } = await api.patch(`/api/products/${id}`, payload);
      setForm(data);
      alert("Product saved ✅");
    } catch (err: any) {
      if (err.response?.status === 400) {
        setError("Validation failed. Check your inputs.");
      } else if (err.response?.status === 401) {
        window.location.href = "/login";
      } else if (err.response?.status === 403) {
        setError("You don't have permission to edit this product.");
      } else {
        setError("Failed to save product.");
        console.error(err);
      }
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!window.confirm("Delete this product? This cannot be undone.")) return;
    try {
      const { data } = await api.delete(`/api/products/${id}`);
      if (!data?.deleted) {
        setError("Delete API responded but did not confirm deletion.");
        return;
      }
      alert("Product deleted.");
      router.replace("/products");
    } catch (err: any) {
      if (err.response?.status === 401) {
        window.location.href = "/login";
      } else if (err.response?.status === 403) {
        setError("You don't have permission to delete this product.");
      } else if (err.response?.status === 404) {
        setError("Product already deleted.");
        router.replace("/products");
      } else {
        setError("Failed to delete product.");
        console.error(err);
      }
    }
  };

  const onUpload = async () => {
    if (!files || files.length === 0) return;

    const selected = Array.from(files).slice(0, 5);
    const formData = new FormData();

    for (const f of selected) {
      const isImage = f.type.startsWith("image/");
      const isVideo = f.type.startsWith("video/");
      if (!isImage && !isVideo) {
        alert(`${f.name}: only images or videos are allowed.`);
        return;
      }
      // client-side size checks (server also enforces)
      if (isImage && f.size > 5 * 1024 * 1024) {
        alert(`${f.name} is larger than 5MB (image limit).`);
        return;
      }
      if (isVideo && f.size > 50 * 1024 * 1024) {
        alert(`${f.name} is larger than 50MB (video limit).`);
        return;
      }
      formData.append("file", f);
    }

    try {
      setUploading(true);
      await api.post(`/api/products/${id}/media/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const { data } = await api.get<ProductDto>(`/api/products/${id}`);
      setForm(data);
      setFiles(null);
    } catch (err) {
      alert("Media upload failed.");
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="p-4">Loading product…</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;

  return (
    <div className="p-4 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Edit Product</h1>
        <Link href="/products" className="underline">
          Back to Products
        </Link>
      </div>

      <form onSubmit={onSave} className="space-y-6">
        {/* Fields */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="sku">SKU</Label>
            <Input id="sku" value={form.sku} onChange={(e) => update("sku", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={form.name} onChange={(e) => update("name", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="category">Category</Label>
            <Input id="category" value={form.category ?? ""} onChange={(e) => update("category", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="supplier">Supplier</Label>
            <Input id="supplier" value={form.supplier ?? ""} onChange={(e) => update("supplier", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="season">Season</Label>
            <Input id="season" value={form.season ?? ""} onChange={(e) => update("season", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="color">Color(s)</Label>
            <Input
              id="color"
              placeholder="comma separated (e.g., Red, Blue)"
              value={Array.isArray(form.color) ? form.color.join(", ") : ""}
              onChange={(e) =>
                update(
                  "color",
                  e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
                )
              }
            />
          </div>
          <div>
            <Label htmlFor="wholesalePrice">Wholesale</Label>
            <Input
              id="wholesalePrice"
              type="number"
              step="0.01"
              value={form.wholesalePrice ?? ""}
              onChange={(e) =>
                update("wholesalePrice", e.target.value === "" ? undefined : Number(e.target.value))
              }
            />
          </div>
          <div>
            <Label htmlFor="rrp">RRP</Label>
            <Input
              id="rrp"
              type="number"
              step="0.01"
              value={form.rrp ?? ""}
              onChange={(e) => update("rrp", e.target.value === "" ? undefined : Number(e.target.value))}
            />
          </div>
          <div className="md:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              rows={4}
              value={form.description ?? ""}
              onChange={(e) => update("description", e.target.value)}
            />
          </div>
        </section>

        {/* Media */}
        <section className="space-y-3">
          <h2 className="font-medium">Media</h2>

          {form.media?.length ? (
            <div className="grid grid-cols-3 gap-3">
              {form.media
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                .map((m) => (
                  <div key={m._id} className="border rounded p-2 flex flex-col items-center">
                    {m.type === "video" ? (
                      <video src={m.url} controls className="w-full h-28 object-cover rounded" />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={m.url} alt={m.altText || "image"} className="w-full h-28 object-cover rounded" />
                    )}
                    <span className="text-xs mt-1 truncate w-full text-center">
                      {m.altText || m.type}
                    </span>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No media yet.</p>
          )}

          <div className="flex items-center gap-2">
            <Input
              type="file"
              multiple
              accept="image/*,video/*"
              onChange={(e) => setFiles(e.target.files)}
            />
            <Button type="button" onClick={onUpload} disabled={uploading || !files?.length}>
              {uploading ? "Uploading…" : "Upload"}
            </Button>
            <span className="text-xs text-muted-foreground">(max 5 files, images ≤ 5MB, videos ≤ 50MB)</span>
          </div>
        </section>

        {error && <p className="text-red-600">{error}</p>}

        <div className="flex flex-wrap gap-2 items-center">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.refresh()}>
            Refresh
          </Button>
          <Button type="button" variant="destructive" onClick={onDelete} className="ml-auto">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete product
          </Button>
        </div>
      </form>
    </div>
  );
}
