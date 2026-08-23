"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { createVehicle } from "@/lib/firestore/vehicles";
import { updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { uploadFotoVeiculoFn } from "@/lib/functions";
import type { VehicleType } from "@financer-auto/shared";
import { ArrowLeft, Camera, X, Upload, Image as ImageIcon, GripVertical } from "lucide-react";
import Link from "next/link";

const MAX_PHOTOS = 5;

interface PhotoItem {
  file: File;
  preview: string;
  uploading?: boolean;
  url?: string;
  error?: boolean;
}

const labelCls = "block text-xs font-medium mb-1";
const inputCls = "w-full px-3 py-2.5 rounded-xl text-sm";
const inputStyle = { background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" };

export default function NovoVeiculoPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const [form, setForm] = useState({
    type: "car" as VehicleType,
    brand: "",
    model: "",
    year: new Date().getFullYear(),
    color: "",
    plate: "",
    chassis: "",
    mileage: 0,
    price: 0,
    purchasePrice: 0,
    features: "",
  });

  function set(key: string, value: unknown) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const remaining = MAX_PHOTOS - photos.length;
    const toAdd = Array.from(files).slice(0, remaining);
    const newItems: PhotoItem[] = toAdd.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));
    setPhotos((prev) => [...prev, ...newItems]);
  }

  function removePhoto(idx: number) {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  }

  function movePhoto(from: number, to: number) {
    setPhotos((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  async function uploadPhotos(vehicleId: string): Promise<string[]> {
    const urls: string[] = [];
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      setPhotos((prev) => prev.map((x, j) => j === i ? { ...x, uploading: true } : x));
      try {
        const base64 = await new Promise<string>((res, rej) => {
          const reader = new FileReader();
          reader.onload = () => res(reader.result as string);
          reader.onerror = rej;
          reader.readAsDataURL(p.file);
        });
        const result = await uploadFotoVeiculoFn({ base64, fileName: p.file.name, vehicleId });
        urls.push(result.data.url);
        setPhotos((prev) => prev.map((x, j) => j === i ? { ...x, uploading: false, url: result.data.url } : x));
      } catch {
        setPhotos((prev) => prev.map((x, j) => j === i ? { ...x, uploading: false, error: true } : x));
      }
    }
    return urls;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError("");
    try {
      // 1. Cria o veículo com photos vazio
      const id = await createVehicle({
        ...form,
        status: "available",
        photos: [],
        createdBy: user.uid,
      });

      // 2. Faz upload das fotos (se houver)
      if (photos.length > 0) {
        const urls = await uploadPhotos(id);
        if (urls.length > 0) {
          await updateDoc(doc(db, "vehicles", id), { photos: urls });
        }
      }

      router.push(`/veiculos/${id}`);
    } catch {
      setError("Erro ao salvar veículo. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/veiculos" style={{ color: "var(--text-muted)" }} className="hover:opacity-70 transition-opacity">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Novo Veículo</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Fotos */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                Fotos do Veículo
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Até {MAX_PHOTOS} fotos · A primeira será a foto principal
              </p>
            </div>
            <span className="text-xs font-bold" style={{ color: photos.length >= MAX_PHOTOS ? "#ef4444" : "var(--accent)" }}>
              {photos.length}/{MAX_PHOTOS}
            </span>
          </div>

          {/* Grid de fotos */}
          {photos.length > 0 && (
            <div className="grid grid-cols-5 gap-2 mb-3">
              {photos.map((p, i) => (
                <div key={i} className="relative aspect-square rounded-xl overflow-hidden group"
                     style={{ border: i === 0 ? "2px solid var(--accent)" : "2px solid var(--border)" }}>
                  <img src={p.preview} alt="" className="w-full h-full object-cover" />

                  {/* Badge principal */}
                  {i === 0 && (
                    <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-white text-[10px] font-bold"
                         style={{ background: "var(--accent)" }}>Principal</div>
                  )}

                  {/* Loading overlay */}
                  {p.uploading && (
                    <div className="absolute inset-0 flex items-center justify-center"
                         style={{ background: "rgba(0,0,0,.5)" }}>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                    </div>
                  )}

                  {/* Error overlay */}
                  {p.error && (
                    <div className="absolute inset-0 flex items-center justify-center"
                         style={{ background: "rgba(239,68,68,.6)" }}>
                      <X className="w-5 h-5 text-white" />
                    </div>
                  )}

                  {/* Remover */}
                  {!p.uploading && (
                    <button type="button" onClick={() => removePhoto(i)}
                            className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ background: "rgba(0,0,0,.6)" }}>
                      <X className="w-3 h-3 text-white" />
                    </button>
                  )}

                  {/* Mover para principal */}
                  {i > 0 && !p.uploading && (
                    <button type="button" onClick={() => movePhoto(i, 0)}
                            className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ background: "rgba(0,0,0,.6)" }}>
                      ★
                    </button>
                  )}
                </div>
              ))}

              {/* Slot de adicionar */}
              {photos.length < MAX_PHOTOS && (
                <button type="button" onClick={() => fileInputRef.current?.click()}
                        className="aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-all"
                        style={{ border: "2px dashed var(--border)", background: "var(--bg-hover)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
                        onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}>
                  <Camera className="w-4 h-4" style={{ color: "var(--text-muted)" }} />
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>Adicionar</span>
                </button>
              )}
            </div>
          )}

          {/* Drop zone (quando não há fotos) */}
          {photos.length === 0 && (
            <div
              className="rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-all"
              style={{
                border: `2px dashed ${dragOver ? "var(--accent)" : "var(--border)"}`,
                background: dragOver ? "var(--accent-light)" : "var(--bg-hover)",
              }}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                   style={{ background: "var(--accent-light)" }}>
                <ImageIcon className="w-6 h-6" style={{ color: "var(--accent)" }} />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  Arraste as fotos ou clique para selecionar
                </p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                  JPG, PNG, WEBP · Até {MAX_PHOTOS} fotos · Máx. 10MB cada
                </p>
              </div>
            </div>
          )}

          {/* Botão adicionar mais */}
          {photos.length > 0 && photos.length < MAX_PHOTOS && (
            <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm transition-all mt-1"
                    style={{ background: "var(--bg-hover)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
              <Upload className="w-4 h-4" />
              Adicionar mais fotos ({photos.length}/{MAX_PHOTOS})
            </button>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
        </div>

        {/* Dados do veículo */}
        <div className="card p-5 space-y-4">
          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Dados do Veículo</p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Tipo</label>
              <select value={form.type} onChange={(e) => set("type", e.target.value)}
                      className={inputCls} style={inputStyle}>
                <option value="car">Carro</option>
                <option value="motorcycle">Moto</option>
                <option value="truck">Caminhão</option>
                <option value="utility">Utilitário</option>
              </select>
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Placa</label>
              <input type="text" value={form.plate} onChange={(e) => set("plate", e.target.value.toUpperCase())}
                     required maxLength={8} placeholder="ABC-1234"
                     className={`${inputCls} font-mono`} style={inputStyle} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Marca</label>
              <input type="text" value={form.brand} onChange={(e) => set("brand", e.target.value)}
                     required placeholder="Toyota, Honda..." className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Modelo</label>
              <input type="text" value={form.model} onChange={(e) => set("model", e.target.value)}
                     required placeholder="Corolla, Civic..." className={inputCls} style={inputStyle} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Ano</label>
              <input type="number" value={form.year} onChange={(e) => set("year", Number(e.target.value))}
                     required min={1950} max={new Date().getFullYear() + 1}
                     className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Cor</label>
              <input type="text" value={form.color} onChange={(e) => set("color", e.target.value)}
                     placeholder="Prata, Preto..." className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Quilometragem</label>
              <input type="number" value={form.mileage || ""} onChange={(e) => set("mileage", Number(e.target.value))}
                     min={0} placeholder="0" className={inputCls} style={inputStyle} />
            </div>
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Chassi</label>
            <input type="text" value={form.chassis} onChange={(e) => set("chassis", e.target.value.toUpperCase())}
                   placeholder="17 caracteres" className={`${inputCls} font-mono`} style={inputStyle} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Preço de Compra (R$)</label>
              <input type="number" value={form.purchasePrice || ""} onChange={(e) => set("purchasePrice", Number(e.target.value))}
                     min={0} step={0.01} placeholder="0,00" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Preço de Venda (R$) <span style={{ color: "#ef4444" }}>*</span></label>
              <input type="number" value={form.price || ""} onChange={(e) => set("price", Number(e.target.value))}
                     required min={0} step={0.01} placeholder="0,00" className={inputCls} style={inputStyle} />
            </div>
          </div>

          <div>
            <label className={labelCls} style={{ color: "var(--text-secondary)" }}>Opcionais / Observações</label>
            <textarea value={form.features} onChange={(e) => set("features", e.target.value)}
                      rows={3} placeholder="Ar condicionado, direção hidráulica, rodas de liga..."
                      className={inputCls} style={inputStyle} />
          </div>
        </div>

        {error && (
          <p className="text-sm px-4 py-3 rounded-xl" style={{ background: "#ef444418", color: "#ef4444" }}>{error}</p>
        )}

        <div className="flex justify-end gap-3">
          <Link href="/veiculos"
                className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all"
                style={{ border: "1px solid var(--border)", color: "var(--text-secondary)", background: "var(--bg-hover)" }}>
            Cancelar
          </Link>
          <button type="submit" disabled={saving}
                  className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all"
                  style={{ background: "var(--accent-gradient)" }}>
            {saving
              ? photos.some((p) => p.uploading)
                ? `Enviando fotos...`
                : "Salvando..."
              : "Salvar Veículo"}
          </button>
        </div>
      </form>
    </div>
  );
}
