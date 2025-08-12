"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Table, TableHeader, TableRow, TableHead, TableBody, TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import api from "@/lib/api";

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

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;
  const route = useRouter();


  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get<Product[]>("/api/products/list");
        const list = Array.isArray((data as any)?.products) ? (data as any).products : data;
        setProducts(list);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const start = page * ITEMS_PER_PAGE;
  const visible = products.slice(start, start + ITEMS_PER_PAGE);
  const totalPages = Math.ceil(products.length / ITEMS_PER_PAGE);


  const goPrev = () => setCurrentPage((p) => Math.max(p - 1, 1));
  const goNext = () => setCurrentPage((p) => Math.min(p + 1, totalPages));

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 bg-white shadow-lg rounded-xl border border-gray-200">
      {/* Heading */}
      <h1 className="text-2xl font-bold text-center text-gray-800 border-b-4 border pb-3 mb-6">
        Product Information
      </h1>

      {/* Create Product Button */}
      <div className="flex justify-end mb-4">
        <Button
          className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all"
          onClick={() => route.push("/Products/CreateProducts")}
        >
          Create Product
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border rounded-lg shadow-sm">
        <Table className="w-full border-collapse text-sm">
          <TableHeader>
            <TableRow className="bg-gray-100">
              <TableHead className="text-gray-700 font-semibold">Name</TableHead>
              <TableHead className="text-gray-700 font-semibold">SKU</TableHead>
              <TableHead className="text-gray-700 font-semibold">Description</TableHead>
              <TableHead className="text-gray-700 font-semibold">Color</TableHead>
              <TableHead className="text-gray-700 font-semibold">RRP</TableHead>
              <TableHead className="text-gray-700 font-semibold">Wholesale Price</TableHead>
              <TableHead className="text-gray-700 font-semibold">Supplier</TableHead>
              <TableHead className="text-gray-700 font-semibold">Category</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {currentProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-6 text-gray-500">
                  No products found.
                </TableCell>
              </TableRow>
            ) : (
              currentProducts.map((prod, index) => (
                <TableRow
                  key={prod._id || index}
                  className="hover:bg-indigo-50 transition-colors cursor-pointer"
                >
                  <TableCell className="font-medium text-gray-800">{prod.name}</TableCell>
                  <TableCell>
                    {prod._id ? (
                      <Link
                        href={`/Products/${prod._id}`}
                        className="text-indigo-600 hover:underline"
                      >
                        {prod.sku}
                      </Link>
                    ) : (
                      prod.sku
                    )}
                  </TableCell>
                  <TableCell className="text-gray-700">{prod.description}</TableCell>
                  <TableCell className="text-gray-700">{prod.color?.join(", ") || "-"}</TableCell>
                  <TableCell className="text-gray-700">{prod.rrp ?? "-"}</TableCell>
                  <TableCell className="text-gray-700">{prod.wholesalePrice ?? "-"}</TableCell>
                  <TableCell className="text-gray-700">{prod.supplier || "-"}</TableCell>
                  <TableCell className="text-gray-700">{prod.category || "-"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex justify-center gap-4 mt-6">
        <Button
          variant="outline"
          onClick={goPrev}
          disabled={currentPage === 1}
          className="disabled:opacity-50"
        >
          Previous
        </Button>
        <span className="flex items-center text-gray-700">
          Page {currentPage} of {totalPages}
        </span>
        <Button
          variant="outline"
          onClick={goNext}
          disabled={currentPage === totalPages}
          className="disabled:opacity-50"
        >
          Next
        </Button>
      </div>
    </div>
  );
}
