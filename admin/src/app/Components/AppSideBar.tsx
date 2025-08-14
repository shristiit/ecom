"use client";

import React from 'react';
import { ChevronUp, Home, Inbox, ListOrdered, LucideListOrdered, User2, Users } from 'lucide-react';
import Link from 'next/link';
import * as Tooltip from "@radix-ui/react-tooltip"; // import Radix Tooltip
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger, DropdownMenuItem } from '@/components/ui/dropdown-menu';

const AppSideBar = () => {
  const listServices = [
    { id: 1, name: 'Home', route: '/', icon: Home },

    { id: 2, name: 'Products', route: '/Products', icon: Inbox },
    { id: 3, name: 'Users', route: '/Users', icon: Users },
    {id: 4, name: "Orders", route: '/orders', icon: LucideListOrdered}
  ];

  return (
    <Sidebar className="h-screen bg-white w-64" collapsible="icon">
      <SidebarHeader className="text-lg font-bold m-2 items-center"></SidebarHeader>
      <SidebarContent className="m-1">
        <SidebarMenu className="gap-7">
          <Tooltip.Provider delayDuration={100}>
            {listServices.map((service) => (
              <SidebarMenuItem key={service.id} className='m-2'>
                <Tooltip.Root>
                  <Tooltip.Trigger asChild>
                    <Link href={service.route} className="w-full">
                      <SidebarMenuButton className="flex items-center gap-3 w-full p-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition">
                        <service.icon className="w-5 h-5" />
                        <span>{service.name}</span>
                      </SidebarMenuButton>
                    </Link>
                  </Tooltip.Trigger>
                  <Tooltip.Portal>
                    <Tooltip.Content
                      side="right"
                      align="center"
                      className="rounded-md text-white bg-black px-3 py-1 text-sm shadow-lg"
                    >
                      <div className="flex items-center gap-2">
                        <service.icon className="w-4 h-4" />
                        <span>{service.name}</span>
                      </div>
                      <Tooltip.Arrow className="fill-gray-900" />
                    </Tooltip.Content>
                  </Tooltip.Portal>
                </Tooltip.Root>
              </SidebarMenuItem>
            ))}
          </Tooltip.Provider>
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="p-4 text-sm text-gray-500">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton>
                  <User2 /> User <ChevronUp className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>Account</DropdownMenuItem>
                <DropdownMenuItem>Settings</DropdownMenuItem>
                <DropdownMenuItem>Log out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
};

export default AppSideBar;
