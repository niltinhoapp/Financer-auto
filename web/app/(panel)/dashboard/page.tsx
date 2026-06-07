"use client";

import { useEffect, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatCurrency } from "@/lib/utils";
import {
  DollarSign,
  FileText,
  Users,
  Car,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";

interface KPIs {
  totalContracts: number;
  activeContracts: number;
  totalReceivable: number;
  totalReceived: number;
  totalOverdue: number;
  totalCustomers: number;
  availableVehicles: number;
  soldVehicles: number;
}

export default function DashboardPage() {
  const [kpis, setKpis] = useState<KPIs | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadKPIs() {
      try {
        const [contractsSnap, customersSnap, vehiclesSnap, installmentsSnap] =
          await Promise.all([
            getDocs(collection(db, "contracts")),
            getDocs(collection(db, "customers")),
            getDocs(collection(db, "vehicles")),
            getDocs(
              query(
                collection(db, "payments"),
              )
            ),
          ]);

        const contracts = contractsSnap.docs.map((d) => d.data());
        const vehicles = vehiclesSnap.docs.map((d) => d.data());

        const activeContracts = contracts.filter((c) => c.status === "active").length;
        const totalReceivable = contracts.reduce(
          (acc, c) => acc + (c.financedAmount || 0),
          0
        );
        const totalReceived = installmentsSnap.docs.reduce(
          (acc, d) => acc + (d.data().amount || 0),
          0
        );

        setKpis({
          totalContracts: contracts.length,
          activeContracts,
          totalReceivable,
          totalReceived,
          totalOverdue: totalReceivable - totalReceived,
          totalCustomers: customersSnap.size,
          availableVehicles: vehicles.filter((v) => v.status === "available").length,
          soldVehicles: vehicles.filter((v) => v.status === "sold").length,
        });
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    loadKPIs();
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const cards = [
    {
      label: "Contratos Ativos",
      value: kpis?.activeContracts ?? 0,
      sub: `${kpis?.totalContracts ?? 0} no total`,
      icon: FileText,
      color: "bg-blue-500",
    },
    {
      label: "Carteira Total",
      value: formatCurrency(kpis?.totalReceivable ?? 0),
      sub: "valor financiado",
      icon: DollarSign,
      color: "bg-emerald-500",
    },
    {
      label: "Total Recebido",
      value: formatCurrency(kpis?.totalReceived ?? 0),
      sub: "pagamentos registrados",
      icon: TrendingUp,
      color: "bg-violet-500",
    },
    {
      label: "Em Aberto",
      value: formatCurrency(kpis?.totalOverdue ?? 0),
      sub: "saldo pendente",
      icon: AlertTriangle,
      color: "bg-amber-500",
    },
    {
      label: "Clientes",
      value: kpis?.totalCustomers ?? 0,
      sub: "cadastrados",
      icon: Users,
      color: "bg-pink-500",
    },
    {
      label: "Veículos Disponíveis",
      value: kpis?.availableVehicles ?? 0,
      sub: `${kpis?.soldVehicles ?? 0} vendidos`,
      icon: Car,
      color: "bg-indigo-500",
    },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Visão geral do negócio</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {cards.map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-xl border border-gray-200 p-6 flex items-start gap-4"
          >
            <div className={`${card.color} p-3 rounded-lg`}>
              <card.icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">{card.label}</p>
              <p className="text-2xl font-bold text-gray-900 mt-0.5">{card.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{card.sub}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
