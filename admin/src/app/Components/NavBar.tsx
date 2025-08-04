"use client";

import React, { useEffect, useState } from "react";
import { LogOut, Moon, Settings, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SidebarTrigger } from "@/components/ui/sidebar";
import api from "@/lib/api";

interface Me {
  _id: string;
  username: string;
  email: string;
  role: "admin" | "customer";
  firstName?: string;
  lastName?: string;
  avatarUrl?: string;
}

export default function NavBar() {
  const [me, setMe] = useState<Me | null>(null);
  const router = useRouter();

  /* ─ fetch authenticated user once ──────────────────────────── */
  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await api.get<Me>("/api/auth/me");
        setMe(data);
      } catch {
        // token invalid/expired → kick back to /login
        router.replace("/login");
      }
    };
    load();
  }, [router]);

 
  const fullName =
    me?.firstName ? `${me.firstName} ${me.lastName ?? ""}`.trim() : me?.username;
  const firstChar = fullName?.charAt(0).toUpperCase() ?? "?";

  const logout = () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    router.push("/login");
  };

  return (
    <nav className="flex items-center justify-between m-3">
      <SidebarTrigger />

      <div className="flex items-center gap-4">
        <Link href="/">dashboard</Link>
        <Moon />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Avatar className="cursor-pointer">
              {me?.avatarUrl ? (
                <AvatarImage src={me.avatarUrl} alt="avatar" />
              ) : (
                <AvatarFallback>{firstChar}</AvatarFallback>
              )}
            </Avatar>
          </DropdownMenuTrigger>

          <DropdownMenuContent className="p-2" sideOffset={10}>
            <DropdownMenuLabel>
              {fullName ?? "Loading…"}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            <DropdownMenuItem asChild>
              <Link href="/profile" className="flex gap-2 items-center">
                <User size={16} /> Profile
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild>
              <Link href="/settings" className="flex gap-2 items-center">
                <Settings size={16} /> Settings
              </Link>
            </DropdownMenuItem>

            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                logout();
              }}
              className="text-red-600 focus:text-red-600 flex gap-2 items-center"
            >
              <LogOut size={16} /> Log Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
}
