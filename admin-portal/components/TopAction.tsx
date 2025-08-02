import { View, Text, Pressable } from 'react-native';
import React from 'react';
import { HStack } from './ui/hstack';
import FontAwesome5 from 'react-native-vector-icons/FontAwesome5';
import { router } from 'expo-router';

const TopAction = () => {
  // Define the list of top actions
  const TopList = [
    { id: 1, name: 'Total Sales', icon: 'pound-sign', route: '/Sales' },
    { id: 2, name: 'Pending Orders', icon: 'clock', route: '/orders' },
    { id: 3, name: 'Low Stock Alerts', icon: 'exclamation-triangle', route: '/alerts' },
    { id: 4, name: 'Active Stores', icon: 'store', route: '/stores' },
  ];

  const listItems = TopList.map((item, index) => (
    <Pressable
      key={index}
      className="py-6 px-8 m-2 bg-gray-100 rounded-lg flex items-center w-64  "
      onPress={() => router.push(item.route)}
    >
      <FontAwesome5 name={item.icon} size={24} color="#333" />
      <Text className="font-bold mt-2">{item.name}</Text>
      <Text>{item.id}</Text>
    </Pressable>
  ));

  return (
    <HStack className="gap-6 flex-wrap p-6 justify-center items-center">
      {listItems}
    </HStack>
  );
};

export default TopAction;
