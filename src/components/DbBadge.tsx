import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Sun, Moon } from "lucide-react";
import { loadConfig, savePendingToken, clearConfig } from "@/lib/atlas";
import { decodeToken } from "@/lib/auth";

// ── Theme toggle (same key + logic as Shell.tsx ThemeToggle) ─────────────────
function useThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "dark";
    try {
      return (localStorage.getItem("pipeon-theme") as "light" | "dark") ?? "dark";
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    try {
      localStorage.setItem("pipeon-theme", theme);
    } catch {}
  }, [theme]);

  return {
    theme,
    toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
  };
}

// ── DbBadge ──────────────────────────────────────────────────────────────────

export function DbBadge() {
  const navigate = useNavigate();
  const { theme, toggle } = useThemeToggle();
  const [cfg, setCfg] = useState<ReturnType<typeof loadConfig> | null>(null);

  useEffect(() => {
    setCfg(loadConfig());
  }, []);

  if (!cfg) return null;

  function handleChangeSystem() {
    if (cfg?.token) savePendingToken(cfg.token);
    clearConfig();
    navigate({ to: "/select-system" });
  }

  const systemLabel = cfg.systemName
    ? cfg.sessionLabel
      ? `${cfg.systemName} — ${cfg.sessionLabel}`
      : cfg.systemName
    : cfg.database;

  return (
    <div className="mb-8 flex items-center justify-between rounded-lg border border-border bg-card px-4 py-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="inline-block h-2 w-2 rounded-full bg-primary shadow-[0_0_10px] shadow-primary" />
        <span className="font-mono text-muted-foreground">{systemLabel}</span>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={handleChangeSystem}
          className="text-xs text-muted-foreground transition hover:text-foreground"
        >
          Trocar sistema
        </button>
        {/* Theme toggle — same localStorage key as ThemeToggle in Shell.tsx */}
        <button
          type="button"
          onClick={toggle}
          aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
          title={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
          className="flex h-7 w-7 items-center justify-center rounded-full border border-border/70 text-muted-foreground transition hover:border-primary/60 hover:text-primary"
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <ProfileButton />
      </div>
    </div>
  );
}

// ── ProfileButton ────────────────────────────────────────────────────────────

function ProfileButton() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const token = decodeToken();

  useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Perfil"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted/50 text-muted-foreground transition hover:border-primary/50 hover:bg-muted hover:text-foreground"
      >
        <PersonIcon className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 min-w-[200px] rounded-xl border border-border bg-card shadow-[0_8px_32px_rgba(0,0,0,0.35)]">
          {token?.email && (
            <div className="border-b border-border px-4 py-3">
              {token.name && (
                <p className="text-sm font-medium text-foreground">{String(token.name)}</p>
              )}
              <p className="truncate text-xs text-muted-foreground">{String(token.email)}</p>
            </div>
          )}
          <div className="p-1">
            <button
              onClick={() => {
                setOpen(false);
                navigate({ to: "/profile" });
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-foreground transition hover:bg-accent"
            >
              <PersonIcon className="h-4 w-4 text-muted-foreground" />
              Meu perfil
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PersonIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    </svg>
  );
}

export function BackLink({ to, search }: { to: string; search?: Record<string, string> }) {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate(search ? { to, search } : { to })}
      className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground"
    >
      ← Voltar
    </button>
  );
}
