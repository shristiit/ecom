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
    name: "",
    username: "",
    email: "",
    password: "",
    confirmpassword: "",
    role: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({
      ...form,
      [e.target.id]: e.target.value,
    });
    setErrors({
      ...errors,
      [e.target.id]: "", // clear error on change
    });
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const usernameRegex = /^[a-zA-Z0-9_]{3,16}$/;
    const passwordRegex = /^(?=.*[A-Z])(?=.*\d)[A-Za-z\d@$!%*?&]{6,}$/;

    if (!form.name.trim()) {
      newErrors.name = "Name is required.";
    }
    if (!usernameRegex.test(form.username)) {
      newErrors.username = "3–16 chars";
    }
    if (!emailRegex.test(form.email)) {
      newErrors.email = "Invalid email format.";
    }
    if (!passwordRegex.test(form.password)) {
      newErrors.password =
        "Min 6 chars, 1 uppercase letter & 1 number required.";
    }
    if (form.password !== form.confirmpassword) {
      newErrors.confirmpassword = "Passwords do not match.";
    }
    if (!form.role) {
      newErrors.role = "Please select a role.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const submitHandle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      const res = await axios.post("http://localhost:4000/api/auth/register", form);
      alert(res.data.message || "User created");
    } catch (error: any) {
      alert("Error creating user: " + (error.response?.data?.message || error.message));
    }
  };

  return (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <Card className="w-full max-w-2xl bg-white shadow-lg rounded-xl border border-gray-200">
        <form onSubmit={submitHandle}>
          <CardHeader className="border-b-4 border-gray-200 pb-4">
            <CardTitle className="text-2xl font-bold text-center text-gray-800">
              Create User
            </CardTitle>
            <CardDescription className="text-center text-gray-600">
              Enter details below to create a new account
            </CardDescription>
          </CardHeader>

          <CardContent className="flex flex-col gap-6 mt-4">
            {/* Name & Username */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name" className="font-medium">Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="John"
                  value={form.name}
                  onChange={handleChange}
                  required
                />
                {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name}</p>}
              </div>
              <div>
                <Label htmlFor="username" className="font-medium">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="john_doe"
                  value={form.username}
                  onChange={handleChange}
                  required
                />
                {errors.username && <p className="text-sm text-red-500 mt-1">{errors.username}</p>}
              </div>
            </div>

            {/* Email */}
            <div>
              <Label htmlFor="email" className="font-medium">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                value={form.email}
                onChange={handleChange}
                required
              />
              {errors.email && <p className="text-sm text-red-500 mt-1">{errors.email}</p>}
            </div>

            {/* Password & Confirm Password */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="password" className="font-medium">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={handleChange}
                  required
                />
                {errors.password && <p className="text-sm text-red-500 mt-1">{errors.password}</p>}
              </div>
              <div>
                <Label htmlFor="confirmpassword" className="font-medium">Confirm Password</Label>
                <Input
                  id="confirmpassword"
                  type="password"
                  placeholder="••••••••"
                  value={form.confirmpassword}
                  onChange={handleChange}
                  required
                />
                {errors.confirmpassword && <p className="text-sm text-red-500 mt-1">{errors.confirmpassword}</p>}
              </div>
            </div>

            {/* Role */}
            <div>
              <Label htmlFor="role" className="font-medium">Role</Label>
              <select
                id="role"
                value={form.role}
                onChange={handleChange}
                className="border p-2 rounded-md w-full"
                required
              >
                <option value="">Select Role</option>
                <option value="admin">Admin</option>
                <option value="user">User</option>
              </select>
              {errors.role && <p className="text-sm text-red-500 mt-1">{errors.role}</p>}
            </div>
          </CardContent>

          <CardFooter className="flex-col gap-2 m-4">
            <Button
              type="submit"
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md transition-all"
            >
              Create User
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
};

export default Page;
