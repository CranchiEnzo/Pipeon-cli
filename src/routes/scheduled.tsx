import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Shell, BrandHeader, Card, Spinner, ReadOnlyBanner } from "@/components/Shell";
import { DbBadge, BackLink } from "@/components/DbBadge";
import { loadConfig } from "@/lib/atlas";
import { fetchAllScheduled, cancelScheduled, type ScheduledProcedure } from "@/lib/scheduled";
import { usePermission, useIsReadOnly } from "@/hooks/use-permission";

export const Route = createFileRoute("/scheduled")({
  head: () => ({ meta: [{ title: "Pipeon — Agendamentos" }] }),
  component: ScheduledPage,
});

type StatusFilter = "all" | ScheduledProcedure["status"];

function statusLabel(status: ScheduledProcedure["status"]) {
  switch (status) {
    case "pending":   return "Pendente";
    case "executed":  return "Executado";
    case "cancelled": return "Cancelado";
    case "failed":    return "Falhou";
  }
}

function statusColor(status: ScheduledProcedure["status"]) {
  switch (status) {
    case "pending":   return "border-orange-500/40 bg-orange-500/10 text-orange-400";
    case "executed":  return "border-green-500/40 bg-green-500/10 text-green-500";
    case "cancelled": return "border-border bg-muted/30 text-muted-foreground";
    case "failed":    return "border-red-500/40 bg-red-500/10 text-red-400";
  }
}

function ScheduledPage() {
  const navigate = useNavigate();
  const [procedures, setProcedures] = useState<ScheduledProcedure[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");

  const canScheduled = usePermission("scheduled");
  const readOnly = useIsReadOnly();

  useEffect(() => {
    if (!loadConfig()) {
      navigate({ to: "/" });
      return;
    }
    if (!canScheduled) {
      void navigate({ to: "/menu" });
      return;
    }
    fetchAllScheduled()
      .then(setProcedures)
      .finally(() => setLoading(false));
  }, [navigate, canScheduled]);

  async function handleCancel(id: string) {
    setCancellingId(id);
    try {
      await cancelScheduled(id);
      setProcedures((prev) =>
        prev.map((p) => String(p._id) === id ? { ...p, status: "cancelled" } : p),
      );
    } finally {
      setCancellingId(null);
    }
  }

  const filterOptions: { value: StatusFilter; label: string }[] = [
    { value: "all",       label: "Todos" },
    { value: "pending",   label: "Pendentes" },
    { value: "executed",  label: "Executados" },
    { value: "failed",    label: "Falhos" },
    { value: "cancelled", label: "Cancelados" },
  ];

  const filtered = filter === "all"
    ? procedures
    : procedures.filter((p) => p.status === filter);

  const countFor = (s: StatusFilter) =>
    s === "all" ? procedures.length : procedures.filter((p) => p.status === s).length;

  return (
    <Shell>
      <DbBadge />
      <BackLink to="/menu" />
      <BrandHeader subtitle={false} />

      {readOnly && <ReadOnlyBanner />}

      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl font-semibold">⏰ Procedimentos Agendados</h2>
        <button
          onClick={() => { setLoading(true); fetchAllScheduled().then(setProcedures).finally(() => setLoading(false)); }}
          className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/40 hover:text-primary"
        >
          Atualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap gap-2">
        {filterOptions.map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              filter === value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/40"
            }`}
          >
            {label}
            <span className="ml-1.5 opacity-60">({countFor(value)})</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Spinner />
          <span className="ml-2">Carregando agendamentos…</span>
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <p className="py-4 text-center text-sm text-muted-foreground">
            Nenhum procedimento encontrado.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((proc) => {
            const id = String(proc._id);
            return (
              <Card key={id} className="space-y-3">
                {/* Cabeçalho */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-primary">
                    #{proc.ticket}
                  </span>
                  <span
                    className={`rounded border px-2 py-0.5 text-[11px] font-medium ${statusColor(proc.status)}`}
                  >
                    {statusLabel(proc.status)}
                    {proc.autoExecuted ? " · automático" : ""}
                  </span>
                  {proc.recurring && (
                    <span className="rounded border border-blue-500/40 bg-blue-500/10 px-2 py-0.5 text-[11px] font-medium text-blue-400">
                      Recorrente · {proc.recurringTime}
                    </span>
                  )}
                </div>

                <p className="text-sm font-medium leading-snug">{proc.procedureName}</p>

                {/* Detalhes */}
                <div className="grid grid-cols-1 gap-x-6 gap-y-1 rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground sm:grid-cols-2">
                  <div>
                    <span className="font-medium text-foreground">Avaliador:</span>{" "}
                    {proc.evaluatorName || proc.evaluatorEmail}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Edital:</span>{" "}
                    <span className="font-mono">{proc.noticeId}</span>
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Agendado para:</span>{" "}
                    {new Date(proc.scheduledFor).toLocaleString("pt-BR")}
                  </div>
                  {proc.executedAt && (
                    <div>
                      <span className="font-medium text-foreground">Executado em:</span>{" "}
                      {new Date(proc.executedAt).toLocaleString("pt-BR")}
                    </div>
                  )}
                  <div>
                    <span className="font-medium text-foreground">Agendado por:</span>{" "}
                    {proc.scheduledBy}
                  </div>
                  <div>
                    <span className="font-medium text-foreground">Banco:</span>{" "}
                    {proc.database}
                  </div>
                </div>

                {/* Erro (se falhou) */}
                {proc.failError && (
                  <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                    <span className="font-medium">Erro:</span> {proc.failError}
                  </div>
                )}

                {/* Ações */}
                {proc.status === "pending" && !readOnly && (
                  <div className="flex justify-end">
                    <button
                      onClick={() => handleCancel(id)}
                      disabled={cancellingId === id}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:border-destructive/50 hover:text-destructive disabled:opacity-50"
                    >
                      {cancellingId === id ? <Spinner /> : "Cancelar agendamento"}
                    </button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </Shell>
  );
}
