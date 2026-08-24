"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { useAuth } from "@/hooks/useAuth";
import { getCustomers } from "@/lib/firestore/customers";
import { getVehicles } from "@/lib/firestore/vehicles";
import { createContract } from "@/lib/firestore/contracts";
import { calcularResumoFinanciamento, gerarCronograma, gerarCronogramaManual } from "@/lib/financiamento";
import { contractPayloadSchema, type ContractPayloadInput } from "@/lib/contractPayloadSchema";
import { formatCurrency, todayISO } from "@/lib/utils";
import { getDocs, collection } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useToast } from "@/components/ui/Toast";
import type { Customer, Vehicle } from "@financer-auto/shared";
import { ArrowLeft, ChevronRight, ArrowLeftRight, AlertTriangle, ShieldCheck, CheckCircle } from "lucide-react";
import Link from "next/link";

type Step = 1 | 2 | 3 | 4;

const inputCls = "w-full px-3 py-2.5 rounded-xl text-sm";
const inputStyle = { background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" };
const labelCls = "block text-xs font-medium mb-1";

const DOC_OBRIGATORIOS = ["cpf", "rg", "residencia", "renda"];

export default function NovoContratoPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [vehicleSearch, setVehicleSearch] = useState("");

  // Documentos do cliente
  const [customerDocs, setCustomerDocs] = useState<string[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [docsOverride, setDocsOverride] = useState(false);

  const [financiamento, setFinanciamento] = useState({
    entrada: 0,
    parcelas: 12,
    taxaMensal: 2.5,
    primeiroVencimento: "",
    multa: 2,
    jurosDiario: 0.1,
    notas: "",
    modoManual: false,
    valorParcelaManual: 0,
  });

  const [tradeIn, setTradeIn] = useState({
    ativo: false,
    marca: "",
    modelo: "",
    ano: "",
    placa: "",
    valor: 0,
    notas: "",
  });

  useEffect(() => {
    Promise.resolve().then(() => {
      const d = new Date();
      d.setMonth(d.getMonth() + 1);
      d.setDate(1);
      setFinanciamento((prev) => ({ ...prev, primeiroVencimento: d.toISOString().split("T")[0] }));
    });
    Promise.all([getCustomers(), getVehicles("available")]).then(([c, v]) => {
      setCustomers(c);
      setVehicles(v);
    }).catch((e) => {
      console.error("Erro ao carregar clientes/veículos:", e);
      Sentry.captureException(e);
      toast("Não foi possível carregar clientes e veículos. Tente novamente.", "error");
    });
  }, [toast]);

  async function loadCustomerDocs(customerId: string) {
    setLoadingDocs(true);
    setCustomerDocs([]);
    setDocsOverride(false);
    try {
      const snap = await getDocs(collection(db, "customers", customerId, "documents"));
      const approved = snap.docs.filter((d) => d.data().status === "approved").map((d) => d.id);
      setCustomerDocs(approved);
    } catch (e) {
      console.error("Erro ao carregar documentos do cliente:", e);
      Sentry.captureException(e);
      setCustomerDocs([]);
    }
    finally { setLoadingDocs(false); }
  }

  const preco = selectedVehicle?.price ?? 0;
  const entradaTotal = financiamento.entrada + (tradeIn.ativo ? tradeIn.valor : 0);

  const resumoCalculado = calcularResumoFinanciamento(preco, entradaTotal, financiamento.taxaMensal, financiamento.parcelas);

  // Modo manual: vendedor define o valor da parcela diretamente (sem cálculo de juros).
  const resumo = financiamento.modoManual
    ? {
        valorFinanciado: Math.round((preco - entradaTotal) * 100) / 100,
        valorParcela: financiamento.valorParcelaManual,
        totalPago: Math.round((entradaTotal + financiamento.valorParcelaManual * financiamento.parcelas) * 100) / 100,
        totalJuros: Math.round((entradaTotal + financiamento.valorParcelaManual * financiamento.parcelas - preco) * 100) / 100,
      }
    : resumoCalculado;

  const cronograma = selectedVehicle
    ? financiamento.modoManual
      ? gerarCronogramaManual(financiamento.valorParcelaManual, financiamento.parcelas, financiamento.primeiroVencimento)
      : gerarCronograma({
          valorFinanciado: resumo.valorFinanciado,
          taxaMensal: financiamento.taxaMensal,
          numeroParcelas: financiamento.parcelas,
          primeiroVencimento: financiamento.primeiroVencimento,
          multaPerc: financiamento.multa,
          jurosDiarioPerc: financiamento.jurosDiario,
        })
    : [];

  const docsOk = DOC_OBRIGATORIOS.every((d) => customerDocs.includes(d));
  const docsFaltando = DOC_OBRIGATORIOS.filter((d) => !customerDocs.includes(d));

  async function handleSave() {
    if (!user) return;

    // Camada final de validação antes de persistir — os `disabled` dos
    // botões do wizard orientam a navegação, mas não são a fonte de
    // verdade da integridade dos dados. Cobre os dois modos de negociação
    // (financiamento calculado e negócio combinado manualmente).
    const payload: ContractPayloadInput = {
      customerId: selectedCustomer?.id ?? null,
      vehicleId: selectedVehicle?.id ?? null,
      price: preco,
      downPayment: financiamento.entrada,
      downPaymentTotal: entradaTotal,
      tradeIn: {
        ativo: tradeIn.ativo,
        marca: tradeIn.marca,
        modelo: tradeIn.modelo,
        ano: tradeIn.ano,
        placa: tradeIn.placa,
        valor: tradeIn.valor,
      },
      installmentsCount: financiamento.parcelas,
      firstDueDate: financiamento.primeiroVencimento,
      modoManual: financiamento.modoManual,
      financedAmount: resumo.valorFinanciado,
      installmentValue: resumo.valorParcela,
      interestRate: financiamento.taxaMensal,
      penaltyRate: financiamento.multa,
      dailyInterestRate: financiamento.jurosDiario,
      docsOk,
      docsOverride,
      isAdmin: user.role === "admin",
    };

    const validation = contractPayloadSchema.safeParse(payload);
    if (!validation.success) {
      const message = validation.error.issues.map((i) => i.message).join(" ");
      const failedFields = validation.error.issues.map((i) => i.path.join(".")).join(", ");
      console.error("Validação do contrato falhou antes de salvar:", validation.error.issues);
      // Registro mínimo — só quais campos falharam, sem exceção completa
      // nem dados pessoais: é uma validação de entrada esperada, não um bug.
      Sentry.captureMessage(`Validação de contrato falhou antes de salvar: ${failedFields}`, "warning");
      setError(message);
      toast(message, "error");
      return;
    }

    // A validação acima já garante customerId/vehicleId presentes —
    // este check só ajuda o TypeScript a estreitar o tipo.
    if (!selectedCustomer || !selectedVehicle) return;

    setSaving(true);
    setError("");
    try {
      const id = await createContract({
        customerId: selectedCustomer.id,
        vehicleId: selectedVehicle.id,
        sellerId: user.uid,
        salePrice: preco,
        downPayment: entradaTotal,
        financedAmount: resumo.valorFinanciado,
        ...(tradeIn.ativo ? {
          tradeIn: { marca: tradeIn.marca, modelo: tradeIn.modelo, ano: tradeIn.ano, placa: tradeIn.placa, valor: tradeIn.valor, notas: tradeIn.notas },
        } : {}),
        installmentsCount: financiamento.parcelas,
        installmentValue: resumo.valorParcela,
        firstDueDate: financiamento.primeiroVencimento,
        interestRate: financiamento.modoManual ? 0 : financiamento.taxaMensal,
        penaltyRate: financiamento.multa,
        dailyInterestRate: financiamento.jurosDiario,
        notes: financiamento.notas,
        docsOverrideBy: (!docsOk && docsOverride) ? user.uid : undefined,
        docsOverrideAt: (!docsOk && docsOverride) ? new Date().toISOString() : undefined,
        docsPendingAtSale: docsOk ? [] : docsFaltando,
      });
      router.push(`/contratos/${id}`);
    } catch (e) {
      console.error("Erro ao salvar contrato:", e);
      Sentry.captureException(e);
      setError("Erro ao salvar contrato. Tente novamente.");
      setSaving(false);
    }
  }

  const filteredCustomers = customers.filter(
    (c) => !customerSearch || c.name.toLowerCase().includes(customerSearch.toLowerCase()) || c.cpf.includes(customerSearch)
  );
  const filteredVehicles = vehicles.filter(
    (v) => !vehicleSearch || `${v.brand} ${v.model} ${v.plate}`.toLowerCase().includes(vehicleSearch.toLowerCase())
  );

  const stepLabels = ["Cliente", "Veículo", "Financiamento", "Revisão"];

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/contratos" aria-label="Voltar para Contratos" style={{ color: "var(--text-muted)" }} className="hover:opacity-70 transition-opacity">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-xl md:text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Nova Venda</h1>
      </div>

      {/* Steps */}
      <div className="flex items-center gap-1 mb-6 overflow-x-auto pb-1">
        {stepLabels.map((label, i) => {
          const s = (i + 1) as Step;
          const done = step > s;
          const active = step === s;
          return (
            <div key={label} className="flex items-center gap-1 flex-shrink-0">
              <span className="px-2.5 py-1 rounded-full text-xs font-medium transition-all"
                    style={
                      active ? { background: "var(--accent)", color: "#fff" }
                      : done  ? { background: "var(--accent-light)", color: "var(--accent)" }
                      :         { background: "var(--bg-hover)", color: "var(--text-muted)" }
                    }>
                {i + 1}. {label}
              </span>
              {i < 3 && <ChevronRight className="w-4 h-4" style={{ color: "var(--border)" }} />}
            </div>
          );
        })}
      </div>

      {/* ── Step 1: Cliente ── */}
      {step === 1 && (
        <div className="card p-5">
          <h2 className="font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Selecionar Cliente</h2>
          <input type="text" placeholder="Buscar por nome ou CPF..."
                 value={customerSearch} onChange={(e) => setCustomerSearch(e.target.value)}
                 className={`${inputCls} mb-4`} style={inputStyle} />
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {filteredCustomers.map((c) => {
              const aprovado = c.approvalStatus === "approved";
              return (
                <button key={c.id} type="button"
                        disabled={!aprovado}
                        onClick={async () => {
                          if (!aprovado) return;
                          setSelectedCustomer(c);
                          await loadCustomerDocs(c.id);
                          setStep(2);
                        }}
                        className="w-full text-left px-4 py-3 rounded-xl border transition-all"
                        style={
                          !aprovado ? { background: "var(--bg-hover)", borderColor: "var(--border)", opacity: 0.5, cursor: "not-allowed" }
                          : selectedCustomer?.id === c.id
                            ? { background: "var(--accent-light)", borderColor: "var(--accent)" }
                            : { background: "var(--bg-card)", borderColor: "var(--border)" }
                        }>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>{c.name}</p>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {c.restricted && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                              style={{ background: "#ef444418", color: "#ef4444" }}>
                          Restrição
                        </span>
                      )}
                      {!aprovado && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                              style={{ background: "#f59e0b18", color: "#f59e0b" }}>
                          {c.approvalStatus === "rejected" ? "Rejeitado" : "Pendente"}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    CPF: {c.cpf} · {c.address.city}/{c.address.state}
                  </p>
                </button>
              );
            })}
            {filteredCustomers.length === 0 && (
              <p className="text-sm text-center py-4" style={{ color: "var(--text-muted)" }}>
                Nenhum cliente encontrado.{" "}
                <Link href="/clientes/novo" style={{ color: "var(--accent)" }}>Cadastrar novo</Link>
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Step 2: Veículo ── */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Alerta de restrição interna */}
          {selectedCustomer?.restricted && (
            <div className="card p-4 space-y-1" style={{ borderColor: "#ef444450", background: "#ef444410" }}>
              <p className="text-sm font-semibold flex items-center gap-2" style={{ color: "#ef4444" }}>
                <AlertTriangle className="w-4 h-4" /> Cliente com restrição interna
              </p>
              <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                {selectedCustomer.restrictionReason || "Cliente marcado com restrição de crédito."}
                {" "}Avalie com cuidado antes de prosseguir com a venda.
              </p>
            </div>
          )}
          {/* Alerta de documentos */}
          {loadingDocs ? (
            <div className="card p-4 flex items-center gap-3">
              <div className="animate-spin rounded-full h-4 w-4 border-2" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>Verificando documentos...</span>
            </div>
          ) : docsOk ? (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl"
                 style={{ background: "#10b98118", border: "1px solid #10b98140", color: "#10b981" }}>
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm font-medium">Documentação completa e aprovada</span>
            </div>
          ) : (
            <div className="card p-4 space-y-3" style={{ borderColor: "#f59e0b40" }}>
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#f59e0b" }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    Documentação incompleta
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                    Documentos pendentes de aprovação: {docsFaltando.map((d) => {
                      const n: Record<string, string> = { cpf: "CPF", rg: "RG", residencia: "Residência", renda: "Renda" };
                      return n[d] ?? d;
                    }).join(", ")}
                  </p>
                </div>
              </div>
              {user?.role === "admin" && (
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    role="switch"
                    checked={docsOverride}
                    onChange={(e) => setDocsOverride(e.target.checked)}
                    aria-label="Liberar venda mesmo assim"
                    className="sr-only peer"
                  />
                  <div
                    aria-hidden="true"
                    className="w-10 h-6 rounded-full transition-colors relative flex-shrink-0 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:[outline-color:var(--accent)]"
                    style={{ background: docsOverride ? "#f59e0b" : "var(--bg-hover)", border: "1px solid var(--border)" }}
                  >
                    <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${docsOverride ? "left-5" : "left-1"}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                      Liberar venda mesmo assim
                    </p>
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                      Admin assume responsabilidade. Ficará registrado no contrato.
                    </p>
                  </div>
                </label>
              )}
              {user?.role !== "admin" && (
                <div className="flex items-center gap-2 text-xs" style={{ color: "#ef4444" }}>
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Apenas o admin pode liberar venda com docs pendentes.
                </div>
              )}
            </div>
          )}

          <div className="card p-5">
            <h2 className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>Selecionar Veículo</h2>
            <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
              Cliente: <span className="font-medium" style={{ color: "var(--text-secondary)" }}>{selectedCustomer?.name}</span>
            </p>
            <input type="text" placeholder="Buscar por marca, modelo ou placa..."
                   value={vehicleSearch} onChange={(e) => setVehicleSearch(e.target.value)}
                   className={`${inputCls} mb-4`} style={inputStyle} />
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {filteredVehicles.map((v) => (
                <button key={v.id} type="button"
                        disabled={!docsOk && !docsOverride && user?.role !== "admin"}
                        onClick={() => { setSelectedVehicle(v); setStep(3); }}
                        className="w-full text-left px-4 py-3 rounded-xl border transition-all"
                        style={
                          selectedVehicle?.id === v.id
                            ? { background: "var(--accent-light)", borderColor: "var(--accent)" }
                            : { background: "var(--bg-card)", borderColor: "var(--border)" }
                        }>
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>
                      {v.brand} {v.model} {v.year}
                    </p>
                    <p className="font-bold text-sm" style={{ color: "var(--accent)" }}>
                      {formatCurrency(v.price)}
                    </p>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {v.plate} · {v.mileage.toLocaleString("pt-BR")} km
                  </p>
                </button>
              ))}
              {filteredVehicles.length === 0 && (
                <p className="text-sm text-center py-4" style={{ color: "var(--text-muted)" }}>
                  Nenhum veículo disponível.
                </p>
              )}
            </div>
            <button type="button" onClick={() => setStep(1)}
                    className="mt-4 text-xs" style={{ color: "var(--text-muted)" }}>
              ← Voltar
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Financiamento ── */}
      {step === 3 && (
        <div className="card p-5 space-y-5">
          <div>
            <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>Condições de Financiamento</h2>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              {selectedVehicle?.brand} {selectedVehicle?.model} · {formatCurrency(preco)}
            </p>
          </div>

          {/* Modo manual */}
          <div className="p-4 rounded-xl space-y-1" style={{ border: "1px solid var(--border)" }}>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                role="switch"
                checked={financiamento.modoManual}
                onChange={(e) => setFinanciamento((p) => ({ ...p, modoManual: e.target.checked }))}
                aria-label="Negócio combinado manualmente"
                className="sr-only peer"
              />
              <div
                aria-hidden="true"
                className="w-10 h-6 rounded-full relative flex-shrink-0 transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:[outline-color:var(--accent)]"
                style={{ background: financiamento.modoManual ? "var(--accent)" : "var(--bg-hover)", border: "1px solid var(--border)" }}>
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${financiamento.modoManual ? "left-5" : "left-1"}`} />
              </div>
              <div>
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  Negócio combinado manualmente
                </span>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  Defina entrada e valor de cada parcela diretamente (ex: 3 mil de entrada + 30x de R$ 400), sem cálculo de juros.
                </p>
              </div>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="entrada" className={labelCls} style={{ color: "var(--text-secondary)" }}>Entrada (R$)</label>
              <input id="entrada" type="number" value={financiamento.entrada || ""}
                     onChange={(e) => setFinanciamento((p) => ({ ...p, entrada: Number(e.target.value) }))}
                     min={0} max={financiamento.modoManual ? undefined : preco} step={0.01} placeholder="0,00" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label htmlFor="parcelas" className={labelCls} style={{ color: "var(--text-secondary)" }}>Nº de Parcelas</label>
              {financiamento.modoManual ? (
                <input id="parcelas" type="number" value={financiamento.parcelas}
                       onChange={(e) => setFinanciamento((p) => ({ ...p, parcelas: Math.max(1, Number(e.target.value)) }))}
                       min={1} step={1} className={inputCls} style={inputStyle} />
              ) : (
                <select id="parcelas" value={financiamento.parcelas}
                        onChange={(e) => setFinanciamento((p) => ({ ...p, parcelas: Number(e.target.value) }))}
                        className={inputCls} style={inputStyle}>
                  {[3, 6, 9, 12, 18, 24, 36, 48, 60].map((n) => (
                    <option key={n} value={n}>{n}x</option>
                  ))}
                </select>
              )}
            </div>

            {financiamento.modoManual ? (
              <div>
                <label htmlFor="valorParcelaManual" className={labelCls} style={{ color: "var(--text-secondary)" }}>Valor de cada parcela (R$)</label>
                <input id="valorParcelaManual" type="number" value={financiamento.valorParcelaManual || ""}
                       onChange={(e) => setFinanciamento((p) => ({ ...p, valorParcelaManual: Number(e.target.value) }))}
                       min={0} step={0.01} placeholder="0,00" className={inputCls} style={inputStyle} />
              </div>
            ) : (
              <div>
                <label htmlFor="taxaMensal" className={labelCls} style={{ color: "var(--text-secondary)" }}>Taxa de Juros (% a.m.)</label>
                <input id="taxaMensal" type="number" value={financiamento.taxaMensal}
                       onChange={(e) => setFinanciamento((p) => ({ ...p, taxaMensal: Number(e.target.value) }))}
                       min={0} step={0.1} className={inputCls} style={inputStyle} />
              </div>
            )}

            {financiamento.modoManual && (
              <div>
                <label htmlFor="diaVencimento" className={labelCls} style={{ color: "var(--text-secondary)" }}>Dia do vencimento (todo mês)</label>
                <select
                  id="diaVencimento"
                  value={financiamento.primeiroVencimento ? Number(financiamento.primeiroVencimento.split("-")[2]) : ""}
                  onChange={(e) => {
                    const dia = Number(e.target.value);
                    if (!dia) return;
                    // Primeira parcela: próxima ocorrência do dia escolhido (mês que vem se já passou)
                    const hoje = new Date();
                    let ano = hoje.getFullYear();
                    let mes = hoje.getMonth();
                    if (hoje.getDate() >= dia) mes += 1;
                    if (mes > 11) { mes = 0; ano += 1; }
                    const data = `${ano}-${String(mes + 1).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
                    setFinanciamento((p) => ({ ...p, primeiroVencimento: data }));
                  }}
                  className={inputCls} style={inputStyle}>
                  <option value="">Escolher dia...</option>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>Dia {d}</option>
                  ))}
                </select>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  Dias 1 a 28 para valer em todos os meses.
                </p>
              </div>
            )}
            <div>
              <label htmlFor="primeiroVencimento" className={labelCls} style={{ color: "var(--text-secondary)" }}>1º Vencimento</label>
              <input id="primeiroVencimento" type="date" value={financiamento.primeiroVencimento}
                     onChange={(e) => setFinanciamento((p) => ({ ...p, primeiroVencimento: e.target.value }))}
                     min={todayISO()} className={inputCls} style={inputStyle} />
              {financiamento.modoManual && financiamento.primeiroVencimento && (
                <p className="text-xs mt-1" style={{ color: "var(--accent)" }}>
                  Parcelas vencem todo dia {Number(financiamento.primeiroVencimento.split("-")[2])}, a partir de {financiamento.primeiroVencimento.split("-").reverse().join("/")}.
                </p>
              )}
            </div>
            <div>
              <label htmlFor="multa" className={labelCls} style={{ color: "var(--text-secondary)" }}>Multa por Atraso (%)</label>
              <input id="multa" type="number" value={financiamento.multa}
                     onChange={(e) => setFinanciamento((p) => ({ ...p, multa: Number(e.target.value) }))}
                     min={0} step={0.1} className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label htmlFor="jurosDiario" className={labelCls} style={{ color: "var(--text-secondary)" }}>Juros Diário Atraso (%)</label>
              <input id="jurosDiario" type="number" value={financiamento.jurosDiario}
                     onChange={(e) => setFinanciamento((p) => ({ ...p, jurosDiario: Number(e.target.value) }))}
                     min={0} step={0.01} className={inputCls} style={inputStyle} />
            </div>
          </div>

          {financiamento.modoManual && (
            <p className="text-xs px-3 py-2 rounded-xl"
               style={{ background: "var(--accent-light)", color: "var(--accent)", border: "1px solid var(--accent)30" }}>
              Multa e juros diário acima continuam valendo apenas para parcelas em atraso (cobrança), não alteram o valor combinado das parcelas.
            </p>
          )}

          {/* Resumo financeiro */}
          <div className="grid grid-cols-2 gap-3 p-4 rounded-xl"
               style={{ background: "var(--accent-light)", border: "1px solid var(--accent)30" }}>
            {[
              { label: "Valor Financiado", value: resumo.valorFinanciado, accent: false },
              { label: "Parcela Mensal",   value: resumo.valorParcela,    accent: true  },
              { label: "Total a Pagar",    value: resumo.totalPago,       accent: false },
              { label: financiamento.modoManual ? "Diferença vs. Preço" : "Total de Juros", value: resumo.totalJuros, danger: true },
            ].map(({ label, value, accent, danger }: { label: string; value: number; accent?: boolean; danger?: boolean }) => (
              <div key={label}>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</p>
                <p className="font-bold text-sm" style={{
                  color: danger ? "#ef4444" : accent ? "var(--accent)" : "var(--text-primary)",
                }}>
                  {formatCurrency(value)}
                </p>
              </div>
            ))}
          </div>

          {/* Trade-in */}
          <div className="p-4 rounded-xl space-y-3" style={{ border: "1px solid var(--border)" }}>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                role="switch"
                checked={tradeIn.ativo}
                onChange={(e) => setTradeIn((p) => ({ ...p, ativo: e.target.checked }))}
                aria-label="Veículo de entrada (trade-in)"
                className="sr-only peer"
              />
              <div
                aria-hidden="true"
                className="w-10 h-6 rounded-full relative flex-shrink-0 transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:[outline-color:var(--accent)]"
                style={{ background: tradeIn.ativo ? "var(--accent)" : "var(--bg-hover)", border: "1px solid var(--border)" }}>
                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${tradeIn.ativo ? "left-5" : "left-1"}`} />
              </div>
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4" style={{ color: "var(--text-secondary)" }} />
                <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  Veículo de entrada (trade-in)
                </span>
              </div>
            </label>

            {tradeIn.ativo && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                {[
                  { key: "marca",  label: "Marca",  ph: "Honda" },
                  { key: "modelo", label: "Modelo", ph: "Civic" },
                  { key: "ano",    label: "Ano",    ph: "2019"  },
                  { key: "placa",  label: "Placa",  ph: "ABC1D23", upper: true },
                ].map(({ key, label, ph, upper }) => (
                  <div key={key}>
                    <label htmlFor={`tradeIn_${key}`} className={labelCls} style={{ color: "var(--text-secondary)" }}>{label}</label>
                    <input id={`tradeIn_${key}`} type="text" value={tradeIn[key as "marca" | "modelo" | "ano" | "placa"]}
                           onChange={(e) => setTradeIn((p) => ({ ...p, [key]: upper ? e.target.value.toUpperCase() : e.target.value }))}
                           placeholder={ph} className={inputCls} style={inputStyle} />
                  </div>
                ))}
                <div className="col-span-2">
                  <label htmlFor="tradeIn_valor" className={labelCls} style={{ color: "var(--text-secondary)" }}>Valor avaliado (R$)</label>
                  <input id="tradeIn_valor" type="number" value={tradeIn.valor || ""}
                         onChange={(e) => setTradeIn((p) => ({ ...p, valor: Number(e.target.value) }))}
                         min={0} step={0.01} placeholder="0,00" className={inputCls} style={inputStyle} />
                </div>
                <div className="col-span-2">
                  <label htmlFor="tradeIn_notas" className={labelCls} style={{ color: "var(--text-secondary)" }}>Observações do trade-in</label>
                  <input id="tradeIn_notas" type="text" value={tradeIn.notas}
                         onChange={(e) => setTradeIn((p) => ({ ...p, notas: e.target.value }))}
                         placeholder="Estado, km, etc." className={inputCls} style={inputStyle} />
                </div>
                {tradeIn.valor > 0 && (
                  <div className="col-span-2 px-3 py-2 rounded-xl text-xs font-medium"
                       style={{ background: "#10b98118", color: "#10b981", border: "1px solid #10b98130" }}>
                    ✓ Entrada total: {formatCurrency(financiamento.entrada)} + {formatCurrency(tradeIn.valor)} (trade-in) = <strong>{formatCurrency(entradaTotal)}</strong>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label htmlFor="notasFinanciamento" className={labelCls} style={{ color: "var(--text-secondary)" }}>Observações</label>
            <textarea id="notasFinanciamento" value={financiamento.notas}
                      onChange={(e) => setFinanciamento((p) => ({ ...p, notas: e.target.value }))}
                      rows={2} className={inputCls} style={inputStyle} />
          </div>

          <div className="flex justify-between">
            <button type="button" onClick={() => setStep(2)}
                    className="text-sm" style={{ color: "var(--text-muted)" }}>← Voltar</button>
            <button type="button" onClick={() => setStep(4)}
                    disabled={!financiamento.primeiroVencimento || (financiamento.modoManual ? resumo.valorParcela <= 0 : resumo.valorFinanciado <= 0)}
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all"
                    style={{ background: "var(--accent-gradient)" }}>
              Revisar →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Revisão ── */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="card p-5">
            <h2 className="font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Revisão do Contrato</h2>
            <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm">
              {[
                { label: "Cliente",        value: selectedCustomer?.name },
                { label: "Veículo",        value: `${selectedVehicle?.brand} ${selectedVehicle?.model} (${selectedVehicle?.year})` },
                { label: "Valor de Venda", value: formatCurrency(preco) },
                { label: "Entrada",        value: formatCurrency(entradaTotal) },
                { label: "Valor Financiado", value: formatCurrency(resumo.valorFinanciado) },
                { label: "Parcelas",       value: `${financiamento.parcelas}x ${formatCurrency(resumo.valorParcela)}` },
                { label: "Taxa de Juros",  value: financiamento.modoManual ? "Combinado manualmente (sem juros)" : `${financiamento.taxaMensal}% a.m.` },
                { label: "1º Vencimento",  value: financiamento.primeiroVencimento },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</p>
                  <p className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Alerta docs pendentes na revisão */}
            {!docsOk && docsOverride && (
              <div className="mt-4 flex items-start gap-2 p-3 rounded-xl text-xs"
                   style={{ background: "#f59e0b18", border: "1px solid #f59e0b40", color: "#f59e0b" }}>
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Atenção:</strong> venda liberada pelo admin com documentação incompleta.
                  Docs faltantes: {docsFaltando.join(", ")}. Ficará registrado no contrato.
                </span>
              </div>
            )}
          </div>

          {/* Cronograma */}
          <div className="card p-5">
            <h3 className="font-semibold text-sm mb-3" style={{ color: "var(--text-primary)" }}>
              Cronograma de Parcelas
            </h3>
            <div className="max-h-52 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    {["#","Vencimento","Valor"].map((h) => (
                      <th key={h} className={`py-2 text-left ${h === "Valor" ? "text-right" : ""} font-medium`}
                          style={{ color: "var(--text-muted)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cronograma.map((p) => (
                    <tr key={p.numero} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td className="py-1.5" style={{ color: "var(--text-muted)" }}>{p.numero}</td>
                      <td className="py-1.5" style={{ color: "var(--text-secondary)" }}>{p.vencimento}</td>
                      <td className="py-1.5 text-right font-medium" style={{ color: "var(--text-primary)" }}>
                        {formatCurrency(p.valor)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {error && (
            <p className="text-sm px-4 py-3 rounded-xl" style={{ background: "#ef444418", color: "#ef4444" }}>{error}</p>
          )}

          <div className="flex justify-between">
            <button type="button" onClick={() => setStep(3)}
                    className="text-sm" style={{ color: "var(--text-muted)" }}>← Voltar</button>
            <button type="button" onClick={handleSave} disabled={saving || (!docsOk && !docsOverride && user?.role !== "admin")}
                    className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all"
                    style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}>
              {saving ? "Salvando..." : "Confirmar Venda ✓"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
