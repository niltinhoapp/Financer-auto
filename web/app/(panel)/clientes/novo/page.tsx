"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import { createCustomer } from "@/lib/firestore/customers";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { registrarAuditoria } from "@/lib/audit";
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

function Field({ label, error, id, children }: { label: string; error?: string; id: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

const inputCls = (error?: string) =>
  `w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
    error ? "border-red-400 bg-red-50" : "border-gray-300"
  }`;

// Data máxima para nascimento (18 anos atrás) — calculada uma única vez ao carregar o módulo,
// não a cada render, para evitar chamar Date.now() de forma impura durante a renderização.
const MAX_BIRTH_DATE = new Date(Date.now() - 18 * 365.25 * 86400000).toISOString().split("T")[0];

// Cadastro rápido pelo admin: apenas nome, telefone e e-mail são obrigatórios.
// CPF, nascimento e endereço serão exigidos do próprio cliente no primeiro acesso.
const clienteSchema = z.object({
  name: z.string().refine(
    (v) => v.trim().length > 0 && v.trim().split(" ").length >= 2,
    "Informe o nome completo (nome e sobrenome)."
  ),
  cpf: z.string().refine((v) => !v || validarCPF(v), "CPF inválido. Verifique os números digitados."),
  rg: z.string(),
  birthDate: z.string().refine((v) => !v || isMaiorDeIdade(v), "Cliente deve ter pelo menos 18 anos."),
  phone: z.string().refine((v) => v.replace(/\D/g, "").length >= 10, "Telefone inválido. Informe com DDD."),
  email: z
    .string()
    .min(1, "E-mail válido é obrigatório (usado para o acesso do cliente).")
    .regex(/\S+@\S+\.\S+/, "E-mail válido é obrigatório (usado para o acesso do cliente)."),
  address: z.object({
    street: z.string(),
    number: z.string(),
    complement: z.string(),
    district: z.string(),
    city: z.string(),
    state: z.string(),
    zip: z.string(),
  }),
});

type ClienteFormValues = z.infer<typeof clienteSchema>;

function NovoClienteForm() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useSearchParams();
  // Pré-preenchimento vindo de um lead da loja virtual
  const leadId = params.get("leadId");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState("");
  const [cepFound, setCepFound] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ClienteFormValues>({
    resolver: zodResolver(clienteSchema),
    defaultValues: {
      name: params.get("name") ?? "",
      cpf: "",
      rg: "",
      birthDate: "",
      phone: (params.get("phone") ?? "").replace(/\D/g, "").slice(0, 11),
      email: params.get("email") ?? "",
      address: {
        street: "",
        number: "",
        complement: "",
        district: "",
        city: "",
        state: "",
        zip: "",
      },
    },
  });

  const cpf = watch("cpf");
  const phone = watch("phone");
  const zip = watch("address.zip");
  const city = watch("address.city");

  // CEP: busca ViaCEP ao completar 8 dígitos
  async function handleCEP(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    setValue("address.zip", digits, { shouldValidate: true });
    setCepFound(false);
    if (digits.length === 8) {
      setCepLoading(true);
      setCepError("");
      const end = await buscarCEP(digits);
      setCepLoading(false);
      if (end) {
        if (end.logradouro) setValue("address.street", end.logradouro);
        if (end.bairro) setValue("address.district", end.bairro);
        if (end.localidade) setValue("address.city", end.localidade);
        if (end.uf) setValue("address.state", end.uf);
        setCepFound(true);
      } else {
        setCepError("CEP não encontrado. Preencha o endereço manualmente.");
      }
    }
  }

  async function onSubmit(data: ClienteFormValues) {
    if (!user) return;
    setSaving(true);
    setSaveError("");
    try {
      const id = await createCustomer({
        ...data,
        cpf: data.cpf.replace(/\D/g, ""),
        phone: data.phone.replace(/\D/g, ""),
        documents: {},
        createdBy: user.uid,
      });
      // Veio de um lead da loja? Marca como convertido (não bloqueia o fluxo se falhar)
      if (leadId) {
        try {
          await updateDoc(doc(db, "leads", leadId), {
            status: "converted",
            customerId: id,
            updatedAt: new Date().toISOString(),
          });
          // Best-effort, sem await — mesmo padrão de todo o app. Não buscamos
          // o status anterior do lead aqui (evitar leitura extra só pra isso);
          // o evento em si (conversão) já é a informação relevante.
          registrarAuditoria(
            "lead_convertido",
            `Lead convertido em cliente "${data.name}" (novo customerId: ${id})`,
            user,
            { tipo: "lead", id: leadId }
          );
        } catch (e) {
          console.error("Falha ao marcar lead como convertido:", e);
          Sentry.captureException(e);
        }
      }
      router.push(`/clientes/${id}`);
    } catch (e) {
      console.error("Erro ao salvar cliente:", e);
      Sentry.captureException(e);
      setSaveError("Erro ao salvar cliente. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  const cpfValido = cpf.length === 11 && validarCPF(cpf);
  const cpfInvalido = cpf.length === 11 && !validarCPF(cpf);

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/clientes" aria-label="Voltar para Clientes" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Novo Cliente</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Após o cadastro, o cliente ficará <span className="font-medium text-amber-600">pendente de aprovação</span> pelo administrador.
          </p>
          {leadId && (
            <p className="text-xs mt-1 font-medium text-emerald-600">
              ✓ Dados importados do lead — ao salvar, o lead será marcado como convertido.
            </p>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
        {/* Dados Pessoais */}
        <section className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-4 pb-2 border-b">Dados Pessoais</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Field label="Nome Completo *" error={errors.name?.message} id="name">
                <input
                  id="name"
                  type="text"
                  {...register("name")}
                  className={inputCls(errors.name?.message)}
                  placeholder="Nome e Sobrenome"
                />
              </Field>
            </div>

            <Field label="CPF (opcional)" error={errors.cpf?.message} id="cpf">
              <div className="relative">
                <input
                  id="cpf"
                  type="text"
                  {...register("cpf")}
                  value={formatarCPF(cpf)}
                  onChange={(e) => setValue("cpf", e.target.value.replace(/\D/g, "").slice(0, 11), { shouldValidate: true })}
                  className={`${inputCls(errors.cpf?.message)} font-mono pr-8`}
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

            <Field label="RG" id="rg">
              <input
                id="rg"
                type="text"
                {...register("rg")}
                className={inputCls()}
                placeholder="0000000"
              />
            </Field>

            <Field label="Data de Nascimento (opcional)" error={errors.birthDate?.message} id="birthDate">
              <input
                id="birthDate"
                type="date"
                {...register("birthDate")}
                className={inputCls(errors.birthDate?.message)}
                max={MAX_BIRTH_DATE}
              />
            </Field>

            <Field label="Telefone / WhatsApp *" error={errors.phone?.message} id="phone">
              <input
                id="phone"
                type="tel"
                {...register("phone")}
                value={formatarTelefone(phone)}
                onChange={(e) => setValue("phone", e.target.value.replace(/\D/g, "").slice(0, 11), { shouldValidate: true })}
                className={`${inputCls(errors.phone?.message)} font-mono`}
                placeholder="(11) 99999-9999"
              />
            </Field>

            <div className="col-span-2">
              <Field label="E-mail *" error={errors.email?.message} id="email">
                <input
                  id="email"
                  type="email"
                  {...register("email")}
                  className={inputCls(errors.email?.message)}
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
            <Field label="CEP (opcional)" error={cepError} id="addr_zip">
              <div className="relative">
                <input
                  id="addr_zip"
                  type="text"
                  {...register("address.zip")}
                  value={formatarCEP(zip)}
                  onChange={(e) => handleCEP(e.target.value)}
                  className={`${inputCls(cepError)} font-mono pr-8`}
                  placeholder="00000-000"
                  maxLength={9}
                />
                {cepLoading && (
                  <Loader2 className="absolute right-2 top-2.5 w-4 h-4 text-blue-500 animate-spin" />
                )}
              </div>
              {!cepError && cepFound && city && (
                <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Endereço encontrado via CEP
                </p>
              )}
            </Field>

            <Field label="Estado (UF)" id="addr_state">
              <input
                id="addr_state"
                type="text"
                {...register("address.state")}
                onChange={(e) => setValue("address.state", e.target.value.toUpperCase())}
                maxLength={2}
                className={inputCls()}
                placeholder="SP"
              />
            </Field>

            <Field label="Cidade" id="addr_city">
              <input
                id="addr_city"
                type="text"
                {...register("address.city")}
                className={inputCls()}
              />
            </Field>

            <Field label="Bairro" id="addr_district">
              <input
                id="addr_district"
                type="text"
                {...register("address.district")}
                className={inputCls()}
              />
            </Field>

            <Field label="Rua" id="addr_street">
              <input
                id="addr_street"
                type="text"
                {...register("address.street")}
                className={inputCls()}
              />
            </Field>

            <Field label="Número" id="addr_number">
              <input
                id="addr_number"
                type="text"
                {...register("address.number")}
                className={inputCls()}
              />
            </Field>

            <div className="col-span-2">
              <Field label="Complemento" id="addr_complement">
                <input
                  id="addr_complement"
                  type="text"
                  {...register("address.complement")}
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

// useSearchParams exige Suspense boundary no App Router
export default function NovoClientePage() {
  return (
    <Suspense fallback={
      <div className="p-8 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-4"
             style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
      </div>
    }>
      <NovoClienteForm />
    </Suspense>
  );
}
