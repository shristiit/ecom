"use client";
import React, { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import axios from "axios";

const Page = () => {
  const [form, setForm] = useState({
    name:"",
    username: "",
    email: "",
    password: "",
    confirmpassword:"",
    role: "",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({
      ...form,
      [e.target.id]: e.target.value, // use id to match field
    });
  };

  const submitHandle = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await axios.post("http://localhost:4000/api/auth/register", form);
      alert(res.data.message || "User created");
    } catch (error: any) {
      alert("Error creating user: " + (error.response?.data?.message || error.message));
    }
  };

  return (
    <div className="flex items-center justify-center h-screen">
      <Card >
        <form onSubmit={submitHandle}>
          <CardHeader>
            <CardTitle>Create User</CardTitle>
            <CardDescription>
              Enter details below to create a new account
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="flex gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                type="text"
                placeholder="John"
                value={form.name}
                onChange={handleChange}
                required
              />
               <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                placeholder="John"
                value={form.username}
                onChange={handleChange}
                required
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                value={form.email}
                onChange={handleChange}
                required
              />
            </div>
            <div className="flex gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={handleChange}
                required
              />
              <Label htmlFor="confirm password">Confirm Password</Label>
              <Input
                id="password"
                type="password"
                value={form.confirmpassword}
                onChange={handleChange}
                required
              />
              
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role">Role</Label>
              <select 
                className="border p-2 rounded-md"
                id="role"
                type="text"
                value={form.role}
                onChange={handleChange}
                required
              >
                <option>Select Role</option>
                <option>Admin</option>
                <option>Users</option>
              </select>
            </div>
          </CardContent>
          <CardFooter className="flex-col gap-2 m-2">
            <Button type="submit" className="w-full">
              Create User
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default Page;
