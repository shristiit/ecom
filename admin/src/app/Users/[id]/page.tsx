"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";

type Role = "admin" | "customer";

type UserDto = {
  _id: string;
  username: string;
  email: string;
  role: Role;
  storenumber?: number | string;
  storename?: string;
  manager?: string;
  location?: string;
  address?: string;
  deliveryaddress?: string;
  contact?: string;
  companycontact?: string;
  vat?: string;
};

export default function UserDetailsPage() {
  const params = useParams<{ id: string }>();
  const id = (params?.id || "") as string;
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<UserDto>({
    _id: "",
    username: "",
    email: "",
    role: "customer",
    storenumber: "",
    storename: "",
    manager: "",
    location: "",
    address: "",
    deliveryaddress: "",
    contact: "",
    companycontact: "",
    vat: "",
  });

  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        setLoading(true);
        const { data } = await api.get<UserDto>(`/api/auth/users/${id}`);
        setForm({
          _id: data._id,
          username: data.username ?? "",
          email: data.email ?? "",
          role: (data.role as Role) ?? "customer",
          storenumber: data.storenumber ?? "",
          storename: data.storename ?? "",
          manager: data.manager ?? "",
          location: data.location ?? "",
          address: data.address ?? "",
          deliveryaddress: data.deliveryaddress ?? "",
          contact: data.contact ?? "",
          companycontact: data.companycontact ?? "",
          vat: data.vat ?? "",
        });
      } catch (err: any) {
        if (err.response?.status === 401) {
          window.location.href = "/login";
        } else if (err.response?.status === 403) {
          setError("You don't have permission to view this user.");
        } else if (err.response?.status === 404) {
          setError("User not found.");
        } else {
          setError("Failed to load user.");
          console.error(err);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const update = (k: keyof UserDto, v: any) =>
    setForm((f) => ({ ...f, [k]: v }));

  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload: any = {
      username: form.username,
      email: form.email,
      role: form.role,
      storename: form.storename,
      manager: form.manager,
      location: form.location,
      address: form.address,
      deliveryaddress: form.deliveryaddress,
      contact: form.contact,
      companycontact: form.companycontact,
      vat: form.vat,
    };

    if (form.storenumber !== "" && form.storenumber !== undefined) {
      const num = Number(form.storenumber);
      if (!Number.isNaN(num)) payload.storenumber = num;
    }

    if (newPassword.trim()) {
      payload.password = newPassword.trim(); // backend hashes
    }

    try {
      const { data } = await api.patch(`/api/auth/users/${id}`, payload);
      setForm({
        _id: data._id,
        username: data.username ?? "",
        email: data.email ?? "",
        role: (data.role as Role) ?? "customer",
        storenumber: data.storenumber ?? "",
        storename: data.storename ?? "",
        manager: data.manager ?? "",
        location: data.location ?? "",
        address: data.address ?? "",
        deliveryaddress: data.deliveryaddress ?? "",
        contact: data.contact ?? "",
        companycontact: data.companycontact ?? "",
        vat: data.vat ?? "",
      });
      setNewPassword("");
      alert("User saved ✅");
    } catch (err: any) {
      if (err.response?.status === 400) {
        setError("Validation failed. Check your inputs.");
      } else if (err.response?.status === 401) {
        window.location.href = "/login";
      } else if (err.response?.status === 403) {
        setError("You don't have permission to edit this user.");
      } else if (err.response?.status === 409) {
        setError("Username or email already in use.");
      } else {
        setError("Failed to save user.");
        console.error(err);
      }
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!window.confirm("Delete this user? This cannot be undone.")) return;
    try {
      const { data } = await api.delete(`/api/auth/users/${id}`);
      if (!data?.deleted) {
        setError("Delete API responded but did not confirm deletion.");
        return;
      }
      alert("User deleted.");
      router.replace("/users");
      // If your list page is heavily cached, use hard reload:
      // window.location.href = "/users";
    } catch (err: any) {
      if (err.response?.status === 401) {
        window.location.href = "/login";
      } else if (err.response?.status === 403) {
        setError("You don't have permission to delete this user.");
      } else if (err.response?.status === 404) {
        setError("User already deleted.");
        router.replace("/users");
      } else {
        setError("Failed to delete user.");
        console.error(err);
      }
    }
  };

  if (loading) return <div className="p-4">Loading user…</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;

  return (
    <div className="p-4 space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Edit User</h1>
        <Link href="/Users" className="underline m-2">
          Back to Users
        </Link>
      </div>

      <form onSubmit={onSave} className="space-y-6">
        {/* Top-level fields */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="username" className="m-2">Username</Label>
            <Input
              id="username"
              value={form.username}
              onChange={(e) => update("username", e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="email" className="m-2">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
            />
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
        </section>

        {/* Password section */}
        <section className="space-y-3">
          <h2 className="font-medium">Password</h2>
        
            <div>
              <Label htmlFor="newPassword" className="m-2">New password</Label>
              <Input
                id="newPassword"
                type="text" 
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                pattern=".{6,}"
                title="Password must be at least 6 characters"
                placeholder="Leave blank to keep unchanged"
              />
            </div>
      
        </section>

        {/* Store section */}
        <section className="space-y-3">
          <h2 className="font-medium">Store</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="storenumber" className="m-2">Store #</Label>
              <Input
                id="storenumber"
                value={form.storenumber ?? ""}
                onChange={(e) => update("storenumber", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="storename" className="m-2">Store Name</Label>
              <Input
                id="storename"
                value={form.storename ?? ""}
                onChange={(e) => update("storename", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="manager" className="m-2">Manager</Label>
              <Input
                id="manager"
                value={form.manager ?? ""}
                onChange={(e) => update("manager", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="location" className="m-2">Location</Label>
              <Input
                id="location"
                value={form.location ?? ""}
                onChange={(e) => update("location", e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="address" className="m-2">Address</Label>
              <Input
                id="address"
                value={form.address ?? ""}
                onChange={(e) => update("address", e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="deliveryaddress" className="m-2">Delivery Address</Label>
              <Input
                id="deliveryaddress"
                value={form.deliveryaddress ?? ""}
                onChange={(e) => update("deliveryaddress", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="contact" className="m-2">Contact</Label>
              <Input
                id="contact"
                value={form.contact ?? ""}
                onChange={(e) => update("contact", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="companycontact" className="m-2">Company Contact</Label>
              <Input
                id="companycontact"
                value={form.companycontact ?? ""}
                onChange={(e) => update("companycontact", e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="vat"className="m-2">VAT</Label>
              <Input
                id="vat"
                value={form.vat ?? ""}
                onChange={(e) => update("vat", e.target.value)}
              />
            </div>
          </div>
        </section>

        {error && <p className="text-red-600">{error}</p>}

        <div className="flex flex-wrap gap-2 items-center">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => router.refresh()}>
            Refresh
          </Button>
          <Button type="button" variant="destructive" onClick={onDelete} className="ml-auto">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete user
          </Button>
        </div>
      </form>
    </div>
  );
}
