import { createFileRoute, useNavigate } from "@tanstack/react-router";
import React, { useEffect, useMemo, useState } from "react";
import { Shell, BrandHeader, Spinner, ErrorBanner } from "@/components/Shell";
import { DbBadge, BackLink } from "@/components/DbBadge";
import { loadConfig } from "@/lib/atlas";
import { decodeToken } from "@/lib/auth";
import {
  fetchProcedures,
  updateProcedure,
  deleteProcedure,
  type ProcedureCatalog,
} from "@/lib/procedures-catalog";
import { fetchProjects, type Project } from "@/lib/projects";

export const Route = createFileRoute("/admin-nucleus/$nucleo")({
  head: ({ params }) => ({ meta: [{ title: `Pipeon — ${params.nucleo}` }] }),
  component: NucleusProceduresPage,
});

function NucleusProceduresPage() {
  const navigate = useNavigate();
  const { nucleo } = Route.useParams();

  const [procedures, setProcedures] = useState<ProcedureCatalog[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const cfg = loadConfig();
    const token = decodeToken();
    if (!cfg || (token?.role as string)?.toLowerCase() !== "admin") {
      void navigate({ to: "/menu" });
      return;
    }
    void loadData();
  }, [navigate]);

  const isSemVinculo = nucleo === "sem-vinculo";

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [procs, projs] = await Promise.all([fetchProcedures(), fetchProjects()]);
      setProcedures(
        isSemVinculo ? procs.filter((p) => !p.nucleo) : procs.filter((p) => p.nucleo === nucleo),
      );
      setProjects(projs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }

  function showFlash(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 3000);
  }

  async function handleDelete(id: string) {
    try {
      await deleteProcedure(id);
      setProcedures((prev) => prev.filter((p) => p._id !== id));
      showFlash("Procedimento removido.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao remover procedimento.");
    }
  }

  function handleNucleoMoved(id: string) {
    setProcedures((prev) => prev.filter((p) => p._id !== id));
  }

  const allNucleos = [...new Set(projects.flatMap((p) => p.nucleos ?? []))];

  const filtered = useMemo(() => {
    if (!search.trim()) return procedures;
    const q = search.toLowerCase();
    return procedures.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description?.toLowerCase().includes(q) ?? false),
    );
  }, [procedures, search]);

  return (
    <Shell>
      <DbBadge />
      <BackLink to="/admin" />
      <BrandHeader subtitle={false} />

      <div className="mb-6">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {isSemVinculo ? "Procedimentos" : "Núcleo"}
        </p>
        <h2 className="text-xl font-semibold">
          {isSemVinculo ? "Sem vínculo" : nucleo}
        </h2>
        {!loading && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            {procedures.length} procedimento(s)
          </p>
        )}
      </div>

      {/* Barra de pesquisa */}
      <div className="mb-5">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 select-none text-muted-foreground">
            ⌕
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou descrição…"
            className="w-full rounded-lg border border-border bg-input py-2.5 pl-9 pr-10 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          )}
        </div>
        {search && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {filtered.length} resultado(s) para &quot;{search}&quot;
          </p>
        )}
      </div>

      <ErrorBanner message={error} />

      {flash && (
        <div className="mb-4 rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
          {flash}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Spinner /> Carregando…
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {search ? `Nenhum resultado para "${search}".` : "Nenhum procedimento neste núcleo."}
        </p>
      ) : (
        <div className="rounded-xl border border-border">
          <div className="divide-y divide-border">
            {filtered.map((proc, i) => (
              <ProcedureDetailRow
                key={proc._id}
                proc={proc}
                index={i}
                project={projects.find((p) => p._id === proc.projectId)}
                allNucleos={allNucleos}
                onMoved={() => proc._id && handleNucleoMoved(proc._id)}
                onDelete={() => proc._id && void handleDelete(proc._id)}
              />
            ))}
          </div>
        </div>
      )}

      <NucleoPageStyle />
    </Shell>
  );
}

// ─── Procedure row ────────────────────────────────────────────────────────────

function ProcedureDetailRow({
  proc,
  index,
  project,
  allNucleos,
  onMoved,
  onDelete,
}: {
  proc: ProcedureCatalog;
  index: number;
  project: Project | undefined;
  allNucleos: string[];
  onMoved: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSaveError(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleSelect(newNucleo: string) {
    if (!proc._id || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await updateProcedure(proc._id, { nucleo: newNucleo || undefined });
      setOpen(false);
      onMoved();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-start gap-4 px-5 py-4 transition hover:bg-muted/10 first:rounded-t-xl last:rounded-b-xl">
      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-[11px] font-semibold text-muted-foreground">
        {index + 1}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{proc.name}</span>
          <span
            className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${
              proc.isActive ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
            }`}
          >
            {proc.isActive ? "Ativo" : "Inativo"}
          </span>
          {project && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
              {project.name}
            </span>
          )}
        </div>
        {proc.description && (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {proc.description}
          </p>
        )}
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          {proc.inputs.length} input(s) · {proc.steps.length} passo(s)
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        {/* Dropdown para mover núcleo */}
        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => {
              setOpen((v) => !v);
              setSaveError(null);
            }}
            disabled={saving}
            title="Mover para outro núcleo"
            className="move-btn"
          >
            {saving ? (
              <>
                <Spinner /> Movendo…
              </>
            ) : (
              <>
                Mover
                <svg width="8" height="5" viewBox="0 0 10 6" fill="currentColor">
                  <path d="M0 0l5 6 5-6H0z" />
                </svg>
              </>
            )}
          </button>

          {open && (
            <div className="absolute right-0 top-full z-20 mt-1 min-w-[160px] overflow-hidden rounded-lg border border-border bg-card shadow-lg">
              {proc.nucleo && (
                <button
                  onClick={() => void handleSelect("")}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] text-muted-foreground transition hover:bg-muted/40"
                >
                  <span className="text-[10px]">✕</span> Remover do núcleo
                </button>
              )}
              <div className={proc.nucleo ? "border-t border-border" : ""}>
                {allNucleos.map((n) => (
                  <button
                    key={n}
                    onClick={() => void handleSelect(n)}
                    disabled={proc.nucleo === n}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-[11px] font-medium transition hover:bg-muted/40 ${
                      proc.nucleo === n ? "text-primary" : "text-foreground"
                    }`}
                  >
                    {n}
                    {proc.nucleo === n && <span className="text-primary">✓</span>}
                  </button>
                ))}
              </div>
              {saveError && (
                <p className="border-t border-border px-3 py-2 text-[11px] text-destructive">
                  {saveError}
                </p>
              )}
            </div>
          )}
        </div>

        <button onClick={onDelete} className="danger-btn">
          Remover
        </button>
      </div>
    </div>
  );
}

function NucleoPageStyle() {
  return (
    <style>{`
      .danger-btn {
        display: inline-flex; align-items: center; justify-content: center;
        background: var(--color-destructive); color: #fff;
        font-size: .8rem; font-weight: 600; padding: .4rem .85rem; border-radius: .5rem;
        transition: filter .15s;
      }
      .danger-btn:hover { filter: brightness(1.1); }
      .move-btn {
        display: inline-flex; align-items: center; gap: .25rem;
        border: 1px dashed var(--color-border); color: var(--color-muted-foreground);
        font-size: .7rem; font-weight: 500; padding: .25rem .5rem; border-radius: .5rem;
        transition: border-color .15s, color .15s;
      }
      .move-btn:hover { border-color: color-mix(in oklab, var(--color-primary) 40%, transparent); color: var(--color-foreground); }
      .move-btn:disabled { opacity: .6; cursor: not-allowed; }
    `}</style>
  );
}
