import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { Shell, BrandHeader, Card, Spinner, ErrorBanner } from "@/components/Shell";
import { DbBadge, BackLink } from "@/components/DbBadge";
import { loadConfig } from "@/lib/atlas";
import { fetchProcedures, type ProcedureCatalog } from "@/lib/procedures-catalog";

export const Route = createFileRoute("/procedure/")({
  head: () => ({ meta: [{ title: "Pipeon — Procedimento" }] }),
  validateSearch: (search) => ({
    nucleo: typeof search.nucleo === "string" ? search.nucleo : "",
  }),
  component: ProcedurePage,
});

const ALLOWED_DATABASES = ["target-database"];
const PAGE_SIZE_OPTIONS = [5, 10, 15, 20];

function ProcedurePage() {
  const navigate = useNavigate();
  const { nucleo } = Route.useSearch();
  const cfg = loadConfig();
  const dbAllowed = cfg ? ALLOWED_DATABASES.includes(cfg.database) : false;

  const [procedures, setProcedures] = useState<ProcedureCatalog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(5);
  const [page, setPage] = useState(1);

  useEffect(() => {
    // Guarda contra race condition: se o usuário navegar entre núcleos antes
    // desta requisição resolver, uma resposta tardia não pode mais sobrescrever
    // a lista com procedimentos do núcleo errado.
    let cancelled = false;

    setLoading(true);
    fetchProcedures()
      .then((procs) => {
        if (cancelled) return;
        const active = procs.filter((p) => p.isActive);
        const filtered = nucleo ? active.filter((p) => p.nucleo === nucleo) : active;
        setProcedures(filtered);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Erro ao carregar procedimentos.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [nucleo]);

  // Reset to page 1 whenever search or page size changes
  useEffect(() => {
    setPage(1);
  }, [search, pageSize]);

  // Assign permanent sequential numbers BEFORE filtering so they never change
  const numbered = useMemo(
    () => procedures.map((p, i) => ({ proc: p, num: i + 1 })),
    [procedures],
  );

  // Filter: pure number query → match by number only; text query → match by name/description
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/^#/, "");
    if (!q) return numbered;
    if (/^\d+$/.test(q)) {
      return numbered.filter(({ num }) => String(num) === q);
    }
    return numbered.filter(
      ({ proc }) =>
        proc.name.toLowerCase().includes(q) ||
        (proc.description ?? "").toLowerCase().includes(q),
    );
  }, [numbered, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  function handleProcedureClick(proc: ProcedureCatalog) {
    if (proc.legacyRoute) {
      void navigate({ to: proc.legacyRoute as "/procedure/reset-evaluations" });
    } else {
      void navigate({ to: "/procedure/$id", params: { id: proc._id! } });
    }
  }

  return (
    <Shell>
      <DbBadge />
      <BackLink to="/system" />
      <BrandHeader subtitle={false} />

      {!dbAllowed && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <strong>Banco não permitido:</strong> procedimentos só podem ser executados contra o banco{" "}
          <code className="font-mono text-xs">target-database</code>. Banco atual:{" "}
          <code className="font-mono text-xs">{cfg?.database ?? "desconhecido"}</code>.
          <br />
          Volte ao menu, selecione a sessão correta e tente novamente.
        </div>
      )}

      {dbAllowed && (
        <>
          <h2 className="mb-4 text-sm uppercase tracking-wider text-muted-foreground">
            {nucleo ? nucleo : "Procedimentos"}
          </h2>

          <ErrorBanner message={error} />

          {/* Search + page size controls */}
          {!loading && procedures.length > 0 && (
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <div className="relative min-w-0 flex-1">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="2" />
                    <path d="M14 14l3.5 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </span>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar procedimento…"
                  className="proc-search-input"
                />
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Por página:</span>
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setPageSize(n)}
                    className={`proc-page-size-btn ${pageSize === n ? "proc-page-size-btn--active" : ""}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Spinner /> Carregando procedimentos…
            </div>
          )}

          {!loading && filtered.length === 0 && !error && (
            <p className="py-4 text-sm text-muted-foreground">
              {search
                ? `Nenhum procedimento encontrado para "${search}".`
                : `Nenhum procedimento registrado${nucleo ? ` para o núcleo "${nucleo}"` : ""}.`}
            </p>
          )}

          {!loading && paginated.map(({ proc, num }) => (
            <button
              key={proc._id}
              onClick={() => handleProcedureClick(proc)}
              className="group mb-2 block w-full text-left transition-all duration-200 hover:-translate-y-1"
            >
              <Card className="transition-all duration-200 group-hover:border-primary group-hover:shadow-[0_6px_24px_-4px] group-hover:shadow-primary/40 group-hover:bg-primary/[0.04]">
                <div className="flex items-start gap-3">
                  <span className="proc-number shrink-0">#{num}</span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base font-semibold">{proc.name}</h3>
                    {proc.description && (
                      <p className="mt-1.5 text-sm text-muted-foreground">{proc.description}</p>
                    )}
                    {!proc.legacyRoute && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {proc.inputs.length} input(s) · {proc.steps.length} passo(s)
                      </p>
                    )}
                  </div>
                </div>
              </Card>
            </button>
          ))}

          {/* Pagination controls */}
          {!loading && totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between gap-4">
              <span className="text-xs text-muted-foreground">
                {filtered.length} resultado(s) · página {page} de {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  className="proc-page-btn"
                  aria-label="Primeira página"
                >
                  «
                </button>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="proc-page-btn"
                  aria-label="Página anterior"
                >
                  ‹
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
                  .reduce<(number | "…")[]>((acc, n, idx, arr) => {
                    if (idx > 0 && n - (arr[idx - 1] as number) > 1) acc.push("…");
                    acc.push(n);
                    return acc;
                  }, [])
                  .map((item, idx) =>
                    item === "…" ? (
                      <span key={`ellipsis-${idx}`} className="px-1 text-xs text-muted-foreground">
                        …
                      </span>
                    ) : (
                      <button
                        key={item}
                        onClick={() => setPage(item as number)}
                        className={`proc-page-btn ${page === item ? "proc-page-btn--active" : ""}`}
                      >
                        {item}
                      </button>
                    ),
                  )}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="proc-page-btn"
                  aria-label="Próxima página"
                >
                  ›
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                  className="proc-page-btn"
                  aria-label="Última página"
                >
                  »
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <style>{`
        .proc-search-input {
          width: 100%;
          padding: 0.5rem 0.75rem 0.5rem 2.25rem;
          background: var(--color-input);
          border: 1px solid var(--color-border);
          border-radius: 0.5rem;
          font-size: 0.875rem;
          color: var(--color-foreground);
          outline: none;
          transition: border-color .15s, box-shadow .15s;
        }
        .proc-search-input:focus {
          border-color: var(--color-primary);
          box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-primary) 20%, transparent);
        }
        .proc-number {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 2rem;
          padding: 0.1rem 0.4rem;
          background: color-mix(in oklab, var(--color-primary) 12%, transparent);
          color: var(--color-primary);
          border-radius: 0.375rem;
          font-size: 0.75rem;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          margin-top: 0.1rem;
        }
        .proc-page-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 2rem;
          height: 2rem;
          padding: 0 0.4rem;
          border: 1px solid var(--color-border);
          border-radius: 0.375rem;
          font-size: 0.8rem;
          color: var(--color-muted-foreground);
          background: transparent;
          transition: border-color .15s, color .15s, background .15s;
        }
        .proc-page-btn:hover:not(:disabled) {
          border-color: var(--color-primary);
          color: var(--color-primary);
        }
        .proc-page-btn:disabled {
          opacity: 0.35;
          cursor: not-allowed;
        }
        .proc-page-btn--active {
          background: var(--color-primary);
          border-color: var(--color-primary);
          color: var(--color-primary-foreground) !important;
          font-weight: 600;
        }
        .proc-page-size-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 2rem;
          height: 1.75rem;
          padding: 0 0.45rem;
          border: 1px solid var(--color-border);
          border-radius: 0.375rem;
          font-size: 0.75rem;
          color: var(--color-muted-foreground);
          background: transparent;
          transition: border-color .15s, color .15s, background .15s;
        }
        .proc-page-size-btn:hover {
          border-color: var(--color-primary);
          color: var(--color-primary);
        }
        .proc-page-size-btn--active {
          background: var(--color-primary);
          border-color: var(--color-primary);
          color: var(--color-primary-foreground) !important;
          font-weight: 600;
        }
      `}</style>
    </Shell>
  );
}
