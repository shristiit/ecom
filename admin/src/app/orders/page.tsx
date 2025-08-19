"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Plus } from "lucide-react";

type OrderProduct = {
  name: string;
  price: number;   
  quantity: number;
};

type Customer = string | { name: string;}; // to avoid email and phone remove the phone and email

type Order = {
  _id: string;
  orderNumber?: string;
  customer?: Customer;
  products?: OrderProduct[];       // simple model
  items?: any[];                   // future model (snapshot items)
  totalAmount?: number;            // simple model total (£)
  grandTotal?: number;             // future model total (minor units/pence)
  status?: string;                 // optional in future model
  createdAt?: string;
};

const ITEMS_PER_PAGE = 15;

function getCustomerName(cust?: Customer) {
  if (!cust) return "—";
  if (typeof cust === "string") return cust || "—";
  // return cust.name || cust.email || cust.phone || "—";
}

function getItemsCount(o: Order) {
  if (Array.isArray(o.items)) return o.items.reduce((s, it: any) => s + (it.quantity || 0), 0);
  if (Array.isArray(o.products)) return o.products.reduce((s, p) => s + (p.quantity || 0), 0);
  return 0;
}

function formatTotal(o: Order) {
  // Prefer future model grandTotal (minor units), else fallback to simple model totalAmount (assumed £)
  if (typeof o.grandTotal === "number") return `£${(o.grandTotal / 100).toFixed(2)}`;
  if (typeof o.totalAmount === "number") return `£${Number(o.totalAmount).toFixed(2)}`;
  return "—";
}

function formatDate(iso?: string) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
  const fetchOrders = async () => {
    setLoading(true);
    setErr(null);

    try {
      // Try /api/orders, fallback to /api/orders/list
      const res = await api.get("/api/orders").catch(() =>
        api.get("/api/orders/list")
      );

      const data = res.data;
      const list: Order[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.rows)
        ? data.rows
        : [];

      setOrders(list);
    } catch (e: any) {
      setErr(e?.response?.data?.message || "Failed to load orders.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  fetchOrders();
}, []);


  const totalPages = useMemo(() => Math.max(1, Math.ceil(orders.length / ITEMS_PER_PAGE)), [orders]);
  const start = page * ITEMS_PER_PAGE;
  const visible = orders.slice(start, start + ITEMS_PER_PAGE);

  if (loading) return <div className="p-6 text-lg font-medium">Loading orders…</div>;
  if (err) return <div className="p-6 text-red-600">{err}</div>;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 bg-white shadow-lg rounded-xl border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold mb-6">Orders</h1>
        <div className="flex justify-end mb-4">
          <Button
            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all"
            onClick={() => router.push("/orders/new")}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create order
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border rounded-lg shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-100">
              <TableHead className="font-semibold">Order #</TableHead>
              <TableHead className="font-semibold">Customer</TableHead>
              <TableHead className="font-semibold">Items</TableHead>
              <TableHead className="font-semibold">Total</TableHead>
              <TableHead className="font-semibold">Status</TableHead>
              <TableHead className="font-semibold">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-6 text-gray-500">
                  No orders found.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((o) => (
                <TableRow key={o._id} className="hover:bg-indigo-50 transition-colors">
                  <TableCell>
                    <Link href={`/orders/${o._id}`} className="text-indigo-600 hover:underline">
                      {o.orderNumber || o._id.slice(-6).toUpperCase()}
                    </Link>
                  </TableCell>
                  <TableCell>{getCustomerName(o.customer)}</TableCell>
                  <TableCell>{getItemsCount(o)}</TableCell>
                  <TableCell>{formatTotal(o)}</TableCell>
                  <TableCell>{o.status || "—"}</TableCell>
                  <TableCell>{formatDate(o.createdAt)}</TableCell>
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
