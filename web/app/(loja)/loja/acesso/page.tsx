"use client";

import { useState } from "react";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, AuthError } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Mail, Lock, User, Eye, EyeOff, Car, ArrowLeft } from "lucide-react";

const inputCls = "w-full pl-10 pr-4 py-3 rounded-xl text-sm";
const inputStyle = { background: "var(--bg-input)", border: "1px solid var(--border)", color: "var(--text-primary)" };

export default function AcessoPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("register");
  const [showPass, setShowPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [resetMsg, setResetMsg] = useState("");

  const [form, setForm] = useState({ name: "", email: "", password: "" });

  async function handleForgotPassword() {
    setError("");
    setResetMsg("");
    if (!form.email.trim()) {
      setError("Digite seu e-mail e clique em \"Esqueci minha senha\" novamente.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, form.email.trim());
      setResetMsg("E-mail de recuperação enviado! Verifique sua caixa de entrada (e o spam).");
    } catch {
      setResetMsg("Se este e-mail estiver cadastrado, você receberá o link de recuperação.");
    }
  }

  function set(k: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));
  }

  async function handleRegister() {
    if (!form.name.trim() || !form.email.trim() || form.password.length < 6) {
      setError("Preencha todos os campos. A senha deve ter no mínimo 6 caracteres.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const cred = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);
      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid,
        name: form.name.trim(),
        email: form.email.trim(),
        role: "prospect",  // Não precisa de aprovação — pode ver loja e enviar leads
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      router.push("/loja");
    } catch (err) {
      const msg: Record<string, string> = {
        "auth/email-already-in-use": "Este e-mail já está cadastrado. Tente fazer login.",
        "auth/weak-password": "Senha fraca — use pelo menos 6 caracteres.",
        "auth/invalid-email": "E-mail inválido.",
      };
      const code = (err as AuthError)?.code;
      setError(msg[code] ?? "Erro ao criar conta. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLogin() {
    if (!form.email.trim() || !form.password) {
      setError("Preencha e-mail e senha.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const cred = await signInWithEmailAndPassword(auth, form.email.trim(), form.password);
      // Redireciona conforme o papel
      const userDoc = await getDoc(doc(db, "users", cred.user.uid));
      const role = userDoc.data()?.role;
      if (role === "admin" || role === "seller") router.push("/dashboard");
      else if (role === "customer") router.push("/minha-area");
      else router.push("/loja");
    } catch (err) {
      const msg: Record<string, string> = {
        "auth/invalid-credential": "E-mail ou senha incorretos.",
        "auth/user-not-found": "Conta não encontrada.",
        "auth/wrong-password": "Senha incorreta.",
      };
      const code = (err as AuthError)?.code;
      setError(msg[code] ?? "Erro ao entrar. Verifique seus dados.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "register") handleRegister();
    else handleLogin();
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="card p-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3"
                 style={{ background: "var(--accent-gradient)" }}>
              <Car className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>
              {mode === "register" ? "Criar sua conta" : "Entrar na sua conta"}
            </h1>
            <p className="text-sm mt-1 text-center" style={{ color: "var(--text-secondary)" }}>
              {mode === "register"
                ? "Acompanhe suas negociações e favoritos"
                : "Bem-vindo de volta!"}
            </p>
          </div>

          {/* Tab */}
          <div className="flex gap-1 p-1 rounded-xl mb-6" style={{ background: "var(--bg-hover)" }}>
            {(["register", "login"] as const).map((m) => (
              <button key={m} onClick={() => { setMode(m); setError(""); }}
                      className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                      style={mode === m
                        ? { background: "var(--bg-card)", color: "var(--text-primary)", boxShadow: "var(--shadow-sm)" }
                        : { color: "var(--text-muted)" }}>
                {m === "register" ? "Cadastrar" : "Entrar"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                  Nome completo
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} />
                  <input value={form.name} onChange={set("name")} placeholder="Seu nome" required
                         className={inputCls} style={inputStyle} />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>E-mail</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} />
                <input type="email" value={form.email} onChange={set("email")} placeholder="seu@email.com" required
                       className={inputCls} style={inputStyle} />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--text-muted)" }} />
                <input type={showPass ? "text" : "password"} value={form.password} onChange={set("password")}
                       placeholder="••••••••" minLength={6} required
                       className={inputCls} style={{ ...inputStyle, paddingRight: "2.5rem" }} />
                <button type="button" onClick={() => setShowPass((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                        style={{ color: "var(--text-muted)" }}>
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-xs px-3 py-2 rounded-xl" style={{ background: "#ef444418", color: "#ef4444" }}>{error}</p>
            )}
            {resetMsg && (
              <p className="text-xs px-3 py-2 rounded-xl" style={{ background: "#10b98118", color: "#10b981" }}>{resetMsg}</p>
            )}

            <button type="submit" disabled={submitting}
                    className="w-full py-3 rounded-xl font-semibold text-sm text-white disabled:opacity-50 transition-all"
                    style={{ background: "var(--accent-gradient)" }}>
              {submitting
                ? "Aguarde..."
                : mode === "register" ? "Criar conta gratuita" : "Entrar"}
            </button>

            {mode === "login" && (
              <button type="button" onClick={handleForgotPassword}
                      className="w-full text-center text-sm"
                      style={{ color: "var(--accent)" }}>
                Esqueci minha senha
              </button>
            )}
          </form>

          <div className="mt-6 pt-5 text-center" style={{ borderTop: "1px solid var(--border)" }}>
            <Link href="/loja"
                  className="inline-flex items-center gap-1.5 text-sm"
                  style={{ color: "var(--text-muted)" }}>
              <ArrowLeft className="w-3.5 h-3.5" /> Continuar sem conta
            </Link>
          </div>
        </div>

        <p className="text-xs text-center mt-4" style={{ color: "var(--text-muted)" }}>
          Para acessar o painel administrativo,{" "}
          <Link href="/login" style={{ color: "var(--accent)" }}>clique aqui</Link>.
        </p>
      </div>
    </div>
  );
}
