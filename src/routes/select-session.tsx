import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Shell, BrandHeader, Card, Spinner } from "@/components/Shell";
import {
  loadPendingToken,
  loadSelectedSystemId,
  loadSystems,
  clearPendingToken,
  clearSelectedSystemId,
  saveConfig,
} from "@/lib/atlas";
import { syncPermissionsFromDb } from "@/lib/permissions";

export const Route = createFileRoute("/select-session")({
  head: () => ({ meta: [{ title: "Pipeon — Selecionar Ambiente" }] }),
  component: SelectSessionPage,
});

const ENV_LABELS: Record<string, string> = {
  production: "Produção",
  staging: "Homologação",
  local: "Local",
};

const ENV_COLORS: Record<string, string> = {
  production: "text-destructive",
  staging: "text-yellow-500",
  local: "text-primary",
};

function SelectSessionPage() {
  const navigate = useNavigate();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const selecting = useRef(false);

  const token = loadPendingToken();
  const systemId = loadSelectedSystemId();
  const systems = loadSystems();
  const system = systems.find((s) => s.id === systemId);

  useEffect(() => {
    if (selecting.current) return;
    if (!token || !system) navigate({ to: "/select-system" });
  }, [navigate, token, system]);

  async function handleSelect(sessionId: string) {
    if (!token || !system) return;
    const session = system.sessions.find((s) => s.id === sessionId);
    if (!session) return;

    selecting.current = true;
    setLoadingId(sessionId);
    try {
      saveConfig({
        token,
        database: session.database,
        ...(system.connectionString ? { connectionString: system.connectionString } : {}),
        systemName: system.name,
        sessionLabel: session.label,
      });
      clearPendingToken();
      clearSelectedSystemId();
      await syncPermissionsFromDb();
      navigate({ to: "/menu" });
    } catch {
      navigate({ to: "/menu" });
    } finally {
      setLoadingId(null);
    }
  }

  if (!system) return null;

  return (
    <Shell>
      <button
        onClick={() => navigate({ to: "/select-system" })}
        className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
      >
        ← Voltar
      </button>

      <BrandHeader />

      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {system.name}
      </h2>
      <p className="mb-6 text-xs text-muted-foreground">Selecione o ambiente de acesso</p>

      {system.sessions.length === 0 ? (
        <Card>
          <p className="text-sm text-muted-foreground">
            Nenhum ambiente configurado para este sistema. Acesse o Painel de Administração para adicionar ambientes.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {system.sessions.map((session) => {
            const busy = loadingId === session.id;
            return (
              <button
                key={session.id}
                onClick={() => handleSelect(session.id)}
                disabled={loadingId !== null}
                className="group text-left transition-all duration-200 hover:-translate-y-2 disabled:opacity-60 disabled:hover:translate-y-0"
              >
                <Card className="h-full transition-all duration-200 group-hover:border-primary group-hover:shadow-[0_8px_32px_-4px] group-hover:shadow-primary/45 group-hover:bg-primary/[0.04]">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold">{session.label}</h3>
                    {busy ? (
                      <Spinner />
                    ) : (
                      <span
                        className={`text-xs font-semibold uppercase ${ENV_COLORS[session.environment] ?? "text-muted-foreground"}`}
                      >
                        {ENV_LABELS[session.environment] ?? session.environment}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 font-mono text-xs text-muted-foreground">
                    {session.database}
                  </p>
                </Card>
              </button>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
