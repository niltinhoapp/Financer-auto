"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getDoc, doc, addDoc, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, maskPhone } from "@/lib/utils";
import Link from "next/link";
import { WhatsAppFloat } from "@/components/loja/WhatsAppFloat";
import {
  ArrowLeft, Car, Calendar, Gauge, Palette, FileText, ShieldCheck,
  Send, CheckCircle2, Phone, User, MessageSquare, ChevronLeft, ChevronRight, Share2,
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

const inputCls = "w-full px-3.5 py-3 rounded-xl text-sm";
const inputStyle = { background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" };

export function VeiculoDetalhe() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [shared, setShared] = useState(false);

  async function handleShare() {
    if (!vehicle) return;
    const url = typeof window !== "undefined" ? window.location.href : "";
    const titulo = `${vehicle.brand} ${vehicle.model} ${vehicle.year}`;
    const texto = `Confira este ${titulo} por ${formatCurrency(vehicle.price)} — parcelamento direto com a loja!`;
    // Web Share API (celular abre o menu nativo: WhatsApp, etc.)
    if (navigator.share) {
      try { await navigator.share({ title: titulo, text: texto, url }); return; } catch { /* cancelado */ }
    }
    // Desktop: copia link + texto para a área de transferência
    try {
      await navigator.clipboard.writeText(`${texto}\n${url}`);
      setShared(true);
      setTimeout(() => setShared(false), 2500);
    } catch { /* ignore */ }
  }

  // Formulário de interesse
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    getDoc(doc(db, "vehicles", id)).then((snap) => {
      if (snap.exists()) setVehicle({ id: snap.id, ...snap.data() } as Vehicle);
      setLoading(false);
    });
    // Pré-preenche só para cliente/prospect (não para admin/vendedor navegando)
    if (user && user.role !== "admin" && user.role !== "seller") {
      Promise.resolve().then(() => {
        setForm((p) => ({ ...p, name: user.name ?? "", email: user.email ?? "" }));
      });
    }
  }, [id, user]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vehicle) return;
    if (!form.name.trim() || !form.phone.trim()) {
      setError("Nome e telefone são obrigatórios.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await addDoc(collection(db, "leads"), {
        vehicleId: vehicle.id,
        vehicleName: `${vehicle.brand} ${vehicle.model} ${vehicle.year}`,
        vehiclePrice: vehicle.price,
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        message: form.message.trim(),
        status: "new",
        userId: user?.uid ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setSent(true);
    } catch (err) {
      setError("Erro ao enviar. Tente novamente.");
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-4"
             style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-12 text-center">
        <Car className="w-12 h-12 mx-auto mb-3 opacity-20" style={{ color: "var(--text-muted)" }} />
        <p style={{ color: "var(--text-primary)" }}>Veículo não encontrado.</p>
        <Link href="/loja" className="mt-4 inline-block text-sm" style={{ color: "var(--accent)" }}>← Voltar ao catálogo</Link>
      </div>
    );
  }

  const photos = vehicle.photos?.length ? vehicle.photos : [];

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <Link href="/loja"
            className="inline-flex items-center gap-1.5 text-sm mb-6 transition-opacity hover:opacity-70"
            style={{ color: "var(--text-secondary)" }}>
        <ArrowLeft className="w-4 h-4" /> Voltar ao catálogo
      </Link>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Fotos */}
        <div>
          <div className="relative rounded-2xl overflow-hidden aspect-[4/3]"
               style={{ background: "var(--bg-hover)" }}>
            {photos.length > 0 ? (
              <>
                <img src={photos[photoIdx]} alt={`${vehicle.brand} ${vehicle.model}`}
                     decoding="async"
                     className="w-full h-full object-cover" />
                {photos.length > 1 && (
                  <>
                    <button onClick={() => setPhotoIdx((i) => (i - 1 + photos.length) % photos.length)}
                            aria-label="Foto anterior"
                            className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full"
                            style={{ background: "rgba(0,0,0,.5)" }}>
                      <ChevronLeft className="w-4 h-4 text-white" />
                    </button>
                    <button onClick={() => setPhotoIdx((i) => (i + 1) % photos.length)}
                            aria-label="Próxima foto"
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full"
                            style={{ background: "rgba(0,0,0,.5)" }}>
                      <ChevronRight className="w-4 h-4 text-white" />
                    </button>
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                      {photos.map((_, i) => (
                        <button key={i} onClick={() => setPhotoIdx(i)}
                                aria-label={`Ver foto ${i + 1}`}
                                className="w-2 h-2 rounded-full transition-all"
                                style={{ background: i === photoIdx ? "#fff" : "rgba(255,255,255,.4)" }} />
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Car className="w-16 h-16 opacity-20" style={{ color: "var(--text-muted)" }} />
              </div>
            )}
          </div>

          {/* Thumb strip */}
          {photos.length > 1 && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
              {photos.map((p, i) => (
                <button key={i} onClick={() => setPhotoIdx(i)}
                        aria-label={`Ver foto ${i + 1} de ${vehicle.brand} ${vehicle.model}`}
                        className="flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden transition-all"
                        style={{ border: `2px solid ${i === photoIdx ? "var(--accent)" : "transparent"}` }}>
                  <img src={p} alt={`${vehicle.brand} ${vehicle.model} - foto ${i + 1}`} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info + Form */}
        <div className="space-y-5">
          {/* Dados do veículo */}
          <div className="card p-5">
            <div className="flex items-start justify-between gap-3">
              <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                {vehicle.brand} {vehicle.model}
              </h1>
              <button onClick={handleShare}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium flex-shrink-0"
                      style={{ background: "var(--bg-hover)", border: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                <Share2 className="w-4 h-4" />
                <span className="hidden sm:inline">{shared ? "Copiado!" : "Compartilhar"}</span>
              </button>
            </div>
            <p className="text-3xl font-bold mt-2" style={{ color: "var(--accent)" }}>
              {formatCurrency(vehicle.price)}
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Parcele em até 60x direto com a loja
            </p>
            <div className="flex items-center gap-1.5 mt-3 flex-wrap">
              <span className="badge badge-success"><ShieldCheck className="w-3 h-3" /> Revisado</span>
              <span className="badge badge-accent"><FileText className="w-3 h-3" /> Documentação em dia</span>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4">
              {[
                { Icon: Calendar, label: "Ano",     val: vehicle.year },
                { Icon: Gauge,    label: "Km",      val: `${vehicle.mileage.toLocaleString("pt-BR")} km` },
                { Icon: Palette,  label: "Cor",     val: vehicle.color },
                { Icon: FileText, label: "Placa",   val: vehicle.plate },
              ].map(({ Icon, label, val }) => (
                <div key={label} className="flex items-center gap-2.5 p-3 rounded-xl"
                     style={{ background: "var(--bg-hover)" }}>
                  <Icon className="w-4 h-4 flex-shrink-0" style={{ color: "var(--accent)" }} />
                  <div>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</p>
                    <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{val}</p>
                  </div>
                </div>
              ))}
            </div>

            {vehicle.features && (
              <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
                <p className="text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Opcionais</p>
                <p className="text-sm" style={{ color: "var(--text-primary)" }}>{vehicle.features}</p>
              </div>
            )}
          </div>

          {/* Formulário de interesse */}
          <div className="card p-5">
            <h2 className="font-bold mb-1" style={{ color: "var(--text-primary)" }}>
              Tenho Interesse
            </h2>
            <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
              Deixe seus dados e entraremos em contato para fechar o negócio.
            </p>

            {sent ? (
              <div className="flex flex-col items-center py-6 text-center gap-3">
                <CheckCircle2 className="w-12 h-12" style={{ color: "#10b981" }} />
                <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Interesse enviado!</p>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                  Nossa equipe entrará em contato em breve para negociar as condições.
                </p>
                <Link href="/loja"
                      className="mt-2 text-sm px-4 py-2 rounded-xl font-medium text-white"
                      style={{ background: "var(--accent)" }}>
                  Ver outros veículos
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                    Nome completo <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} />
                    <input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                           placeholder="Seu nome" required className={inputCls} style={{ ...inputStyle, paddingLeft: "2.5rem" }} />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                    Telefone / WhatsApp <span style={{ color: "#ef4444" }}>*</span>
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} />
                    <input value={form.phone} inputMode="tel"
                           onChange={(e) => setForm((p) => ({ ...p, phone: maskPhone(e.target.value) }))}
                           placeholder="(00) 00000-0000" required className={inputCls} style={{ ...inputStyle, paddingLeft: "2.5rem" }} />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>E-mail</label>
                  <input type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                         placeholder="seu@email.com" className={inputCls} style={inputStyle} />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                    <MessageSquare className="inline w-3.5 h-3.5 mr-1" />
                    Mensagem (opcional)
                  </label>
                  <textarea value={form.message} onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))}
                            rows={2} placeholder="Dúvidas, condições de financiamento, etc."
                            className={inputCls} style={inputStyle} />
                </div>

                {error && (
                  <p className="text-xs px-3 py-2 rounded-lg" style={{ background: "#ef444418", color: "#ef4444" }}>{error}</p>
                )}

                {!user && (
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Quer acompanhar sua negociação?{" "}
                    <Link href="/loja/acesso" style={{ color: "var(--accent)" }}>Crie sua conta</Link> gratuitamente.
                  </p>
                )}

                <button type="submit" disabled={submitting}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm text-white disabled:opacity-50 transition-all"
                        style={{ background: "var(--accent-gradient)" }}>
                  <Send className="w-4 h-4" />
                  {submitting ? "Enviando..." : "Enviar interesse"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      <WhatsAppFloat message={`Olá! Tenho interesse no ${vehicle.brand} ${vehicle.model} ${vehicle.year} anunciado no site.`} />
    </div>
  );
}
