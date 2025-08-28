"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/app/Components/textarea";
import { Trash2, Pencil, Check, X as XIcon } from "lucide-react";

/* ---------------- helpers ---------------- */
function skuSuffixFromColor(name: string) {
  const letters = (name || "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return letters.slice(0, 6) || "CLR";
}
function toMinor(pounds: string | number) {
  const n = Number(pounds);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
function rand(n = 6) {
  return Math.random().toString(36).slice(-n).toUpperCase();
}
function tokenize(s: string) {
  return (s || "").replace(/\s+/g, "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}
function normColor(s: string) {
  return (s || "").trim().toLowerCase();
}
function normSize(s: string) {
  return (s || "").trim().toLowerCase();
}

/** Parse a size input like "S,M,L" or "S:10,M:5,UK 8:0" into entries. */
function parseSizesInput(
  input: string,
  defaultQty: number
): Array<{ label: string; quantity: number }> {
  const out: Array<{ label: string; quantity: number }> = [];
  for (const raw of (input || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)) {
    const [labelPart, qtyPart] = raw.split(":");
    const label = (labelPart || "").trim();
    if (!label) continue;
    let qty = defaultQty;
    if (qtyPart != null && qtyPart.trim() !== "") {
      const qn = Number(qtyPart);
      if (Number.isFinite(qn) && qn >= 0) qty = qn;
    }
    out.push({ label, quantity: qty });
  }
  return out;
}

/* ---------------- localStorage key ---------------- */
const DRAFT_KEY = "product:new:draft:v1";

/* ---------------- types ---------------- */
type Line = {
  id: string; // stable key
  colorName: string;
  colorCode?: string;
  sizeLabel: string;
  quantity: number; // onHand at WH-DEFAULT
};

type DraftShape = {
  styleNumber: string;
  title: string;
  desc: string;
  priceGBP: string | number;
  status: "active" | "inactive" | "draft" | "archived";
  category: string;
  supplier: string;
  season: string;
  wholesale: string | number;

  // quick add mini-form
  colorName: string;
  colorCode: string;
  sizeLabel: string;
  quantity: number;

  // table
  lines: Line[];
};

export default function NewProductPage() {
  const router = useRouter();

  // product fields
  const [styleNumber, setStyleNumber] = useState("");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [priceGBP, setPriceGBP] = useState<string | number>("");
  const [status, setStatus] =
    useState<"active" | "inactive" | "draft" | "archived">("active");
  const [category, setCategory] = useState("");
  const [supplier, setSupplier] = useState("");
  const [season, setSeason] = useState("");
  const [wholesale, setWholesale] = useState<string | number>("");

  // quick add row (top mini-form)
  const [colorName, setColorName] = useState("");
  const [colorCode, setColorCode] = useState("");
  const [sizeLabel, setSizeLabel] = useState("");
  const [quantity, setQuantity] = useState<number>(0);

  // table rows
  const [lines, setLines] = useState<Line[]>([]);

  // inline edit state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<Line | null>(null);

  // ui
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // preview SKU for current color (per-color)
  const skuPreview = useMemo(() => {
    const sty = tokenize(styleNumber);
    const suf = skuSuffixFromColor(colorName);
    return sty ? `${sty}-${suf}` : `STYLE?-${suf}`;
  }, [styleNumber, colorName]);

  /* ---------------- DRAFT: load on mount ---------------- */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed: Partial<DraftShape> = JSON.parse(raw);

      if (parsed.styleNumber != null) setStyleNumber(parsed.styleNumber);
      if (parsed.title != null) setTitle(parsed.title);
      if (parsed.desc != null) setDesc(parsed.desc);
      if (parsed.priceGBP != null) setPriceGBP(parsed.priceGBP);
      if (
        parsed.status === "active" ||
        parsed.status === "inactive" ||
        parsed.status === "draft" ||
        parsed.status === "archived"
      ) {
        setStatus(parsed.status);
      }
      if (parsed.category != null) setCategory(parsed.category);
      if (parsed.supplier != null) setSupplier(parsed.supplier);
      if (parsed.season != null) setSeason(parsed.season);
      if (parsed.wholesale != null) setWholesale(parsed.wholesale);

      if (parsed.colorName != null) setColorName(parsed.colorName);
      if (parsed.colorCode != null) setColorCode(parsed.colorCode);
      if (parsed.sizeLabel != null) setSizeLabel(parsed.sizeLabel);
      if (typeof parsed.quantity === "number") setQuantity(parsed.quantity);

      if (Array.isArray(parsed.lines)) setLines(parsed.lines);
      setInfo("Draft restored from local storage.");
    } catch {
      // ignore bad drafts
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- DRAFT: autosave (debounced) ---------------- */
  const autosaveTimer = useRef<number | null>(null);
  function scheduleAutosave() {
    if (autosaveTimer.current) window.clearTimeout(autosaveTimer.current);
    autosaveTimer.current = window.setTimeout(() => {
      const snapshot: DraftShape = {
        styleNumber,
        title,
        desc,
        priceGBP,
        status,
        category,
        supplier,
        season,
        wholesale,
        colorName,
        colorCode,
        sizeLabel,
        quantity,
        lines,
      };
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot));
      } catch {
        // ignore write failures
      }
    }, 300);
  }

  // watch all form states
  useEffect(() => {
    scheduleAutosave();
  }, [
    styleNumber,
    title,
    desc,
    priceGBP,
    status,
    category,
    supplier,
    season,
    wholesale,
    colorName,
    colorCode,
    sizeLabel,
    quantity,
    lines,
  ]);

  /* ---------------- Manual draft actions ---------------- */
  function clearDraft() {
    localStorage.removeItem(DRAFT_KEY);
    setInfo("Draft cleared.");
  }
  function saveDraftNow() {
    const snapshot: DraftShape = {
      styleNumber,
      title,
      desc,
      priceGBP,
      status,
      category,
      supplier,
      season,
      wholesale,
      colorName,
      colorCode,
      sizeLabel,
      quantity,
      lines,
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(snapshot));
    setInfo("Draft saved.");
  }

  /* ---------------- add / merge ---------------- */
  function addOrMergeRow(newRow: Omit<Line, "id">) {
    setLines((prev) => {
      const i = prev.findIndex(
        (r) =>
          normColor(r.colorName) === normColor(newRow.colorName) &&
          normSize(r.sizeLabel) === normSize(newRow.sizeLabel)
      );
      if (i >= 0) {
        const next = [...prev];
        next[i] = {
          ...next[i],
          quantity: next[i].quantity + Math.max(0, newRow.quantity),
        };
        return next;
      }
      return [...prev].concat([{ id: rand(), ...newRow }]);
    });
  }

  function addLine() {
    setErr(null);
    const c = colorName.trim();
    const s = sizeLabel.trim();
    const q = Number(quantity);

    if (!c) return setErr("Color is required.");
    if (!s) return setErr("Size is required.");
    if (!Number.isFinite(q) || q < 0) return setErr("Quantity must be ≥ 0.");

    const entries = parseSizesInput(s, q);
    if (entries.length === 0)
      return setErr("Provide at least one size (e.g., S,M,L or S:10,M:5).");

    for (const { label, quantity } of entries) {
      addOrMergeRow({
        colorName: c,
        colorCode: colorCode || undefined,
        sizeLabel: label,
        quantity: Math.max(0, quantity),
      });
    }

    // Keep color so you can add more size batches for the same color
    setSizeLabel("");
    setQuantity(0);
    // If you prefer clearing color too, uncomment:
    // setColorName(""); setColorCode("");
  }

  function removeLine(i: number) {
    setLines((prev) => prev.filter((_, idx) => idx !== i));
    if (editingIndex === i) {
      setEditingIndex(null);
      setDraft(null);
    }
  }

  /* ---------------- inline edit ---------------- */
  function startEdit(i: number) {
    setErr(null);
    setEditingIndex(i);
    setDraft({ ...lines[i] });
  }
  function cancelEdit() {
    setEditingIndex(null);
    setDraft(null);
  }
  function applyEdit() {
    if (editingIndex === null || !draft) return;
    const { colorName, sizeLabel, quantity } = draft;
    if (!colorName.trim()) return setErr("Color is required.");
    if (!sizeLabel.trim()) return setErr("Size is required.");
    if (!Number.isFinite(quantity) || quantity < 0)
      return setErr("Quantity must be ≥ 0.");

    setLines((prev) => {
      const next = [...prev];
      const id = next[editingIndex].id;
      // check if this edit collides with another row -> merge
      const dupIdx = next.findIndex(
        (r, idx) =>
          idx !== editingIndex &&
          normColor(r.colorName) === normColor(colorName) &&
          normSize(r.sizeLabel) === normSize(sizeLabel)
      );
      if (dupIdx >= 0) {
        // merge into dupIdx
        next[dupIdx] = {
          ...next[dupIdx],
          quantity: next[dupIdx].quantity + Math.max(0, quantity),
          colorCode: draft.colorCode || next[dupIdx].colorCode,
        };
        // remove the original edited row
        next.splice(editingIndex, 1);
      } else {
        // simple replace
        next[editingIndex] = { ...draft, id };
      }
      return next;
    });

    setEditingIndex(null);
    setDraft(null);
  }

  /* ---------------- submit ---------------- */
  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    setInfo(null);

    try {
      const style = tokenize(styleNumber);
      if (!style) throw new Error("Style number is required.");
      if (!title.trim()) throw new Error("Title is required.");
      if (lines.length === 0) throw new Error("Add at least one variant row.");
      if (editingIndex !== null)
        throw new Error("Finish or cancel the edit in progress.");

      // group rows by color
      const byColor = new Map<
        string,
        {
          colorName: string;
          colorCode?: string;
          sizes: Array<{ label: string; quantity: number }>;
        }
      >();
      for (const ln of lines) {
        const key = normColor(ln.colorName);
        const entry =
          byColor.get(key) || {
            colorName: ln.colorName,
            colorCode: ln.colorCode,
            sizes: [],
          };
        entry.sizes.push({ label: ln.sizeLabel, quantity: ln.quantity });
        if (ln.colorCode) entry.colorCode = ln.colorCode;
        byColor.set(key, entry);
      }

      // build deep variants
      const variants = Array.from(byColor.values()).map((group) => {
        const suffix = skuSuffixFromColor(group.colorName);
        const sku = `${style}-${suffix}`;
        const sizes = group.sizes.map((s) => {
          const sizeTok = tokenize(s.label || "OS");
          const barcode = `${style}-${suffix}-${sizeTok}-${rand(5)}`;
          return {
            label: s.label || "OS",
            barcode,
            inventory: [
              {
                location: "WH-DEFAULT",
                onHand: Math.max(0, Number(s.quantity || 0)),
                onOrder: 0,
                reserved: 0,
              },
            ],
          };
        });
        return {
          sku,
          color: { name: group.colorName, code: group.colorCode || undefined },
          status: "active" as const,
          media: [] as Array<{
            url: string;
            type: "image" | "video";
            isPrimary?: boolean;
          }>,
          sizes,
        };
      });

      const payload = {
        product: {
          styleNumber: style,
          title: title.trim(),
          description: desc || undefined,
          price: toMinor(priceGBP),
          attributes: {
            category: category || undefined,
            supplier: supplier || undefined,
            season: season || undefined,
            wholesale: wholesale === "" ? undefined : Number(wholesale),
          },
          status,
        },
        variants,
      };

      const { data: created } = await api.post("/api/products", payload);
      const productId = created?._id;
      if (!productId) throw new Error("Create API did not return product _id");

      // clear draft after successful save
      localStorage.removeItem(DRAFT_KEY);

      setInfo("Product created successfully.");
      router.push(`/products/${productId}`);
    } catch (e: any) {
      setErr(
        e?.response?.data?.message || e?.message || "Failed to create product."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Create Product</h1>
        <Link href="/products" className="underline">
          Back to Products
        </Link>
      </div>

      {/* Draft controls */}
      {/* <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" onClick={saveDraftNow}>Save draft</Button>
        <Button type="button" variant="secondary" onClick={clearDraft}>Discard draft</Button>
      </div> */}

      <form onSubmit={onSave} className="space-y-8">
        {/* ---------- Product core ---------- */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4 border rounded p-4">
          <div>
            <Label className="m-2">Style Number</Label>
            <Input
              value={styleNumber}
              onChange={(e) => setStyleNumber(e.target.value)}
              required
              placeholder="STY-500010"
            />
          </div>
          <div>
            <Label className="m-2">Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder="Men's Running Shoe"
            />
          </div>
          <div>
            <Label className="m-2">Price (GBP)</Label>
            <Input
              type="number"
              step="0.01"
              value={priceGBP}
              onChange={(e) => setPriceGBP(e.target.value)}
              placeholder="79.99"
            />
          </div>
          <div>
            <Label className="m-2">Status</Label>
            <select
              className="w-full h-10 border rounded px-3"
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
            >
              <option value="active">active</option>
              <option value="inactive">inactive</option>
              <option value="draft">draft</option>
              <option value="archived">archived</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <Label className="m-2">Description</Label>
            <Textarea
              rows={4}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
            />
          </div>
          <div>
            <Label className="m-2">Category</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </div>
          <div>
            <Label className="m-2">Supplier</Label>
            <Input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
            />
          </div>
          <div>
            <Label className="m-2">Season</Label>
            <Input
              value={season}
              onChange={(e) => setSeason(e.target.value)}
            />
          </div>
          <div>
            <Label className="m-2">Wholesale (£)</Label>
            <Input
              type="number"
              step="0.01"
              value={wholesale}
              onChange={(e) => setWholesale(e.target.value)}
            />
          </div>
        </section>

        {/* ---------- Quick add row ---------- */}
        <section className="space-y-4 border rounded p-4">
          <h2 className="font-medium">Add Color and Size</h2>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div>
              <Label className="m-2">Color name</Label>
              <Input
                value={colorName}
                onChange={(e) => setColorName(e.target.value)}
                placeholder="Enter Color"
              />
            </div>
            <div>
              <Label className="m-2">Color code</Label>
              <Input
                value={colorCode}
                onChange={(e) => setColorCode(e.target.value)}
                placeholder="#111111 (optional)"
              />
            </div>
            <div>
              <Label className="m-2">Size</Label>
              <Input
                value={sizeLabel}
                onChange={(e) => setSizeLabel(e.target.value)}
                placeholder="OS / S,M,L or S:10,M:5,UK 8:0"
              />
            </div>
            
            <div className="flex items-end">
              <Button className="" type="button" onClick={addLine}>
                Add
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            SKU will be generated per color: <code>{skuPreview}</code>. 
          </p>
          <p className="text-xs text-muted-foreground">
            Tip: add multiple sizes separated by commas. Use{" "}
            <code>size:qty</code> to override quantity per size (e.g.,{" "}
            <code>S:10,M:5</code>).
          </p>

          {/* ---------- Editable table ---------- */}
          <div className="overflow-x-auto border rounded">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100">
                  <th className="text-left p-2">#</th>
                  <th className="text-left p-2">Color</th>
                  <th className="text-left p-2">Size</th>
                  <th className="text-right p-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td
                      className="p-3 text-center text-gray-500"
                      colSpan={6}
                    >
                      No variant rows yet. Add one above.
                    </td>
                  </tr>
                ) : (
                  lines.map((ln, i) => {
                    const isEdit = editingIndex === i;
                    return (
                      <tr key={ln.id} className="border-t">
                        <td className="p-2 align-middle">{i + 1}</td>

                        {/* Color */}
                        <td className="p-2 align-middle">
                          {isEdit ? (
                            <Input
                              value={draft?.colorName || ""}
                              onChange={(e) =>
                                setDraft((d) =>
                                  d ? { ...d, colorName: e.target.value } : d
                                )
                              }
                            />
                          ) : (
                            ln.colorName
                          )}
                        </td>

                        {/* Size */}
                        <td className="p-2 align-middle">
                          {isEdit ? (
                            <Input
                              value={draft?.sizeLabel || ""}
                              onChange={(e) =>
                                setDraft((d) =>
                                  d ? { ...d, sizeLabel: e.target.value } : d
                                )
                              }
                            />
                          ) : (
                            ln.sizeLabel
                          )}
                        </td>

                        {/* Qty */}
                       

                        {/* Actions */}
                        <td className="p-2 flex justify-end align-middle text-right">
                          {isEdit ? (
                            <div className="flex justify-end gap-2">
                              <Button type="button" size="sm" onClick={applyEdit}>
                                <Check className="h-4 w-4 mr-2" /> Save
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={cancelEdit}
                              >
                                <XIcon className="h-4 w-4 mr-2" /> Cancel
                              </Button>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => startEdit(i)}
                              >
                                <Pencil className="h-4 w-4 mr-2" /> Edit
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={() => removeLine(i)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Remove
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {err && <p className="text-red-600">{err}</p>}
        {/* {info && <p className="text-emerald-700">{info}</p>} */}

        <div className="flex gap-2">
          <Button className="bg-green-600" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Create product"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.push("/products")}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
