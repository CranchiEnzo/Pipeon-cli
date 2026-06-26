import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Shell, BrandHeader, Card, Spinner, ErrorBanner } from "@/components/Shell";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({ meta: [{ title: "Pipeon — Recuperar senha" }] }),
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Informe o e-mail cadastrado.");
      return;
    }
    setLoading(true);
    const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8080";
    try {
      const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message ?? "Não foi possível processar o pedido.");
        return;
      }
      setSent(true);
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
        {sent ? (
          <div className="space-y-4 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-6 w-6 text-primary"
              >
                <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold">Verifique seu e-mail</h2>
            <p className="text-sm text-muted-foreground">
              Se <span className="font-medium text-foreground">{email}</span> estiver
              cadastrado, você receberá um link para redefinir sua senha em instantes.
            </p>
            <a
              href="/"
              className="inline-flex items-center justify-center gap-1 text-sm text-primary hover:underline"
            >
              ← Voltar para o login
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold">Recuperar senha</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Informe o e-mail cadastrado e enviaremos um link para redefinição.
              </p>
            </div>

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

            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? <><Spinner /> Enviando…</> : "Enviar link de recuperação"}
            </button>

            <ErrorBanner message={error} />

            <p className="text-center text-sm text-muted-foreground">
              Lembrou a senha?{" "}
              <a href="/" className="font-medium text-primary hover:underline">
                Entrar
              </a>
            </p>
          </form>
        )}
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
