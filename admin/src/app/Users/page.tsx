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
import { useRouter } from "next/navigation";

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
  const route = useRouter();

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

  if (loading)
    return <div className="p-6 text-lg font-medium">Loading users…</div>;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 bg-white shadow-lg rounded-xl border border-gray-200">
      {/* Heading */}
      <h1 className="text-2xl font-bold text-center text-gray-800 border-b-4 border pb-3 mb-6">
        Users
      </h1>

      {/* Create User Button */}
      <div className="flex justify-end mb-4">
        <Button
          className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all"
          onClick={() => route.push("/users/new")}
        >
          <Plus className="mr-2 h-4 w-4" />
          Create User
        </Button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border rounded-lg shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-100">
              <TableHead className="font-semibold">###</TableHead>
              <TableHead className="font-semibold">User</TableHead>
              <TableHead className="font-semibold">Email</TableHead>
              <TableHead className="font-semibold">Role</TableHead>
              <TableHead className="font-semibold">Store #</TableHead>
              <TableHead className="font-semibold">Store Name</TableHead>
              <TableHead className="font-semibold">Manager</TableHead>
              <TableHead className="font-semibold">Location</TableHead>
              <TableHead className="font-semibold">Contact</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={9}
                  className="text-center py-6 text-gray-500"
                >
                  No users found.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((u) => (
                <TableRow
                  key={u._id}
                  className="hover:bg-indigo-50 transition-colors"
                >
                  <TableCell className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>
                        {u.username?.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/users/${u._id}`}
                      className="text-indigo-600 hover:underline"
                    >
                      {u.username}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/users/${u._id}`}
                      className="text-indigo-600 hover:underline"
                    >
                      {u.email}
                    </Link>
                  </TableCell>
                  <TableCell className="capitalize">{u.role}</TableCell>
                  <TableCell>{u.storenumber ?? "—"}</TableCell>
                  <TableCell>{u.storename ?? "—"}</TableCell>
                  <TableCell>{u.manager ?? "—"}</TableCell>
                  <TableCell>{u.location ?? "—"}</TableCell>
                  <TableCell>{u.contact ?? "—"}</TableCell>
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
            onClick={() =>
              setPage((p) => Math.min(p + 1, totalPages - 1))
            }
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
