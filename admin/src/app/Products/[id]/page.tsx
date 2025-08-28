"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/app/Components/textarea";
import {
  Table,
  TableHeader,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import { Pencil, Trash2, Check, X as XIcon, ChevronDown, ChevronRight, Plus } from "lucide-react";

/* ---------- Types ---------- */
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
  price: number; // pence
  status: "active" | "inactive" | "draft" | "archived";
  attributes?: Record<string, any>;
  variants?: Variant[];
};

const PRODUCT_STATUSES: ProductDeep["status"][] = ["active", "inactive", "draft", "archived"];
const VARIANT_STATUSES: NonNullable<Variant["status"]>[] = ["active", "inactive"];

/* ---------- Helpers ---------- */
function poundsFromMinor(minor?: number) {
  if (typeof minor !== "number") return "";
  return (minor / 100).toFixed(2);
}
function minorFromPounds(s: string) {
  const n = Number(s);
  if (Number.isNaN(n)) return undefined;
  return Math.round(n * 100);
}
function rand(n = 5) {
  return Math.random().toString(36).slice(-n).toUpperCase();
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
  const [pricePounds, setPricePounds] = useState("");
  const [status, setStatus] = useState<ProductDeep["status"]>("draft");
  const [attributes, setAttributes] = useState<Record<string, string>>({});

  // variants
  const [variants, setVariants] = useState<Variant[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // inline edit for a variant
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [draftVariant, setDraftVariant] = useState<Variant | null>(null);

  // add new variant (+ initial size/qty)
  const [addingVariant, setAddingVariant] = useState(false);
  const [newVariant, setNewVariant] = useState<{
    sku: string;
    colorName: string;
    colorCode: string;
    status: "active" | "inactive";
    sizeLabel: string;
    quantity: number;
    location: string;
    barcode: string;
  }>({
    sku: "",
    colorName: "",
    colorCode: "",
    status: "active",
    sizeLabel: "OS",
    quantity: 0,
    location: "WH-DEFAULT",
    barcode: "",
  });

  /* ---------- Load product deep ---------- */
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
        Object.entries(data.attributes).forEach(([k, v]) => {
          attrs[k] = v != null ? String(v) : "";
        });
      }
      setAttributes(attrs);

      setVariants(data.variants || []);
      setEditingVariantId(null);
      setDraftVariant(null);
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

  /* ---------- Attributes editor ---------- */
  const attrPairs = useMemo(() => Object.entries(attributes), [attributes]);

  function addAttrRow() {
    let i = 1;
    let key = "key";
    while (attributes[key]) {
      i += 1;
      key = `key${i}`;
    }
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

  /* ---------- Save product core ---------- */
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

  /* ---------- Variant helpers ---------- */
  function updateVariantLocal(vId: string, patch: Partial<Variant>) {
    setVariants((prev) =>
      prev.map((v) =>
        v._id === vId
          ? { ...v, ...patch, color: { ...(v.color || {}), ...(patch.color || {}) } }
          : v
      )
    );
  }

  async function saveVariant(v: Variant) {
    try {
      const payload: Partial<Variant> = {
        sku: v.sku,
        status: (v.status as any) || "active",
        color: { name: v.color?.name || "", code: v.color?.code || undefined },
      };
      const { data } = await api.patch(`/api/products/variants/${v._id}`, payload);
      updateVariantLocal(v._id, {
        sku: data.sku ?? payload.sku ?? v.sku,
        status: data.status ?? payload.status ?? v.status,
        color: data.color ?? payload.color ?? v.color,
      });
      setEditingVariantId(null);
      setDraftVariant(null);
    } catch (e: any) {
      alert(e?.response?.data?.message || "Failed to save variant.");
    }
  }

  async function deleteVariant(vId: string) {
    if (!confirm("Delete this variant? Its sizes will be archived too.")) return;
    try {
      await api.delete(`/api/products/variants/${vId}`);
      setVariants((prev) => prev.filter((v) => v._id !== vId));
    } catch (e: any) {
      alert(e?.response?.data?.message || "Failed to delete variant.");
    }
  }

  async function addVariant() {
    // basic checks
    if (!newVariant.sku.trim() || !newVariant.colorName.trim()) {
      alert("SKU and Color name are required.");
      return;
    }
    const cleanSku = newVariant.sku.trim().toUpperCase();

    try {
      // 1) create variant
      const { data: created } = await api.post(`/api/products/${id}/variants`, {
        sku: cleanSku,
        color: {
          name: newVariant.colorName.trim(),
          code: newVariant.colorCode.trim() || undefined,
        },
        media: [],
        status: newVariant.status,
      });

      // try to get the new variant id from response
      let variantId: string | undefined = created?._id;

      // 2) if initial quantity/size provided, create size with inventory
      const qty = Math.max(0, Number(newVariant.quantity || 0));
      const sizeLabel = (newVariant.sizeLabel || "OS").trim();
      const location = (newVariant.location || "WH-DEFAULT").trim();
      const barcode =
        newVariant.barcode.trim() ||
        `${cleanSku}-${sizeLabel.replace(/\s+/g, "").toUpperCase()}-${rand(5)}`;

      if ((qty > 0 || sizeLabel) ) {
        // if no id in response, refresh + find by sku
        if (!variantId) {
          await refreshProduct();
          const v = (variants || []).find((x) => x.sku?.toUpperCase() === cleanSku);
          variantId = v?._id;
        }

        if (variantId) {
          try {
            await api.post(`/api/products/variants/${variantId}/sizes`, {
              label: sizeLabel,
              barcode,
              inventory: [{ location, onHand: qty, onOrder: 0, reserved: 0 }],
            });
          } catch (e: any) {
            console.warn("Failed to create initial size/inventory:", e?.response?.data || e?.message);
          }
        }
      }

      // 3) cleanup and refresh UI
      await refreshProduct();
      setNewVariant({
        sku: "",
        colorName: "",
        colorCode: "",
        status: "active",
        sizeLabel: "OS",
        quantity: 0,
        location: "WH-DEFAULT",
        barcode: "",
      });
      setAddingVariant(false);
    } catch (e: any) {
      alert(e?.response?.data?.message || "Failed to add variant.");
    }
  }

  function toggleExpand(vId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(vId)) next.delete(vId);
      else next.add(vId);
      return next;
    });
  }

  /* ---------- UI ---------- */
  if (loading) return <div className="p-4">Loading…</div>;
  if (err) return <div className="p-4 text-red-600">{err}</div>;

  return (
    <div className="p-4 space-y-8 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Edit Product</h1>
        <Link href="/products" className="underline">
          Back to Products
        </Link>
      </div>

      {/* Product core form */}
      <form onSubmit={onSaveProduct} className="space-y-8">
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 border rounded p-4">
          <div>
            <Label className="m-2">Style number</Label>
            <Input value={styleNumber} onChange={(e) => setStyleNumber(e.target.value)} required />
          </div>
          <div>
            <Label className="m-2">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>

          <div>
            <Label className="m-2">Price (GBP)</Label>
            <Input
              type="number"
              step="0.01"
              value={pricePounds}
              onChange={(e) => setPricePounds(e.target.value)}
              placeholder="e.g. 79.99"
            />
          </div>

          <div>
            <Label className="m-2">Status</Label>
            <select
              className="w-full h-10 border rounded px-3"
              value={status}
              onChange={(e) => setStatus(e.target.value as ProductDeep["status"])}
            >
              {PRODUCT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <Label className="m-2">Description</Label>
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
                <Button type="button" variant="secondary" onClick={() => updateAttrVal(k, "")}>
                  Clear
                </Button>
                <Button type="button" variant="destructive" onClick={() => removeAttr(k)}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </section>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save product"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.refresh()}>
            Refresh
          </Button>
          <Button type="button" variant="destructive" className="ml-auto" onClick={onDeleteProduct}>
            Archive product
          </Button>
        </div>
      </form>

      {/* ------- VARIANTS (Editable table) ------- */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Variants</h2>

          {!addingVariant ? (
            <Button type="button" variant="secondary" onClick={() => setAddingVariant(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add variant
            </Button>
          ) : (
            <div className="w-full border rounded p-3 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                <div>
                  <Label className="m-2">SKU</Label>
                  <Input
                    value={newVariant.sku}
                    onChange={(e) => setNewVariant({ ...newVariant, sku: e.target.value })}
                    placeholder="e.g., STY-100001-BLK"
                  />
                </div>
                <div>
                  <Label className="m-2">Color name</Label>
                  <Input
                    value={newVariant.colorName}
                    onChange={(e) => setNewVariant({ ...newVariant, colorName: e.target.value })}
                    placeholder="Black"
                  />
                </div>
                <div>
                  <Label className="m-2">Color code</Label>
                  <Input
                    value={newVariant.colorCode}
                    onChange={(e) => setNewVariant({ ...newVariant, colorCode: e.target.value })}
                    placeholder="#111111"
                  />
                </div>
                <div>
                  <Label className="m-2">Status</Label>
                  <select
                    className="w-full h-10 border rounded px-3"
                    value={newVariant.status}
                    onChange={(e) =>
                      setNewVariant({ ...newVariant, status: e.target.value as "active" | "inactive" })
                    }
                  >
                    {VARIANT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <Label className="m-2">Size label</Label>
                  <Input
                    value={newVariant.sizeLabel}
                    onChange={(e) => setNewVariant({ ...newVariant, sizeLabel: e.target.value })}
                    placeholder="OS / S / M / UK 9"
                  />
                </div>
                <div>
                  <Label className="m-2">Quantity (on hand)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={newVariant.quantity}
                    onChange={(e) =>
                      setNewVariant({ ...newVariant, quantity: Math.max(0, Number(e.target.value || 0)) })
                    }
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label className="m-2">Location</Label>
                  <Input
                    value={newVariant.location}
                    onChange={(e) => setNewVariant({ ...newVariant, location: e.target.value })}
                    placeholder="WH-DEFAULT"
                  />
                </div>
                <div>
                  <Label className="m-2">Barcode (optional)</Label>
                  <Input
                    value={newVariant.barcode}
                    onChange={(e) => setNewVariant({ ...newVariant, barcode: e.target.value })}
                    placeholder="auto if left blank"
                  />
                </div>
              </div>

              <div className="flex gap-2 justify-end">
                <Button type="button" onClick={addVariant}>
                  Save
                </Button>
                <Button type="button" variant="secondary" onClick={() => setAddingVariant(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="overflow-x-auto border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-100">
                <TableHead />
                <TableHead className="font-semibold">SKU</TableHead>
                <TableHead className="font-semibold">Color</TableHead>
                <TableHead className="font-semibold">Code</TableHead>
                <TableHead className="font-semibold">Status</TableHead>
                <TableHead className="font-semibold text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {variants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-gray-500">
                    No variants yet.
                  </TableCell>
                </TableRow>
              ) : (
                variants.map((v) => {
                  const isEditing = editingVariantId === v._id;
                  const draft = isEditing ? draftVariant : null;

                  return (
                    <React.Fragment key={v._id}>
                      <TableRow>
                        {/* Expand/Collapse */}
                        <TableCell className="w-10">
                          <button
                            className="p-1 rounded hover:bg-gray-100"
                            onClick={() => toggleExpand(v._id)}
                            title={expanded.has(v._id) ? "Hide sizes" : "Show sizes"}
                          >
                            {expanded.has(v._id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </button>
                        </TableCell>

                        {/* SKU */}
                        <TableCell className="align-middle">
                          {isEditing ? (
                            <Input
                              value={draft?.sku || ""}
                              onChange={(e) =>
                                setDraftVariant((d) => (d ? { ...d, sku: e.target.value } : d))
                              }
                            />
                          ) : (
                            <span className="font-mono">{v.sku}</span>
                          )}
                        </TableCell>

                        {/* Color name */}
                        <TableCell className="align-middle">
                          {isEditing ? (
                            <Input
                              value={draft?.color?.name || ""}
                              onChange={(e) =>
                                setDraftVariant((d) =>
                                  d
                                    ? { ...d, color: { ...(d.color || {}), name: e.target.value } }
                                    : d
                                )
                              }
                            />
                          ) : (
                            v.color?.name || "—"
                          )}
                        </TableCell>

                        {/* Color code + swatch */}
                        <TableCell className="align-middle">
                          {isEditing ? (
                            <div className="flex items-center gap-2">
                              <Input
                                value={draft?.color?.code || ""}
                                onChange={(e) =>
                                  setDraftVariant((d) =>
                                    d
                                      ? { ...d, color: { ...(d.color || {}), code: e.target.value } }
                                      : d
                                  )
                                }
                                placeholder="#111111"
                              />
                              <span
                                className="inline-block w-5 h-5 rounded border"
                                style={{ backgroundColor: draft?.color?.code || "#fff" }}
                              />
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span
                                className="inline-block w-5 h-5 rounded border"
                                style={{ backgroundColor: v.color?.code || "#fff" }}
                              />
                              <span className="font-mono text-xs">{v.color?.code || "—"}</span>
                            </div>
                          )}
                        </TableCell>

                        {/* Status */}
                        <TableCell className="align-middle">
                          {isEditing ? (
                            <select
                              className="w-full h-10 border rounded px-3"
                              value={draft?.status || "active"}
                              onChange={(e) =>
                                setDraftVariant((d) => (d ? { ...d, status: e.target.value as any } : d))
                              }
                            >
                              {VARIANT_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          ) : (
                            v.status || "active"
                          )}
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="align-middle text-right">
                          {isEditing ? (
                            <div className="flex justify-end gap-2">
                              <Button type="button" size="sm" onClick={() => draft && saveVariant(draft)}>
                                <Check className="h-4 w-4 mr-2" />
                                Save
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setEditingVariantId(null);
                                  setDraftVariant(null);
                                }}
                              >
                                <XIcon className="h-4 w-4 mr-2" />
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setEditingVariantId(v._id);
                                  setDraftVariant({
                                    _id: v._id,
                                    sku: v.sku,
                                    status: v.status || "active",
                                    color: {
                                      name: v.color?.name || "",
                                      code: v.color?.code || "",
                                    },
                                  });
                                }}
                              >
                                <Pencil className="h-4 w-4 mr-2" />
                                Edit
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={() => deleteVariant(v._id)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>

                      {/* Expanded: sizes table */}
                      {expanded.has(v._id) && (
                        <TableRow>
                          <TableCell colSpan={6} className="bg-gray-50">
                            {v.sizes && v.sizes.length > 0 ? (
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="bg-gray-100">
                                      <th className="text-left p-2">Size</th>
                                      <th className="text-left p-2">Barcode</th>
                                      <th className="text-left p-2">Total</th>
                                      <th className="text-left p-2">Reserved</th>
                                      <th className="text-left p-2">Sellable</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {v.sizes.map((s) => (
                                      <tr key={s._id} className="border-t">
                                        <td className="p-2">{s.label}</td>
                                        <td className="p-2 font-mono">{s.barcode}</td>
                                        <td className="p-2">{s.totalQuantity ?? "—"}</td>
                                        <td className="p-2">{s.reservedTotal ?? "—"}</td>
                                        <td className="p-2">{s.sellableQuantity ?? "—"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <div className="p-3 text-sm text-gray-600">No sizes for this variant.</div>
                            )}
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
