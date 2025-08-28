"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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

type OrderProduct = { name: string; price: number; quantity: number };
type OrderStatus = "In Hand" | "Processing" | "Delivered";

type OrderItemSnap = {
  _id: string;
  productId: string;
  variantId: string;
  sizeId: string;
  styleNumber: string;
  title: string;
  sku: string;
  sizeLabel: string;
  unitPrice: number; // minor units
  quantity: number;
  lineTotal: number; // minor units
  location?: string;
};

type AddressObj =
  | {
      name?: string;
      phone?: string;
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    }
  | string
  | undefined;

type Customer = string | { name?: string; phone?: string; email?: string };

type Order = {
  _id: string;
  orderNumber?: string;
  status?: string;
  fulfillmentStatus?: string;
  currency?: string;
  customer?: Customer;

  // simple model
  products?: OrderProduct[];
  totalAmount?: number; // GBP float
  shippingAddress?: AddressObj;

  // ERD model
  items?: OrderItemSnap[];
  subTotal?: number; // minor units
  taxTotal?: number; // minor units
  shippingFee?: number; // minor units
  discountTotal?: number; // minor units
  grandTotal?: number; // minor units
  billingAddress?: AddressObj;
  createdAt?: string;
  updatedAt?: string;
};

function moneyMinorToGBP(n?: number) {
  if (typeof n !== "number") return "—";
  return `£${(n / 100).toFixed(2)}`;
}

function moneyFloatGBP(n?: number) {
  if (typeof n !== "number") return "—";
  return `£${n.toFixed(2)}`;
}

function getCustomerText(c?: Customer) {
  if (!c) return "—";
  if (typeof c === "string") return c;
  const bits = [c.name, c.phone, c.email].filter(Boolean);
  return bits.length ? bits.join(" · ") : "—";
}

function formatAddress(addr?: AddressObj) {
  if (!addr) return "—";
  if (typeof addr === "string") return addr;
  const bits = [
    addr.name,
    addr.phone,
    addr.line1,
    addr.line2,
    addr.city,
    addr.state,
    addr.postalCode,
    addr.country,
  ]
    .filter(Boolean)
    .join(", ");
  return bits || "—";
}

function fmtDate(iso?: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function OrderDetailsPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = (params?.id || "") as string;
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const STATUS_OPTIONS: Array<{ label: string; value: OrderStatus }> = [
    { label: "In Hand", value: "In Hand" },
    { label: "Processing", value: "Processing" },
    { label: "Delivered", value: "Delivered" },
  ];

  const [statusSaving, setStatusSaving] = React.useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const { data } = await api.get<Order>(`/api/orders/${id}`);
        setOrder(data);
      } catch (e: any) {
        const msg =
          e?.response?.data?.message ||
          (e?.response?.status === 404
            ? "Order not found."
            : "Failed to load order.");
        setErr(msg);
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const isERD = useMemo(
    () => !!order?.items && Array.isArray(order.items),
    [order]
  );

  // Totals (display)
  const totalsView = useMemo(() => {
    if (!order) return { sub: "—", tax: "—", ship: "—", disc: "—", grand: "—" };
    if (isERD) {
      return {
        sub: moneyMinorToGBP(order.subTotal),
        tax: moneyMinorToGBP(order.taxTotal),
        ship: moneyMinorToGBP(order.shippingFee),
        disc: moneyMinorToGBP(order.discountTotal),
        grand: moneyMinorToGBP(order.grandTotal),
      };
    }
    // simple model fallback
    let computed = 0;
    if (Array.isArray(order.products)) {
      computed = order.products.reduce(
        (s, p) => s + (p.price || 0) * (p.quantity || 0),
        0
      );
    }
    return {
      sub: moneyFloatGBP(computed),
      tax: "£0.00",
      ship: "£0.00",
      disc: "£0.00",
      grand: moneyFloatGBP(order.totalAmount ?? computed),
    };
  }, [order, isERD]);

  async function onDelete() {
    if (!order) return;
    if (!confirm("Delete this order? This cannot be undone.")) return;
    try {
      setDeleting(true);
      await api.delete(`/api/orders/${order._id}`);
      alert("Order deleted.");
      router.replace("/orders");
    } catch (e: any) {
      const msg = e?.response?.data?.message || "Failed to delete order.";
      alert(msg);
    } finally {
      setDeleting(false);
    }
  }

  if (loading)
    return <div className="p-6 text-lg font-medium">Loading order…</div>;
  if (err) return <div className="p-6 text-red-600">{err}</div>;
  if (!order) return <div className="p-6">Not found.</div>;


  async function updateOrderStatus(newStatus: OrderStatus) {
  if (!order) return;

  setStatusSaving(true);
  const prev = order.status as OrderStatus | undefined;

  // optimistic UI
  setOrder({ ...order, status: newStatus });

  try {
    await api.post("/api/orders/update", {
      orderNumber: order._id,        // your controller treats this as _id
      status: newStatus,             // must match enum exactly
    });
    // Optionally refetch if you want fresh updatedAt:
    // const { data } = await api.get(`/api/orders/${order._id}`);
    // setOrder(data);
  } catch (e: any) {
    setOrder({ ...order, status: prev }); // revert on error
    alert(e?.response?.data?.message || "Failed to update status.");
  } finally {
    setStatusSaving(false);
  }
}


  return (
    <div className="max-w-6xl mx-auto px-6 py-8 bg-white shadow-lg rounded-xl border border-gray-200 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">
            Order {order.orderNumber || order._id.slice(-6).toUpperCase()}
          </h1>
          <p className="text-sm text-gray-600">
            Created: {fmtDate(order.createdAt)} • Updated:{" "}
            {fmtDate(order.updatedAt)}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/orders" className="underline self-center">
            Back to Orders
          </Link>
          <Button variant="destructive" onClick={onDelete} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded-lg p-4">
          <div className="text-sm text-gray-500">Customer</div>
          <div className="mt-1 font-medium">
            {getCustomerText(order.customer)}
          </div>
        </div>
        <div className="border rounded-lg p-4">
          <h1>status</h1>
          <select
      className="w-full h-10 border rounded px-3 disabled:opacity-60"
      value={(order.status as OrderStatus) ?? "In Hand"}
      onChange={(e) => updateOrderStatus(e.target.value as OrderStatus)}
      disabled={statusSaving}
    >
      {STATUS_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
    {statusSaving && <div className="text-xs text-gray-500 mt-1">Updating…</div>}
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-sm text-gray-500">Total</div>
          <div className="mt-1 text-xl font-semibold">{totalsView.grand}</div>
        </div>
      </div>

      {/* Addresses */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border rounded-lg p-4">
          <div className="font-medium mb-1">Shipping Address</div>
          <div className="text-gray-700">
            {formatAddress(order.shippingAddress)}
          </div>
        </div>
        {isERD && (
          <div className="border rounded-lg p-4">
            <div className="font-medium mb-1">Billing Address</div>
            <div className="text-gray-700">
              {formatAddress(order.billingAddress)}
            </div>
          </div>
        )}
      </div>

      {/* Items */}
      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-100">
              {isERD ? (
                <>
                  <TableHead className="font-semibold">SKU</TableHead>
                  <TableHead className="font-semibold">Item</TableHead>
                  <TableHead className="font-semibold">Size</TableHead>
                  <TableHead className="font-semibold">Qty</TableHead>
                  <TableHead className="font-semibold">Unit</TableHead>
                  <TableHead className="font-semibold">Line</TableHead>
                  <TableHead className="font-semibold">Location</TableHead>
                </>
              ) : (
                <>
                  <TableHead className="font-semibold">Item</TableHead>
                  <TableHead className="font-semibold">Price</TableHead>
                  <TableHead className="font-semibold">Qty</TableHead>
                  <TableHead className="font-semibold">Line Total</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isERD && order.items && order.items.length > 0 ? (
              order.items.map((it) => (
                <TableRow key={it._id}>
                  <TableCell>{it.sku}</TableCell>
                  <TableCell>
                    <div className="font-medium">{it.title}</div>
                    <div className="text-xs text-gray-500">
                      {it.styleNumber}
                    </div>
                  </TableCell>
                  <TableCell>{it.sizeLabel}</TableCell>
                  <TableCell>{it.quantity}</TableCell>
                  <TableCell>{moneyMinorToGBP(it.unitPrice)}</TableCell>
                  <TableCell>{moneyMinorToGBP(it.lineTotal)}</TableCell>
                  <TableCell>{it.location || "—"}</TableCell>
                </TableRow>
              ))
            ) : Array.isArray(order.products) && order.products.length > 0 ? (
              order.products.map((p, idx) => (
                <TableRow key={idx}>
                  <TableCell>
                    <div className="font-medium">{p.name}</div>
                  </TableCell>
                  <TableCell>{moneyFloatGBP(p.price)}</TableCell>
                  <TableCell>{p.quantity}</TableCell>
                  <TableCell>{moneyFloatGBP(p.price * p.quantity)}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={isERD ? 7 : 4}
                  className="text-center py-6 text-gray-500"
                >
                  No items.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Totals */}
      <div className="flex justify-end">
        <div className="w-full md:w-96 border rounded-lg p-4 space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-600">Subtotal</span>
            <span className="font-medium">{totalsView.sub}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Tax</span>
            <span className="font-medium">{totalsView.tax}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Shipping</span>
            <span className="font-medium">{totalsView.ship}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Discount</span>
            <span className="font-medium">{totalsView.disc}</span>
          </div>
          <div className="border-t pt-2 flex justify-between">
            <span className="font-semibold">Grand Total</span>
            <span className="font-semibold">{totalsView.grand}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
