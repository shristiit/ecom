import { SafeAreaView , ScrollView} from 'react-native';
import React, { useState, useEffect,useRef } from 'react';
import Header from '@/components/Header';
import { Text, Animated , Button, View} from 'react-native';
import { VStack } from '@/components/ui/vstack';
import { HStack } from '@/components/ui/hstack';
import TopAction from '@/components/TopAction';
import PieChartContent from '@/components/PieChartContenet';
import LineGraph from '@/components/LineGraph';
const Index = () => {


  return (
    <SafeAreaView className="flex-1 bg-white">
      {/* Main Scrollable Content */}
      <ScrollView className='bg-gray-200'>
        <VStack className='m-2 gap-2'>
          <Text className='font-bold text-4xl'>Sales Dashboard</Text>
          <Text>Overview of your sales data and performance metrics.</Text>
        </VStack>
        <TopAction />
        <HStack className='justify-center item-center'>
        <PieChartContent />
        <LineGraph />
        </HStack>
      </ScrollView>
    </SafeAreaView>
  );
};

export default Index;
