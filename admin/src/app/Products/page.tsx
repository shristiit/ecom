"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import api from "@/lib/api";

/** ---- List response types ---- */
type ProductRow = {
  _id: string;
  styleNumber: string;
  title: string;
  status: "active" | "inactive" | "draft" | "archived";
  price: number; // minor units
  updatedAt?: string;
  variantCount?: number;
};
type ListResponse = {
  page: number;
  limit: number;
  total: number;
  rows: ProductRow[];
};

/** ---- Deep product (expanded so we can read color + size labels) ---- */
type SizeDeep = {
  label: string;
  totalQuantity?: number;
  reservedTotal?: number;
  sellableQuantity?: number;
};
type VariantDeep = {
  color?: { name?: string; code?: string };
  sizes?: SizeDeep[];
};
type ProductDeep = { _id: string; variants?: VariantDeep[] };

const ITEMS_PER_PAGE = 15;

function formatMinorGBP(pence?: number) {
  if (typeof pence !== "number") return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

export default function ProductsPage() {
  const router = useRouter();

  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0); // 0-based for UI
  const [total, setTotal] = useState(0);

  // qtyMap holds per-product totals once fetched
  const [qtyMap, setQtyMap] = useState<
    Record<string, { total: number; reserved: number; sellable: number }>
  >({});
  const [qtyLoading, setQtyLoading] = useState<Record<string, boolean>>({});

  // meta map to display colors and sizes
  const [metaMap, setMetaMap] = useState<
    Record<string, { colors: string[]; sizes: string[] }>
  >({});

  const fetchPage = useCallback(async (uiPage: number) => {
    setLoading(true);
    try {
      const { data } = await api.get<ListResponse>(
        `/api/products?page=${uiPage + 1}&limit=${ITEMS_PER_PAGE}`
      );
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      console.error("Error fetching products:", err);
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPage(page);
  }, [page, fetchPage]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / ITEMS_PER_PAGE)),
    [total]
  );

  // Visible rows on this page
  const visible = rows;

  // Compute totals AND collect display meta from deep product payload
  function computeFromDeep(p: ProductDeep) {
    let total = 0,
      reserved = 0,
      sellable = 0;
    const colorSet = new Set<string>();
    const sizeSet = new Set<string>();

    (p.variants ?? []).forEach((v) => {
      const colorName = v?.color?.name?.trim();
      if (colorName) colorSet.add(colorName);

      (v.sizes ?? []).forEach((s) => {
        total += Number(s.totalQuantity ?? 0);
        reserved += Number(s.reservedTotal ?? 0);
        const sell =
          s.sellableQuantity ??
          Math.max(
            0,
            Number(s.totalQuantity ?? 0) - Number(s.reservedTotal ?? 0)
          );
        sellable += Number(sell);

        const lbl = (s.label ?? "").toString().trim();
        if (lbl) sizeSet.add(lbl);
      });
    });

    return {
      totals: { total, reserved, sellable },
      meta: { colors: Array.from(colorSet), sizes: Array.from(sizeSet) },
    };
  }

  // Lazily fetch quantities + meta for the visible rows
  const fetchQuantitiesForVisible = useCallback(async () => {
    const idsToFetch = visible
      .map((r) => r._id)
      .filter((id) => !qtyMap[id] && !qtyLoading[id]); // skip already loaded/in-flight

    if (idsToFetch.length === 0) return;

    // Mark in-flight
    setQtyLoading((prev) => {
      const next = { ...prev };
      idsToFetch.forEach((id) => {
        next[id] = true;
      });
      return next;
    });

    try {
      const results = await Promise.allSettled(
        idsToFetch.map(async (id) => {
          const { data } = await api.get<ProductDeep>(`/api/products/${id}`);
          const { totals, meta } = computeFromDeep(data);
          return { id, totals, meta };
        })
      );

      const addQty: Record<
        string,
        { total: number; reserved: number; sellable: number }
      > = {};
      const addMeta: Record<string, { colors: string[]; sizes: string[] }> = {};
      const done: Record<string, boolean> = {};

      results.forEach((r) => {
        if (r.status === "fulfilled") {
          const { id, totals, meta } = r.value;
          addQty[id] = totals;
          addMeta[id] = meta;
          done[id] = true;
        } else {
          const failedId = (r as any).reason?.config?.url?.split("/").pop();
          if (failedId) done[failedId] = true;
        }
      });

      if (Object.keys(addQty).length)
        setQtyMap((prev) => ({ ...prev, ...addQty }));
      if (Object.keys(addMeta).length)
        setMetaMap((prev) => ({ ...prev, ...addMeta }));

      if (Object.keys(done).length) {
        setQtyLoading((prev) => {
          const next = { ...prev };
          Object.keys(done).forEach((id) => {
            delete next[id];
          });
          return next;
        });
      }
    } catch (e) {
      console.error(e);
      setQtyLoading((prev) => {
        const next = { ...prev };
        idsToFetch.forEach((id) => {
          delete next[id];
        });
        return next;
      });
    }
  }, [visible, qtyMap, qtyLoading]);

  useEffect(() => {
    fetchQuantitiesForVisible();
  }, [fetchQuantitiesForVisible]);

  // helper to render up to N chips with “+N more”
  const renderChips = (items: string[] | undefined, max = 6) => {
    if (!items || items.length === 0) return <span>—</span>;
    const head = items.slice(0, max);
    const extra = items.length - head.length;
    return (
      <div className="flex flex-wrap gap-1">
        {head.map((t) => (
          <span
            key={t}
            className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-800"
          >
            {t}
          </span>
        ))}
        {extra > 0 && (
          <span className="px-2 py-0.5 text-xs rounded-full bg-gray-200 text-gray-700">
            +{extra} more
          </span>
        )}
      </div>
    );
  };

  if (loading)
    return (
      <div className="p-6 text-lg font-medium">Loading products…</div>
    );

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 bg-white shadow-lg rounded-xl border border-gray-200">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold mb-6">Products</h1>
        <div className="flex justify-end mb-4 gap-2">
          <Button
            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all"
            onClick={() => router.push("/products/new")}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create product
          </Button>
          <Button variant="outline" onClick={() => fetchPage(page)}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto border rounded-lg shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-100">
              <TableHead className="font-semibold">Style No.</TableHead>
              <TableHead className="font-semibold">Title</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="font-semibold">Price</TableHead>
              <TableHead className="font-semibold">Colors & Sizes</TableHead>
              <TableHead className="font-semibold text-right">Total</TableHead>
              <TableHead className="font-semibold text-right">Reserved</TableHead>
              <TableHead className="font-semibold text-right">Sellable</TableHead>
              <TableHead className="font-semibold">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center py-6 text-gray-500"
                >
                  No products found.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((p) => {
                const qty = qtyMap[p._id];
                const loadingQty = !!qtyLoading[p._id];
                const meta = metaMap[p._id];

                return (
                  <TableRow
                    key={p._id}
                    className="hover:bg-indigo-50 transition-colors"
                  >
                    <TableCell className="font-mono">
                      <Link
                        href={`/products/${p._id}`}
                        className="text-indigo-600 hover:underline"
                      >
                        {p.styleNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/products/${p._id}`}
                        className="text-indigo-600 hover:underline"
                      >
                        {p.title}
                      </Link>
                    </TableCell>
                    <TableCell className="capitalize">{p.status}</TableCell>
                    <TableCell>{formatMinorGBP(p.price)}</TableCell>

                    {/* Colors & Sizes badges */}
                    <TableCell>
                      {loadingQty ? (
                        "…"
                      ) : (
                        <div className="space-y-1">
                          <div className="text-xs text-gray-500">Colors</div>
                          {renderChips(meta?.colors)}
                          <div className="text-xs text-gray-500 mt-1">
                            Sizes
                          </div>
                          {renderChips(meta?.sizes)}
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="text-right tabular-nums">
                      {loadingQty ? "…" : qty ? qty.total : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {loadingQty ? "…" : qty ? qty.reserved : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {loadingQty ? "…" : qty ? qty.sellable : "—"}
                    </TableCell>

                    <TableCell>
                      {p.updatedAt
                        ? new Date(p.updatedAt).toLocaleDateString("en-GB")
                        : "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-4 mt-6">
          <Button
            variant="outline"
            onClick={() => setPage((p) => Math.max(p - 1, 0))}
            disabled={page === 0}
          >
            Previous
          </Button>
          <span className="flex items-center text-gray-700">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            onClick={() =>
              setPage((p) => Math.min(p + 1, totalPages - 1))
            }
            disabled={page >= totalPages - 1}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
