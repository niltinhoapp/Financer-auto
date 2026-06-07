import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/contexts/AuthContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Financer Auto",
  description: "Sistema de Gestão de Revendas com Financiamento Próprio",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="h-full" style={{ colorScheme: "light" }}>
      <body className={`${inter.className} h-full bg-gray-50`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
