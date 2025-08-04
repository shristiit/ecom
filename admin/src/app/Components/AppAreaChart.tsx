"use client";
import React from "react";
import { ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { ChartContainer} from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

const chartConfig = {
  desktop: {
    label: "Men",
    color: "#2563eb",
  },
  mobile: {
    label: "Women",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig
const AppAreaChart = () => {
  const chartData = [
    { month: "January", Men: 186, Women: 80 },
    { month: "February", Men: 305, Women: 200 },
    { month: "March", Men: 237, Women: 120 },
    { month: "April", Men: 73, Women: 190 },
    { month: "May", Men: 209, Women: 130 },
    { month: "June", Men: 214, Women: 140 },
  ];
  return (

   <div>
    <h1 className="text-lg mb-4 font-bold">Total Payments</h1>
 <ChartContainer config={chartConfig} className="min-h-[200px] w-full">
      <AreaChart accessibilityLayer data={chartData}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month"
        tickFormatter={(value) => value.slice(0,3)} />
        <YAxis dataKey="Men"  />
        <ChartTooltip content={<ChartTooltipContent />}/>
        <ChartLegend content={<ChartLegendContent />}/>
        <Area dataKey="Men" fill="var(--color-desktop)" />
        <Area dataKey="Women" fill="var(--color-mobile)" />
      </AreaChart>
    </ChartContainer>
   </div>
  )
};

export default AppAreaChart;
