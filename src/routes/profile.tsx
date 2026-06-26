import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell, BrandHeader, Card, Spinner, ErrorBanner } from "@/components/Shell";
import { DbBadge, BackLink } from "@/components/DbBadge";
import { loadConfig } from "@/lib/atlas";
import { decodeToken } from "@/lib/auth";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Pipeon — Meu perfil" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const token = decodeToken();

  useEffect(() => {
    if (!loadConfig()) navigate({ to: "/" });
  }, [navigate]);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!currentPassword.trim() || !newPassword.trim()) {
      setError("Preencha todos os campos.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("A nova senha e a confirmação não coincidem.");
      return;
    }
    if (newPassword.length < 6) {
      setError("A nova senha deve ter ao menos 6 caracteres.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("A nova senha deve ser diferente da senha atual.");
      return;
    }

    setLoading(true);
    const cfg = loadConfig();
    const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8080";
    try {
      const res = await fetch(`${API_BASE}/api/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${cfg?.token ?? ""}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message ?? "Não foi possível alterar a senha.");
        return;
      }

      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setError("Não foi possível conectar ao servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Shell>
      <DbBadge />
      <BackLink to="/menu" />
      <BrandHeader subtitle={false} />

      <Card>
        <div className="mb-6">
          <h2 className="text-lg font-semibold">Meu perfil</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Informações da conta e alteração de senha.
          </p>
        </div>

        <div className="mb-6 rounded-md border border-border bg-muted/30 p-4">
          <dl className="space-y-2 text-sm">
            {token?.name && (
              <div>
                <dt className="mb-0.5 text-xs text-muted-foreground">Nome</dt>
                <dd className="font-medium">{String(token.name)}</dd>
              </div>
            )}
            <div>
              <dt className="mb-0.5 text-xs text-muted-foreground">E-mail</dt>
              <dd className="font-medium">{token?.email ? String(token.email) : "—"}</dd>
            </div>
            <div>
              <dt className="mb-0.5 text-xs text-muted-foreground">Perfil</dt>
              <dd>
                <span className="rounded bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                  {token?.role ? String(token.role) : "user"}
                </span>
              </dd>
            </div>
          </dl>
        </div>

        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Alterar senha
        </h3>

        <form onSubmit={handleChangePassword} className="space-y-4">
          <Field label="Senha atual">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="input"
            />
          </Field>

          <Field label="Nova senha">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              className="input"
            />
          </Field>

          <Field label="Confirmar nova senha">
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="new-password"
              className="input"
            />
          </Field>

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? <><Spinner /> Alterando…</> : "Alterar senha"}
          </button>

          <ErrorBanner message={error} />

          {success && (
            <div className="rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
              Senha alterada com sucesso.
            </div>
          )}
        </form>
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
