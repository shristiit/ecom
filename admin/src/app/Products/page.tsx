"use client";

import React, { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
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
  price: number;           // minor units
  updatedAt?: string;
  variantCount?: number;
};
type ListResponse = { page: number; limit: number; total: number; rows: ProductRow[] };

/** ---- Deep product (only fields we need) ---- */
type SizeTotals = {
  totalQuantity?: number;     // sum(onHand) across locations (reserved still counted)
  reservedTotal?: number;     // sum(reserved) across locations
  sellableQuantity?: number;  // max(0, onHand - reserved)
};
type VariantDeep = { sizes?: SizeTotals[] };
type ProductDeep = { _id: string; variants?: VariantDeep[] };

const ITEMS_PER_PAGE = 15;

function formatMinorGBP(pence?: number) {
  if (typeof pence !== "number") return "—";
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
}

export default function ProductsPage() {
  const router = useRouter();

  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0); // 0-based for UI
  const [total, setTotal] = useState(0);

  // qtyMap holds per-product totals once fetched
  const [qtyMap, setQtyMap] = useState<Record<string, { total: number; reserved: number; sellable: number }>>({});
  const [qtyLoading, setQtyLoading] = useState<Record<string, boolean>>({});

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

  useEffect(() => { fetchPage(page); }, [page, fetchPage]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / ITEMS_PER_PAGE)), [total]);

  // Visible rows on this page
  const visible = rows;

  // Compute totals from deep product payload
  function computeTotals(p: ProductDeep) {
    let total = 0, reserved = 0, sellable = 0;
    (p.variants ?? []).forEach(v => {
      (v.sizes ?? []).forEach(s => {
        total += Number(s.totalQuantity ?? 0);
        reserved += Number(s.reservedTotal ?? 0);
        sellable += Number(s.sellableQuantity ?? Math.max(0, Number(s.totalQuantity ?? 0) - Number(s.reservedTotal ?? 0)));
      });
    });
    return { total, reserved, sellable };
  }

  // Lazily fetch quantities for the visible rows
  const fetchQuantitiesForVisible = useCallback(async () => {
    const idsToFetch = visible
      .map(r => r._id)
      .filter(id => !qtyMap[id] && !qtyLoading[id]); // skip already loaded/in-flight

    if (idsToFetch.length === 0) return;

    // Mark in-flight
    setQtyLoading(prev => {
      const next = { ...prev };
      idsToFetch.forEach(id => { next[id] = true; });
      return next;
    });

    try {
      // Fetch in parallel (page size is small)
      const results = await Promise.allSettled(
        idsToFetch.map(async (id) => {
          const { data } = await api.get<ProductDeep>(`/api/products/${id}`);
          return { id, totals: computeTotals(data) };
        })
      );

      const add: Record<string, { total: number; reserved: number; sellable: number }> = {};
      const done: Record<string, boolean> = {};
      results.forEach(r => {
        if (r.status === "fulfilled") {
          const { id, totals } = r.value;
          add[id] = totals;
          done[id] = true;
        } else {
          // mark as done to avoid spinner loop; you could keep it false to retry
          const failedId = (r as any).reason?.config?.url?.split("/").pop();
          if (failedId) done[failedId] = true;
        }
      });

      if (Object.keys(add).length) {
        setQtyMap(prev => ({ ...prev, ...add }));
      }
      if (Object.keys(done).length) {
        setQtyLoading(prev => {
          const next = { ...prev };
          Object.keys(done).forEach(id => { delete next[id]; });
          return next;
        });
      }
    } catch (e) {
      console.error(e);
      // Clear in-flight flags on error
      setQtyLoading(prev => {
        const next = { ...prev };
        idsToFetch.forEach(id => { delete next[id]; });
        return next;
      });
    }
  }, [visible, qtyMap, qtyLoading]);
  console.log(visible)

  useEffect(() => { fetchQuantitiesForVisible(); }, [fetchQuantitiesForVisible]);

  if (loading) return <div className="p-6 text-lg font-medium">Loading products…</div>;

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
              {/* NEW columns */}
              <TableHead className="font-semibold text-right">Total</TableHead>
              <TableHead className="font-semibold text-right">Reserved</TableHead>
              <TableHead className="font-semibold text-right">Sellable</TableHead>
              <TableHead className="font-semibold">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-6 text-gray-500">
                  No products found.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((p) => {
                const qty = qtyMap[p._id];
                const loadingQty = !!qtyLoading[p._id];
                return (
                  <TableRow key={p._id} className="hover:bg-indigo-50 transition-colors">
                    <TableCell className="font-mono">
                      <Link href={`/products/${p._id}`} className="text-indigo-600 hover:underline">
                        {p.styleNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link href={`/products/${p._id}`} className="text-indigo-600 hover:underline">
                        {p.title}
                      </Link>
                    </TableCell>
                    <TableCell className="capitalize">{p.status}</TableCell>
                    <TableCell>{formatMinorGBP(p.price)}</TableCell>
                    <TableCell>{``}</TableCell>

                    {/* NEW qty cells */}
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
                      {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString("en-GB") : "—"}
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
          <Button variant="outline" onClick={() => setPage((p) => Math.max(p - 1, 0))} disabled={page === 0}>
            Previous
          </Button>
          <span className="flex items-center text-gray-700">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            onClick={() => setPage((p) => Math.min(p + 1, totalPages - 1))}
            disabled={page >= totalPages - 1}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
