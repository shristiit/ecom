"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Role = "admin" | "customer";

export default function NewUserPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    username: "",
    email: "",
    role: "customer" as Role,
    password: "",
    storenumber: "" as number | string,
    storename: "",
    manager: "",
    location: "",
    address: "",
    deliveryaddress: "",
    contact: "",
    companycontact: "",
    vat: "",
  });

  const update = (k: keyof typeof form, v: any) =>
    setForm((f) => ({ ...f, [k]: v }));

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload: any = {
      username: form.username,
      email: form.email,
      role: form.role,
      password: form.password,
      storename: form.storename,
      manager: form.manager,
      location: form.location,
      address: form.address,
      deliveryaddress: form.deliveryaddress,
      contact: form.contact,
      companycontact: form.companycontact,
      vat: form.vat,
    };

    const num = Number(form.storenumber);
    payload.storenumber = Number.isNaN(num) ? undefined : num;

    try {
      await api.post("/api/auth/register", payload);
      alert("User created ✅");
      router.push("/Users");
    } catch (err: any) {
      if (err.response?.status === 409) {
        setError("Username or email already exists.");
      } else {
        const msg =
          err.response?.data?.message ||
          err.response?.data?.errors?.[0]?.msg ||
          "Failed to create user.";
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Create User</h1>
        <Link href="/Users" className="underline">Back to Users</Link>
      </div>

      <form onSubmit={onSave} className="space-y-6">
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="username" className="m-2">Username</Label>
            <Input id="username" required value={form.username} onChange={(e) => update("username", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="email" className="m-2">Email</Label>
            <Input id="email" type="email" required value={form.email} onChange={(e) => update("email", e.target.value)} />
          </div>
          <div>
            <Label htmlFor="role" className="m-2">Role</Label>
            <select
              id="role"
              className="border rounded h-10 px-3 w-full"
              value={form.role}
              onChange={(e) => update("role", e.target.value as Role)}
            >
              <option value="customer">customer</option>
              <option value="admin">admin</option>
            </select>
          </div>
          <div>
            <Label htmlFor="password" className="m-2">Password</Label>
            <Input
              id="password"
              type="text" 
              value={form.password}
              required
              minLength={6}
              onChange={(e) => update("password", e.target.value)}
              pattern=".{6,}"
              title="Password must be at least 6 characters"
              placeholder="Set initial password"
            />
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-medium">Store</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="storenumber" className="m-2">Store #</Label>
              <Input
                id="storenumber"
                type="number"
                required
                value={form.storenumber}
                onChange={(e) => update("storenumber", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="storename" className="m-2">Store Name</Label>
              <Input id="storename" value={form.storename} onChange={(e) => update("storename", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="manager" className="m-2">Manager</Label>
              <Input id="manager" value={form.manager} onChange={(e) => update("manager", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="location" className="m-2">Location</Label>
              <Input id="location" value={form.location} onChange={(e) => update("location", e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="address" className="m-2">Address</Label>
              <Input id="address" value={form.address} onChange={(e) => update("address", e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="deliveryaddress" className="m-2">Delivery Address</Label>
              <Input id="deliveryaddress" value={form.deliveryaddress} onChange={(e) => update("deliveryaddress", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="contact" className="m-2">Contact</Label>
              <Input id="contact" value={form.contact} onChange={(e) => update("contact", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="companycontact" className="m-2">Company Contact</Label>
              <Input id="companycontact" value={form.companycontact} onChange={(e) => update("companycontact", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="vat" className="m-2">VAT</Label>
              <Input id="vat" value={form.vat} onChange={(e) => update("vat", e.target.value)} />
            </div>
          </div>
        </section>

        {error && <p className="text-red-600">{error}</p>}

        <div className="flex gap-2">
          <Button className="bg-green-600" type="submit" disabled={saving}>{saving ? "Creating…" : "Create user"}</Button>
        </div>
      </form>
    </div>
  );
}
