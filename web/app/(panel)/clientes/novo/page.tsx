"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { createCustomer } from "@/lib/firestore/customers";
import {
  validarCPF,
  formatarCPF,
  formatarTelefone,
  formatarCEP,
  isMaiorDeIdade,
  buscarCEP,
} from "@/lib/validations";
import { ArrowLeft, CheckCircle, XCircle, Loader2 } from "lucide-react";
import Link from "next/link";

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

const inputCls = (error?: string) =>
  `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
    error ? "border-red-400 bg-red-50" : "border-gray-300"
  }`;

export default function NovoClientePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    name: "",
    cpf: "",
    rg: "",
    birthDate: "",
    phone: "",
    email: "",
    address: {
      street: "",
      number: "",
      complement: "",
      district: "",
      city: "",
      state: "",
      zip: "",
    },
  });

  function set(key: string, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: "" }));
  }

  function setAddr(key: string, value: string) {
    setForm((prev) => ({ ...prev, address: { ...prev.address, [key]: value } }));
    setErrors((prev) => ({ ...prev, [`addr_${key}`]: "" }));
  }

  // CPF com máscara e validação em tempo real
  function handleCPF(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 11);
    set("cpf", digits);
  }

  // CEP: busca ViaCEP ao completar 8 dígitos
  async function handleCEP(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    setAddr("zip", digits);
    if (digits.length === 8) {
      setCepLoading(true);
      setErrors((prev) => ({ ...prev, addr_zip: "" }));
      const end = await buscarCEP(digits);
      setCepLoading(false);
      if (end) {
        setForm((prev) => ({
          ...prev,
          address: {
            ...prev.address,
            zip: digits,
            street: end.logradouro || prev.address.street,
            district: end.bairro || prev.address.district,
            city: end.localidade || prev.address.city,
            state: end.uf || prev.address.state,
          },
        }));
      } else {
        setErrors((prev) => ({ ...prev, addr_zip: "CEP não encontrado. Preencha o endereço manualmente." }));
      }
    }
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};

    if (!form.name.trim() || form.name.trim().split(" ").length < 2)
      errs.name = "Informe o nome completo (nome e sobrenome).";

    if (!validarCPF(form.cpf))
      errs.cpf = "CPF inválido. Verifique os números digitados.";

    if (!form.birthDate)
      errs.birthDate = "Data de nascimento obrigatória.";
    else if (!isMaiorDeIdade(form.birthDate))
      errs.birthDate = "Cliente deve ter pelo menos 18 anos.";

    if (form.phone.replace(/\D/g, "").length < 10)
      errs.phone = "Telefone inválido. Informe com DDD.";

    if (!form.address.zip || form.address.zip.length < 8)
      errs.addr_zip = "CEP obrigatório.";
    if (!form.address.city.trim())
      errs.addr_city = "Cidade obrigatória.";
    if (!form.address.street.trim())
      errs.addr_street = "Rua obrigatória.";
    if (!form.address.number.trim())
      errs.addr_number = "Número obrigatório.";

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!validate()) return;

    setSaving(true);
    setSaveError("");
    try {
      const id = await createCustomer({
        ...form,
        cpf: form.cpf.replace(/\D/g, ""),
        phone: form.phone.replace(/\D/g, ""),
        documents: {},
        createdBy: user.uid,
      });
      router.push(`/clientes/${id}`);
    } catch {
      setSaveError("Erro ao salvar cliente. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  const cpfValido = form.cpf.length === 11 && validarCPF(form.cpf);
  const cpfInvalido = form.cpf.length === 11 && !validarCPF(form.cpf);

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/clientes" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Novo Cliente</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Após o cadastro, o cliente ficará <span className="font-medium text-amber-600">pendente de aprovação</span> pelo administrador.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {/* Dados Pessoais */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">Dados Pessoais</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Field label="Nome Completo *" error={errors.name}>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  className={inputCls(errors.name)}
                  placeholder="Nome e Sobrenome"
                />
              </Field>
            </div>

            <Field label="CPF *" error={errors.cpf}>
              <div className="relative">
                <input
                  type="text"
                  value={formatarCPF(form.cpf)}
                  onChange={(e) => handleCPF(e.target.value)}
                  className={`${inputCls(errors.cpf)} font-mono pr-8`}
                  placeholder="000.000.000-00"
                  maxLength={14}
                />
                {cpfValido && (
                  <CheckCircle className="absolute right-2 top-2.5 w-4 h-4 text-emerald-500" />
                )}
                {cpfInvalido && (
                  <XCircle className="absolute right-2 top-2.5 w-4 h-4 text-red-500" />
                )}
              </div>
            </Field>

            <Field label="RG">
              <input
                type="text"
                value={form.rg}
                onChange={(e) => set("rg", e.target.value)}
                className={inputCls()}
                placeholder="0000000"
              />
            </Field>

            <Field label="Data de Nascimento *" error={errors.birthDate}>
              <input
                type="date"
                value={form.birthDate}
                onChange={(e) => set("birthDate", e.target.value)}
                className={inputCls(errors.birthDate)}
                max={new Date(Date.now() - 18 * 365.25 * 86400000).toISOString().split("T")[0]}
              />
            </Field>

            <Field label="Telefone / WhatsApp *" error={errors.phone}>
              <input
                type="tel"
                value={formatarTelefone(form.phone)}
                onChange={(e) => {
                  const d = e.target.value.replace(/\D/g, "").slice(0, 11);
                  set("phone", d);
                }}
                className={`${inputCls(errors.phone)} font-mono`}
                placeholder="(11) 99999-9999"
              />
            </Field>

            <div className="col-span-2">
              <Field label="E-mail">
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  className={inputCls()}
                  placeholder="cliente@email.com"
                />
              </Field>
            </div>
          </div>
        </section>

        {/* Endereço */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">Endereço</h2>
          <div className="grid grid-cols-2 gap-4">
            <Field label="CEP *" error={errors.addr_zip}>
              <div className="relative">
                <input
                  type="text"
                  value={formatarCEP(form.address.zip)}
                  onChange={(e) => handleCEP(e.target.value)}
                  className={`${inputCls(errors.addr_zip)} font-mono pr-8`}
                  placeholder="00000-000"
                  maxLength={9}
                />
                {cepLoading && (
                  <Loader2 className="absolute right-2 top-2.5 w-4 h-4 text-blue-500 animate-spin" />
                )}
              </div>
              {!errors.addr_zip && form.address.city && (
                <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Endereço encontrado via CEP
                </p>
              )}
            </Field>

            <Field label="Estado (UF)">
              <input
                type="text"
                value={form.address.state}
                onChange={(e) => setAddr("state", e.target.value.toUpperCase())}
                maxLength={2}
                className={inputCls()}
                placeholder="SP"
              />
            </Field>

            <Field label="Cidade *" error={errors.addr_city}>
              <input
                type="text"
                value={form.address.city}
                onChange={(e) => setAddr("city", e.target.value)}
                className={inputCls(errors.addr_city)}
              />
            </Field>

            <Field label="Bairro">
              <input
                type="text"
                value={form.address.district}
                onChange={(e) => setAddr("district", e.target.value)}
                className={inputCls()}
              />
            </Field>

            <Field label="Rua *" error={errors.addr_street}>
              <input
                type="text"
                value={form.address.street}
                onChange={(e) => setAddr("street", e.target.value)}
                className={inputCls(errors.addr_street)}
              />
            </Field>

            <Field label="Número *" error={errors.addr_number}>
              <input
                type="text"
                value={form.address.number}
                onChange={(e) => setAddr("number", e.target.value)}
                className={inputCls(errors.addr_number)}
              />
            </Field>

            <div className="col-span-2">
              <Field label="Complemento">
                <input
                  type="text"
                  value={form.address.complement}
                  onChange={(e) => setAddr("complement", e.target.value)}
                  className={inputCls()}
                  placeholder="Apto, bloco, casa..."
                />
              </Field>
            </div>
          </div>
        </section>

        {/* Info aprovação */}
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <span className="text-lg">⚠️</span>
          <div>
            <p className="font-semibold">Aprovação necessária</p>
            <p className="text-xs mt-0.5">
              Após o cadastro, o cliente ficará com status <strong>Pendente</strong> até que um administrador
              valide os dados e documentos. Só então será possível criar um contrato para este cliente.
            </p>
          </div>
        </div>

        {saveError && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{saveError}</p>
        )}

        <div className="flex justify-end gap-3">
          <Link
            href="/clientes"
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={saving || cpfInvalido}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Salvando..." : "Cadastrar Cliente"}
          </button>
        </div>
      </form>
    </div>
  );
}
