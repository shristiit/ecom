"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/app/Components/textarea";

type Size = {
  _id: string;
  label: string;
  barcode: string;
  totalQuantity?: number;
  reservedTotal?: number;
  sellableQuantity?: number;
};

type Variant = {
  _id: string;
  sku: string;
  status?: "active" | "inactive";
  color?: { name?: string; code?: string };
  sizes?: Size[];
};

type ProductDeep = {
  _id: string;
  styleNumber: string;
  title: string;
  description?: string;
  price: number; // minor units (pence)
  status: "active" | "inactive" | "draft" | "archived";
  attributes?: Record<string, any>;
  variants?: Variant[];
};

const PRODUCT_STATUSES: ProductDeep["status"][] = ["active", "inactive", "draft", "archived"];
const VARIANT_STATUSES: NonNullable<Variant["status"]>[] = ["active", "inactive"];

function poundsFromMinor(minor?: number) {
  if (typeof minor !== "number") return "";
  return (minor / 100).toFixed(2);
}
function minorFromPounds(s: string) {
  const n = Number(s);
  if (Number.isNaN(n)) return undefined;
  return Math.round(n * 100);
}

export default function ProductDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // product fields
  const [styleNumber, setStyleNumber] = useState("");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [pricePounds, setPricePounds] = useState(""); // UI in pounds
  const [status, setStatus] = useState<ProductDeep["status"]>("draft");
  const [attributes, setAttributes] = useState<Record<string, string>>({});

  // variants (editable)
  const [variants, setVariants] = useState<Variant[]>([]);
  const [addingVariant, setAddingVariant] = useState(false);
  const [newVariant, setNewVariant] = useState<{ sku: string; colorName: string; colorCode: string; status: "active"|"inactive" }>({
    sku: "",
    colorName: "",
    colorCode: "",
    status: "active",
  });

  // Load product (deep)
  async function refreshProduct() {
    setLoading(true);
    setErr(null);
    try {
      const { data } = await api.get<ProductDeep>(`/api/products/${id}`);
      setStyleNumber(data.styleNumber || "");
      setTitle(data.title || "");
      setDesc(data.description || "");
      setPricePounds(poundsFromMinor(data.price));
      setStatus(data.status || "draft");

      const attrs: Record<string, string> = {};
      if (data.attributes && typeof data.attributes === "object") {
        Object.entries(data.attributes).forEach(([k, v]) => { attrs[k] = v != null ? String(v) : ""; });
      }
      setAttributes(attrs);

      setVariants(data.variants || []);
    } catch (e: any) {
      setErr(e?.response?.data?.message || "Failed to load product.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    refreshProduct();
  }, [id]);

  const attrPairs = useMemo(() => Object.entries(attributes), [attributes]);

  function addAttrRow() {
    let i = 1;
    let key = "key";
    while (attributes[key]) { i += 1; key = `key${i}`; }
    setAttributes((a) => ({ ...a, [key]: "" }));
  }
  function updateAttrKey(oldKey: string, newKey: string) {
    if (!newKey || newKey === oldKey) return;
    setAttributes((attrs) => {
      const next: Record<string, string> = {};
      Object.entries(attrs).forEach(([k, v]) => {
        if (k === oldKey) next[newKey] = v;
        else next[k] = v;
      });
      return next;
    });
  }
  function updateAttrVal(k: string, v: string) {
    setAttributes((a) => ({ ...a, [k]: v }));
  }
  function removeAttr(k: string) {
    setAttributes((a) => {
      const { [k]: _, ...rest } = a;
      return rest;
    });
  }

  async function onSaveProduct(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const cleanAttrs: Record<string, any> = {};
      for (const [k, v] of Object.entries(attributes)) {
        if (!k.trim()) continue;
        cleanAttrs[k.trim()] = v;
      }
      const payload: Partial<ProductDeep> = {
        styleNumber: styleNumber.trim(),
        title: title.trim(),
        description: desc,
        status,
        attributes: cleanAttrs,
      };
      const cents = minorFromPounds(pricePounds);
      if (typeof cents === "number") payload.price = cents;

      const { data } = await api.patch(`/api/products/${id}`, payload);
      setStyleNumber(data.styleNumber || payload.styleNumber || "");
      setTitle(data.title || payload.title || "");
      setDesc(data.description || payload.description || "");
      setStatus(data.status || payload.status || "draft");
      setPricePounds(poundsFromMinor(data.price ?? cents));
      alert("Saved ✅");
    } catch (e: any) {
      setErr(e?.response?.data?.message || "Failed to save product.");
    } finally {
      setSaving(false);
    }
  }

  async function onDeleteProduct() {
    if (!confirm("Archive this product (and its variants & sizes)?")) return;
    try {
      const { data } = await api.delete(`/api/products/${id}`);
      if (data?.deleted || data?.ok || true) {
        alert("Product archived.");
        router.replace("/products");
      }
    } catch (e: any) {
      setErr(e?.response?.data?.message || "Failed to delete product.");
    }
  }

  // ------- VARIANT EDIT HELPERS -------

  function updateVariantLocal(vId: string, patch: Partial<Variant>) {
    setVariants(prev => prev.map(v => v._id === vId ? { ...v, ...patch, color: { ...(v.color || {}), ...(patch.color || {}) } } : v));
  }

  async function saveVariant(v: Variant) {
    try {
      const payload: Partial<Variant> = {
        sku: v.sku,
        status: (v.status as any) || "active",
        color: { name: v.color?.name || "", code: v.color?.code || undefined },
      };
      const { data } = await api.patch(`/api/products/variants/${v._id}`, payload);
      // reflect canonicalized server response if any
      updateVariantLocal(v._id, {
        sku: data.sku ?? payload.sku ?? v.sku,
        status: data.status ?? payload.status ?? v.status,
        color: data.color ?? payload.color ?? v.color,
      });
    } catch (e: any) {
      alert(e?.response?.data?.message || "Failed to save variant.");
    }
  }

  async function deleteVariant(vId: string) {
    if (!confirm("Delete this variant? Its sizes will be archived too.")) return;
    try {
      await api.delete(`/api/products/variants/${vId}`);
      setVariants(prev => prev.filter(v => v._id !== vId));
    } catch (e: any) {
      alert(e?.response?.data?.message || "Failed to delete variant.");
    }
  }

  async function addVariant() {
    if (!newVariant.sku.trim() || !newVariant.colorName.trim()) {
      alert("SKU and Color name are required.");
      return;
    }
    try {
      const payload = {
        sku: newVariant.sku.trim(),
        color: { name: newVariant.colorName.trim(), code: newVariant.colorCode.trim() || undefined },
        media: [],
        status: newVariant.status,
      };
      const { data } = await api.post(`/api/products/${id}/variants`, payload);
      // refresh full product to pull sizes etc.
      await refreshProduct();
      setNewVariant({ sku: "", colorName: "", colorCode: "", status: "active" });
      setAddingVariant(false);
    } catch (e: any) {
      alert(e?.response?.data?.message || "Failed to add variant.");
    }
  }

   if (loading) return <div className="p-4">Loading…</div>;
  if (err) return <div className="p-4 text-red-600">{err}</div>;

  return (
    <div className="p-4 space-y-8 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Edit Product</h1>
        <Link href="/products" className="underline">Back to Products</Link>
      </div>

      {/* Product core form */}
      <form onSubmit={onSaveProduct} className="space-y-8">
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 border rounded p-4">
          <div>
            <Label>Style number</Label>
            <Input value={styleNumber} onChange={(e) => setStyleNumber(e.target.value)} required />
          </div>
          <div>
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>

          <div>
            <Label>Price (GBP)</Label>
            <Input
              type="number"
              step="0.01"
              value={pricePounds}
              onChange={(e) => setPricePounds(e.target.value)}
              placeholder="e.g. 79.99"
            />
          </div>

          <div>
            <Label>Status</Label>
            <select
              className="w-full h-10 border rounded px-3"
              value={status}
              onChange={(e) => setStatus(e.target.value as ProductDeep["status"])}
            >
              {PRODUCT_STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <Label>Description</Label>
            <Textarea rows={4} value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
        </section>

        {/* Attributes editor */}
        <section className="border rounded p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Attributes</h2>
            <Button type="button" variant="secondary" onClick={addAttrRow}>
              Add row
            </Button>
          </div>

          {attrPairs.length === 0 && (
            <p className="text-sm text-muted-foreground">No attributes yet.</p>
          )}

          {attrPairs.map(([k, v]) => (
            <div key={k} className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <Input
                value={k}
                onChange={(e) => updateAttrKey(k, e.target.value)}
                placeholder="key (e.g., brand)"
              />
              <Input
                value={v}
                onChange={(e) => updateAttrVal(k, e.target.value)}
                placeholder="value (e.g., Aurum)"
              />
              <div className="flex gap-2">
                <Button type="button" variant="secondary" onClick={() => updateAttrVal(k, "")}>Clear</Button>
                <Button type="button" variant="destructive" onClick={() => removeAttr(k)}>Remove</Button>
              </div>
            </div>
          ))}
        </section>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save product"}</Button>
          <Button type="button" variant="secondary" onClick={() => router.refresh()}>Refresh</Button>
          <Button type="button" variant="destructive" className="ml-auto" onClick={onDeleteProduct}>
            Archive product
          </Button>
        </div>
      </form>

      {/* ------- VARIANTS (Editable) ------- */}
      <section className="border rounded p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Variants</h2>
          {!addingVariant ? (
            <Button type="button" variant="secondary" onClick={() => setAddingVariant(true)}>
              Add variant
            </Button>
          ) : null}
        </div>

        {/* Add new variant */}
        {addingVariant && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-2 p-3 rounded border bg-gray-50">
            <div>
              <Label>SKU</Label>
              <Input value={newVariant.sku} onChange={e => setNewVariant(v => ({ ...v, sku: e.target.value }))} />
            </div>
            <div>
              <Label>Color name</Label>
              <Input value={newVariant.colorName} onChange={e => setNewVariant(v => ({ ...v, colorName: e.target.value }))} />
            </div>
            <div>
              <Label>Color code</Label>
              <Input placeholder="#000000" value={newVariant.colorCode} onChange={e => setNewVariant(v => ({ ...v, colorCode: e.target.value }))} />
            </div>
            <div>
              <Label>Status</Label>
              <select
                className="w-full h-10 border rounded px-3"
                value={newVariant.status}
                onChange={(e) => setNewVariant(v => ({ ...v, status: e.target.value as "active"|"inactive" }))}
              >
                {VARIANT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex items-end gap-2">
              <Button type="button" onClick={addVariant}>Create</Button>
              <Button type="button" variant="secondary" onClick={() => setAddingVariant(false)}>Cancel</Button>
            </div>
          </div>
        )}

        {variants.length === 0 ? (
          <p className="text-sm text-muted-foreground">No variants yet.</p>
        ) : (
          <div className="space-y-3">
            {variants.map(v => (
              <div key={v._id} className="border rounded p-3 space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
                  <div>
                    <Label>SKU</Label>
                    <Input value={v.sku} onChange={(e) => updateVariantLocal(v._id, { sku: e.target.value })} />
                  </div>
                  <div>
                    <Label>Color name</Label>
                    <Input
                      value={v.color?.name || ""}
                      onChange={(e) => updateVariantLocal(v._id, { color: { ...(v.color || {}), name: e.target.value } })}
                    />
                  </div>
                  <div>
                    <Label>Color code</Label>
                    <Input
                      placeholder="#000000"
                      value={v.color?.code || ""}
                      onChange={(e) => updateVariantLocal(v._id, { color: { ...(v.color || {}), code: e.target.value } })}
                    />
                  </div>
                  <div>
                    <Label>Status</Label>
                    <select
                      className="w-full h-10 border rounded px-3"
                      value={v.status || "active"}
                      onChange={(e) => updateVariantLocal(v._id, { status: e.target.value as any })}
                    >
                      {VARIANT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" onClick={() => saveVariant(v)}>Save</Button>
                    <Button type="button" variant="destructive" onClick={() => deleteVariant(v._id)}>
                      Delete
                    </Button>
                  </div>
                  {/* live color preview */}
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded border"
                      style={{ backgroundColor: v.color?.code || "#ffffff" }}
                      title={v.color?.code}
                    />
                    <span className="text-xs text-muted-foreground">Preview</span>
                  </div>
                </div>

                {/* Sizes overview (read-only for now) */}
                {v.sizes && v.sizes.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-sm mt-2">
                    {v.sizes.map((s) => (
                      <div key={s._id} className="border rounded p-2">
                        <div className="font-medium">{s.label}</div>
                        <div className="text-xs text-muted-foreground break-all">{s.barcode}</div>
                        {typeof s.totalQuantity === "number" && (
                          <div className="mt-1 text-xs">
                            Total: {s.totalQuantity} · Reserved: {s.reservedTotal ?? 0} ·
                            Sellable: {s.sellableQuantity ?? Math.max(0, (s.totalQuantity || 0) - (s.reservedTotal || 0))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
