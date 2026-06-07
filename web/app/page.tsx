"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    } else if (user.role === "admin") {
      router.replace("/dashboard");
    } else if (user.role === "seller") {
      router.replace("/clientes");
    } else if (user.role === "customer") {
      router.replace("/minha-area");
    } else {
      router.replace("/login");
    }
  }, [user, loading, router]);

  return (
    <div className="flex h-full items-center justify-center">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
    </div>
  );
}
