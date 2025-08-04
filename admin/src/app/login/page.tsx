"use client";

import { useEffect, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";

export default function Login() {
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // 🔁 Redirect if already logged in
  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("accessToken")) {
      router.replace("/");
    }
  }, [router]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!user.trim() || !pass) {
      setError("All fields are required");
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post(
        "/api/auth/login",
        {
          usernameOrEmail: user,
          password: pass,
        },
        {
          withCredentials: true,
        }
      );

      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("refreshToken", data.refreshToken);
      console.log("login success")
      router.push("/");
      console.log("push called")
    } catch (err: any) {
      setError(
        err.response?.data?.message ?? err.message ?? "Login failed. Check credentials."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-gray-50">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-2xl font-semibold text-center">
          Admin Login
        </CardHeader>

        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="user">Username / E-mail</Label>
              <Input
                id="user"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2 relative">
              <Label htmlFor="pass">Password</Label>
              <Input
                id="pass"
                type={showPassword ? "text" : "password"}
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                required
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-2 top-9 text-sm text-gray-500 focus:outline-none"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
