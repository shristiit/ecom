import React from 'react';
import { ChevronUp, Home, Inbox, Settings, User2, Users } from 'lucide-react';
import Link from 'next/link';
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
    { id: 2, name: 'Products', route: '/products', icon: Inbox },
    { id: 3, name: 'Users', route: '/users', icon: Users },
    { id: 4, name: 'Create Store', route: '/CreateStore', icon: Settings },
    { id: 5, name: 'Create-User', route: '/CreateUser', icon: User2 },
  ];

  return (
    <Sidebar className="h-screen bg-white w-64" collapsible='icon'>
      <SidebarHeader className="text-lg font-bold m-2 items-center">Menu</SidebarHeader>
      <SidebarContent className='m-1'>
        <SidebarMenu className='gap-7'>
          {listServices.map((service) => (
            <SidebarMenuItem key={service.id}>
              <Link href={service.route} className="w-full">
                <SidebarMenuButton className="flex items-center gap-3 w-full p-2 text-sm text-gray-700 hover:bg-gray-100 rounded-md transition">
                  <service.icon className="w-2 h-5" />
                  <span>{service.name}</span>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>

      

      <SidebarFooter className="p-4 text-sm text-gray-500">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton>
                  <User2 /> User <ChevronUp className='ml-auto' />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='end'>
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
