"use client";

import { useState } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { validarCPF, formatarCPF, formatarCEP, isMaiorDeIdade, buscarCEP } from "@/lib/validations";
import type { Customer } from "@financer-auto/shared";
import { UserCheck, Loader2 } from "lucide-react";

interface Props {
  customer: Customer;
  onDone: () => void;
}

/** Verifica se o cadastro do cliente tem todos os dados obrigatórios. */
export function cadastroCompleto(c: Customer | null): boolean {
  if (!c) return true; // sem vínculo — não bloqueia (caso raro tratado em outro lugar)
  return Boolean(
    c.cpf && c.cpf.length === 11 &&
    c.birthDate &&
    c.address?.zip && c.address?.street && c.address?.number && c.address?.city
  );
}

/**
 * Tela bloqueante: o cliente precisa completar CPF, nascimento e endereço
 * antes de usar a área do cliente.
 */
export function CompletarCadastro({ customer, onDone }: Props) {
  const [form, setForm] = useState({
    cpf: customer.cpf ?? "",
    rg: customer.rg ?? "",
    birthDate: customer.birthDate ?? "",
    address: {
      street: customer.address?.street ?? "",
      number: customer.address?.number ?? "",
      complement: customer.address?.complement ?? "",
      district: customer.address?.district ?? "",
      city: customer.address?.city ?? "",
      state: customer.address?.state ?? "",
      zip: customer.address?.zip ?? "",
    },
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [cepLoading, setCepLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  function set(k: string, v: string) {
    setForm((p) => ({ ...p, [k]: v }));
    setErrors((p) => ({ ...p, [k]: "" }));
  }
  function setAddr(k: string, v: string) {
    setForm((p) => ({ ...p, address: { ...p.address, [k]: v } }));
    setErrors((p) => ({ ...p, [`addr_${k}`]: "" }));
  }

  async function handleCEP(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    setAddr("zip", digits);
    if (digits.length === 8) {
      setCepLoading(true);
      const end = await buscarCEP(digits);
      setCepLoading(false);
      if (end) {
        setForm((p) => ({
          ...p,
          address: {
            ...p.address,
            zip: digits,
            street: end.logradouro || p.address.street,
            district: end.bairro || p.address.district,
            city: end.localidade || p.address.city,
            state: end.uf || p.address.state,
          },
        }));
      }
    }
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!validarCPF(form.cpf)) errs.cpf = "CPF inválido.";
    if (!form.birthDate) errs.birthDate = "Informe sua data de nascimento.";
    else if (!isMaiorDeIdade(form.birthDate)) errs.birthDate = "É necessário ter 18 anos ou mais.";
    if (!form.address.zip || form.address.zip.length < 8) errs.addr_zip = "CEP obrigatório.";
    if (!form.address.street.trim()) errs.addr_street = "Rua obrigatória.";
    if (!form.address.number.trim()) errs.addr_number = "Número obrigatório.";
    if (!form.address.city.trim()) errs.addr_city = "Cidade obrigatória.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    setSaveError("");
    try {
      await updateDoc(doc(db, "customers", customer.id), {
        cpf: form.cpf.replace(/\D/g, ""),
        rg: form.rg,
        birthDate: form.birthDate,
        address: form.address,
        updatedAt: new Date().toISOString(),
      });
      onDone();
    } catch {
      setSaveError("Erro ao salvar. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  const label = "block text-xs font-medium mb-1";
  const labelStyle = { color: "var(--text-secondary)" };
  const err = (k: string) => errors[k]
    ? <p className="text-xs mt-1" style={{ color: "var(--danger)" }}>{errors[k]}</p>
    : null;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 py-8" style={{ background: "var(--bg-primary)" }}>
      <div className="card w-full max-w-lg p-7">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
               style={{ background: "var(--accent-gradient)" }}>
            <UserCheck className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
            Complete seu cadastro
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Olá, {customer.name.split(" ")[0]}! Para continuar, precisamos de alguns dados para o seu contrato.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} style={labelStyle}>CPF *</label>
              <input value={formatarCPF(form.cpf)} inputMode="numeric"
                     onChange={(e) => set("cpf", e.target.value.replace(/\D/g, "").slice(0, 11))}
                     placeholder="000.000.000-00" className="input-base font-mono" />
              {err("cpf")}
            </div>
            <div>
              <label className={label} style={labelStyle}>RG</label>
              <input value={form.rg} onChange={(e) => set("rg", e.target.value)}
                     placeholder="0000000" className="input-base" />
            </div>
          </div>

          <div>
            <label className={label} style={labelStyle}>Data de nascimento *</label>
            <input type="date" value={form.birthDate} onChange={(e) => set("birthDate", e.target.value)}
                   className="input-base" />
            {err("birthDate")}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} style={labelStyle}>CEP *</label>
              <div className="relative">
                <input value={formatarCEP(form.address.zip)} inputMode="numeric"
                       onChange={(e) => handleCEP(e.target.value)}
                       placeholder="00000-000" maxLength={9} className="input-base font-mono" />
                {cepLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin" style={{ color: "var(--accent)" }} />}
              </div>
              {err("addr_zip")}
            </div>
            <div>
              <label className={label} style={labelStyle}>Cidade *</label>
              <input value={form.address.city} onChange={(e) => setAddr("city", e.target.value)}
                     className="input-base" />
              {err("addr_city")}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className={label} style={labelStyle}>Rua *</label>
              <input value={form.address.street} onChange={(e) => setAddr("street", e.target.value)}
                     className="input-base" />
              {err("addr_street")}
            </div>
            <div>
              <label className={label} style={labelStyle}>Número *</label>
              <input value={form.address.number} onChange={(e) => setAddr("number", e.target.value)}
                     className="input-base" />
              {err("addr_number")}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} style={labelStyle}>Bairro</label>
              <input value={form.address.district} onChange={(e) => setAddr("district", e.target.value)}
                     className="input-base" />
            </div>
            <div>
              <label className={label} style={labelStyle}>Complemento</label>
              <input value={form.address.complement} onChange={(e) => setAddr("complement", e.target.value)}
                     placeholder="Apto, bloco..." className="input-base" />
            </div>
          </div>

          {saveError && (
            <p className="text-xs px-3 py-2 rounded-xl" style={{ background: "var(--danger-light)", color: "var(--danger)" }}>
              {saveError}
            </p>
          )}

          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? "Salvando..." : "Salvar e continuar"}
          </button>
        </form>
      </div>
    </div>
  );
}
