"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import api from "@/lib/api";

type ProductRow = {
  _id: string;
  styleNumber: string;
  title: string;
  status: "active" | "inactive" | "draft" | "archived";
  price: number;           // minor units
  updatedAt?: string;
  variantCount?: number;   // provided by backend list aggregation
};

type ListResponse = {
  page: number;
  limit: number;
  total: number;
  rows: ProductRow[];
};

const ITEMS_PER_PAGE = 15;

function formatMinorGBP(pence: number | undefined) {
  if (typeof pence !== "number") return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

export default function ProductsPage() {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0); // 0-based for UI
  const [total, setTotal] = useState(0);
  const router = useRouter();

  const fetchPage = useCallback(async (uiPage: number) => {
    setLoading(true);
    try {
      // backend uses 1-based pages
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

  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));

  if (loading) {
    return <div className="p-6 text-lg font-medium">Loading products…</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 bg-white shadow-lg rounded-xl border border-gray-200">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold mb-6">Products</h1>
        <div className="flex justify-end mb-4">
          <Button
            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all"
            onClick={() => router.push("/Products/new")}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create product
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
              <TableHead className="font-semibold">Variants</TableHead>
              <TableHead className="font-semibold">Updated</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-gray-500">
                  No products found.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((p) => (
                <TableRow key={p._id} className="hover:bg-indigo-50 transition-colors">
                  <TableCell className="font-mono">{p.styleNumber}</TableCell>
                  <TableCell>
                    {/* ensure backend list returns _id; if not, include _id in $project */}
                    <Link href={`/products/${p._id}`} className="text-indigo-600 hover:underline">
                      {p.title}
                    </Link>
                  </TableCell>
                  <TableCell className="capitalize">{p.status}</TableCell>
                  <TableCell>{formatMinorGBP(p.price)}</TableCell>
                  <TableCell>{p.variantCount ?? "—"}</TableCell>
                  <TableCell>
                    {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString("en-GB") : "—"}
                  </TableCell>
                </TableRow>
              ))
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
            className="disabled:opacity-50"
          >
            Previous
          </Button>
          <span className="flex items-center text-gray-700">
            Page {page + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            onClick={() => setPage((p) => Math.min(p + 1, totalPages - 1))}
            disabled={page >= totalPages - 1}
            className="disabled:opacity-50"
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
