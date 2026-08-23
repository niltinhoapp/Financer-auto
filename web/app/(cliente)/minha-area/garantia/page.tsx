"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getDoc, doc } from "firebase/firestore";
import * as Sentry from "@sentry/nextjs";
import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { getWarrantyByContract } from "@/lib/firestore/warranties";
import { getRevisionsByContract } from "@/lib/firestore/revisions";
import { getWorkshop } from "@/lib/firestore/workshops";
import { formatDate } from "@/lib/utils";
import { useToast } from "@/components/ui/Toast";
import type { Contract, Warranty, Revision, Workshop } from "@financer-auto/shared";
import { ArrowLeft, ShieldCheck, Wrench, Phone, MapPin, AlertCircle, CheckCircle2, Calendar } from "lucide-react";

export default function GarantiaPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [contract, setContract] = useState<Contract | null>(null);
  const [warranty, setWarranty] = useState<Warranty | null>(null);
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [workshops, setWorkshops] = useState<Record<string, Workshop>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const userDoc = await getDoc(doc(db, "users", user!.uid));
        const customerId = userDoc.data()?.customerId;
        if (!customerId) return;

        const contracts = await import("@/lib/firestore/contracts").then(({ getContracts }) =>
          getContracts({ customerId })
        );
        const c = contracts.find((x) => x.status === "active" || x.status === "settled") ?? contracts[0];
        if (!c) return;
        setContract(c);

        const [war, revs] = await Promise.all([
          getWarrantyByContract(c.id),
          getRevisionsByContract(c.id),
        ]);
        setWarranty(war);
        setRevisions(revs);

        const ids = new Set<string>();
        if (war?.workshopIds) war.workshopIds.forEach((id) => ids.add(id));
        revs.forEach((r) => r.workshopId && ids.add(r.workshopId));
        const entries = await Promise.all(
          Array.from(ids).map(async (wid) => [wid, await getWorkshop(wid)] as const)
        );
        const map: Record<string, Workshop> = {};
        entries.forEach(([wid, w]) => { if (w) map[wid] = w; });
        setWorkshops(map);
      } catch (err) {
        console.error("Erro ao carregar garantia do cliente:", err);
        Sentry.captureException(err);
        toast("Não foi possível carregar as informações de garantia. Tente novamente.", "error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [user, toast]);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  const today = new Date().toISOString().split("T")[0];
  const isActive = warranty && warranty.endDate >= today;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/minha-area" aria-label="Voltar para Minha Área" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Garantia e Revisões</h1>
          <p className="text-xs text-gray-500">Acompanhe a garantia do seu veículo e o histórico de manutenções</p>
        </div>
      </div>

      {!contract ? (
        <div className="text-center py-16">
          <ShieldCheck className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <h2 className="text-lg font-semibold text-gray-700">Nenhum contrato encontrado</h2>
          <p className="text-sm text-gray-500 mt-1">Entre em contato com a revenda para mais informações.</p>
        </div>
      ) : (
        <>
          {/* Status da garantia */}
          {warranty ? (
            <div className={`rounded-2xl border p-6 ${isActive ? "bg-emerald-50 border-emerald-200" : "bg-gray-50 border-gray-200"}`}>
              <div className="flex items-start gap-3">
                {isActive ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-6 h-6 text-gray-400 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p className={`font-semibold ${isActive ? "text-emerald-800" : "text-gray-600"}`}>
                    Garantia {isActive ? "ativa" : "expirada"}
                  </p>
                  <div className="grid sm:grid-cols-2 gap-3 mt-3 text-sm">
                    <div className="flex items-center gap-2 text-gray-700">
                      <Calendar className="w-4 h-4 text-gray-400" />
                      Válida de {formatDate(warranty.startDate)} até {formatDate(warranty.endDate)}
                    </div>
                    {warranty.coverage && (
                      <div className="flex items-center gap-2 text-gray-700">
                        <ShieldCheck className="w-4 h-4 text-gray-400" />
                        Cobertura: {warranty.coverage}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {warranty.workshopIds?.length > 0 && (
                <div className="mt-5 pt-5 border-t border-emerald-100">
                  <p className="text-sm font-semibold text-gray-800 mb-3">Oficinas autorizadas para atendimento</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {warranty.workshopIds.map((wid) => {
                      const w = workshops[wid];
                      if (!w) return null;
                      return (
                        <div key={wid} className="bg-white rounded-xl border border-gray-200 p-4">
                          <p className="font-medium text-gray-900 flex items-center gap-2">
                            <Wrench className="w-4 h-4 text-blue-600" /> {w.name}
                          </p>
                          {w.phone && (
                            <p className="text-xs text-gray-500 mt-1.5 flex items-center gap-1.5">
                              <Phone className="w-3.5 h-3.5" /> {w.phone}
                            </p>
                          )}
                          {w.address && (
                            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                              <MapPin className="w-3.5 h-3.5" /> {w.address}
                            </p>
                          )}
                          {w.specialties?.length > 0 && (
                            <p className="text-xs text-gray-400 mt-1.5">{w.specialties.join(" · ")}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
              <ShieldCheck className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="font-semibold text-gray-700">Nenhuma garantia cadastrada</p>
              <p className="text-sm text-gray-500 mt-1">Entre em contato com a revenda para mais informações sobre a garantia do seu veículo.</p>
            </div>
          )}

          {/* Histórico de revisões */}
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800 text-sm flex items-center gap-2">
                <Wrench className="w-4 h-4 text-blue-600" /> Histórico de Revisões e Manutenções
              </h2>
            </div>
            {revisions.length === 0 ? (
              <p className="text-sm text-gray-400 px-5 py-8 text-center">Nenhuma revisão registrada até o momento.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {revisions.map((r) => (
                  <div key={r.id} className="px-5 py-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">{formatDate(r.date)}</p>
                      <span className="text-xs text-gray-500">{r.mileage?.toLocaleString("pt-BR")} km</span>
                    </div>
                    {r.workshopId && workshops[r.workshopId] && (
                      <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5" /> {workshops[r.workshopId].name}
                      </p>
                    )}
                    {r.services?.length > 0 && (
                      <p className="text-xs text-gray-600 mt-1.5"><span className="font-medium">Serviços:</span> {r.services.join(", ")}</p>
                    )}
                    {r.parts?.length > 0 && (
                      <p className="text-xs text-gray-600 mt-0.5"><span className="font-medium">Peças trocadas:</span> {r.parts.join(", ")}</p>
                    )}
                    {r.notes && <p className="text-xs text-gray-500 mt-1.5">{r.notes}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
