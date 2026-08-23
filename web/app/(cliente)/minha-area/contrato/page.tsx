"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, query, where, getDocs, orderBy, getDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { getCustomer } from "@/lib/firestore/customers";
import { getVehicle } from "@/lib/firestore/vehicles";
import { getUser } from "@/lib/firestore/users";
import { gerarTextoContrato } from "@/lib/contractTemplate";
import { assinarContratoFn } from "@/lib/functions";
import { formatCPF, formatDate } from "@/lib/utils";
import { validarCPF } from "@/lib/validations";
import type { Contract, Customer, Vehicle } from "@financer-auto/shared";
import { ArrowLeft, FileSignature, ShieldCheck, AlertCircle, CheckCircle2 } from "lucide-react";

export default function ContratoLeituraAssinaturaPage() {
  const { user } = useAuth();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const [sellerName, setSellerName] = useState("");
  const [loading, setLoading] = useState(true);

  const [agreed, setAgreed] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [typedCpf, setTypedCpf] = useState("");
  const [signing, setSigning] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [debugInfo, setDebugInfo] = useState("");

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const userDoc = await getDoc(doc(db, "users", user!.uid));
        const userData = userDoc.data();
        const customerId = userData?.customerId;

        if (!customerId) {
          setDebugInfo(`uid=${user!.uid} SEM_customerId userData=${JSON.stringify(userData ?? {})}`);
          return;
        }

        const cust = await getCustomer(customerId);
        setCustomer(cust);

        if (!cust) {
          setDebugInfo(`customerId=${customerId} getCustomer=null`);
          return;
        }

        const q = query(
          collection(db, "contracts"),
          where("customerId", "==", customerId),
          where("status", "in", ["active", "settled"]),
          orderBy("createdAt", "desc")
        );
        const snap = await getDocs(q);
        setDebugInfo(`uid=${user!.uid} customerId=${customerId} contratos=${snap.size}`);
        if (!snap.empty) {
          const c = { id: snap.docs[0].id, ...snap.docs[0].data() } as Contract;
          setContract(c);
          // Carrega veículo e vendedor em paralelo — falhas não bloqueiam o contrato
          const [veh, seller] = await Promise.allSettled([
            getVehicle(c.vehicleId),
            getUser(c.sellerId),
          ]);
          if (veh.status === "fulfilled") setVehicle(veh.value);
          setSellerName(
            seller.status === "fulfilled" ? (seller.value?.name ?? "Vendedor(a) responsável") : "Vendedor(a) responsável"
          );
        }
      } catch (err) {
        console.error("Erro ao carregar contrato do cliente:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user]);

  async function handleSign(e: React.FormEvent) {
    e.preventDefault();
    if (!contract || !customer) return;
    setError("");

    if (!agreed) {
      setError("Você precisa marcar que leu e concorda com os termos do contrato.");
      return;
    }
    if (typedName.trim().toLowerCase() !== customer.name.trim().toLowerCase()) {
      setError("O nome digitado não corresponde ao nome cadastrado. Digite seu nome completo exatamente como no cadastro.");
      return;
    }
    const cpfDigits = typedCpf.replace(/\D/g, "");
    if (!validarCPF(cpfDigits)) {
      setError("CPF inválido. Confira os números digitados.");
      return;
    }
    if (cpfDigits !== customer.cpf.replace(/\D/g, "")) {
      setError("O CPF informado não corresponde ao seu cadastro.");
      return;
    }

    setSigning(true);
    try {
      await assinarContratoFn({ contractId: contract.id, signerName: typedName.trim(), signerCpf: cpfDigits });
      setSuccess(true);
      setContract({
        ...contract,
        signature: {
          signerUid: user!.uid,
          signerName: typedName.trim(),
          signerCpf: cpfDigits,
          signedAt: new Date().toISOString(),
        },
      });
    } catch (err: unknown) {
      const message =
        (err as { details?: string; message?: string })?.details ??
        (err as Error)?.message ??
        "Erro ao assinar o contrato. Tente novamente.";
      setError(message);
    } finally {
      setSigning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!contract || !customer) {
    return (
      <div className="text-center py-20">
        <FileSignature className="w-12 h-12 mx-auto mb-4 text-gray-300" />
        <h2 className="text-lg font-semibold text-gray-700">Nenhum contrato encontrado</h2>
        <p className="text-sm text-gray-500 mt-1">Entre em contato com a revenda para mais informações.</p>
        {debugInfo && (
          <p className="mt-6 text-xs font-mono bg-gray-100 text-gray-500 rounded-lg px-4 py-3 text-left break-all max-w-lg mx-auto">
            {debugInfo}
          </p>
        )}
      </div>
    );
  }

  const texto = gerarTextoContrato({ contract, customer, vehicle, sellerName });
  const jaAssinado = !!contract.signature;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/minha-area" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Contrato de Compra e Venda</h1>
          <p className="text-xs text-gray-500">Leia atentamente todas as cláusulas antes de assinar</p>
        </div>
      </div>

      {/* Status da assinatura */}
      {jaAssinado ? (
        <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-emerald-800">Contrato assinado digitalmente</p>
            <p className="text-emerald-700 mt-0.5">
              Assinado por <strong>{contract.signature!.signerName}</strong> (CPF {formatCPF(contract.signature!.signerCpf)})
              {" "}em {new Date(contract.signature!.signedAt).toLocaleString("pt-BR")}.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-amber-800">Assinatura pendente</p>
            <p className="text-amber-700 mt-0.5">
              Leia o contrato completo abaixo. Os dados do veículo, do contrato e os seus dados cadastrais já foram
              preenchidos automaticamente — falta apenas confirmar a leitura e assinar digitalmente ao final.
            </p>
          </div>
        </div>
      )}

      {/* Texto do contrato */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 leading-relaxed max-h-[32rem] overflow-y-auto pr-2">
          {texto}
        </pre>
      </div>

      {/* Bloco de assinatura */}
      {jaAssinado ? null : success ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
          <p className="font-semibold text-emerald-800">Contrato assinado com sucesso!</p>
          <p className="text-sm text-emerald-700 mt-1">Você já pode acompanhar suas parcelas em &quot;Minha Área&quot;.</p>
          <Link href="/minha-area" className="inline-block mt-4 text-sm font-medium text-blue-600 hover:underline">
            Voltar para Minha Área
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSign} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
          <div className="flex items-center gap-2 text-gray-800 font-semibold">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
            Assinatura Digital
          </div>
          <p className="text-xs text-gray-500 -mt-2">
            Para assinar, confirme que leu o contrato e digite seu nome completo e CPF exatamente como constam no seu cadastro.
            Isso terá a mesma validade jurídica de uma assinatura manuscrita (assinatura eletrônica simples, MP nº 2.200-2/2001).
          </p>

          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5"
            />
            Li e concordo integralmente com todas as cláusulas e condições deste contrato.
          </label>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo</label>
              <input
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder={customer.name}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CPF</label>
              <input
                value={typedCpf}
                onChange={(e) => setTypedCpf(e.target.value)}
                placeholder={formatCPF(customer.cpf)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>
          )}

          <button
            type="submit"
            disabled={signing}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            <FileSignature className="w-4 h-4" />
            {signing ? "Assinando..." : "Assinar Digitalmente"}
          </button>
        </form>
      )}

      <p className="text-xs text-gray-400 text-center">
        Contrato gerado em {formatDate(contract.createdAt.split("T")[0])} • ID {contract.id}
      </p>
    </div>
  );
}
