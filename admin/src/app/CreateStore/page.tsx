"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  PaginationState,
  useReactTable,
  getFilteredRowModel,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus } from "lucide-react";
import Link from "next/link";
import api from "@/lib/api";

// 1) Define your row type
type UserRow = {
  _id: string;
  username: string;
  email: string;
  role: "admin" | "customer";
  storenumber?: number;
  storename?: string;
  manager?: string;
  location?: string;
  contact?: string;
};

export default function UsersPage() {
  const [data, setData] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  // 2) Fetch once on mount
  useEffect(() => {
    api.get<UserRow[]>("/api/auth/users")
      .then((res) => setData(res.data))
      .catch((err) => {
        if (err.response?.status === 401) window.location.href = "/login";
        else console.error(err);
      })
      .finally(() => setLoading(false));
  }, []);

  // 3) Column definitions
  const columns = useMemo<ColumnDef<UserRow>[]>(
    () => [
      {
        accessorKey: "username",
        header: ({ column }) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            User {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </button>
        ),
        cell: (info) => info.getValue(),
      },
      {
        accessorKey: "email",
        header: ({ column }) => (
          <button onClick={() => column.toggleSorting()}>
            Email {column.getIsSorted() === "asc" ? "↑" : column.getIsSorted() === "desc" ? "↓" : ""}
          </button>
        ),
        cell: (info) => info.getValue(),
      },
      {
        accessorKey: "role",
        header: "Role",
        cell: (info) => info.getValue(),
      },
      {
        accessorKey: "storenumber",
        header: "Store #",
        cell: (info) => info.getValue() ?? "—",
      },
      {
        accessorKey: "storename",
        header: "Store Name",
        cell: (info) => info.getValue() ?? "—",
      },
      {
        accessorKey: "manager",
        header: "Manager",
        cell: (info) => info.getValue() ?? "—",
      },
      {
        accessorKey: "location",
        header: "Location",
        cell: (info) => info.getValue() ?? "—",
      },
      {
        accessorKey: "contact",
        header: "Contact",
        cell: (info) => info.getValue() ?? "—",
      },
    ],
    []
  );

  // 4) Table state (pagination, sorting, filtering)
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 12,
  });

  // 5) Create the table instance
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting: [],           // local sorting state
      pagination,            // pagination state
      globalFilter,
    },
    onSortingChange: (updater) => table.setSorting(updater),
    onPaginationChange: setPagination,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: () => table.getFilteredRowModel().rows.slice(
      pagination.pageIndex * pagination.pageSize,
      (pagination.pageIndex + 1) * pagination.pageSize
    ),
    globalFilterFn: "includesString", // simple substring match
  });

  if (loading) return <div className="p-4">Loading users…</div>;

  return (
    <div className="space-y-4 rounded-lg p-4">
      {/* Header + Global search */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Users</h1>
        <div className="flex items-center space-x-2">
          <Input
            placeholder="Search…"
            value={globalFilter}
            onChange={(e) => {
              setGlobalFilter(e.target.value);
              setPagination((p) => ({ ...p, pageIndex: 0 }));
            }}
          />
          <Link href="/users/new">
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create user
            </Button>
          </Link>
        </div>
      </div>

      {/* Table markup */}
      <table className="min-w-full table-auto">
        <thead>
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((header) => (
                <th key={header.id} className="px-4 py-2 text-left">
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext()
                  )}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="border-t">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-4 py-2">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Pagination controls */}
      <div className="flex justify-between items-center mt-2">
        <Button
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Previous
        </Button>
        <span>
          Page{" "}
          <strong>
            {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
          </strong>
        </span>
        <Button
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
