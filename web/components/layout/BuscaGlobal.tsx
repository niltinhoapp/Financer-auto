"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Search, X, Users, Car, FileText } from "lucide-react";

interface Item {
  tipo: "cliente" | "veiculo" | "contrato";
  id: string;
  titulo: string;
  sub: string;
  href: string;
  busca: string;
}

function normalizar(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Busca global do painel: encontra cliente (nome/CPF/telefone),
 * veículo (marca/modelo/placa) e contrato de qualquer tela.
 * Atalho de teclado: Ctrl/Cmd + K.
 */
export function BuscaGlobal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [itens, setItens] = useState<Item[]>([]);
  const [carregado, setCarregado] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Atalho Ctrl/Cmd + K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Carrega o índice na primeira abertura
  useEffect(() => {
    if (!open || carregado) return;
    (async () => {
      try {
        const [custSnap, vehSnap, contractsSnap] = await Promise.all([
          getDocs(collection(db, "customers")),
          getDocs(collection(db, "vehicles")),
          getDocs(collection(db, "contracts")),
        ]);
        const custById: Record<string, { name?: string }> = {};
        custSnap.docs.forEach((d) => (custById[d.id] = d.data()));
        const vehById: Record<string, { brand?: string; model?: string }> = {};
        vehSnap.docs.forEach((d) => (vehById[d.id] = d.data()));

        const lista: Item[] = [];
        custSnap.docs.forEach((d) => {
          const c = d.data();
          lista.push({
            tipo: "cliente", id: d.id, titulo: c.name ?? "Cliente",
            sub: `${c.cpf ? "CPF " + c.cpf : ""}${c.phone ? " · " + c.phone : ""}`.trim() || "Cliente",
            href: `/clientes/${d.id}`,
            busca: normalizar(`${c.name} ${c.cpf ?? ""} ${c.phone ?? ""}`),
          });
        });
        vehSnap.docs.forEach((d) => {
          const v = d.data();
          lista.push({
            tipo: "veiculo", id: d.id, titulo: `${v.brand} ${v.model} ${v.year ?? ""}`.trim(),
            sub: `Placa ${v.plate ?? "—"}`,
            href: `/veiculos/${d.id}`,
            busca: normalizar(`${v.brand} ${v.model} ${v.plate ?? ""} ${v.year ?? ""}`),
          });
        });
        contractsSnap.docs.forEach((d) => {
          const c = d.data();
          const cliente = custById[c.customerId]?.name ?? "Cliente";
          const veiculo = vehById[c.vehicleId] ? `${vehById[c.vehicleId].brand} ${vehById[c.vehicleId].model}` : "";
          lista.push({
            tipo: "contrato", id: d.id, titulo: `Contrato — ${cliente}`,
            sub: `${veiculo} · ${c.status}`.trim(),
            href: `/contratos/${d.id}`,
            busca: normalizar(`${cliente} ${veiculo} contrato ${c.status}`),
          });
        });
        setItens(lista);
        setCarregado(true);
      } catch (e) { console.error("BuscaGlobal:", e); }
    })();
  }, [open, carregado]);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);

  const resultados = useMemo(() => {
    const termos = normalizar(q).split(/\s+/).filter((t) => t.length >= 2);
    if (!termos.length) return [];
    return itens
      .filter((it) => termos.every((t) => it.busca.includes(t)))
      .slice(0, 12);
  }, [q, itens]);

  function ir(href: string) {
    setOpen(false);
    setQ("");
    router.push(href);
  }

  const iconOf = { cliente: Users, veiculo: Car, contrato: FileText };
  const corOf = { cliente: "#ec4899", veiculo: "#f59e0b", contrato: "#3b82f6" };

  return (
    <>
      {/* Trigger — ícone no mobile, barra no desktop */}
      <button onClick={() => setOpen(true)}
              aria-label="Buscar"
              className="lg:hidden p-2 rounded-lg"
              style={{ color: "var(--text-primary)" }}>
        <Search className="w-5 h-5" />
      </button>
      <button onClick={() => setOpen(true)}
              className="hidden lg:flex items-center gap-2 px-3 py-2 rounded-xl text-sm w-80"
              style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
        <Search className="w-4 h-4" />
        <span className="flex-1 text-left">Buscar cliente, placa, contrato...</span>
        <kbd className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>Ctrl K</kbd>
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-[85] flex items-start justify-center pt-20 px-4">
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,.5)" }} onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-lg rounded-2xl overflow-hidden"
               style={{ background: "var(--bg-card)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}>
            <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <Search className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
              <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
                     placeholder="Nome do cliente, placa, CPF, contrato..."
                     className="flex-1 bg-transparent outline-none text-sm" style={{ color: "var(--text-primary)" }} />
              <button onClick={() => setOpen(false)} aria-label="Fechar busca" style={{ color: "var(--text-muted)" }}><X className="w-4 h-4" /></button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {!carregado && (
                <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>Carregando índice...</p>
              )}
              {carregado && q.length >= 2 && resultados.length === 0 && (
                <p className="px-4 py-6 text-center text-sm" style={{ color: "var(--text-muted)" }}>Nada encontrado para &quot;{q}&quot;</p>
              )}
              {carregado && q.length < 2 && (
                <p className="px-4 py-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>Digite ao menos 2 letras</p>
              )}
              {resultados.map((it) => {
                const Icon = iconOf[it.tipo];
                return (
                  <button key={`${it.tipo}-${it.id}`} onClick={() => ir(it.href)}
                          className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:opacity-80"
                          style={{ borderBottom: "1px solid var(--border)" }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                         style={{ background: `${corOf[it.tipo]}18` }}>
                      <Icon className="w-4 h-4" style={{ color: corOf[it.tipo] }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>{it.titulo}</p>
                      <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{it.sub}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
