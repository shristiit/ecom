"use client";
import { useEffect } from "react";

import AppBarChart from "../Components/AppBarChart";
import AppAreaChart from "../Components/AppAreaChart";
import AppUsers from "../Components/AppUsers";

const Page = () => {
  // useEffect(() => {
  //   const token = localStorage.getItem("accessToken");
  //   if (!token) {
  //     router.replace("/login"); // redirect to login if not logged in
  //   }else{
  //      router.replace("/")
  //    }
  // }, []);

  return (
    <div className="grid grid-1 lg:grid-cols-2 2xl:grid-col-3 gap-[5rem]">
      <div className="border lg:col-span-2">
        <AppUsers />
      </div>
      <div className="rounded-lg">
        <AppAreaChart />
      </div>
      <div>
        <AppBarChart />
      </div>
      <div className="bg-yellow-300 rounded-lg lg:col-span-2 2xl:col-span-2">
        hola
      </div>
      <div></div>
      <div className="bg-pink-300">ciao</div>
    </div>
  );
};

export default Page;
