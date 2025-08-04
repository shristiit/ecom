import React from "react";
import { LogOut, Moon, Settings, User } from "lucide-react";
import Link from "next/link";
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
const NavBar = () => {
  return (
    <nav className="flex items-center justify-between m-3">
      <SidebarTrigger />
      <div className="flex items-center gap-4">
        <Link href="/">dashboard</Link>
        <Moon />
        <DropdownMenu>
          <DropdownMenuTrigger>
          <Avatar>
            <AvatarImage
              src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&auto=format&fit=crop&w=687&q=80"
              alt="User Avatar"
            />
            <AvatarFallback>JD</AvatarFallback>
          </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="p-2" sideOffset={10}>
            <DropdownMenuLabel>User Menu</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem> <User /> Profile</DropdownMenuItem>
            <DropdownMenuItem ><Settings />Settings</DropdownMenuItem>
            <DropdownMenuItem className="text-red-700" variant="destructive"><LogOut/> Log Out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </nav>
  );
};

export default NavBar;
