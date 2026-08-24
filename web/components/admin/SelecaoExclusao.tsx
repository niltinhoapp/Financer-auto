"use client";

import { useState } from "react";
import { Trash2, X, CheckSquare, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

/**
 * Hook + UI de seleção múltipla para exclusão em listas (somente admin).
 *
 * Uso:
 *   const sel = useSelecaoExclusao(async (id) => { await excluirFn({ id }); }, reload);
 *   - sel.selecting / sel.toggleSelecting()  → modo seleção
 *   - sel.isSelected(id) / sel.toggle(id)    → checkbox por item
 *   - <sel.Bar itemLabel="veículo(s)" />     → barra flutuante + modal de confirmação
 */
export function useSelecaoExclusao(
  deleteOne: (id: string) => Promise<void>,
  onAfter: () => void | Promise<void>
) {
  const { toast } = useToast();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [executando, setExecutando] = useState(false);

  function toggleSelecting() {
    setSelecting((v) => !v);
    setSelected(new Set());
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const isSelected = (id: string) => selected.has(id);

  async function executar() {
    setExecutando(true);
    let ok = 0;
    const falhas: string[] = [];
    for (const id of selected) {
      try {
        await deleteOne(id);
        ok++;
      } catch (e) {
        falhas.push(e instanceof Error ? e.message : "erro");
      }
    }
    setExecutando(false);
    setConfirming(false);
    setSelecting(false);
    setSelected(new Set());
    if (ok) toast(`${ok} registro(s) excluído(s).`, "success");
    if (falhas.length) toast(`${falhas.length} não puderam ser excluídos: ${falhas[0]}`, "error");
    await onAfter();
  }

  function Bar({ itemLabel }: { itemLabel: string }) {
    if (!selecting) return null;
    return (
      <>
        {/* Barra flutuante */}
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-5 py-3 rounded-2xl"
             style={{ background: "var(--bg-card)", border: "1px solid var(--border)", boxShadow: "var(--shadow-lg)" }}>
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {selected.size} selecionado{selected.size !== 1 ? "s" : ""}
          </span>
          <button onClick={() => setConfirming(true)} disabled={selected.size === 0}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
                  style={{ background: "var(--danger)" }}>
            <Trash2 className="w-4 h-4" /> Excluir
          </button>
          <button onClick={toggleSelecting}
                  className="p-2 rounded-xl" style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }}
                  aria-label="Cancelar seleção">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal de confirmação */}
        {confirming && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.6)" }}>
            <div className="card w-full max-w-sm p-6 space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                     style={{ background: "var(--danger-light)" }}>
                  <AlertTriangle className="w-5 h-5" style={{ color: "var(--danger)" }} />
                </div>
                <div>
                  <h3 className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>
                    Excluir {selected.size} {itemLabel}?
                  </h3>
                  <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                    Esta ação é permanente e remove também arquivos e imagens vinculados. Não pode ser desfeita.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setConfirming(false)} disabled={executando} className="btn-secondary flex-1">
                  Cancelar
                </button>
                <button onClick={executar} disabled={executando}
                        className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                        style={{ background: "var(--danger)" }}>
                  {executando ? `Excluindo...` : "Sim, excluir"}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  /** Botão para o cabeçalho da página que liga/desliga o modo seleção. */
  function ToggleButton() {
    return (
      <button onClick={toggleSelecting}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium"
              style={selecting
                ? { background: "var(--danger-light)", color: "var(--danger)", border: "1px solid var(--danger)" }
                : { background: "var(--bg-hover)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
        <CheckSquare className="w-4 h-4" />
        <span className="hidden sm:inline">{selecting ? "Cancelar" : "Selecionar"}</span>
      </button>
    );
  }

  return { selecting, toggleSelecting, toggle, isSelected, Bar, ToggleButton };
}

/** Checkbox padrão para usar nas linhas/cards da lista. */
export function CheckExclusao({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <input type="checkbox" checked={checked}
           onChange={onChange}
           onClick={(e) => e.stopPropagation()}
           className="w-5 h-5 rounded flex-shrink-0 accent-red-500 cursor-pointer" />
  );
}
