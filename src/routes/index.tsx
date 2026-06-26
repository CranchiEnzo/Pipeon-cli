import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Shell, BrandHeader, Card, Spinner, ErrorBanner } from "@/components/Shell";
import { savePendingToken } from "@/lib/atlas";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pipeon — Login" },
      { name: "description", content: "Pipeon — Suporte Automatizado." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError("Preencha o e-mail e a senha.");
      return;
    }
    setLoading(true);
    try {
      const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:5000";
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message ?? "E-mail ou senha inválidos.");
        return;
      }

      const { token } = await res.json();
      savePendingToken(token);
      navigate({ to: "/select-system" });
    } catch {
      setError("Não foi possível conectar ao servidor. Verifique se a API está acessível.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell>
      <BrandHeader />
      <Card>
        <form onSubmit={handleLogin} className="space-y-5">
          <Field label="E-mail">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              autoComplete="email"
              className="input"
            />
          </Field>

          <Field label="Senha">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="input"
            />
          </Field>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? (
              <>
                <Spinner /> Entrando…
              </>
            ) : (
              "Entrar"
            )}
          </button>

          <ErrorBanner message={error} />
        </form>

        <div className="mt-4 flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
          <a href="/forgot-password" className="font-medium text-primary hover:underline">
            Esqueceu a senha?
          </a>
          <span>
            Não tem uma conta?{" "}
            <a href="/register" className="font-medium text-primary hover:underline">
              Registre-se aqui
            </a>
          </span>
        </div>
      </Card>

      <Style />
    </Shell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function Style() {
  return (
    <style>{`
      .input {
        width: 100%;
        background: var(--color-input);
        border: 1px solid var(--color-border);
        border-radius: 0.5rem;
        padding: 0.65rem 0.85rem;
        font-size: 0.9rem;
        color: var(--color-foreground);
        outline: none;
        transition: border-color .15s, box-shadow .15s;
      }
      .input:focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-primary) 25%, transparent); }
      .btn-primary {
        display: inline-flex; align-items: center; justify-content: center; gap: .5rem;
        background: var(--color-primary); color: var(--color-primary-foreground);
        font-weight: 600; padding: .7rem 1rem; border-radius: .5rem;
        transition: filter .15s, transform .05s;
      }
      .btn-primary:hover { filter: brightness(1.05); }
      .btn-primary:active { transform: translateY(1px); }
      .btn-primary:disabled { opacity: .6; cursor: not-allowed; }
    `}</style>
  );
}
