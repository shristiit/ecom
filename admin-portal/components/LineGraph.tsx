import React from 'react';
import { View, Text, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { VStack } from './ui/vstack';



const lineChartData = {
  labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
  datasets: [
    {
      data: [30, 45, 28, 80, 99, 43],
      strokeWidth: 2,
      color: (opacity = 1) => `rgba(33, 150, 243, ${opacity})`,
    },
  ],
  legend: ['Sales'],
};

const chartConfig = {
  backgroundColor: '#ffffff',
  backgroundGradientFrom: '#ffffff',
  backgroundGradientTo: '#ffffff',
  decimalPlaces: 0,
  color: (opacity = 1) => `rgba(0,0,0,${opacity})`,
  labelColor: (opacity = 1) => `rgba(0,0,0,${opacity})`,
  style: {
    borderRadius: 12,
  },
  propsForDots: {
    r: '4',
    strokeWidth: '2',
    stroke: '#2196F3',
  },
};

const LineGraph = () => {
  return (
    <VStack className="bg-white m-7 w-1/3 rounded-lg justify-space-between flex items-center">
      <Text className="font-bold text-xl m-2">Sales Over Time</Text>
      {/*filtre button*/}

      <View>
        
      </View>
      <View className="m-2 w-full h-[200px] justify-space-between flex-1 items-center">
        <LineChart
          data={lineChartData}
          width={400}
          height={200}
          chartConfig={chartConfig}
          bezier
          style={{
            borderRadius: 12,
          }}
        />
      </View>
    </VStack>
  );
};

export default LineGraph;
