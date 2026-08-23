"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, getDocs, query, where, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { formatCurrency } from "@/lib/utils";
import { WhatsAppFloat } from "@/components/loja/WhatsAppFloat";
import {
  Car, Search, SlidersHorizontal, Gauge, Calendar, ChevronRight,
  Sparkles, ShieldCheck, X,
} from "lucide-react";

interface Vehicle {
  id: string;
  brand: string;
  model: string;
  year: number;
  color: string;
  plate: string;
  mileage: number;
  price: number;
  photos: string[];
  features?: string;
  status: string;
}

const BRANDS = ["Todos", "Chevrolet", "Fiat", "Ford", "Honda", "Hyundai", "Toyota", "Volkswagen", "Outros"];

const SORT_OPTIONS = [
  { value: "price_asc", label: "Menor preço" },
  { value: "price_desc", label: "Maior preço" },
  { value: "year_desc", label: "Mais novo" },
  { value: "km_asc", label: "Menor km" },
] as const;

function SkeletonCard() {
  return (
    <div className="card overflow-hidden">
      <div className="skeleton aspect-[4/3] !rounded-none" />
      <div className="p-4 space-y-2.5">
        <div className="skeleton h-4 w-3/4" />
        <div className="skeleton h-3 w-1/2" />
        <div className="skeleton h-5 w-2/5" />
      </div>
    </div>
  );
}

export function LojaCatalogo({ initial }: { initial: Vehicle[] }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>(initial ?? []);
  const [loading, setLoading] = useState(initial.length === 0);
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState("Todos");
  const [maxPrice, setMaxPrice] = useState<number | "">("");
  const [sortBy, setSortBy] = useState<"price_asc" | "price_desc" | "year_desc" | "km_asc">("price_asc");
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    // Atualiza com dados ao vivo (os dados do servidor já foram renderizados p/ SEO)
    async function load() {
      try {
        const snap = await getDocs(
          query(collection(db, "vehicles"), where("status", "==", "available"), orderBy("createdAt", "desc"))
        );
        setVehicles(snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Vehicle[]);
      } catch { /* mantém os dados do servidor */ }
      finally { setLoading(false); }
    }
    load();
  }, []);

  const hasActiveFilters = brandFilter !== "Todos" || maxPrice !== "" || search !== "";

  function clearFilters() {
    setSearch("");
    setBrandFilter("Todos");
    setMaxPrice("");
    setSortBy("price_asc");
  }

  const filtered = vehicles
    .filter((v) => {
      const q = search.toLowerCase();
      const matchSearch = !q || `${v.brand} ${v.model} ${v.plate} ${v.color}`.toLowerCase().includes(q);
      const matchBrand = brandFilter === "Todos" || v.brand === brandFilter;
      const matchPrice = !maxPrice || v.price <= maxPrice;
      return matchSearch && matchBrand && matchPrice;
    })
    .sort((a, b) => {
      if (sortBy === "price_asc") return a.price - b.price;
      if (sortBy === "price_desc") return b.price - a.price;
      if (sortBy === "year_desc") return b.year - a.year;
      if (sortBy === "km_asc") return a.mileage - b.mileage;
      return 0;
    });

  return (
    <div>
      {/* Hero */}
      <section className="relative py-16 px-6 text-center overflow-hidden"
               style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f2044 100%)" }}>
        {/* Decorative circles */}
        <div className="absolute top-0 left-1/4 w-72 h-72 rounded-full opacity-10"
             style={{ background: "radial-gradient(circle, #3b82f6, transparent)", transform: "translate(-50%,-50%)" }} />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 rounded-full opacity-10"
             style={{ background: "radial-gradient(circle, #6366f1, transparent)", transform: "translate(50%,50%)" }} />

        <div className="relative max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium mb-4"
               style={{ background: "rgba(59,130,246,.15)", border: "1px solid rgba(59,130,246,.3)", color: "#60a5fa" }}>
            <Sparkles className="w-3.5 h-3.5" />
            Sem consulta ao SPC/Serasa
          </div>
          <h1 className="text-4xl font-bold text-white mb-3 leading-tight">
            Encontre o seu<br />
            <span style={{ background: "linear-gradient(135deg,#60a5fa,#a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              próximo carro
            </span>
          </h1>
          <p className="text-gray-400 mb-8">
            Carros revisados, com parcelamento direto com a loja — sem banco, sem burocracia.
          </p>

          {/* Search bar */}
          <div className="relative max-w-lg mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por marca, modelo ou cor..."
              className="w-full pl-11 pr-4 py-3.5 rounded-2xl text-sm"
              style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.12)", color: "#fff" }}
            />
          </div>
        </div>
      </section>

      {/* Filtros — desktop: barra fixa / mobile: botão que abre bottom sheet */}
      <section className="sticky top-16 z-10 px-4 md:px-6 py-3"
               style={{ background: "var(--bg-card)", borderBottom: "1px solid var(--border)" }}>
        {/* Mobile */}
        <div className="flex md:hidden items-center justify-between gap-3">
          <button onClick={() => setFilterOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium"
                  style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
            <SlidersHorizontal className="w-4 h-4" />
            Filtrar
            {hasActiveFilters && (
              <span className="w-2 h-2 rounded-full" style={{ background: "var(--accent)" }} />
            )}
          </button>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="px-3 py-2 rounded-xl text-sm"
                  style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
            {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Desktop */}
        <div className="hidden md:flex items-center gap-4 flex-wrap">
          <SlidersHorizontal className="w-4 h-4 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
          <div className="flex gap-1.5 flex-wrap">
            {BRANDS.map((b) => (
              <button key={b} onClick={() => setBrandFilter(b)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                      style={brandFilter === b
                        ? { background: "var(--accent)", color: "#fff" }
                        : { background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                {b}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <input type="number" inputMode="numeric" value={maxPrice}
                   onChange={(e) => setMaxPrice(e.target.value ? Number(e.target.value) : "")}
                   placeholder="Preço máximo"
                   className="px-3 py-1.5 rounded-lg text-xs w-36"
                   style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }} />
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                    className="px-3 py-1.5 rounded-lg text-xs"
                    style={{ background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" }}>
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="text-xs font-medium" style={{ color: "var(--accent)" }}>
                Limpar filtros
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Bottom sheet — filtros mobile */}
      {filterOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,.55)" }}
               onClick={() => setFilterOpen(false)} />
          <div className="absolute bottom-0 inset-x-0 rounded-t-3xl p-5 pb-8 space-y-5 animate-toast-in max-h-[80vh] overflow-y-auto"
               style={{ background: "var(--bg-card)" }}>
            <div className="flex items-center justify-between">
              <h2 className="font-bold" style={{ color: "var(--text-primary)" }}>Filtrar veículos</h2>
              <button onClick={() => setFilterOpen(false)} aria-label="Fechar"
                      className="p-2 rounded-lg" style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Marca</p>
              <div className="flex gap-1.5 flex-wrap">
                {BRANDS.map((b) => (
                  <button key={b} onClick={() => setBrandFilter(b)}
                          className="px-3.5 py-2 rounded-xl text-sm font-medium transition-all"
                          style={brandFilter === b
                            ? { background: "var(--accent)", color: "#fff" }
                            : { background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
                    {b}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>Preço máximo</p>
              <input type="number" inputMode="numeric" value={maxPrice}
                     onChange={(e) => setMaxPrice(e.target.value ? Number(e.target.value) : "")}
                     placeholder="Ex: 50000"
                     className="input-base" />
            </div>

            <div className="flex gap-3 pt-1">
              {hasActiveFilters && (
                <button onClick={() => { clearFilters(); setFilterOpen(false); }} className="btn-secondary flex-1">
                  Limpar
                </button>
              )}
              <button onClick={() => setFilterOpen(false)} className="btn-primary flex-1">
                Ver {filtered.length} veículo{filtered.length !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grid */}
      <section className="max-w-7xl mx-auto px-4 md:px-6 py-8">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <Car className="w-12 h-12 mx-auto mb-3 opacity-20" style={{ color: "var(--text-muted)" }} />
            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Nenhum veículo encontrado</p>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Tente outros filtros ou entre em contato conosco.</p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="btn-primary mt-5">
                Ver todos os veículos
              </button>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
              {filtered.length} veículo{filtered.length !== 1 ? "s" : ""} disponíve{filtered.length !== 1 ? "is" : "l"}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filtered.map((v) => (
                <Link key={v.id} href={`/loja/${v.id}`}
                      className="card overflow-hidden group hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5">
                  {/* Foto */}
                  <div className="relative aspect-[4/3] overflow-hidden"
                       style={{ background: "var(--bg-hover)" }}>
                    {v.photos?.[0] ? (
                      <img src={v.photos[0]} alt={`${v.brand} ${v.model}`}
                           loading="lazy" decoding="async"
                           className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Car className="w-12 h-12 opacity-20" style={{ color: "var(--text-muted)" }} />
                      </div>
                    )}
                    {/* Selo de confiança */}
                    <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-white"
                         style={{ background: "rgba(16,185,129,.92)" }}>
                      <ShieldCheck className="w-3 h-3" /> Revisado
                    </div>
                    {/* Price badge */}
                    <div className="absolute bottom-2 right-2 px-2.5 py-1 rounded-lg text-sm font-bold text-white"
                         style={{ background: "var(--accent-gradient)" }}>
                      {formatCurrency(v.price)}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="p-4">
                    <p className="font-bold text-sm leading-tight" style={{ color: "var(--text-primary)" }}>
                      {v.brand} {v.model}
                    </p>
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <span className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
                        <Calendar className="w-3 h-3" /> {v.year}
                      </span>
                      <span className="flex items-center gap-1 text-xs" style={{ color: "var(--text-muted)" }}>
                        <Gauge className="w-3 h-3" /> {v.mileage.toLocaleString("pt-BR")} km
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <span className="badge badge-accent">Financie agora</span>
                      <ChevronRight className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </section>

      <WhatsAppFloat />
    </div>
  );
}
