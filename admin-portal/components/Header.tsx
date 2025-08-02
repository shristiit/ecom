import { View, Text, SafeAreaView, Pressable, TextInput } from "react-native";
import React from "react";
import { HStack } from "./ui/hstack";
import { FaAlignJustify } from "react-icons/fa";
import { Menu, MenuItem, MenuItemLabel, MenuContent } from "./ui/menu";
import {
  Avatar,
  AvatarBadge,
  AvatarFallbackText,
  AvatarImage,
} from "./ui/avatar";

const Header = ({ onMenuPress }: { onMenuPress: () => void }) => {
  return (
    <SafeAreaView>
      <HStack className="flex items-center justify-between p-4 bg-gray-400">
        {/* Menu Icon */}
        <Pressable onPress={onMenuPress}>
          <Text>
            <FaAlignJustify className="h-6 w-8"/>
          </Text>
        </Pressable>

        <HStack className="items-center">
          {/* Search Input */}
          <TextInput
            className="rounded-2xl bg-white w-[300px] p-3 mr-7"
            placeholder="Search stores, sales, sales ids, or products"
          />

          {/* Avatar Dropdown */}
          <Menu
            placement="bottom right"
            trigger={(triggerProps) => (
              
                <Pressable {...triggerProps}>
                  <Avatar size="md">
                    <AvatarFallbackText>Jane Doe</AvatarFallbackText>
                    <AvatarImage
                      source={{
                        uri: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?ixlib=rb-1.2.1&auto=format&fit=crop&w=687&q=80",
                      }}
                    />
                    <AvatarBadge />
                  </Avatar>
                </Pressable>
  )}
          >
           
              <MenuItem onPress={() => console.log("Profile")}>
                <MenuItemLabel>My Profile</MenuItemLabel>
              </MenuItem>
              <MenuItem onPress={() => console.log("Logout")}>
                <MenuItemLabel>Logout</MenuItemLabel>
              </MenuItem>
            
          </Menu>
        </HStack>
      </HStack>
    </SafeAreaView>
  );
};

export default Header;
