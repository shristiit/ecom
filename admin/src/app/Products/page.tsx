"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
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
  const [currentPage, setCurrentPage] = useState(0); // start from page 0
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
    return <div className="p-4">Loading products…</div>;
  }

  return (
    <div className="space-y-4 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Products</h1>
        <Link href="/products/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create product
          </Button>
        </Link>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SKU</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Supplier</TableHead>
            <TableHead>Color</TableHead>
            <TableHead>Wholesale</TableHead>
            <TableHead>RRP</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((p) => (
            <TableRow key={p._id} className="hover:bg-gray-50">
              <TableCell>
                <Link href={`/products/${p._id}`} className="text-blue-500 hover:underline">
                  {p.sku}
                </Link>
              </TableCell>
              <TableCell>{p.name}</TableCell>
              <TableCell>{p.category ?? "—"}</TableCell>
              <TableCell>{p.supplier ?? "—"}</TableCell>
              <TableCell>{p.color?.join(", ") ?? "—"}</TableCell>
              <TableCell>{p.wholesalePrice ?? "—"}</TableCell>
              <TableCell>{p.rrp ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="flex justify-between items-center m-3">
          <Button
            onClick={() => setCurrentPage((p) => Math.max(p - 1, 0))}
            disabled={currentPage === 0}
          >
            Previous
          </Button>
          <span>
            Page {currentPage + 1} of {totalPages}
          </span>
          <Button
            onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages - 1))}
            disabled={currentPage >= totalPages - 1}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
