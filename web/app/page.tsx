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
      router.replace("/loja");
    } else if (user.role === "admin") {
      router.replace("/dashboard");
    } else if (user.role === "seller") {
      router.replace("/veiculos");
    } else if (user.role === "customer") {
      router.replace("/minha-area");
    } else {
      // prospect → vai para a loja
      router.replace("/loja");
    }
  }, [user, loading, router]);

  return (
    <div className="flex h-full items-center justify-center" style={{ background: "var(--bg-primary)" }}>
      <div className="animate-spin rounded-full h-10 w-10 border-4"
           style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
    </div>
  );
}
