"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AppBarChart from "./Components/AppBarChart";
import AppAreaChart from "./Components/AppAreaChart";
import AppUsers from "./Components/AppUsers";

const Page = () => {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      router.replace("/login"); // redirect to login if not logged in
    } 
  }, [router]);

  return (
    <div className="grid grid-1 lg:grid-cols-2 2xl:grid-col-3 gap-[5rem]">
      <div className="lg:col-span-2"><AppUsers /></div>
      {/* <div className="rounded-lg"><AppAreaChart /></div>
      <div><AppBarChart /></div> */}
    </div>
  );
};

export default Page;
