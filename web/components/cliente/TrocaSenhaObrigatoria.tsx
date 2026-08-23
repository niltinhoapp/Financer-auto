"use client";

import { useState } from "react";
import { updatePassword, AuthError } from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Lock, Eye, EyeOff, ShieldCheck } from "lucide-react";

interface Props {
  uid: string;
  /** Chamado após a troca bem-sucedida */
  onDone: () => void;
}

/**
 * Tela bloqueante de troca de senha no primeiro acesso.
 * Não há como fechar sem definir uma nova senha.
 */
export function TrocaSenhaObrigatoria({ uid, onDone }: Props) {
  const [senha, setSenha] = useState("");
  const [confirma, setConfirma] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const forte = senha.length >= 6;
  const igual = senha === confirma && confirma.length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!forte) { setError("A nova senha deve ter pelo menos 6 caracteres."); return; }
    if (senha !== confirma) { setError("As senhas não conferem."); return; }
    if (!auth.currentUser) { setError("Sessão expirada. Entre novamente."); return; }

    setSaving(true);
    setError("");
    try {
      await updatePassword(auth.currentUser, senha);
      await updateDoc(doc(db, "users", uid), {
        mustChangePassword: false,
        updatedAt: new Date().toISOString(),
      });
      onDone();
    } catch (err) {
      const code = (err as AuthError)?.code;
      if (code === "auth/requires-recent-login") {
        setError("Por segurança, saia e entre novamente com a senha temporária antes de trocar.");
      } else if (code === "auth/weak-password") {
        setError("Senha fraca — use pelo menos 6 caracteres.");
      } else {
        setError("Erro ao trocar a senha. Tente novamente.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4"
         style={{ background: "var(--bg-primary)" }}>
      <div className="card w-full max-w-md p-7">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
               style={{ background: "var(--accent-gradient)" }}>
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
            Crie sua senha pessoal
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Por segurança, você precisa trocar a senha temporária antes de continuar.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              Nova senha
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} />
              <input type={show ? "text" : "password"} value={senha}
                     onChange={(e) => setSenha(e.target.value)}
                     placeholder="Mínimo 6 caracteres" minLength={6} required autoFocus
                     className="input-base !pl-10 !pr-10" />
              <button type="button" onClick={() => setShow((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: "var(--text-muted)" }}>
                {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
              Confirmar nova senha
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} />
              <input type={show ? "text" : "password"} value={confirma}
                     onChange={(e) => setConfirma(e.target.value)}
                     placeholder="Repita a senha" minLength={6} required
                     className="input-base !pl-10" />
            </div>
            {confirma.length > 0 && (
              <p className="text-xs mt-1" style={{ color: igual ? "var(--success)" : "var(--danger)" }}>
                {igual ? "✓ Senhas conferem" : "✕ As senhas não conferem"}
              </p>
            )}
          </div>

          {error && (
            <p className="text-xs px-3 py-2 rounded-xl" style={{ background: "var(--danger-light)", color: "var(--danger)" }}>
              {error}
            </p>
          )}

          <button type="submit" disabled={saving || !forte || !igual} className="btn-primary w-full">
            {saving ? "Salvando..." : "Salvar nova senha e continuar"}
          </button>

          <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
            Guarde sua nova senha. Você usará ela nos próximos acessos.
          </p>
        </form>
      </div>
    </div>
  );
}
