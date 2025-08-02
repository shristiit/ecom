import { View, Text } from 'react-native'
import React from 'react'
import { VStack } from './ui/vstack'
import { PieChart } from 'react-native-chart-kit';
import {pieChartData} from "@/constants/PieChartData"
const PieChartContent = () => {
   

  return (
    <VStack className='bg-white m-7 w-1/3 rounded-lg justify-space-between flex items-center'> 
        <Text className='font-bold text-xl m-2'>Sales Summary</Text>
        <View className='m-2 w-full h-[200px] justify-space-between flex-1 items-center'>
        <PieChart data={pieChartData}
          width={400}
          height={200}
          chartConfig={{
            backgroundColor: '#fff',
            backgroundGradientFrom: '#fff',
            backgroundGradientTo: '#fff',
            color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
            strokeWidth: 2,
            useShadowColorFromDataset: false,
          }}
          accessor="population"
          backgroundColor="transparent"
          paddingLeft="15"
          absolute
          />
        </View>
    </VStack>
  )
}

export default PieChartContent