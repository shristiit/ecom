"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
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
import { useRouter } from "next/navigation";

type Product = {
  _id: string;
  sku: string;
  name: string;
  category?: string;
  supplier?: string;
  color?: string[];
  wholesalePrice?: number;
  rrp?: number;
};

const ITEMS_PER_PAGE = 15;

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/api/products/list");
        const list = Array.isArray(data?.products) ? data.products : data;
        setProducts(list);
      } catch (error) {
        console.error("Error fetching products:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const start = currentPage * ITEMS_PER_PAGE;
  const visible = products.slice(start, start + ITEMS_PER_PAGE);
  const totalPages = Math.ceil(products.length / ITEMS_PER_PAGE);

  if (loading) {
    return <div className="p-6 text-lg font-medium">Loading products…</div>;
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 bg-white shadow-lg rounded-xl border border-gray-200">
      {/* Heading */}
      <div className="flex items-center justify-between">
      <h1 className="text-2xl font-bold mb-6">
        Products
      </h1>

      
      <div className="flex justify-end mb-4">
        <Button
          className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all"
          onClick={() => router.push("/products/new")}
        >
          <Plus className="mr-2 h-4 w-4" />
          Create product
        </Button>
      </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border rounded-lg shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-100">
              <TableHead className="font-semibold">SKU</TableHead>
              <TableHead className="font-semibold">Name</TableHead>
              <TableHead className="font-semibold">Category</TableHead>
              <TableHead className="font-semibold">Supplier</TableHead>
              <TableHead className="font-semibold">Color</TableHead>
              <TableHead className="font-semibold">Wholesale</TableHead>
              <TableHead className="font-semibold">RRP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-6 text-gray-500">
                  No products found.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((p) => (
                <TableRow key={p._id} className="hover:bg-indigo-50 transition-colors">
                  <TableCell>{p.sku}</TableCell>
                  <TableCell>
                    <Link href={`/products/${p._id}`} className="text-indigo-600 hover:underline">
                      {p.name}
                    </Link>
                  </TableCell>
                  <TableCell>{p.category ?? "—"}</TableCell>
                  <TableCell>{p.supplier ?? "—"}</TableCell>
                  <TableCell>{p.color?.join(", ") ?? "—"}</TableCell>
                  <TableCell>{p.wholesalePrice ?? "—"}</TableCell>
                  <TableCell>{p.rrp ?? "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-4 mt-6">
          <Button
            variant="outline"
            onClick={() => setCurrentPage((p) => Math.max(p - 1, 0))}
            disabled={currentPage === 0}
            className="disabled:opacity-50"
          >
            Previous
          </Button>
          <span className="flex items-center text-gray-700">
            Page {currentPage + 1} of {totalPages}
          </span>
          <Button
            variant="outline"
            onClick={() =>
              setCurrentPage((p) => Math.min(p + 1, totalPages - 1))
            }
            disabled={currentPage >= totalPages - 1}
            className="disabled:opacity-50"
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
