"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { HelpCircle, X, Search, ChevronLeft, Lightbulb, MessageCircle } from "lucide-react";
import { buscarAjuda, sugestoesPorRota, type PapelAjuda, type TopicoAjuda } from "@/lib/ajuda";

interface Props {
  papel: PapelAjuda;
  /** lado do botão flutuante (evita conflito com o WhatsApp da loja) */
  lado?: "left" | "right";
  /** link de contato humano (wa.me) mostrado quando a busca não resolve */
  contatoWhatsApp?: string;
}

/**
 * Central de Ajuda: botão flutuante "?" que abre um painel com busca
 * sobre a base de conhecimento do sistema, guias passo a passo por
 * perfil e sugestões conforme a tela aberta.
 */
export function HelpWidget({ papel, lado = "right", contatoWhatsApp }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [topico, setTopico] = useState<TopicoAjuda | null>(null);
  const [verTodos, setVerTodos] = useState(false);

  const sugestoes = useMemo(() => sugestoesPorRota(pathname ?? "", papel), [pathname, papel]);
  const resultados = useMemo(() => buscarAjuda(busca, papel), [busca, papel]);
  const buscando = busca.trim().length >= 3;
  const lista = buscando
    ? resultados
    : verTodos
    ? buscarAjuda("", papel)
    : (sugestoes.length ? sugestoes : buscarAjuda("", papel).slice(0, 8));

  function fechar() {
    setOpen(false);
    setBusca("");
    setTopico(null);
    setVerTodos(false);
  }

  return (
    <>
      {/* Botão flutuante */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Ajuda"
        className="fixed bottom-5 z-40 w-12 h-12 rounded-full flex items-center justify-center transition-transform hover:scale-105 active:scale-95"
        style={{
          [lado]: "1.25rem",
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-lg)",
          color: "var(--accent)",
        } as React.CSSProperties}
      >
        <HelpCircle className="w-6 h-6" />
      </button>

      {/* Painel */}
      {open && (
        <div className="fixed inset-0 z-[80]">
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,.45)" }} onClick={fechar} />

          {/* mobile: bottom sheet · desktop: painel lateral direito */}
          <div className="absolute bottom-0 inset-x-0 sm:inset-x-auto sm:right-0 sm:top-0 sm:bottom-0 sm:w-[420px]
                          rounded-t-3xl sm:rounded-none flex flex-col max-h-[85vh] sm:max-h-none"
               style={{ background: "var(--bg-card)", borderLeft: "1px solid var(--border)" }}>

            {/* Cabeçalho */}
            <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
              {topico ? (
                <button onClick={() => setTopico(null)} className="p-1.5 rounded-lg"
                        style={{ background: "var(--bg-hover)", color: "var(--text-secondary)" }} aria-label="Voltar">
                  <ChevronLeft className="w-4 h-4" />
                </button>
              ) : (
                <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                     style={{ background: "var(--accent-gradient)" }}>
                  <HelpCircle className="w-4 h-4 text-white" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate" style={{ color: "var(--text-primary)" }}>
                  {topico ? topico.titulo : "Central de Ajuda"}
                </p>
                {!topico && (
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    Digite o que você precisa fazer
                  </p>
                )}
              </div>
              <button onClick={fechar} className="p-1.5 rounded-lg"
                      style={{ background: "var(--bg-hover)", color: "var(--text-muted)" }} aria-label="Fechar">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Conteúdo */}
            <div className="flex-1 overflow-y-auto p-5">
              {topico ? (
                /* ── Artigo: passos ── */
                <div className="space-y-4">
                  <ol className="space-y-3">
                    {topico.passos.map((p, i) => (
                      <li key={i} className="flex gap-3">
                        <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                              style={{ background: "var(--accent-light)", color: "var(--accent)" }}>
                          {i + 1}
                        </span>
                        <p className="text-sm" style={{ color: "var(--text-primary)" }}>{p}</p>
                      </li>
                    ))}
                  </ol>
                  {topico.dica && (
                    <div className="flex gap-2.5 p-3 rounded-xl"
                         style={{ background: "var(--warning-light)" }}>
                      <Lightbulb className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: "var(--warning)" }} />
                      <p className="text-xs" style={{ color: "var(--text-primary)" }}>{topico.dica}</p>
                    </div>
                  )}
                </div>
              ) : (
                /* ── Busca + lista ── */
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} />
                    <input
                      value={busca}
                      onChange={(e) => setBusca(e.target.value)}
                      autoFocus
                      placeholder='Ex: "como cobrar parcela atrasada"'
                      className="input-base !pl-10"
                    />
                  </div>

                  {!buscando && sugestoes.length > 0 && (
                    <p className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>
                      Sugestões para esta tela:
                    </p>
                  )}

                  {lista.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        Nada encontrado para &quot;{busca}&quot;
                      </p>
                      <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                        Tente outras palavras (ex: &quot;pagar&quot;, &quot;senha&quot;, &quot;excluir&quot;).
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {lista.map((t) => (
                        <button key={t.id} onClick={() => setTopico(t)}
                                className="w-full text-left p-3.5 rounded-xl transition-colors card-hover"
                                style={{ background: "var(--bg-hover)", border: "1px solid var(--border)" }}>
                          <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{t.titulo}</p>
                          <p className="text-xs mt-0.5 line-clamp-1" style={{ color: "var(--text-muted)" }}>{t.passos[0]}</p>
                        </button>
                      ))}
                    </div>
                  )}

                  {!buscando && !verTodos && (
                    <button onClick={() => setVerTodos(true)}
                            className="text-xs font-medium" style={{ color: "var(--accent)" }}>
                      Ver todos os tópicos →
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Rodapé: contato humano */}
            {contatoWhatsApp && (
              <div className="px-5 py-3" style={{ borderTop: "1px solid var(--border)" }}>
                <a href={contatoWhatsApp} target="_blank" rel="noopener noreferrer"
                   className="flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white"
                   style={{ background: "#25D366" }}>
                  <MessageCircle className="w-4 h-4" />
                  Não resolveu? Falar com a gente
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
