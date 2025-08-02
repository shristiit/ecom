import { Pressable, View } from "react-native";
import React from "react";
import { Text } from "@/components/ui/text";
import { useRouter } from "expo-router";
import { Heading } from "@/components/ui/heading";
import { router } from "expo-router";
import { Button, ButtonText } from "@/components/ui/button";
import {
  Drawer,
  DrawerBackdrop,
  DrawerBody,
  DrawerFooter,
  DrawerContent,
  DrawerHeader,
} from "@/components/ui/drawer";
import { useRoute } from "@react-navigation/native";
import { VStack } from "./ui/vstack";

const DrawerDemo = ({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) => {
  const listServices = [
    { id: 1, name: "Home", route: "/" },
    { id: 2, name: "Products", route: "/Products" },
    { id: 3, name: "Stores", route: "/Stores" },
    { id: 4, name: "Create Store", route: "/CreateStore" },
  ];

  const listItems = listServices.map((service, index) => (
    <Pressable key={index} className="p-9 m-2 hover:bg-gray-200">
      <Text>{service.name}</Text>
    </Pressable>
  ));

  const route = useRouter();
  return (
    <Drawer isOpen={isOpen} onClose={onClose} size="sm" anchor="left">
      <DrawerBackdrop />
      <DrawerContent>
        <DrawerHeader>
          <Heading size="3xl">Menu</Heading>
        </DrawerHeader>
        <DrawerBody>
          <VStack className="gap-4 mt-5">
            {listServices.map((service, index) => (
              <Pressable
                key={index}
                className="p-4 hover:bg-gray-200"
                onPress={()=> router.push(service.route)}
              >
                <Text>{service.name}</Text>
              </Pressable>
            ))}
            <Pressable className="bg-white flex items-center py-4 hover:bg-gray-400"></Pressable>

            {/* {listItems} */}
          </VStack>
        </DrawerBody>
        <DrawerFooter>
          <Button
            onPress={() => {
              onClose();
            }}
            className="flex-1"
          >
            <ButtonText>Close</ButtonText>
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};

export default DrawerDemo;
