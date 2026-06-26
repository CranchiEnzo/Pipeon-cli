import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Shell, BrandHeader, Card, Spinner, ErrorBanner } from "@/components/Shell";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Pipeon — Registro" },
      { name: "description", content: "Pipeon — Criar nova conta." },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !email.trim() || !password.trim()) {
      setError("Preencha todos os campos.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    try {
      const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8080";
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message ?? "Não foi possível criar a conta.");
        return;
      }

      navigate({ to: "/" });
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
        <form onSubmit={handleRegister} className="space-y-5">
          <Field label="Nome">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
              autoComplete="name"
              className="input"
            />
          </Field>

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
              autoComplete="new-password"
              className="input"
            />
          </Field>

          <Field label="Confirmar senha">
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              className="input"
            />
          </Field>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? (
              <>
                <Spinner /> Criando conta…
              </>
            ) : (
              "Criar conta"
            )}
          </button>

          <ErrorBanner message={error} />
        </form>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Já tem uma conta?{" "}
          <a href="/" className="font-medium text-primary hover:underline">
            Entrar
          </a>
        </p>
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
