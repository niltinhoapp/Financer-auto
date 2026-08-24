"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import * as Sentry from "@sentry/nextjs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import { createVehicle } from "@/lib/firestore/vehicles";
import { updateDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { uploadFotoVeiculoFn } from "@/lib/functions";
import { ArrowLeft, Camera, X, Upload, Image as ImageIcon } from "lucide-react";
import Link from "next/link";

const MAX_PHOTOS = 5;
const CURRENT_YEAR = new Date().getFullYear();

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
const errorInputStyle = { ...inputStyle, borderColor: "#ef4444" };

// Mesmas exigências que já existiam no HTML nativo (required/min/max), agora
// com mensagens visíveis em vez de só o balão de validação do navegador.
const veiculoSchema = z.object({
  type: z.enum(["car", "motorcycle", "truck", "utility"]),
  plate: z.string().min(1, "Informe a placa."),
  brand: z.string().min(1, "Informe a marca."),
  model: z.string().min(1, "Informe o modelo."),
  year: z.number().min(1950, "Ano inválido.").max(CURRENT_YEAR + 1, "Ano inválido."),
  color: z.string(),
  mileage: z.number().min(0, "Quilometragem não pode ser negativa."),
  chassis: z.string(),
  purchasePrice: z.number().min(0, "Preço de compra inválido."),
  price: z.number().min(0, "Informe o preço de venda."),
  features: z.string(),
});

type VeiculoFormValues = z.infer<typeof veiculoSchema>;

export default function NovoVeiculoPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [dragOver, setDragOver] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<VeiculoFormValues>({
    resolver: zodResolver(veiculoSchema),
    defaultValues: {
      type: "car",
      brand: "",
      model: "",
      year: CURRENT_YEAR,
      color: "",
      plate: "",
      chassis: "",
      mileage: 0,
      price: 0,
      purchasePrice: 0,
      features: "",
    },
  });

  const brand = watch("brand");
  const model = watch("model");

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
      } catch (e) {
        console.error("Erro ao enviar foto do veículo:", e);
        Sentry.captureException(e);
        setPhotos((prev) => prev.map((x, j) => j === i ? { ...x, uploading: false, error: true } : x));
      }
    }
    return urls;
  }

  async function onSubmit(data: VeiculoFormValues) {
    if (!user) return;
    setSaving(true);
    setError("");
    try {
      // 1. Cria o veículo com photos vazio
      const id = await createVehicle({
        ...data,
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
    } catch (e) {
      console.error("Erro ao salvar veículo:", e);
      Sentry.captureException(e);
      setError("Erro ao salvar veículo. Tente novamente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/veiculos" aria-label="Voltar para Veículos" style={{ color: "var(--text-muted)" }} className="hover:opacity-70 transition-opacity">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>Novo Veículo</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

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
                  <img src={p.preview} alt={brand && model ? `${brand} ${model}` : `Foto ${i + 1} do veículo`} className="w-full h-full object-cover" />

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
                            aria-label="Remover foto"
                            className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ background: "rgba(0,0,0,.6)" }}>
                      <X className="w-3 h-3 text-white" />
                    </button>
                  )}

                  {/* Mover para principal */}
                  {i > 0 && !p.uploading && (
                    <button type="button" onClick={() => movePhoto(i, 0)}
                            aria-label="Marcar como foto principal"
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
              <label htmlFor="type" className={labelCls} style={{ color: "var(--text-secondary)" }}>Tipo</label>
              <select id="type" {...register("type")}
                      className={inputCls} style={inputStyle}>
                <option value="car">Carro</option>
                <option value="motorcycle">Moto</option>
                <option value="truck">Caminhão</option>
                <option value="utility">Utilitário</option>
              </select>
            </div>
            <div>
              <label htmlFor="plate" className={labelCls} style={{ color: "var(--text-secondary)" }}>Placa</label>
              <input id="plate" type="text" {...register("plate")}
                     value={watch("plate")}
                     onChange={(e) => setValue("plate", e.target.value.toUpperCase(), { shouldValidate: true })}
                     maxLength={8} placeholder="ABC-1234"
                     className={`${inputCls} font-mono`} style={errors.plate ? errorInputStyle : inputStyle} />
              {errors.plate && <p className="text-xs mt-1" style={{ color: "#ef4444" }}>{errors.plate.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="brand" className={labelCls} style={{ color: "var(--text-secondary)" }}>Marca</label>
              <input id="brand" type="text" {...register("brand")}
                     placeholder="Toyota, Honda..." className={inputCls} style={errors.brand ? errorInputStyle : inputStyle} />
              {errors.brand && <p className="text-xs mt-1" style={{ color: "#ef4444" }}>{errors.brand.message}</p>}
            </div>
            <div>
              <label htmlFor="model" className={labelCls} style={{ color: "var(--text-secondary)" }}>Modelo</label>
              <input id="model" type="text" {...register("model")}
                     placeholder="Corolla, Civic..." className={inputCls} style={errors.model ? errorInputStyle : inputStyle} />
              {errors.model && <p className="text-xs mt-1" style={{ color: "#ef4444" }}>{errors.model.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="year" className={labelCls} style={{ color: "var(--text-secondary)" }}>Ano</label>
              <input id="year" type="number" {...register("year")}
                     value={watch("year")}
                     onChange={(e) => setValue("year", Number(e.target.value), { shouldValidate: true })}
                     min={1950} max={CURRENT_YEAR + 1}
                     className={inputCls} style={errors.year ? errorInputStyle : inputStyle} />
              {errors.year && <p className="text-xs mt-1" style={{ color: "#ef4444" }}>{errors.year.message}</p>}
            </div>
            <div>
              <label htmlFor="color" className={labelCls} style={{ color: "var(--text-secondary)" }}>Cor</label>
              <input id="color" type="text" {...register("color")}
                     placeholder="Prata, Preto..." className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label htmlFor="mileage" className={labelCls} style={{ color: "var(--text-secondary)" }}>Quilometragem</label>
              <input id="mileage" type="number" {...register("mileage")}
                     value={watch("mileage") || ""}
                     onChange={(e) => setValue("mileage", Number(e.target.value), { shouldValidate: true })}
                     min={0} placeholder="0" className={inputCls} style={inputStyle} />
            </div>
          </div>

          <div>
            <label htmlFor="chassis" className={labelCls} style={{ color: "var(--text-secondary)" }}>Chassi</label>
            <input id="chassis" type="text" {...register("chassis")}
                   value={watch("chassis")}
                   onChange={(e) => setValue("chassis", e.target.value.toUpperCase())}
                   placeholder="17 caracteres" className={`${inputCls} font-mono`} style={inputStyle} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="purchasePrice" className={labelCls} style={{ color: "var(--text-secondary)" }}>Preço de Compra (R$)</label>
              <input id="purchasePrice" type="number" {...register("purchasePrice")}
                     value={watch("purchasePrice") || ""}
                     onChange={(e) => setValue("purchasePrice", Number(e.target.value), { shouldValidate: true })}
                     min={0} step={0.01} placeholder="0,00" className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label htmlFor="price" className={labelCls} style={{ color: "var(--text-secondary)" }}>Preço de Venda (R$) <span style={{ color: "#ef4444" }}>*</span></label>
              <input id="price" type="number" {...register("price")}
                     value={watch("price") || ""}
                     onChange={(e) => setValue("price", Number(e.target.value), { shouldValidate: true })}
                     min={0} step={0.01} placeholder="0,00" className={inputCls} style={errors.price ? errorInputStyle : inputStyle} />
              {errors.price && <p className="text-xs mt-1" style={{ color: "#ef4444" }}>{errors.price.message}</p>}
            </div>
          </div>

          <div>
            <label htmlFor="features" className={labelCls} style={{ color: "var(--text-secondary)" }}>Opcionais / Observações</label>
            <textarea id="features" {...register("features")}
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
