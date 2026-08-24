"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function LoginPage() {
  const { login, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetMsg, setResetMsg] = useState("");

  async function handleForgotPassword() {
    setError("");
    setResetMsg("");
    if (!email.trim()) {
      setError("Digite seu e-mail acima e clique em \"Esqueci minha senha\" novamente.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setResetMsg("E-mail de recuperação enviado! Verifique sua caixa de entrada (e o spam).");
    } catch {
      // Não revela se o e-mail existe ou não (segurança)
      setResetMsg("Se este e-mail estiver cadastrado, você receberá o link de recuperação.");
    }
  }

  // O login() apenas autentica; o AuthContext popula `user` de forma assíncrona
  // (onAuthStateChanged + busca do perfil no Firestore). Redirecionar aqui via
  // efeito — assim que `user` estiver disponível — evita a corrida que mandava
  // o usuário de volta para /login antes do perfil carregar (exigindo logar 2x).
  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/");
    }
  }, [user, authLoading, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      // O efeito acima cuida do redirecionamento assim que `user` for populado.
    } catch {
      setError("E-mail ou senha incorretos.");
      setSubmitting(false);
    }
  }

  const loading = submitting || (!!user && authLoading);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-xl mb-4">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Financer Auto</h1>
            <p className="text-sm text-gray-500 mt-1">Acesse sua conta</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                E-mail
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="seu@email.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}
            {resetMsg && (
              <p className="text-sm text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg">
                {resetMsg}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>

            <button
              type="button"
              onClick={handleForgotPassword}
              className="w-full text-center text-sm text-blue-600 hover:underline"
            >
              Esqueci minha senha
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
