import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

// ── Theme toggle ──────────────────────────────────────────────────────────────

function getStoredTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  try {
    return (localStorage.getItem("pipeon-theme") as "light" | "dark") ?? "dark";
  } catch {
    return "dark";
  }
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">(getStoredTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    try {
      localStorage.setItem("pipeon-theme", theme);
    } catch {}
  }, [theme]);

  return (
    <button
      type="button"
      onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
      aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
      title={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
      className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full border border-slate-300/60 bg-white/70 shadow-md backdrop-blur-sm transition hover:border-sky-400/60 hover:shadow-lg dark:border-slate-700/60 dark:bg-white/10"
    >
      {theme === "dark" ? (
        <Sun size={16} className="text-sky-500" />
      ) : (
        <Moon size={16} className="text-sky-600" />
      )}
    </button>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative flex min-h-screen w-full flex-col overflow-hidden bg-[#d8e0ec] text-slate-800 dark:bg-[#0b0f1e] dark:text-slate-100"
      style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
    >
      {/* Subtle grid — fades toward bottom */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-[0.12]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148,163,184,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.18) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage:
            "radial-gradient(ellipse 60% 50% at 50% 0%, black 30%, transparent 100%)",
        }}
      />
      {/* Ambient blue glow at top */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-[-180px] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-sky-400/20 blur-[160px]"
      />
      <div className="relative z-10 mx-auto w-full max-w-5xl flex-1 px-6 py-10 sm:py-14">
        {children}
      </div>

      <footer className="relative z-10 border-t border-slate-300/60 py-4 dark:border-slate-700/40">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-center gap-x-2 gap-y-1 px-6 text-xs text-slate-500 dark:text-slate-400">
          <span>© Desenvolvido por</span>
          <img src="/logo.png" alt="[COMPANY]" className="h-5 w-5 opacity-80" />
          <span className="font-medium text-sky-600 dark:text-sky-400">[COMPANY]</span>
          <span className="opacity-40">·</span>
          <span>Enzo Cranchi</span>
        </div>
      </footer>
    </div>
  );
}

// ── BrandHeader ───────────────────────────────────────────────────────────────

export function BrandHeader({ subtitle = true }: { subtitle?: boolean }) {
  return (
    <header className="mb-8 text-center">
      <div className="mb-5 flex justify-center">
        <div
          className="rounded-full"
          style={{ boxShadow: "0 0 40px -8px rgba(56,189,248,0.45)" }}
        >
          <svg
            width="72"
            height="72"
            viewBox="0 0 96 96"
            fill="none"
            role="img"
            aria-labelledby="brandLogoTitle"
            className="pipeon-logo-svg"
          >
            <title id="brandLogoTitle">Pipeon logo</title>
            <defs>
              <filter id="brand-chevron-glow" x="-80%" y="-80%" width="260%" height="260%">
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
              filter="url(#brand-chevron-glow)"
            />
          </svg>
        </div>
      </div>
      <h1 className="text-3xl font-bold tracking-[0.15em] text-sky-600 dark:text-sky-400 sm:text-4xl">
        PIPEON
      </h1>
      {subtitle && (
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Desenvolvido por Enzo Cranchi — [COMPANY]
        </p>
      )}
    </header>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-slate-300/60 bg-white/60 p-6 backdrop-blur-sm dark:border-slate-700/40 dark:bg-white/[0.06] ${className}`}
      style={{ boxShadow: "0 10px 40px -15px rgba(0,0,0,0.12)" }}
    >
      {children}
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────────────────

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent ${className}`}
      aria-label="Carregando"
    />
  );
}

// ── ErrorBanner ───────────────────────────────────────────────────────────────

export function ErrorBanner({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div className="mt-4 rounded-xl border border-red-300/60 bg-red-50/60 px-4 py-3 text-sm text-red-600 backdrop-blur-sm dark:border-red-500/30 dark:bg-red-900/20 dark:text-red-400">
      {message}
    </div>
  );
}

// ── ReadOnlyBanner ────────────────────────────────────────────────────────────

export function ReadOnlyBanner() {
  return (
    <div className="mb-5 rounded-xl border border-amber-300/60 bg-amber-50/60 px-4 py-3 text-sm text-amber-700 backdrop-blur-sm dark:border-amber-500/30 dark:bg-amber-900/20 dark:text-amber-400">
      Seu perfil tem acesso apenas para visualização. Ações de execução, restauração e agendamento estão desabilitadas.
    </div>
  );
}

