import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Settings,
  Database,
  History,
  AlarmClock,
  ShieldCheck,
  LogOut,
  ArrowRight,
} from "lucide-react";
import { Spinner } from "@/components/Shell";
import { DbBadge } from "@/components/DbBadge";
import { clearConfig, loadConfig } from "@/lib/atlas";
import { decodeToken } from "@/lib/auth";
import { usePermission, useIsReadOnly } from "@/hooks/use-permission";
import {
  fetchDueProcedures,
  cancelScheduled,
  type ScheduledProcedure,
  type ScheduledPrefill,
} from "@/lib/scheduled";

export const Route = createFileRoute("/menu")({
  head: () => ({ meta: [{ title: "Pipeon — Menu" }] }),
  component: MenuPage,
});

// ── Logo ──────────────────────────────────────────────────────────────────────

function MenuLogo() {
  return (
    <div
      className="rounded-full"
      style={{ boxShadow: "0 0 40px -8px rgba(56,189,248,0.45)" }}
    >
      <svg
        width="96"
        height="96"
        viewBox="0 0 96 96"
        fill="none"
        role="img"
        aria-labelledby="pipeonLogoTitle"
        className="pipeon-logo-svg"
      >
        <title id="pipeonLogoTitle">Pipeon logo</title>
        <defs>
          <filter id="pipeon-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx="48" cy="48" r="32" className="pipeon-logo-circle" />
        <path
          d="M32.8 58.2C39.6 57.5 44.3 53.1 48 45C51.7 53.1 56.4 57.5 63.2 58.2C57.4 60.7 52.3 58.7 48 52.4C43.7 58.7 38.6 60.7 32.8 58.2Z"
          className="pipeon-logo-icon"
          filter="url(#pipeon-glow)"
        />
      </svg>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function MenuPage() {
  const navigate = useNavigate();
  const token = decodeToken();
  const isAdmin = (token?.role as string)?.toLowerCase() === "admin";

  const canProcedure = usePermission("procedure");
  const canHistory = usePermission("history");
  const canRestore = usePermission("restore");
  const canScheduled = usePermission("scheduled");
  const readOnly = useIsReadOnly();

  const [dueProcedures, setDueProcedures] = useState<ScheduledProcedure[]>([]);
  const [showScheduled, setShowScheduled] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    if (!loadConfig()) {
      navigate({ to: "/" });
      return;
    }
    fetchDueProcedures()
      .then((items) => {
        setDueProcedures(items);
        if (items.length > 0) setShowScheduled(true);
      })
      .catch(() => {});
  }, [navigate]);

  async function handleCancelScheduled(id: string) {
    setCancellingId(id);
    try {
      await cancelScheduled(id);
      setDueProcedures((prev) => prev.filter((p) => String(p._id) !== id));
    } catch {
      // ignore
    } finally {
      setCancellingId(null);
    }
  }

  function handleExecuteScheduled(proc: ScheduledProcedure) {
    const prefill: ScheduledPrefill = {
      ticket: proc.ticket,
      noticeId: proc.noticeId,
      evaluatorUserId: proc.evaluatorUserId,
      evaluatorName: proc.evaluatorName,
      evaluatorEmail: proc.evaluatorEmail,
      scheduledId: String(proc._id),
    };
    sessionStorage.setItem("pipeon-scheduled-execute", JSON.stringify(prefill));
    navigate({ to: "/procedure/reset-evaluations" });
  }

  return (
    <div
      className="menu-page relative min-h-screen w-full overflow-hidden bg-[#d8e0ec] text-slate-800 dark:bg-[#0b0f1e] dark:text-slate-100"
      style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
    >
      {/* Subtle grid overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-[0.12]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148,163,184,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.18) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage:
            "radial-gradient(ellipse 60% 50% at 50% 0%, black 30%, transparent 100%)",
        }}
      />
      {/* Blue ambient glow at top */}
      <div className="pointer-events-none absolute left-1/2 top-[-180px] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-sky-400/20 blur-[160px]" />

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-5xl px-6 pb-20 pt-8">

        {/* System bar: database name / Trocar sistema / theme toggle / user icon */}
        <DbBadge />

        {/* Hero header */}
        <div className="mt-8 flex flex-col items-center text-center">
          <MenuLogo />
          <h1
            className="mt-5 text-4xl font-bold tracking-[0.15em] text-sky-600 dark:text-sky-400 sm:text-5xl"
            style={{ textShadow: "0 0 28px rgba(56,189,248,0.35)" }}
          >
            PIPEON
          </h1>
        </div>

        {/* Scheduled procedures banner */}
        {dueProcedures.length > 0 && (
          <div className="mt-8">
            <button
              onClick={() => setShowScheduled((v) => !v)}
              className="mb-2 flex w-full items-center justify-between rounded-xl border border-sky-400/40 bg-sky-50/60 px-5 py-3 text-sm font-medium text-sky-700 backdrop-blur-sm transition hover:bg-sky-50/80 dark:bg-sky-900/20 dark:text-sky-300 dark:hover:bg-sky-900/30"
              style={{ boxShadow: "0 10px 40px -15px rgba(0,0,0,0.12)" }}
            >
              <span>
                {dueProcedures.length} procedimento(s) agendado(s) prontos para execução
              </span>
              <span>{showScheduled ? "▲" : "▼"}</span>
            </button>

            {showScheduled && (
              <div className="space-y-2">
                {dueProcedures.map((proc) => {
                  const id = String(proc._id);
                  return (
                    <div
                      key={id}
                      className="rounded-xl border border-slate-300/60 bg-white/60 p-4 backdrop-blur-sm dark:border-slate-700/40 dark:bg-white/[0.06]"
                      style={{ boxShadow: "0 10px 40px -15px rgba(0,0,0,0.12)" }}
                    >
                      <div className="mb-3">
                        <span className="font-mono text-xs font-semibold text-sky-600 dark:text-sky-400">
                          #{proc.ticket}
                        </span>
                        <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                          {proc.procedureName}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                          Avaliador: {proc.evaluatorName || proc.evaluatorEmail}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Agendado para: {new Date(proc.scheduledFor).toLocaleString("pt-BR")}
                        </p>
                      </div>
                      {!readOnly && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleExecuteScheduled(proc)}
                            className="flex-1 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-600"
                          >
                            Executar agora
                          </button>
                          <button
                            onClick={() => handleCancelScheduled(id)}
                            disabled={cancellingId === id}
                            className="rounded-lg border border-slate-300/60 px-3 py-2 text-sm text-slate-500 transition hover:border-red-300 hover:text-red-500 disabled:opacity-50 dark:border-slate-700/40 dark:text-slate-400"
                          >
                            {cancellingId === id ? <Spinner /> : "Cancelar"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Action cards grid */}
        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {canProcedure && (
            <ActionCard
              icon={<Settings className="size-4" />}
              title="Executar procedimento"
              desc="Selecione um sistema e um procedimento de manutenção."
              onClick={() => navigate({ to: "/system" })}
            />
          )}
          {canRestore && (
            <ActionCard
              icon={<Database className="size-4" />}
              title="Restaurar backup"
              desc="Carregue um arquivo .zip de backup e restaure documentos."
              onClick={() => navigate({ to: "/restore" })}
            />
          )}
          {canHistory && (
            <ActionCard
              icon={<History className="size-4" />}
              title="Histórico de operações"
              desc="Veja todos os procedimentos executados, quem rodou e quando."
              onClick={() => navigate({ to: "/history" })}
            />
          )}
          {canScheduled && (
            <ActionCard
              icon={<AlarmClock className="size-4" />}
              title="Procedimentos Agendados"
              desc="Visualize, gerencie e acompanhe todos os procedimentos agendados."
              onClick={() => navigate({ to: "/scheduled" })}
              accent
            />
          )}
          {isAdmin && (
            <ActionCard
              icon={<ShieldCheck className="size-4" />}
              title="Painel de administração"
              desc="Gerencie usuários, defina permissões por cargo e configure o sistema."
              onClick={() => navigate({ to: "/admin" })}
            />
          )}
        </div>

        {/* Sair — full width */}
        <button
          type="button"
          onClick={() => {
            clearConfig();
            navigate({ to: "/" });
          }}
          className="group mt-4 flex w-full items-start justify-between rounded-xl border border-slate-300/60 bg-white/60 p-5 text-left backdrop-blur-sm transition-all duration-200 hover:-translate-y-2 hover:border-sky-400/80 hover:bg-white/90 hover:shadow-[0_8px_32px_-4px] hover:shadow-sky-500/35 dark:border-slate-700/40 dark:bg-white/[0.06] dark:hover:border-sky-500/70 dark:hover:bg-white/[0.12]"
          style={{ boxShadow: "0 10px 40px -15px rgba(0,0,0,0.12)" }}
        >
          <div>
            <div className="flex items-center gap-2">
              <LogOut className="size-4 text-sky-500 dark:text-sky-400" />
              <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">Sair</h3>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              Encerra a sessão e remove as credenciais.
            </p>
          </div>
          <ArrowRight className="mt-1 size-4 shrink-0 text-sky-500 transition group-hover:translate-x-1 dark:text-sky-400" />
        </button>

      </div>
    </div>
  );
}

// ── ActionCard ────────────────────────────────────────────────────────────────

function ActionCard({
  icon,
  title,
  desc,
  onClick,
  accent = false,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
  accent?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex items-start justify-between rounded-xl border bg-white/60 p-5 text-left backdrop-blur-sm transition-all duration-200 hover:-translate-y-2 hover:bg-white/90 hover:shadow-[0_8px_32px_-4px] hover:shadow-sky-500/35 dark:bg-white/[0.06] dark:hover:bg-white/[0.12] ${
        accent
          ? "border-sky-400/50 hover:border-sky-400 dark:border-sky-500/50 dark:hover:border-sky-500"
          : "border-slate-300/60 hover:border-sky-400/80 dark:border-slate-700/40 dark:hover:border-sky-500/70"
      }`}
      style={{ boxShadow: "0 10px 40px -15px rgba(0,0,0,0.12)" }}
    >
      <div className="pr-4">
        <div className="flex items-center gap-2">
          <span className="text-sky-500 dark:text-sky-400">{icon}</span>
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200">{title}</h3>
        </div>
        <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{desc}</p>
      </div>
      <ArrowRight className="mt-1 size-4 shrink-0 text-sky-500 transition group-hover:translate-x-1 dark:text-sky-400" />
    </button>
  );
}
