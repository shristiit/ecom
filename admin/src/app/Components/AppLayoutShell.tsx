"use client";
import React from "react";
import { usePathname } from "next/navigation";
import NavBar from "./NavBar";
import AppSideBar from "./AppSideBar";
import { SidebarProvider } from "@/components/ui/sidebar";

export default function AppLayoutShell({ defaultOpen, children }: { defaultOpen: boolean, children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === "/login";

  if (isLogin) {
    return <div className="w-full p-3"><div className="p-4">{children}</div></div>;
  }

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSideBar />
      <main className="w-full p-3">
        <NavBar />
        <div className="p-4">{children}</div>
      </main>
    </SidebarProvider>
  );
}
