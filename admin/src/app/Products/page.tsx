"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";

interface Product {
  _id?: string;
  name: string;
  sku?: string;
  description?: string;
  color?: string[];
  rrp?: number;
  wholesalePrice?: number;
  supplier?: string;
  category?: string;
}

const Products = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  useEffect(() => {
    fetch("http://localhost:4000/api/products/list")
      .then((res) => res.json())
      .then((data) => {
        const productList = Array.isArray(data.products) ? data.products : data;
        setProducts(productList);
      })
      .catch((err) => console.error("Failed to fetch products:", err));
  }, []);

  const totalPages = Math.ceil(products.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentProducts = products.slice(startIndex, startIndex + itemsPerPage);

  const goPrev = () => setCurrentPage((p) => Math.max(p - 1, 1));
  const goNext = () => setCurrentPage((p) => Math.min(p + 1, totalPages));
  const route = useRouter()
  return (
    <div className="p-4 m-2 max-w-7xl mx-auto">
      <h1 className="text-xl font-semibold text-center border-b-4 mb-4 pb-2">
        Product Information
      </h1>

      {/* Create Product Button */}
      <div className="flex justify-end mb-4">
        <Link href="/Products/CreateProducts">
          <Button variant="default" onClick={()=>route.push("/Products/CreateProducts")}>Create Product</Button>
        </Link>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>SKU</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Color</TableHead>
            <TableHead>RRP</TableHead>
            <TableHead>Wholesale Price</TableHead>
            <TableHead>Supplier</TableHead>
            <TableHead>Category</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {currentProducts.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center">
                No products found.
              </TableCell>
            </TableRow>
          ) : (
            currentProducts.map((prod, index) => (
              <TableRow key={prod._id || index} className="hover:bg-gray-50">
                <TableCell>{prod.name}</TableCell>
                <TableCell>
                  {prod._id ? (
                    <Link
                      href={`/Products/${prod._id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {prod.sku}
                    </Link>
                  ) : (
                    prod.sku
                  )}
                </TableCell>
                <TableCell>{prod.description}</TableCell>
                <TableCell>{prod.color?.join(", ") || "-"}</TableCell>
                <TableCell>{prod.rrp ?? "-"}</TableCell>
                <TableCell>{prod.wholesalePrice ?? "-"}</TableCell>
                <TableCell>{prod.supplier || "-"}</TableCell>
                <TableCell>{prod.category || "-"}</TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <div className="flex justify-center gap-4 mt-4">
        <Button onClick={goPrev} disabled={currentPage === 1}>
          Previous
        </Button>
        <span className="flex items-center">
          Page {currentPage} of {totalPages}
        </span>
        <Button onClick={goNext} disabled={currentPage === totalPages}>
          Next
        </Button>
      </div>
    </div>
  );
};

export default Products;
