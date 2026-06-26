import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import JSZip from "jszip";
import { Shell, BrandHeader, Card, Spinner, ErrorBanner, ReadOnlyBanner } from "@/components/Shell";
import { DbBadge, BackLink } from "@/components/DbBadge";
import { atlasCall } from "@/lib/atlas";
import { useIsReadOnly } from "@/hooks/use-permission";

export const Route = createFileRoute("/restore")({
  head: () => ({ meta: [{ title: "Pipeon — Restaurar backup" }] }),
  component: RestorePage,
});

type LoadedDoc = { fileName: string; submissionNumber: string; doc: Record<string, unknown>; collection: string };

// Converts plain 24-hex-char strings to {$oid:"..."} so the server's
// resolveExtendedJson restores them as ObjectId, preserving query compatibility.
function wrapObjectIds(val: unknown): unknown {
  if (typeof val === "string" && /^[0-9a-f]{24}$/.test(val)) return { $oid: val };
  if (val === null || val === undefined) return val;
  if (Array.isArray(val)) return val.map(wrapObjectIds);
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    if ("$oid" in obj || "$date" in obj) return val;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = wrapObjectIds(v);
    return out;
  }
  return val;
}

function RestorePage() {
  const navigate = useNavigate();
  const readOnly = useIsReadOnly();
  const [docs, setDocs] = useState<LoadedDoc[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [docSearch, setDocSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<{
    ok: number;
    errors: { file: string; error: string }[];
  } | null>(null);

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    setDocs([]);
    setSelectedIds(new Set());
    setDocSearch("");
    try {
      if (file.name.endsWith(".json")) {
        const text = await file.text();
        const parsed = JSON.parse(text) as Record<string, unknown>;

        // Formato wrapper gerado pelo Pipeon: { collection, documents: [...] }
        if (typeof parsed.collection === "string" && Array.isArray(parsed.documents)) {
          const collection = parsed.collection as string;
          const documents = parsed.documents as Record<string, unknown>[];
          if (documents.length === 0) {
            setError("O arquivo de backup não contém documentos.");
            return;
          }
          const loaded = documents.map((d, i) => ({
            fileName: `${collection}-doc-${i + 1}`,
            submissionNumber:
              (d.submission as { submissionNumber?: string } | undefined)?.submissionNumber ||
              String(d._id),
            doc: d,
            collection,
          }));
          setDocs(loaded);
          setSelectedIds(new Set(loaded.map((d) => d.fileName)));
          return;
        }

        // Formato legado: documento único de evaluations
        const submission =
          (parsed.submission as { submissionNumber?: string } | undefined)?.submissionNumber ||
          String(parsed._id);
        const loaded = [{ fileName: file.name, submissionNumber: submission, doc: parsed, collection: "evaluations" }];
        setDocs(loaded);
        setSelectedIds(new Set([file.name]));
        return;
      }
      if (!file.name.endsWith(".zip")) {
        setError("Selecione um arquivo .zip ou .json.");
        return;
      }
      const zip = await JSZip.loadAsync(file);
      const loaded: LoadedDoc[] = [];
      const entries = Object.values(zip.files).filter(
        (f) => !f.dir && f.name.endsWith(".json"),
      );
      for (const entry of entries) {
        const text = await entry.async("string");
        try {
          const parsed = JSON.parse(text) as Record<string, unknown>;

          // Novo formato: wrapper com collection + documents[]
          if (typeof parsed.collection === "string" && Array.isArray(parsed.documents)) {
            const collection = parsed.collection as string;
            for (const d of parsed.documents as Record<string, unknown>[]) {
              const submission =
                (d.submission as { submissionNumber?: string } | undefined)?.submissionNumber ||
                String(d._id);
              loaded.push({
                fileName: `${entry.name}::${String(d._id)}`,
                submissionNumber: submission,
                doc: d,
                collection,
              });
            }
          } else {
            // Formato legado: documento único de evaluations
            const submission =
              (parsed.submission as { submissionNumber?: string } | undefined)?.submissionNumber ||
              String(parsed._id);
            loaded.push({ fileName: entry.name, submissionNumber: submission, doc: parsed, collection: "evaluations" });
          }
        } catch {
          // skip invalid
        }
      }
      if (loaded.length === 0) {
        setError("Nenhum documento .json válido encontrado no zip.");
        return;
      }
      setDocs(loaded);
      setSelectedIds(new Set(loaded.map((d) => d.fileName)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao ler arquivo.");
    }
  }

  async function handleRestore() {
    setError(null);
    setResult(null);
    const target = docs.filter((d) => selectedIds.has(d.fileName));
    if (target.length === 0) {
      setError("Nenhum documento selecionado para restaurar.");
      return;
    }

    setLoading(true);
    setProgress({ current: 0, total: target.length });
    const errors: { file: string; error: string }[] = [];
    let ok = 0;

    for (let i = 0; i < target.length; i++) {
      const d = target[i];
      try {
        const id = d.doc._id;
        const filter =
          typeof id === "object" && id !== null && "$oid" in (id as Record<string, unknown>)
            ? { _id: id }
            : typeof id === "string"
              ? { _id: { $oid: id } }
              : { _id: id };
        const { _id, ...rawReplacement } = d.doc as Record<string, unknown>;
        void _id;
        // Wrap 24-char hex strings as {$oid} so the server restores ObjectId types
        // correctly (plain strings break queries that filter by ObjectId references).
        const replacement = wrapObjectIds(rawReplacement) as Record<string, unknown>;
        await atlasCall("replaceOne", d.collection, { filter, replacement });
        ok++;
      } catch (err) {
        errors.push({
          file: d.fileName,
          error: err instanceof Error ? err.message : String(err),
        });
      }
      setProgress({ current: i + 1, total: target.length });
    }

    setLoading(false);
    setResult({ ok, errors });
  }

  // ── Preview data ──────────────────────────────────────────────────────────
  const statusBreakdown = computeStatusBreakdown(docs);
  const filteredDocs = docs.filter((d) => {
    if (!docSearch.trim()) return true;
    const q = docSearch.toLowerCase();
    return (
      d.submissionNumber.toLowerCase().includes(q) ||
      d.fileName.toLowerCase().includes(q)
    );
  });

  function toggleAll() {
    if (filteredDocs.every((d) => selectedIds.has(d.fileName))) {
      const next = new Set(selectedIds);
      filteredDocs.forEach((d) => next.delete(d.fileName));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      filteredDocs.forEach((d) => next.add(d.fileName));
      setSelectedIds(next);
    }
  }

  const allFilteredSelected = filteredDocs.length > 0 && filteredDocs.every((d) => selectedIds.has(d.fileName));

  return (
    <Shell>
      <DbBadge />
      <BackLink to="/menu" />
      <BrandHeader subtitle={false} />
      {readOnly && <ReadOnlyBanner />}
      <Card>
        <h2 className="mb-1 text-lg font-semibold">🔄 Restaurar backup</h2>
        <p className="mb-5 text-sm text-muted-foreground">
          Selecione o arquivo .zip de backup gerado anteriormente (ou um .json individual).
        </p>

        {/* Upload area */}
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-muted/20 px-4 py-8 text-sm text-muted-foreground transition hover:border-primary/60 hover:text-foreground">
          <span className="text-2xl">⬆</span>
          <span className="mt-2">
            {docs.length > 0
              ? `${docs.length} documento(s) carregado(s) — clique para trocar o arquivo`
              : "Clique para selecionar um arquivo .zip ou .json"}
          </span>
          <input
            type="file"
            accept=".zip,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
        </label>

        {docs.length > 0 && !result && (
          <div className="mt-6 space-y-4">
            {/* Preview summary */}
            <div className="rounded-md border border-border bg-muted/30 p-4">
              <p className="mb-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Preview do backup
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <PreviewStat label="Total de documentos" value={String(docs.length)} />
                {statusBreakdown.map(({ status, count }) => (
                  <PreviewStat
                    key={status}
                    label={`Status: ${STATUS_LABELS[status] ?? status}`}
                    value={String(count)}
                  />
                ))}
              </div>
            </div>

            {/* Document selection */}
            <div className="rounded-md border border-border">
              <div className="flex items-center justify-between border-b border-border px-3 py-2">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 accent-[var(--color-primary)]"
                  />
                  <span className="text-xs font-medium">
                    {selectedIds.size} de {docs.length} selecionado(s)
                  </span>
                </div>
                <input
                  type="text"
                  value={docSearch}
                  onChange={(e) => setDocSearch(e.target.value)}
                  placeholder="Filtrar…"
                  className="rounded border border-border bg-card px-2 py-1 text-xs outline-none focus:border-primary/60"
                  style={{ width: 140 }}
                />
              </div>
              <ul className="max-h-56 overflow-y-auto divide-y divide-border">
                {filteredDocs.map((d) => (
                  <li key={d.fileName}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-accent">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(d.fileName)}
                        onChange={() => {
                          const next = new Set(selectedIds);
                          if (next.has(d.fileName)) next.delete(d.fileName);
                          else next.add(d.fileName);
                          setSelectedIds(next);
                        }}
                        className="h-4 w-4 accent-[var(--color-primary)]"
                      />
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs">{d.submissionNumber}</p>
                        <p className="truncate text-[10px] text-muted-foreground/60">
                          {d.fileName}
                        </p>
                      </div>
                    </label>
                  </li>
                ))}
                {filteredDocs.length === 0 && (
                  <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                    Nenhum documento encontrado.
                  </li>
                )}
              </ul>
            </div>

            <button
              onClick={handleRestore}
              disabled={readOnly || loading || selectedIds.size === 0}
              title={readOnly ? "Seu perfil tem acesso apenas para visualização." : undefined}
              className="btn-primary w-full"
            >
              {loading ? (
                <>
                  <Spinner /> Restaurando…
                </>
              ) : (
                `Restaurar ${selectedIds.size} documento(s) selecionado(s)`
              )}
            </button>

            {loading && (
              <div>
                <div className="mb-1 text-xs text-muted-foreground">
                  {progress.current} de {progress.total} documentos restaurados
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{
                      width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <ErrorBanner message={error} />

        {result && (
          <div className="mt-6 space-y-3">
            <div className="rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
              ✓ {result.ok} documento(s) restaurado(s) com sucesso
              {result.errors.length > 0 && ` — ${result.errors.length} erro(s)`}
            </div>
            {result.errors.length > 0 && (
              <details className="rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <summary className="cursor-pointer">Ver erros</summary>
                <ul className="mt-2 space-y-1 text-xs">
                  {result.errors.map((e, i) => (
                    <li key={i} className="font-mono">
                      {e.file}: {e.error}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <button onClick={() => navigate({ to: "/menu" })} className="btn-ghost w-full">
              Voltar ao menu
            </button>
          </div>
        )}
      </Card>
    </Shell>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  NOTSTARTED: "Não iniciado",
  STARTED: "Em andamento",
  SUBMITTED: "Submetido",
  COMPLETED: "Concluído",
  INPROGRESS: "Em progresso",
  PENDING: "Pendente",
  APPROVED: "Aprovado",
  REJECTED: "Reprovado",
  CANCELLED: "Cancelado",
};

function computeStatusBreakdown(docs: LoadedDoc[]): { status: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const d of docs) {
    const status = String(d.doc.status ?? "");
    if (status) counts[status] = (counts[status] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({ status, count }));
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-primary">{value}</p>
    </div>
  );
}

