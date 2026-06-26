import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import JSZip from "jszip";
import fileSaver from "file-saver";
const { saveAs } = fileSaver;
import { Shell, BrandHeader, Card, Spinner, ErrorBanner } from "@/components/Shell";
import { DbBadge, BackLink } from "@/components/DbBadge";
import { fetchLogs, type ProcedureLog, type DiffSnapshot } from "@/lib/history";
import { fetchOperations, type Operation } from "@/lib/operations";
import { atlasCall, loadConfig, API_BASE } from "@/lib/atlas";
import { fetchProcedures } from "@/lib/procedures-catalog";

export const Route = createFileRoute("/history")({
  head: () => ({ meta: [{ title: "Pipeon — Histórico" }] }),
  component: HistoryPage,
});

const PAGE_SIZE_OPTIONS = [5, 10, 20, 30];

// ─── Unified display type ─────────────────────────────────────────────────────

interface ChangelogStep {
  stepIndex: number;
  collection: string;
  operation: string;
  result: string;
  documentCount: number;
  backupId?: string;
  matchedCount?: number;
  filter?: Record<string, unknown>;
  update?: Record<string, unknown>;
  changes?: string[];
  stepName?: string;
  stepDescription?: string;
}

function deriveChangesFromTemplate(update: Record<string, unknown>): string[] {
  const lines: string[] = [];
  for (const [op, fields] of Object.entries(update)) {
    if (typeof fields !== "object" || fields === null) continue;
    for (const [field, value] of Object.entries(fields as Record<string, unknown>)) {
      if (op === "$set") lines.push(`$set: ${field} → ${JSON.stringify(value)}`);
      else if (op === "$unset") lines.push(`$unset: ${field}`);
      else lines.push(`${op}: ${field}`);
    }
  }
  return lines;
}

interface HistoryEntry {
  _id: string;
  ticketId: string;
  procedureName: string;
  procedureId?: string;
  executedBy: string;
  executedByName?: string;
  executedAt: string;
  database: string;
  projectName?: string;
  autoExecuted?: boolean;
  // legacy
  affectedCount?: number;
  steps?: ProcedureLog["steps"];
  diffSnapshot?: DiffSnapshot;
  evaluatorName?: string;
  evaluatorEmail?: string;
  noticeId?: string;
  evaluatorUserId?: string;
  // new model
  affectedDocs?: Record<string, number>;
  status?: "success" | "error";
  source: "legacy" | "operation";
}

function fromLog(log: ProcedureLog): HistoryEntry {
  return {
    _id: String(log._id ?? ""),
    ticketId: log.ticket,
    procedureName: log.procedureName,
    executedBy: log.executedBy,
    executedByName: log.executedByName,
    executedAt: log.executedAt,
    database: log.database,
    autoExecuted: log.autoExecuted,
    affectedCount: log.affectedCount,
    steps: log.steps,
    diffSnapshot: log.diffSnapshot,
    evaluatorName: log.evaluatorName,
    evaluatorEmail: log.evaluatorEmail,
    noticeId: log.noticeId,
    evaluatorUserId: log.evaluatorUserId,
    source: "legacy",
  };
}

function fromOperation(op: Operation): HistoryEntry {
  return {
    _id: String(op._id ?? ""),
    ticketId: op.ticketId,
    procedureName: op.procedureName,
    procedureId: op.procedureId,
    executedBy: op.executedBy,
    executedByName: op.executedByName,
    executedAt: op.executedAt,
    database: op.database,
    projectName: op.projectName,
    affectedDocs: op.affectedDocs,
    status: op.status,
    source: "operation",
  };
}

function pipeonAuthHeaders(): Record<string, string> {
  const cfg = loadConfig();
  return { "Content-Type": "application/json", Authorization: `Bearer ${cfg?.token ?? ""}` };
}

async function fetchChangelog(ticketId: string, procedureId: string): Promise<ChangelogStep[]> {
  const params = new URLSearchParams({ ticketId, procedureId });
  try {
    const res = await fetch(`${API_BASE}/api/pipeon/changelogs?${params}`, {
      headers: pipeonAuthHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json() as { documents: Array<{ steps?: ChangelogStep[] }> };
    return data.documents?.[0]?.steps ?? [];
  } catch {
    return [];
  }
}

async function downloadBackupById(backupId: string, collection: string, ticket: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/pipeon/backup/${backupId}`, {
    headers: pipeonAuthHeaders(),
  });
  if (!res.ok) throw new Error("Backup não encontrado.");
  const doc = await res.json();
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
  const ts = new Date().toISOString().slice(0, 10);
  saveAs(blob, `backup-${collection}-${ticket}-${ts}.json`);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function HistoryPage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [filterExecutor, setFilterExecutor] = useState("");
  const [filterDatabase, setFilterDatabase] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterProcedure, setFilterProcedure] = useState("");

  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!loadConfig()) {
      navigate({ to: "/" });
      return;
    }
    Promise.all([fetchLogs(), fetchOperations()])
      .then(([logs, ops]) => {
        const all = [
          ...logs.map(fromLog),
          ...ops.map(fromOperation),
        ].sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime());
        setEntries(all);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar histórico."))
      .finally(() => setLoading(false));
  }, [navigate]);

  const uniqueDatabases = [...new Set(entries.map((e) => e.database).filter(Boolean))];
  const uniqueProcedures = [...new Set(entries.map((e) => e.procedureName).filter(Boolean))];

  const activeFilterCount = [filterExecutor, filterDatabase, filterFrom, filterTo, filterProcedure]
    .filter(Boolean).length;

  function clearFilters() {
    setFilterExecutor("");
    setFilterDatabase("");
    setFilterFrom("");
    setFilterTo("");
    setFilterProcedure("");
  }

  const filtered = entries.filter((e) => {
    const q = search.toLowerCase();
    const matchSearch =
      !search.trim() ||
      e.ticketId.toLowerCase().includes(q) ||
      e.procedureName.toLowerCase().includes(q) ||
      (e.evaluatorName ?? "").toLowerCase().includes(q) ||
      (e.evaluatorEmail ?? "").toLowerCase().includes(q) ||
      (e.projectName ?? "").toLowerCase().includes(q);

    const matchExecutor =
      !filterExecutor.trim() ||
      e.executedBy.toLowerCase().includes(filterExecutor.toLowerCase());

    const matchDatabase = !filterDatabase || e.database === filterDatabase;

    const logDate = new Date(e.executedAt).toISOString().slice(0, 10);
    const matchFrom = !filterFrom || logDate >= filterFrom;
    const matchTo = !filterTo || logDate <= filterTo;

    const matchProcedure = !filterProcedure || e.procedureName === filterProcedure;

    return matchSearch && matchExecutor && matchDatabase && matchFrom && matchTo && matchProcedure;
  });

  // Reset para a primeira página sempre que busca, filtros ou tamanho de página mudarem
  useEffect(() => {
    setPage(1);
  }, [search, filterExecutor, filterDatabase, filterFrom, filterTo, filterProcedure, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  return (
    <Shell>
      <DbBadge />
      <BackLink to="/menu" />
      <BrandHeader subtitle={false} />

      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm uppercase tracking-wider text-muted-foreground">
          📜 Histórico de operações
        </h2>
        {!loading && (
          <span className="text-xs text-muted-foreground">{entries.length} registro(s)</span>
        )}
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por chamado, procedimento, projeto ou avaliador…"
          className="input min-w-0 flex-1"
        />
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`shrink-0 rounded-lg border px-3 py-2 text-xs transition ${
            showFilters || activeFilterCount > 0
              ? "border-primary/60 bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
          }`}
        >
          {activeFilterCount > 0 ? `Filtros (${activeFilterCount})` : "Filtros"}
        </button>
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

      {showFilters && (
        <div className="mb-5 space-y-3 rounded-lg border border-border bg-muted/20 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <FilterField label="Executor">
              <input
                value={filterExecutor}
                onChange={(e) => setFilterExecutor(e.target.value)}
                className="input"
                placeholder="email@..."
              />
            </FilterField>
            <FilterField label="Banco de dados">
              <select
                value={filterDatabase}
                onChange={(e) => setFilterDatabase(e.target.value)}
                className="input"
              >
                <option value="">Todos</option>
                {uniqueDatabases.map((db) => (
                  <option key={db} value={db}>{db}</option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Tipo de procedimento">
              <select
                value={filterProcedure}
                onChange={(e) => setFilterProcedure(e.target.value)}
                className="input"
              >
                <option value="">Todos</option>
                {uniqueProcedures.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Período (de / até)">
              <div className="flex gap-2">
                <input
                  type="date"
                  value={filterFrom}
                  onChange={(e) => setFilterFrom(e.target.value)}
                  className="input flex-1"
                />
                <input
                  type="date"
                  value={filterTo}
                  onChange={(e) => setFilterTo(e.target.value)}
                  className="input flex-1"
                />
              </div>
            </FilterField>
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={clearFilters}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Spinner /> Carregando…
        </div>
      )}

      <ErrorBanner message={error} />

      {!loading && filtered.length === 0 && !error && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {search || activeFilterCount > 0
            ? "Nenhum resultado encontrado."
            : "Nenhuma operação registrada ainda."}
        </p>
      )}

      <div className="space-y-3">
        {paginated.map((entry, i) => (
          <LogCard key={entry._id || i} entry={entry} />
        ))}
      </div>

      {!loading && filtered.length > 0 && totalPages > 1 && (
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

      <Style />
    </Shell>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  status: "Status",
  evaluationAverage: "Média da avaliação",
  evaluationAverageByBlocks: "Médias por bloco",
  evaluationSum: "Soma da avaliação",
  submittedDate: "Data de submissão",
  evaluatorNote: "Nota do avaliador",
  evaluatorId: "ID do avaliador",
  evaluatorName: "Nome do avaliador",
  "phaseForm.blocks[].fields[].value": "Valores dos campos do formulário",
  "phaseForm.blocks[].sumValue": "Subtotais do formulário",
  scoreFinal: "Nota final",
  rankingScore: "Pontuação no ranking",
  score: "Pontuação",
  phase: "Fase",
  evaluationStatus: "Status de avaliação",
  isActive: "Conta ativa",
  role: "Perfil de acesso",
};

const STATUS_LABELS: Record<string, string> = {
  NOTSTARTED: "Avaliações pendentes",
  PENDING:    "Avaliações pendentes",
  STARTED:    "Rascunhos",
  INPROGRESS: "Rascunhos",
  SUBMITTED:  "Avaliações concluídas",
  COMPLETE:   "Avaliações concluídas",
  COMPLETED:  "Avaliações concluídas",
  APPROVED:   "Avaliações concluídas",
  REJECTED:   "Reprovado",
  CANCELLED:  "Cancelado",
};

const STEP_DESCRIPTIONS: Record<string, string> = {
  Backup:
    "Cópia de segurança dos documentos realizada antes de qualquer alteração.",
  "Reset de status":
    "O status das avaliações foi redefinido para que os avaliadores possam recomeçar.",
  "Limpeza de formulário":
    "Os campos preenchidos nos formulários de avaliação foram apagados.",
};

function humanizeChange(change: string): { human: string; technical: string } {
  const setMatch = change.match(/^\$set:\s*(.+?)\s*[→>]\s*(.+)$/);
  if (setMatch) {
    const fieldLabel = FIELD_LABELS[setMatch[1].trim()] ?? setMatch[1].trim();
    const valueLabel = STATUS_LABELS[setMatch[2].trim()] ?? `"${setMatch[2].trim()}"`;
    return { human: `${fieldLabel} definido como ${valueLabel}`, technical: change };
  }
  const unsetMatch = change.match(/^\$unset:\s*(.+)$/);
  if (unsetMatch) {
    const fieldLabel = FIELD_LABELS[unsetMatch[1].trim()] ?? unsetMatch[1].trim();
    return { human: `${fieldLabel} removido/limpo`, technical: change };
  }
  if (change.startsWith("Arquivo gerado:")) {
    return { human: `Arquivo de backup gerado: ${change.replace("Arquivo gerado:", "").trim()}`, technical: change };
  }
  return { human: change, technical: change };
}

function affectedDocsSummary(docs: Record<string, number>): string {
  return Object.entries(docs)
    .map(([col, count]) => `${count} ${col}`)
    .join(", ");
}

// ─── PDF export ───────────────────────────────────────────────────────────────

function exportToPdf(entry: HistoryEntry) {
  const date = new Date(entry.executedAt).toLocaleString("pt-BR");
  const evaluator = [entry.evaluatorName, entry.evaluatorEmail].filter(Boolean).join(" — ");

  const stepsHtml = (entry.steps ?? [])
    .map((s) => {
      const desc = STEP_DESCRIPTIONS[s.name] ?? "";
      const changesHtml = s.changes?.length
        ? `<ul class="changes">${s.changes.map((c) => {
            const { human, technical } = humanizeChange(c);
            const isSame = human === technical;
            return `<li><span class="change-human">${human}</span>${!isSame ? `<span class="change-tech">${technical}</span>` : ""}</li>`;
          }).join("")}</ul>`
        : "";
      return `<div class="step"><div class="step-name">✓ ${s.name}</div><div class="step-detail">${s.detail}</div>${desc ? `<div class="step-desc">${desc}</div>` : ""}${changesHtml}</div>`;
    })
    .join("");

  const affectedRow = entry.affectedCount != null
    ? `<tr><td>Documentos afetados</td><td>${entry.affectedCount}</td></tr>`
    : entry.affectedDocs
    ? `<tr><td>Documentos afetados</td><td>${affectedDocsSummary(entry.affectedDocs)}</td></tr>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório — #${entry.ticketId}</title>
  <style>
    body{font-family:Arial,sans-serif;max-width:720px;margin:40px auto;color:#111;font-size:14px}
    h1{font-size:18px;margin:6px 0 0}
    .badge{display:inline-block;background:#e8f4ff;color:#0057b8;padding:2px 10px;border-radius:4px;font-family:monospace;font-size:13px;font-weight:700}
    table{width:100%;border-collapse:collapse;margin:18px 0}
    td{padding:8px 12px;border:1px solid #ddd;font-size:13px}
    td:first-child{font-weight:700;color:#555;width:170px;background:#f9f9f9}
    .section{font-size:11px;text-transform:uppercase;letter-spacing:.6px;color:#888;margin:22px 0 8px;font-weight:700}
    .step{border:1px solid #ddd;border-radius:4px;padding:10px 14px;margin-bottom:8px}
    .step-name{font-weight:700;font-size:13px}
    .step-detail{color:#444;font-size:13px;margin-top:3px}
    .step-desc{color:#777;font-size:12px;margin-top:4px;font-style:italic}
    .changes{font-size:12px;color:#333;margin:8px 0 0;list-style:none;padding:0;border-top:1px solid #eee;padding-top:6px}
    .changes li{margin-bottom:5px;display:flex;flex-direction:column;gap:1px}
    .change-human{color:#222}
    .change-tech{font-family:monospace;font-size:10px;color:#aaa}
    .footer{margin-top:32px;font-size:11px;color:#aaa;border-top:1px solid #eee;padding-top:8px}
    @media print{body{margin:20px}}
  </style>
</head>
<body>
  <span class="badge">#${entry.ticketId}</span>
  <h1>${entry.procedureName}</h1>
  <table>
    <tr><td>Executado por</td><td>${entry.executedBy}</td></tr>
    <tr><td>Data / hora</td><td>${date}</td></tr>
    <tr><td>Banco de dados</td><td>${entry.database}</td></tr>
    ${entry.projectName ? `<tr><td>Projeto</td><td>${entry.projectName}</td></tr>` : ""}
    ${affectedRow}
    ${evaluator ? `<tr><td>Avaliador</td><td>${evaluator}</td></tr>` : ""}
    ${entry.noticeId ? `<tr><td>Ciclo (ObjectId)</td><td style="font-family:monospace;font-size:12px">${entry.noticeId}</td></tr>` : ""}
  </table>
  ${stepsHtml ? `<p class="section">Etapas executadas</p>${stepsHtml}` : ""}
  <div class="footer">Gerado por Pipeon em ${new Date().toLocaleString("pt-BR")}</div>
  <script>window.onload=function(){window.print()}<\/script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=800,height=600");
  if (!win) return;
  win.document.write(html);
  win.document.close();
}

// ─── Backup download (legacy only) ───────────────────────────────────────────

async function downloadBackup(entry: HistoryEntry): Promise<void> {
  if (!entry.noticeId || !entry.evaluatorUserId) return;
  const res = await atlasCall<{ documents: Array<Record<string, unknown>> }>(
    "find",
    "evaluations",
    {
      filter: {
        notice: { $oid: entry.noticeId },
        "noticeEvaluator.userId": { $oid: entry.evaluatorUserId },
      },
      limit: 100000,
    },
  );
  const docs = res.documents ?? [];
  if (docs.length === 0) throw new Error("Nenhuma avaliação encontrada para este procedimento.");
  const zip = new JSZip();
  for (const doc of docs) {
    const submission = (doc.submission as { submissionNumber?: string } | undefined)?.submissionNumber || String(doc._id);
    const safeName = `Evaluation - ${String(submission).replace(/\//g, "-")}.json`;
    zip.file(safeName, JSON.stringify(doc, null, 2));
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const ts = new Date(entry.executedAt).toISOString().slice(0, 10);
  saveAs(blob, `backup-hist-${entry.ticketId}-${ts}.zip`);
}

// ─── Log Card ─────────────────────────────────────────────────────────────────

function LogCard({ entry }: { entry: HistoryEntry }) {
  const [open, setOpen] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [changelogSteps, setChangelogSteps] = useState<ChangelogStep[] | null>(null);
  const [changelogLoading, setChangelogLoading] = useState(false);
  const [stepDlLoading, setStepDlLoading] = useState<string | null>(null);

  useEffect(() => {
    if (open && entry.source === "operation" && entry.procedureId && changelogSteps === null) {
      setChangelogLoading(true);
      Promise.all([
        fetchChangelog(entry.ticketId, entry.procedureId),
        fetchProcedures().catch(() => []),
      ])
        .then(([steps, procs]) => {
          const proc = procs.find((p) => p._id === entry.procedureId);
          const enriched: ChangelogStep[] = steps.map((step) => {
            const enrichedStep: ChangelogStep = { ...step };
            if (proc) {
              const procStep = proc.steps[step.stepIndex - 1];
              if (procStep) {
                if (!enrichedStep.stepName && procStep.name) enrichedStep.stepName = procStep.name;
                if (!enrichedStep.stepDescription && procStep.description) enrichedStep.stepDescription = procStep.description;
                if (!enrichedStep.changes && procStep.update) {
                  const derived = deriveChangesFromTemplate(procStep.update);
                  if (derived.length > 0) enrichedStep.changes = derived;
                }
              }
            }
            return enrichedStep;
          });
          setChangelogSteps(enriched);
        })
        .catch(() => setChangelogSteps([]))
        .finally(() => setChangelogLoading(false));
    }
  }, [open, entry.source, entry.procedureId, entry.ticketId, changelogSteps]);

  const date = new Date(entry.executedAt).toLocaleString("pt-BR");
  const evaluator = [entry.evaluatorName, entry.evaluatorEmail].filter(Boolean).join(" — ");
  const canBackup = entry.source === "legacy" && !!(entry.noticeId && entry.evaluatorUserId);

  async function handleBackup(e: React.MouseEvent) {
    e.stopPropagation();
    setBackupError(null);
    setBackupLoading(true);
    try {
      await downloadBackup(entry);
    } catch (err) {
      setBackupError(err instanceof Error ? err.message : "Erro ao gerar backup.");
    } finally {
      setBackupLoading(false);
    }
  }

  return (
    <Card className="p-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start justify-between gap-4 p-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-primary/15 px-2 py-0.5 font-mono text-xs font-semibold text-primary">
              #{entry.ticketId}
            </span>
            <span className="truncate text-sm font-medium">{entry.procedureName}</span>
            {entry.autoExecuted && (
              <span className="rounded border border-blue-500/30 bg-blue-500/10 px-1.5 py-px text-[10px] font-medium text-blue-400">
                automático
              </span>
            )}
            {entry.status === "error" && (
              <span className="rounded border border-destructive/30 bg-destructive/10 px-1.5 py-px text-[10px] font-medium text-destructive">
                erro
              </span>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
            <span>{date}</span>
            <span>
              por{" "}
              <span className="font-medium text-foreground">
                {entry.executedByName || entry.executedBy}
              </span>
            </span>
            <span className="rounded border border-border px-1.5 py-px font-mono">
              {entry.database}
            </span>
            {entry.projectName && (
              <span className="rounded border border-border px-1.5 py-px">
                {entry.projectName}
              </span>
            )}
            {entry.diffSnapshot && (
              <span className="rounded border border-primary/30 bg-primary/5 px-1.5 py-px text-primary">
                diff
              </span>
            )}
          </div>
        </div>
        <div className="mt-1 flex shrink-0 items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); exportToPdf(entry); }}
            className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
          >
            PDF
          </button>
          {canBackup && (
            <button
              onClick={handleBackup}
              disabled={backupLoading}
              className="rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition hover:border-primary/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              {backupLoading ? <Spinner /> : "Backup"}
            </button>
          )}
          <span className="text-xs text-muted-foreground">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {backupError && (
        <div className="border-t border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          {backupError}
        </div>
      )}

      {open && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {evaluator && <InfoRow label="Avaliador" value={evaluator} />}
            <InfoRow label="Executado por" value={entry.executedByName ? `${entry.executedByName} (${entry.executedBy})` : entry.executedBy} />
            {entry.affectedCount != null && (
              <InfoRow label="Avaliações afetadas" value={String(entry.affectedCount)} />
            )}
            {entry.affectedDocs && (
              <InfoRow label="Documentos afetados" value={affectedDocsSummary(entry.affectedDocs)} />
            )}
            {entry.noticeId && <InfoRow label="Ciclo (ObjectId)" value={entry.noticeId} mono />}
            {entry.projectName && <InfoRow label="Projeto" value={entry.projectName} />}
          </dl>

          {entry.steps && entry.steps.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Etapas executadas
              </p>
              <div className="space-y-3">
                {entry.steps.map((s, i) => {
                  const desc = STEP_DESCRIPTIONS[s.name];
                  return (
                    <div key={i} className="rounded-md border border-border bg-muted/20 px-3 py-2.5">
                      <div className="flex gap-2 text-xs">
                        <span className="mt-px shrink-0 text-primary">✓</span>
                        <div>
                          <span className="font-semibold">{s.name}</span>
                          <span className="text-muted-foreground"> — {s.detail}</span>
                          {desc && (
                            <p className="mt-1 text-[11px] italic text-muted-foreground/70">{desc}</p>
                          )}
                        </div>
                      </div>
                      {s.changes && s.changes.length > 0 && (
                        <ul className="mt-2 space-y-2 border-t border-border pt-2">
                          {s.changes.map((c, j) => {
                            const { human, technical } = humanizeChange(c);
                            const isSame = human === technical;
                            return (
                              <li key={j}>
                                <p className="text-xs text-foreground">{human}</p>
                                {!isSame && (
                                  <p className="font-mono text-[10px] text-muted-foreground/50">{technical}</p>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {entry.source === "operation" && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Passos executados
              </p>
              {changelogLoading && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Spinner /> Carregando passos…
                </div>
              )}
              {!changelogLoading && changelogSteps && changelogSteps.length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhum detalhe disponível.</p>
              )}
              {!changelogLoading && changelogSteps && changelogSteps.length > 0 && (
                <div className="space-y-3">
                  {changelogSteps.map((step, i) => (
                    <div key={i} className="rounded-md border border-border bg-muted/20 px-3 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-1 gap-2 text-xs">
                          <span className="mt-px shrink-0 text-primary">✓</span>
                          <div className="min-w-0">
                            <span className="font-semibold">
                              {step.stepName ?? `${
                                step.operation === "backup" ? "Backup" :
                                step.operation === "updateOne" ? "Atualizar" :
                                step.operation === "updateMany" ? "Atualizar todos" :
                                step.operation === "findOne" ? "Buscar" :
                                step.operation === "resolveByEmail" ? "Buscar usuário por e-mail" :
                                step.operation
                              } (${step.collection})`}
                            </span>
                            <span className="text-muted-foreground"> — {step.result}</span>
                            {step.matchedCount !== undefined && step.matchedCount !== step.documentCount && (
                              <span className="text-muted-foreground/60">
                                {" "}({step.matchedCount} encontrado{step.matchedCount !== 1 ? "s" : ""})
                              </span>
                            )}
                            {step.stepDescription && (
                              <p className="mt-1 text-[11px] italic text-muted-foreground/70">
                                {step.stepDescription}
                              </p>
                            )}
                          </div>
                        </div>
                        {step.backupId && (
                          <button
                            disabled={stepDlLoading === step.backupId}
                            onClick={() => {
                              setStepDlLoading(step.backupId!);
                              downloadBackupById(step.backupId!, step.collection, entry.ticketId)
                                .catch(() => {})
                                .finally(() => setStepDlLoading(null));
                            }}
                            className="shrink-0 rounded border border-border px-2 py-0.5 text-[11px] text-muted-foreground transition hover:border-primary/50 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {stepDlLoading === step.backupId ? <Spinner /> : "↓ Backup"}
                          </button>
                        )}
                      </div>
                      {step.changes && step.changes.length > 0 && (
                        <ul className="mt-2 space-y-2 border-t border-border pt-2">
                          {step.changes.map((c, j) => {
                            const { human, technical } = humanizeChange(c);
                            const isSame = human === technical;
                            return (
                              <li key={j}>
                                <p className="text-xs text-foreground">{human}</p>
                                {!isSame && (
                                  <p className="font-mono text-[10px] text-muted-foreground/50">{technical}</p>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      {step.filter && (
                        <details className="mt-2 border-t border-border pt-2">
                          <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
                            Filtro aplicado
                          </summary>
                          <pre className="mt-1 overflow-auto rounded bg-muted/40 p-2 text-[10px] leading-relaxed text-muted-foreground/70">
                            {JSON.stringify(step.filter, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {entry.diffSnapshot && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Diff antes / depois
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border border-border bg-muted/20 p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Antes</p>
                  <div className="space-y-1">
                    {Object.entries(entry.diffSnapshot.before.statusCounts).map(([status, count]) => (
                      <div key={status} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{STATUS_LABELS[status] ?? status}</span>
                        <span className="font-medium">{count}</span>
                      </div>
                    ))}
                  </div>
                  {entry.diffSnapshot.before.fieldsPresent.length > 0 && (
                    <div className="mt-2 border-t border-border pt-2">
                      <p className="mb-1 text-[10px] text-muted-foreground">Campos removidos:</p>
                      <div className="flex flex-wrap gap-1">
                        {entry.diffSnapshot.before.fieldsPresent.map((f) => (
                          <span key={f} className="rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-[10px] text-destructive">{f}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-primary">Depois</p>
                  <div className="space-y-1">
                    {Object.entries(entry.diffSnapshot.after.statusCounts).map(([status, count]) => (
                      <div key={status} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{STATUS_LABELS[status] ?? status}</span>
                        <span className="font-medium text-primary">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="mb-0.5 text-xs text-muted-foreground">{label}</dt>
      <dd className={`font-medium ${mono ? "break-all font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      {children}
    </div>
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
      .input:focus {
        border-color: var(--color-primary);
        box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-primary) 25%, transparent);
      }
      select.input { cursor: pointer; }
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
  );
}
