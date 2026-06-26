import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import JSZip from "jszip";
import fileSaver from "file-saver";
const { saveAs } = fileSaver;
import { Shell, BrandHeader, Card, Spinner, ErrorBanner, ReadOnlyBanner } from "@/components/Shell";
import { DbBadge, BackLink } from "@/components/DbBadge";
import { atlasCall, loadConfig, API_BASE } from "@/lib/atlas";
import { logOperation } from "@/lib/operations";
import { saveScheduledProcedure, markScheduledExecuted, type ScheduledPrefill } from "@/lib/scheduled";
import { useIsReadOnly } from "@/hooks/use-permission";

export const Route = createFileRoute("/procedure/reset-evaluations")({
  head: () => ({ meta: [{ title: "Pipeon — Resetar avaliações" }] }),
  component: ResetEvaluationsPage,
});

type Evaluator = { userId: string; firstName?: string; lastName?: string; email?: string };

interface DryRunData {
  statusCounts: Record<string, number>;
  fieldsPresent: string[];
}

const TRACKED_FIELDS = [
  "evaluationAverage",
  "evaluationAverageByBlocks",
  "evaluationSum",
  "submittedDate",
  "evaluatorNote",
];

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

function evalStatusColor(status: string): string {
  if (status === "SUBMITTED" || status === "COMPLETE" || status === "COMPLETED" || status === "APPROVED")
    return "border-green-500/40 bg-green-500/10 text-green-500";
  if (status === "STARTED" || status === "INPROGRESS")
    return "border-purple-500/40 bg-purple-500/10 text-purple-400";
  if (status === "NOTSTARTED" || status === "PENDING")
    return "border-orange-500/40 bg-orange-500/10 text-orange-400";
  return "border-border bg-card text-muted-foreground";
}

function ResetEvaluationsPage() {
  const readOnly = useIsReadOnly();
  const [step, setStep] = useState(1);
  const [ticket, setTicket] = useState("");
  const [noticeId, setNoticeId] = useState("");
  const [evaluators, setEvaluators] = useState<Evaluator[]>([]);
  const [selectedEvaluator, setSelectedEvaluator] = useState<Evaluator | null>(null);
  const [evalCount, setEvalCount] = useState<number | null>(null);
  const [evalStatusCounts, setEvalStatusCounts] = useState<Record<string, number> | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dry run
  const [dryRunData, setDryRunData] = useState<DryRunData | null>(null);
  const [loadingDryRun, setLoadingDryRun] = useState(false);

  // Scheduling
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledFor, setScheduledFor] = useState("");
  const [scheduleSaved, setScheduleSaved] = useState(false);
  const [scheduledId, setScheduledId] = useState<string | null>(null);
  const [recurring, setRecurring] = useState(false);
  const [recurringTime, setRecurringTime] = useState("");

  // Execution state
  const [execLog, setExecLog] = useState<{ msg: string; done: boolean }[]>([]);
  const [execDone, setExecDone] = useState(false);

  const navigate = useNavigate();

  // On mount: check for pre-fill from "execute scheduled" flow
  useEffect(() => {
    const raw = sessionStorage.getItem("pipeon-scheduled-execute");
    if (!raw) return;
    sessionStorage.removeItem("pipeon-scheduled-execute");
    try {
      const data = JSON.parse(raw) as ScheduledPrefill;
      setTicket(data.ticket);
      setNoticeId(data.noticeId);
      setScheduledId(data.scheduledId);
      const ev: Evaluator = {
        userId: data.evaluatorUserId,
        firstName: data.evaluatorName,
        lastName: "",
        email: data.evaluatorEmail,
      };
      setSelectedEvaluator(ev);
      setEvaluators([ev]);
      setLoading(true);
      atlasCall<{ documents: unknown[] }>("find", "evaluations", {
        filter: {
          notice: { $oid: data.noticeId },
          "noticeEvaluator.userId": { $oid: data.evaluatorUserId },
        },
        projection: { _id: 1 },
      })
        .then((res) => {
          setEvalCount(res.documents.length);
          setStep(3);
          loadDryRun(data.noticeId, data.evaluatorUserId);
        })
        .catch(() => setStep(3))
        .finally(() => setLoading(false));
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadDryRun(overrideNoticeId?: string, overrideEvaluatorId?: string) {
    const nId = overrideNoticeId ?? noticeId.trim();
    const eId = overrideEvaluatorId ?? selectedEvaluator?.userId;
    if (!nId || !eId) return;
    setDryRunData(null);
    setLoadingDryRun(true);
    try {
      const filter = {
        notice: { $oid: nId },
        "noticeEvaluator.userId": { $oid: eId },
      };
      const [statusRes, sampleRes] = await Promise.all([
        atlasCall<{ documents: Array<{ _id: string | null; count: number }> }>(
          "aggregate",
          "evaluations",
          {
            pipeline: [
              { $match: filter },
              { $group: { _id: "$status", count: { $sum: 1 } } },
              { $sort: { count: -1 } },
            ],
          },
        ),
        atlasCall<{ documents: Array<Record<string, unknown>> }>(
          "find",
          "evaluations",
          {
            filter,
            projection: TRACKED_FIELDS.reduce((acc, f) => ({ ...acc, [f]: 1 }), { _id: 1 } as Record<string, unknown>),
            limit: 1000,
          },
        ),
      ]);
      const statusCounts: Record<string, number> = {};
      for (const doc of statusRes.documents) {
        statusCounts[doc._id ?? "null"] = doc.count;
      }
      const fieldsPresent = TRACKED_FIELDS.filter((field) =>
        sampleRes.documents.some((doc) => doc[field] !== undefined && doc[field] !== null),
      );
      setDryRunData({ statusCounts, fieldsPresent });
    } catch {
      // non-critical — dry run failure doesn't block execution
    } finally {
      setLoadingDryRun(false);
    }
  }

  async function handleSearchEvaluators() {
    setError(null);
    if (!ticket.trim() || !noticeId.trim()) {
      setError("Preencha o número do chamado e o ObjectId do ciclo.");
      return;
    }
    setLoading(true);
    try {
      const agg = await atlasCall<{ documents: Array<{ _id: string | null }> }>(
        "aggregate",
        "evaluations",
        {
          pipeline: [
            { $match: { notice: { $oid: noticeId.trim() } } },
            { $group: { _id: "$noticeEvaluator.userId" } },
          ],
        },
      );
      const ids = (agg.documents || [])
        .map((d) => d._id)
        .filter((x): x is string => typeof x === "string" && x.length > 0);

      if (ids.length === 0) {
        setEvaluators([]);
        setError("Nenhum avaliador encontrado para este ciclo.");
        return;
      }

      const users = await atlasCall<{
        documents: Array<{ _id: string; firstName?: string; lastName?: string; email?: string }>;
      }>("find", "users", {
        filter: { _id: { $in: ids.map((id) => ({ $oid: id })) } },
        projection: { firstName: 1, lastName: 1, email: 1 },
      });

      const userMap = new Map(users.documents.map((u) => [u._id, u]));
      const list: Evaluator[] = ids.map((id) => {
        const u = userMap.get(id);
        return { userId: id, firstName: u?.firstName, lastName: u?.lastName, email: u?.email };
      });
      setEvaluators(list);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar avaliadores.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectEvaluator(ev: Evaluator) {
    setSelectedEvaluator(ev);
    setEvalCount(null);
    setEvalStatusCounts(null);
    setDryRunData(null);
    setError(null);
    setLoading(true);
    try {
      const filter = {
        notice: { $oid: noticeId.trim() },
        "noticeEvaluator.userId": { $oid: ev.userId },
      };
      const [countRes, statusRes] = await Promise.all([
        atlasCall<{ documents: unknown[] }>("find", "evaluations", {
          filter,
          projection: { _id: 1 },
        }),
        atlasCall<{ documents: Array<{ _id: string | null; count: number }> }>(
          "aggregate",
          "evaluations",
          {
            pipeline: [
              { $match: filter },
              { $group: { _id: "$status", count: { $sum: 1 } } },
              { $sort: { count: -1 } },
            ],
          },
        ),
      ]);
      setEvalCount(countRes.documents.length);
      const counts: Record<string, number> = {};
      for (const doc of statusRes.documents) {
        counts[doc._id ?? "null"] = doc.count;
      }
      setEvalStatusCounts(counts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao contar avaliações.");
    } finally {
      setLoading(false);
    }
  }

  function handleContinueToStep3() {
    setStep(3);
    loadDryRun();
  }

  async function handleSchedule() {
    if (!selectedEvaluator || !scheduledFor) return;
    setError(null);
    setLoading(true);
    try {
      await saveScheduledProcedure({
        procedureName: "Retornar avaliações para pendentes para substituição de avaliador(a)",
        ticket: ticket.trim(),
        noticeId: noticeId.trim(),
        evaluatorUserId: selectedEvaluator.userId,
        evaluatorName: [selectedEvaluator.firstName, selectedEvaluator.lastName]
          .filter(Boolean)
          .join(" "),
        evaluatorEmail: selectedEvaluator.email ?? "",
        scheduledFor: new Date(scheduledFor).toISOString(),
        recurring,
        recurringTime: recurring ? recurringTime : undefined,
      });
      setScheduleSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao agendar procedimento.");
    } finally {
      setLoading(false);
    }
  }

  function pushLog(msg: string, done = false) {
    setExecLog((l) => [...l, { msg, done }]);
  }
  function markLastDone(msg: string) {
    setExecLog((l) => {
      const copy = [...l];
      const idx = copy.findIndex((e) => !e.done);
      if (idx >= 0) copy[idx] = { msg, done: true };
      return copy;
    });
  }

  async function handleExecute() {
    if (!selectedEvaluator) return;
    setError(null);
    setExecLog([]);
    setExecDone(false);
    setStep(4);

    const filter = {
      notice: { $oid: noticeId.trim() },
      "noticeEvaluator.userId": { $oid: selectedEvaluator.userId },
    };

    try {

      // Etapa 1 — Backup (ZIP local + cópia no banco Pipeon em paralelo)
      pushLog("Gerando backup das avaliações…");
      const cfg = loadConfig();
      const [backup] = await Promise.all([
        atlasCall<{ documents: Array<Record<string, unknown>> }>(
          "find",
          "evaluations",
          { filter, limit: 100000 },
        ),
        fetch(`${API_BASE}/api/pipeon/backup/create`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${cfg?.token ?? ""}`,
          },
          body: JSON.stringify({
            noticeId: noticeId.trim(),
            evaluatorUserId: selectedEvaluator.userId,
            ticket: ticket.trim(),
            evaluatorName: [selectedEvaluator.firstName, selectedEvaluator.lastName]
              .filter(Boolean)
              .join(" "),
            evaluatorEmail: selectedEvaluator.email ?? "",
            database: cfg?.database,
            connectionString: cfg?.connectionString,
          }),
        }).catch(() => null),
      ]);
      const docs = backup.documents || [];
      const zip = new JSZip();
      for (const doc of docs) {
        const submission = doc.submission as { submissionNumber?: string } | undefined;
        const submissionNumber = submission?.submissionNumber || String(doc._id);
        const safeName = `Evaluation - ${submissionNumber.replace(/\//g, "-")}.json`;
        zip.file(safeName, JSON.stringify(doc, null, 2));
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const zipName = `backup-${ticket.trim()}-${selectedEvaluator.userId}-${Date.now()}.zip`;
      if (typeof window.showSaveFilePicker === "function") {
        try {
          const fileHandle = await window.showSaveFilePicker({
            suggestedName: zipName,
            types: [{ description: "Arquivo ZIP", accept: { "application/zip": [".zip"] } }],
          });
          const writable = await fileHandle.createWritable();
          await writable.write(blob);
          await writable.close();
        } catch (err: unknown) {
          if (err instanceof Error && err.name !== "AbortError") throw err;
          markLastDone(`✓ Backup de ${docs.length} documento(s) cancelado pelo usuário`);
          return;
        }
      } else {
        saveAs(blob, zipName);
      }
      markLastDone(`✓ Backup de ${docs.length} documento(s) salvo (ZIP local + banco Pipeon)`);

      // Etapa 2 — Reset status
      pushLog("Resetando status e limpando campos de avaliação…");
      const r2 = await atlasCall<{ matchedCount: number; modifiedCount: number }>(
        "updateMany",
        "evaluations",
        {
          filter,
          update: {
            $set: { status: "NOTSTARTED" },
            $unset: {
              evaluationAverage: "",
              evaluationAverageByBlocks: "",
              evaluationSum: "",
              submittedDate: "",
              evaluatorNote: "",
            },
          },
        },
      );
      markLastDone(`✓ ${r2.modifiedCount} avaliação(ões) retornada(s) para NOTSTARTED`);

      // Etapa 3 — Limpar campos do formulário
      pushLog("Limpando campos do formulário (phaseForm)…");
      const r3 = await atlasCall<{ matchedCount: number; modifiedCount: number }>(
        "updateMany",
        "evaluations",
        {
          filter,
          update: {
            $unset: {
              "phaseForm.blocks.$[].fields.$[].value": "",
              "phaseForm.blocks.$[].sumValue": "",
            },
          },
        },
      );
      markLastDone(`✓ Campos do formulário limpos em ${r3.modifiedCount} documento(s)`);

      setExecDone(true);

      // Mark scheduled procedure as executed if applicable
      if (scheduledId) {
        try { await markScheduledExecuted(scheduledId); } catch {}
      }

      try {
        await logOperation({
          procedureId: "reset-evaluations",
          procedureName: "Retornar avaliações para pendentes para substituição de avaliador(a)",
          projectId: "target-db",
          projectName: "[INTERNAL-SYSTEM]",
          ticketId: ticket.trim(),
          status: "success",
          affectedDocs: { evaluations: r2.modifiedCount },
        });
      } catch {
        // log failure does not block the user
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha durante a execução.");
    }
  }

  const minDateTime = new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16);

  const cfg = loadConfig();
  const dbAllowed = cfg ? ["target-database"].includes(cfg.database) : false;

  if (!dbAllowed) {
    return (
      <Shell>
        <DbBadge />
        <BackLink to="/procedure" search={{ nucleo: "Ciclos" }} />
        <BrandHeader subtitle={false} />
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <strong>Banco não permitido:</strong> procedimentos só podem ser executados contra o banco{" "}
          <code className="font-mono text-xs">target-database</code>. Banco atual:{" "}
          <code className="font-mono text-xs">{cfg?.database ?? "desconhecido"}</code>.
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <DbBadge />
      <BackLink to="/procedure" search={{ nucleo: "Ciclos" }} />
      <BrandHeader subtitle={false} />

      {readOnly && <ReadOnlyBanner />}

      <Stepper current={step} />

      {step === 1 && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold">Identificação</h2>
          <p className="mb-5 text-sm text-muted-foreground">
            Informe o chamado e o ObjectId do ciclo para localizar os avaliadores.
          </p>
          <div className="space-y-4">
            <Field label="Número do chamado">
              <input
                value={ticket}
                onChange={(e) => setTicket(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearchEvaluators()}
                className="input"
                placeholder="Ex.: 123456"
              />
            </Field>
            <Field label="ObjectId do ciclo (notice)">
              <input
                value={noticeId}
                onChange={(e) => setNoticeId(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearchEvaluators()}
                className="input font-mono"
                placeholder="65a1b2c3d4e5f6a7b8c9d0e1"
              />
            </Field>
            <button
              onClick={handleSearchEvaluators}
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? (
                <>
                  <Spinner /> Buscando…
                </>
              ) : (
                "Buscar avaliadores"
              )}
            </button>
            <ErrorBanner message={error} />
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold">Seleção do avaliador</h2>
          <p className="mb-5 text-sm text-muted-foreground">
            {evaluators.length} avaliador(es) encontrado(s).
          </p>
          <div className="space-y-2">
            {evaluators.map((ev) => {
              const selected = selectedEvaluator?.userId === ev.userId;
              const full =
                [ev.firstName, ev.lastName].filter(Boolean).join(" ") || "(sem nome)";
              return (
                <button
                  key={ev.userId}
                  onClick={() => handleSelectEvaluator(ev)}
                  className={`w-full rounded-lg border px-4 py-3 text-left transition ${
                    selected
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50 hover:bg-accent"
                  }`}
                >
                  <div className="font-medium">{full}</div>
                  <div className="text-xs text-muted-foreground">{ev.email || ev.userId}</div>
                </button>
              );
            })}
          </div>

          {selectedEvaluator && (
            <div className="mt-5 rounded-md border border-border bg-muted/30 px-4 py-3 text-sm">
              {loading ? (
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Spinner /> Buscando avaliações…
                </span>
              ) : evalCount !== null ? (
                <div className="space-y-2.5">
                  <p className="text-muted-foreground">
                    <strong className="text-primary">{evalCount}</strong> avaliação(ões) deste
                    avaliador neste ciclo.
                  </p>
                  {evalStatusCounts && Object.keys(evalStatusCounts).length > 0 && (
                    <div>
                      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Status atual:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(evalStatusCounts).map(([status, count]) => (
                          <span
                            key={status}
                            className={`rounded border px-2.5 py-1 text-xs font-medium ${evalStatusColor(status)}`}
                          >
                            {count} {STATUS_LABELS[status] ?? status}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}

          <ErrorBanner message={error} />

          <div className="mt-6 flex gap-3">
            <button onClick={() => setStep(1)} className="btn-ghost">
              ← Voltar
            </button>
            <button
              onClick={handleContinueToStep3}
              disabled={!selectedEvaluator || evalCount === null || loading}
              className="btn-primary flex-1"
            >
              Continuar
            </button>
          </div>
        </Card>
      )}

      {step === 3 && selectedEvaluator && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold">Confirmação</h2>
          <p className="mb-5 text-sm text-muted-foreground">
            Revise os dados e a simulação antes de executar.
          </p>

          <dl className="space-y-3 rounded-md border border-border bg-muted/30 p-4 text-sm">
            <Row label="Chamado" value={ticket} />
            <Row label="Ciclo" value={noticeId} mono />
            <Row
              label="Avaliador"
              value={`${[selectedEvaluator.firstName, selectedEvaluator.lastName].filter(Boolean).join(" ")} (${selectedEvaluator.email || selectedEvaluator.userId})`}
            />
            <Row label="Total de avaliações" value={String(evalCount)} />
          </dl>

          {/* Dry run preview */}
          <div className="mt-5">
            <p className="mb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Simulação (dry run)
            </p>
            {loadingDryRun ? (
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                <Spinner /> Analisando avaliações…
              </div>
            ) : dryRunData ? (
              <div className="space-y-3 rounded-md border border-border bg-muted/20 p-4 text-sm">
                <div>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                    Status atual das avaliações:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(dryRunData.statusCounts).map(([status, count]) => (
                      <span
                        key={status}
                        className={`rounded border px-2.5 py-1 text-xs font-medium ${evalStatusColor(status)}`}
                      >
                        {count} {STATUS_LABELS[status] ?? status}
                      </span>
                    ))}
                  </div>
                </div>
                {dryRunData.fieldsPresent.length > 0 ? (
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                      Campos que serão removidos:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {dryRunData.fieldsPresent.map((f) => (
                        <span
                          key={f}
                          className="rounded bg-destructive/10 px-2 py-0.5 font-mono text-[11px] text-destructive"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs italic text-muted-foreground">
                    Nenhum campo a remover (campos já estão vazios).
                  </p>
                )}
              </div>
            ) : (
              <div className="rounded-md border border-border bg-muted/20 px-4 py-3 text-sm italic text-muted-foreground">
                Simulação não disponível.
              </div>
            )}
          </div>

          {/* Schedule toggle */}
          <div className="mt-5 rounded-md border border-border bg-muted/20 p-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={scheduleMode}
                onChange={(e) => {
                  setScheduleMode(e.target.checked);
                  setScheduleSaved(false);
                }}
                className="h-4 w-4 accent-[var(--color-primary)]"
              />
              <span className="font-medium">Agendar para depois</span>
            </label>
            {scheduleMode && (
              <div className="mt-3 space-y-3">
                <Field label="Data e hora da primeira execução">
                  <input
                    type="datetime-local"
                    value={scheduledFor}
                    onChange={(e) => setScheduledFor(e.target.value)}
                    min={minDateTime}
                    className="input"
                  />
                </Field>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={recurring}
                    onChange={(e) => {
                      setRecurring(e.target.checked);
                      if (!e.target.checked) setRecurringTime("");
                    }}
                    className="h-4 w-4 accent-[var(--color-primary)]"
                  />
                  <span className="font-medium">Repetir automaticamente todo dia</span>
                </label>
                {recurring && (
                  <Field label="Horário de repetição diária">
                    <input
                      type="time"
                      value={recurringTime}
                      onChange={(e) => setRecurringTime(e.target.value)}
                      className="input"
                    />
                  </Field>
                )}
                {scheduleSaved ? (
                  <div className="rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
                    ✓ Procedimento agendado para{" "}
                    {new Date(scheduledFor).toLocaleString("pt-BR")}.
                    {recurring && recurringTime && (
                      <span className="block mt-1 text-xs opacity-80">
                        Repetição automática todo dia às {recurringTime}.
                      </span>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={handleSchedule}
                    disabled={readOnly || !scheduledFor || (recurring && !recurringTime) || loading}
                    title={readOnly ? "Seu perfil tem acesso apenas para visualização." : undefined}
                    className="btn-primary w-full"
                  >
                    {loading ? (
                      <>
                        <Spinner /> Agendando…
                      </>
                    ) : (
                      "Confirmar agendamento"
                    )}
                  </button>
                )}
              </div>
            )}
          </div>

          {!scheduleMode && (
            <label className="mt-5 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="h-4 w-4 accent-[var(--color-primary)]"
              />
              Confirmo que o total de avaliações está correto
            </label>
          )}

          <ErrorBanner message={error} />

          <div className="mt-6 flex gap-3">
            <button onClick={() => setStep(2)} className="btn-ghost">
              ← Voltar
            </button>
            {scheduleSaved ? (
              <button
                onClick={() => navigate({ to: "/menu" })}
                className="btn-primary flex-1"
              >
                Voltar ao menu
              </button>
            ) : (
              !scheduleMode && (
                <button
                  onClick={handleExecute}
                  disabled={readOnly || !confirmed}
                  title={readOnly ? "Seu perfil tem acesso apenas para visualização." : undefined}
                  className="btn-primary flex-1"
                >
                  Executar procedimento
                </button>
              )
            )}
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold">Execução</h2>
          <p className="mb-5 text-sm text-muted-foreground">
            Acompanhe o progresso de cada etapa.
          </p>
          <ul className="space-y-2 text-sm">
            {execLog.map((e, i) => (
              <li
                key={i}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 ${
                  e.done
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border bg-muted/30 text-muted-foreground"
                }`}
              >
                {e.done ? <span>✓</span> : <Spinner />}
                <span>{e.msg}</span>
              </li>
            ))}
          </ul>

          <ErrorBanner message={error} />

          {execDone && (
            <>
              <div className="mt-6 rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
                Procedimento concluído com sucesso.
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => navigate({ to: "/restore" })}
                  className="btn-ghost flex-1"
                >
                  Restaurar backup
                </button>
                <button
                  onClick={() => navigate({ to: "/menu" })}
                  className="btn-primary flex-1"
                >
                  Voltar ao menu
                </button>
              </div>
            </>
          )}
        </Card>
      )}
    </Shell>
  );
}

function Stepper({ current }: { current: number }) {
  const steps = ["Identificação", "Avaliador", "Confirmação", "Execução"];
  return (
    <ol className="mb-8 flex items-center gap-2 text-xs">
      {steps.map((s, i) => {
        const n = i + 1;
        const active = n === current;
        const done = n < current;
        return (
          <li key={s} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${
                done
                  ? "border-primary bg-primary text-primary-foreground"
                  : active
                    ? "border-primary text-primary"
                    : "border-border text-muted-foreground"
              }`}
            >
              {n}
            </span>
            <span
              className={`hidden sm:inline ${active ? "text-foreground" : "text-muted-foreground"}`}
            >
              {s}
            </span>
            {i < steps.length - 1 && <span className="ml-1 flex-1 border-t border-border" />}
          </li>
        );
      })}
    </ol>
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

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`text-right ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
