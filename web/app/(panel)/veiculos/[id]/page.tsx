"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { getVehicle, updateVehicleStatus } from "@/lib/firestore/vehicles";
import { updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { uploadFotoVeiculoFn, excluirVeiculoFn } from "@/lib/functions";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/utils";
import type { Vehicle, VehicleStatus } from "@financer-auto/shared";
import {
  ArrowLeft, Car, Gauge, Calendar, Palette, Hash, Tag,
  Camera, X, ChevronLeft, ChevronRight, Upload, Trash2,
} from "lucide-react";

import { useToast } from "@/components/ui/Toast";
const MAX_PHOTOS = 5;

const statusLabel: Record<VehicleStatus, string> = {
  available: "Disponível",
  reserved:  "Reservado",
  sold:      "Vendido",
  warranty:  "Em Garantia",
};

const statusColor: Record<VehicleStatus, { bg: string; color: string }> = {
  available: { bg: "#10b98118", color: "#10b981" },
  reserved:  { bg: "#f59e0b18", color: "#f59e0b" },
  sold:      { bg: "#94a3b818", color: "#94a3b8" },
  warranty:  { bg: "#3b82f618", color: "#3b82f6" },
};

const typeLabel: Record<string, string> = {
  car:        "Carro",
  motorcycle: "Moto",
  truck:      "Caminhão",
  utility:    "Utilitário",
};

export default function VeiculoDetailPage() {
  const { toast } = useToast();
  const { id }  = useParams<{ id: string }>();
  const { user } = useAuth();
  const [vehicle, setVehicle]   = useState<Vehicle | null>(null);
  const [loading, setLoading]   = useState(true);
  const [updating, setUpdating] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const isStaff = user?.role === "admin" || user?.role === "seller";

  async function handleDelete() {
    if (!vehicle) return;
    setDeleting(true);
    try {
      await excluirVeiculoFn({ vehicleId: vehicle.id });
      toast("Veículo excluído.", "success");
      router.replace("/veiculos");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao excluir veículo.", "error");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  async function load() {
    if (!id) return;
    const v = await getVehicle(id);
    setVehicle(v);
    setLoading(false);
  }

  useEffect(() => {
    Promise.resolve().then(() => load());
  }, [id]);

  async function handleStatusChange(status: VehicleStatus) {
    if (!vehicle) return;
    setUpdating(true);
    await updateVehicleStatus(vehicle.id, status);
    await load();
    setUpdating(false);
  }

  async function handleAddPhotos(files: FileList | null) {
    if (!files || !vehicle || !id) return;
    const current = vehicle.photos ?? [];
    const remaining = MAX_PHOTOS - current.length;
    if (remaining <= 0) { toast(`Máximo de ${MAX_PHOTOS} fotos atingido.`, "info"); return; }

    setUploadingPhotos(true);
    const newUrls: string[] = [];
    const toAdd = Array.from(files).slice(0, remaining);

    for (const file of toAdd) {
      try {
        const base64 = await new Promise<string>((res, rej) => {
          const r = new FileReader();
          r.onload = () => res(r.result as string);
          r.onerror = rej;
          r.readAsDataURL(file);
        });
        const result = await uploadFotoVeiculoFn({ base64, fileName: file.name, vehicleId: id });
        newUrls.push(result.data.url);
      } catch (err) {
        console.error("Erro ao fazer upload:", err);
      }
    }

    if (newUrls.length > 0) {
      const updated = [...current, ...newUrls];
      await updateDoc(doc(db, "vehicles", id), { photos: updated });
      await load();
    }
    setUploadingPhotos(false);
  }

  async function handleRemovePhoto(idx: number) {
    if (!vehicle || !id) return;
    if (!confirm("Remover esta foto?")) return;
    const updated = (vehicle.photos ?? []).filter((_, i) => i !== idx);
    await updateDoc(doc(db, "vehicles", id), { photos: updated });
    if (photoIdx >= updated.length) setPhotoIdx(Math.max(0, updated.length - 1));
    await load();
  }

  async function handleSetMain(idx: number) {
    if (!vehicle || !id || idx === 0) return;
    const photos = [...(vehicle.photos ?? [])];
    const [main] = photos.splice(idx, 1);
    photos.unshift(main);
    await updateDoc(doc(db, "vehicles", id), { photos });
    setPhotoIdx(0);
    await load();
  }

  if (loading) {
    return (
      <div className="p-8 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-4"
             style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="p-8 text-center">
        <Car className="w-10 h-10 mx-auto mb-3 opacity-20" style={{ color: "var(--text-muted)" }} />
        <p style={{ color: "var(--text-secondary)" }}>Veículo não encontrado.</p>
        <Link href="/veiculos" className="text-sm mt-2 inline-block" style={{ color: "var(--accent)" }}>
          Voltar para a lista
        </Link>
      </div>
    );
  }

  const photos = vehicle.photos ?? [];
  const sc = statusColor[vehicle.status];

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/veiculos" style={{ color: "var(--text-muted)" }} className="hover:opacity-70 transition-opacity">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            {vehicle.brand} {vehicle.model}{" "}
            <span className="font-normal" style={{ color: "var(--text-muted)" }}>{vehicle.year}</span>
          </h1>
          <p className="text-xs mt-0.5 font-mono" style={{ color: "var(--text-muted)" }}>{vehicle.plate}</p>
        </div>
        <span className="ml-auto px-3 py-1 rounded-full text-xs font-medium"
              style={{ background: sc.bg, color: sc.color }}>
          {statusLabel[vehicle.status]}
        </span>
      </div>

      {/* ── Galeria de Fotos ─────────────────────────────────────── */}
      <div className="card p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Fotos
          </p>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {photos.length}/{MAX_PHOTOS}
          </span>
        </div>

        {/* Foto principal */}
        <div className="relative aspect-video rounded-xl overflow-hidden mb-3"
             style={{ background: "var(--bg-hover)" }}>
          {photos.length > 0 ? (
            <>
              <img src={photos[photoIdx]} alt={`${vehicle.brand} ${vehicle.model}`}
                   className="w-full h-full object-cover" />

              {/* Nav arrows */}
              {photos.length > 1 && (
                <>
                  <button onClick={() => setPhotoIdx((i) => (i - 1 + photos.length) % photos.length)}
                          className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full"
                          style={{ background: "rgba(0,0,0,.5)" }}>
                    <ChevronLeft className="w-4 h-4 text-white" />
                  </button>
                  <button onClick={() => setPhotoIdx((i) => (i + 1) % photos.length)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full"
                          style={{ background: "rgba(0,0,0,.5)" }}>
                    <ChevronRight className="w-4 h-4 text-white" />
                  </button>
                </>
              )}

              {/* Badge principal */}
              {photoIdx === 0 && (
                <div className="absolute top-3 left-3 px-2 py-1 rounded-lg text-xs font-bold text-white"
                     style={{ background: "var(--accent)" }}>
                  Principal
                </div>
              )}

              {/* Ações admin */}
              {isStaff && (
                <div className="absolute top-3 right-3 flex gap-1.5">
                  {photoIdx > 0 && (
                    <button onClick={() => handleSetMain(photoIdx)}
                            className="px-2 py-1 rounded-lg text-xs font-medium text-white"
                            style={{ background: "rgba(0,0,0,.6)" }}
                            title="Tornar principal">
                      ★ Principal
                    </button>
                  )}
                  <button onClick={() => handleRemovePhoto(photoIdx)}
                          className="p-1.5 rounded-lg text-white"
                          style={{ background: "rgba(239,68,68,.7)" }}
                          title="Remover foto">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2">
              <Car className="w-12 h-12 opacity-20" style={{ color: "var(--text-muted)" }} />
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                {isStaff ? "Nenhuma foto — adicione abaixo" : "Sem fotos disponíveis"}
              </p>
            </div>
          )}
        </div>

        {/* Thumbnails */}
        {photos.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {photos.map((url, i) => (
              <button key={i} onClick={() => setPhotoIdx(i)}
                      className="flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden transition-all"
                      style={{ border: `2px solid ${i === photoIdx ? "var(--accent)" : "transparent"}` }}>
                <img src={url} alt="" className="w-full h-full object-cover" />
              </button>
            ))}

            {/* Slot adicionar (staff) */}
            {isStaff && photos.length < MAX_PHOTOS && (
              <button onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingPhotos}
                      className="flex-shrink-0 w-16 h-16 rounded-xl flex flex-col items-center justify-center gap-1 transition-all"
                      style={{ border: "2px dashed var(--border)", background: "var(--bg-hover)" }}>
                {uploadingPhotos
                  ? <div className="animate-spin rounded-full h-4 w-4 border-2" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} />
                  : <>
                      <Camera className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Adicionar</span>
                    </>
                }
              </button>
            )}
          </div>
        )}

        {/* Upload inicial */}
        {isStaff && photos.length === 0 && (
          <button onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingPhotos}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium transition-all"
                  style={{ border: "2px dashed var(--border)", background: "var(--bg-hover)", color: "var(--text-secondary)" }}>
            {uploadingPhotos
              ? <><div className="animate-spin rounded-full h-4 w-4 border-2" style={{ borderColor: "var(--border)", borderTopColor: "var(--accent)" }} /> Enviando...</>
              : <><Upload className="w-4 h-4" /> Adicionar fotos</>
            }
          </button>
        )}

        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
               onChange={(e) => handleAddPhotos(e.target.files)} />
      </div>

      {/* ── Dados ─────────────────────────────────────────────────── */}
      <div className="card p-5 mb-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          {[
            { Icon: Tag,     label: "Tipo",         val: typeLabel[vehicle.type] ?? vehicle.type },
            { Icon: Palette, label: "Cor",          val: vehicle.color || "—" },
            { Icon: Gauge,   label: "Quilometragem",val: `${vehicle.mileage.toLocaleString("pt-BR")} km` },
            { Icon: Calendar,label: "Ano",          val: vehicle.year },
            { Icon: Hash,    label: "Chassi",       val: vehicle.chassis || "—" },
          ].map(({ Icon, label, val }) => (
            <div key={label} className="flex items-center gap-2.5 p-3 rounded-xl"
                 style={{ background: "var(--bg-hover)" }}>
              <Icon className="w-4 h-4 flex-shrink-0" style={{ color: "var(--accent)" }} />
              <div>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{label}</p>
                <p className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>{val}</p>
              </div>
            </div>
          ))}
        </div>

        {vehicle.features && (
          <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
            <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>Opcionais / Observações</p>
            <p className="text-sm" style={{ color: "var(--text-primary)" }}>{vehicle.features}</p>
          </div>
        )}
      </div>

      {/* ── Preços ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="card p-4">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Preço de Compra</p>
          <p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{formatCurrency(vehicle.purchasePrice)}</p>
        </div>
        <div className="card p-4" style={{ background: "#10b98110", borderColor: "#10b98140" }}>
          <p className="text-xs" style={{ color: "#10b981" }}>Preço de Venda</p>
          <p className="text-lg font-bold" style={{ color: "#10b981" }}>{formatCurrency(vehicle.price)}</p>
        </div>
      </div>

      {/* ── Alterar Status ─────────────────────────────────────────── */}
      {isStaff && (
        <div className="card p-5">
          <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Alterar Status</h2>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(statusLabel) as VehicleStatus[]).map((s) => {
              const c = statusColor[s];
              const active = vehicle.status === s;
              return (
                <button key={s} disabled={updating || active}
                        onClick={() => handleStatusChange(s)}
                        className="px-4 py-2 rounded-xl text-sm font-medium transition-all disabled:cursor-not-allowed"
                        style={active
                          ? { background: c.bg, color: c.color, border: `1px solid ${c.color}` }
                          : { background: "var(--bg-hover)", color: "var(--text-secondary)", border: "1px solid var(--border)", opacity: updating ? 0.5 : 1 }}>
                  {statusLabel[s]}
                </button>
              );
            })}
          </div>
          {vehicle.status === "sold" && (
            <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
              Este veículo está vendido — o status é definido automaticamente ao criar um contrato.
            </p>
          )}
        </div>
      )}

      {/* ── Zona de perigo: excluir veículo (somente admin) ────────── */}
      {user?.role === "admin" && (
        <div className="card p-5 mt-4" style={{ borderColor: "var(--danger)" }}>
          <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--danger)" }}>Excluir veículo</h2>
          <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
            Remove o veículo e todas as fotos do banco. Não é possível excluir veículos vinculados a contratos.
          </p>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)}
                    className="px-4 py-2 rounded-xl text-sm font-semibold"
                    style={{ background: "var(--danger-light)", color: "var(--danger)", border: "1px solid var(--danger)" }}>
              Excluir este veículo
            </button>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Tem certeza? Esta ação não pode ser desfeita.</p>
              <button onClick={handleDelete} disabled={deleting}
                      className="px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                      style={{ background: "var(--danger)" }}>
                {deleting ? "Excluindo..." : "Sim, excluir"}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="btn-secondary !py-2">Cancelar</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
