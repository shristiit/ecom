"use client";

import React, { useEffect, useState } from "react";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import Link from "next/link";
import api from "@/lib/api";

type UserRow = {
  _id: string;
  username: string;
  email: string;
  role: "admin" | "customer";
  storenumber?: number;
  storename?: string;
  manager?: string;
  location?: string;
  address?: string;
  deliveryaddress?: string;
  contact?: string;
  companycontact?: string;
  vat?: string;
};

const ITEMS_PER_PAGE = 12;

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get<UserRow[]>("/api/auth/users");
        setUsers(data);
      } catch (err: any) {
        if (err.response?.status === 401) window.location.href = "/login";
        else console.error(err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const start = page * ITEMS_PER_PAGE;
  const visible = users.slice(start, start + ITEMS_PER_PAGE);
  const totalPages = Math.ceil(users.length / ITEMS_PER_PAGE);

  if (loading) return <div className="p-4">Loading users…</div>;

  return (
    <div className="space-y-4 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Users</h1>
        <Link href="/users/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Create user
          </Button>
        </Link>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>###</TableHead>
            <TableHead>User</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Store #</TableHead>
            <TableHead>Store Name</TableHead>
            <TableHead>Manager</TableHead>
            <TableHead>Location</TableHead>
            <TableHead>Contact</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((u) => (
            <TableRow key={u._id}>
              <TableCell className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarFallback>
                    {u.username?.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </TableCell>
              <TableCell>
                <Link href={`/users/${u._id}`} className="hover:underline text-blue-500
               " >
                  {u.username}
                </Link>
              </TableCell>
              <TableCell>
                <Link href={`/users/${u._id}`} className="  text-blue-500 hover:underline">
                  {u.email}
                </Link>
              </TableCell>
              <TableCell>{u.role}</TableCell>
              <TableCell>{u.storenumber ?? "—"}</TableCell>
              <TableCell>{u.storename ?? "—"}</TableCell>
              <TableCell>{u.manager ?? "—"}</TableCell>
              <TableCell>{u.location ?? "—"}</TableCell>
              <TableCell>{u.contact ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="flex justify-between items-center m-3">
          <Button onClick={() => setPage((p) => Math.max(p - 1, 0))} disabled={page === 0}>
            Previous
          </Button>
          <span>
            Page {page + 1} of {totalPages}
          </span>
          <Button
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
