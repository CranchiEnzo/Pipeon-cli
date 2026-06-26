import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import JSZip from "jszip";
import fileSaver from "file-saver";
const { saveAs } = fileSaver;
import { Shell, BrandHeader, Card, Spinner, ErrorBanner, ReadOnlyBanner } from "@/components/Shell";
import { DbBadge, BackLink } from "@/components/DbBadge";
import { atlasCall, API_BASE, loadConfig } from "@/lib/atlas";
import { fetchProcedures, type ProcedureCatalog, type ProcedureInput } from "@/lib/procedures-catalog";
import { logOperation } from "@/lib/operations";
import { currentUserEmail, currentUserName } from "@/lib/auth";
import { useIsReadOnly } from "@/hooks/use-permission";

export const Route = createFileRoute("/procedure/$id")({
  head: () => ({ meta: [{ title: "Pipeon — Executar procedimento" }] }),
  component: RunProcedurePage,
});

const ALLOWED_DATABASES = ["target-database"];

function buildChangeSummary(update: Record<string, unknown>): string[] {
  const lines: string[] = [];
  for (const [op, fields] of Object.entries(update)) {
    if (typeof fields !== "object" || fields === null) continue;
    for (const [field, value] of Object.entries(fields as Record<string, unknown>)) {
      if (op === "$set") {
        lines.push(`$set: ${field} → ${JSON.stringify(value)}`);
      } else if (op === "$unset") {
        lines.push(`$unset: ${field}`);
      } else {
        lines.push(`${op}: ${field}`);
      }
    }
  }
  return lines;
}

function interpolate(
  template: Record<string, unknown>,
  inputs: ProcedureInput[],
  values: Record<string, string>,
  // Valores obtidos em runtime por steps "resolveByEmail" (ex: userId
  // encontrado a partir de um e-mail) — sempre interpolados como ObjectId.
  resolved: Record<string, string> = {},
): Record<string, unknown> {
  let json = JSON.stringify(template);
  for (const input of inputs) {
    // Trim para evitar que espaços/quebras de linha coladas junto quebrem a
    // conversão (ObjectId inválido ou Date inválida virando 1970-01-01).
    const val = (values[input.key] ?? "").trim();
    if (input.type === "objectId") {
      json = json.replace(
        new RegExp(`"\\{\\{${input.key}\\}\\}"`, "g"),
        JSON.stringify({ $oid: val }),
      );
    } else {
      json = json.replace(new RegExp(`\\{\\{${input.key}\\}\\}`, "g"), val);
    }
  }
  for (const [key, val] of Object.entries(resolved)) {
    json = json.replace(new RegExp(`"\\{\\{${key}\\}\\}"`, "g"), JSON.stringify({ $oid: val.trim() }));
  }
  return JSON.parse(json) as Record<string, unknown>;
}

function RunProcedurePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const readOnly = useIsReadOnly();

  const cfg = (() => {
    try {
      const raw = sessionStorage.getItem("fase-cli-atlas-config");
      return raw ? (JSON.parse(raw) as { database?: string }) : null;
    } catch {
      return null;
    }
  })();
  const dbAllowed = cfg ? ALLOWED_DATABASES.includes(cfg.database ?? "") : false;

  const [procedure, setProcedure] = useState<ProcedureCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [ticket, setTicket] = useState("");
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const [execState, setExecState] = useState<"idle" | "running" | "done">("idle");
  const [execLog, setExecLog] = useState<{ msg: string; done: boolean; error?: boolean }[]>([]);
  const [execError, setExecError] = useState<string | null>(null);

  function pipeonHeaders() {
    const config = loadConfig();
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config?.token ?? ""}`,
    };
  }

  async function callPipeonApi(path: string, body: unknown) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: pipeonHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((err as { error?: string }).error ?? `Erro ${res.status}`);
    }
    return res.json() as Promise<Record<string, unknown>>;
  }

  async function callPipeonGet(path: string) {
    const res = await fetch(`${API_BASE}${path}`, { headers: pipeonHeaders() });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error((err as { error?: string }).error ?? `Erro ${res.status}`);
    }
    return res.json() as Promise<Record<string, unknown>>;
  }

  async function downloadBackupsAsZip(
    backups: { collection: string; documents: unknown[] }[],
    ticketName: string,
  ) {
    const zip = new JSZip();
    const ts = new Date().toISOString().slice(0, 10);
    const collectionCount: Record<string, number> = {};
    for (const { collection, documents } of backups) {
      collectionCount[collection] = (collectionCount[collection] ?? 0) + 1;
      const count = collectionCount[collection];
      const fname = count > 1 ? `backup-${collection}-${count}.json` : `backup-${collection}.json`;
      zip.file(fname, JSON.stringify({ collection, documents }, null, 2));
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const zipName = `backup-${ticketName}-${ts}.zip`;

    if (typeof window.showSaveFilePicker === "function") {
      try {
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: zipName,
          types: [{ description: "Arquivo ZIP", accept: { "application/zip": [".zip"] } }],
        });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (err: unknown) {
        if (err instanceof Error && err.name !== "AbortError") throw err;
        return; // usuário cancelou a seleção de destino do backup
      }
    }
    saveAs(blob, zipName);
  }

  useEffect(() => {
    fetchProcedures()
      .then((procs) => {
        const found = procs.find((p) => p._id === id);
        if (!found) setNotFound(true);
        else setProcedure(found);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  function pushLog(msg: string) {
    setExecLog((l) => [...l, { msg, done: false }]);
  }

  function resolveLastLog(msg: string, error = false) {
    setExecLog((l) => {
      const copy = [...l];
      const idx = copy.findIndex((e) => !e.done);
      if (idx >= 0) copy[idx] = { msg, done: true, error };
      return copy;
    });
  }

  async function handleExecute() {
    if (!procedure) return;
    setFormError(null);

    const missing = procedure.inputs
      .filter((inp) => inp.required && !inputValues[inp.key]?.trim())
      .map((inp) => inp.label);
    if (missing.length > 0) {
      setFormError(`Campos obrigatórios não preenchidos: ${missing.join(", ")}`);
      return;
    }

    setExecState("running");
    setExecLog([]);
    setExecError(null);

    const affectedDocs: Record<string, number> = {};
    const backupAccumulator: { collection: string; documents: unknown[] }[] = [];
    // Valores resolvidos em runtime por steps "resolveByEmail" (ex: userId
    // encontrado a partir de um e-mail), disponíveis para os steps seguintes.
    const resolvedValues: Record<string, string> = {};
    const changelogSteps: {
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
    }[] = [];
    const config = loadConfig();
    const ticketLabel = ticket.trim() || "—";

    try {
      for (let i = 0; i < procedure.steps.length; i++) {
        const stepDef = procedure.steps[i];
        pushLog(`Passo ${i + 1}: ${stepDef.collection} → ${stepDef.operation}…`);

        const filter = interpolate(stepDef.filter, procedure.inputs, inputValues, resolvedValues);

        if (stepDef.operation === "resolveByEmail") {
          const result = await atlasCall<{ document: Record<string, unknown> | null }>(
            "findOne",
            stepDef.collection,
            { filter },
          );
          if (!result.document) {
            throw new Error(
              `Passo ${i + 1}: nenhum documento encontrado em "${stepDef.collection}" para o filtro informado.`,
            );
          }
          if (!stepDef.resolveAs) {
            throw new Error(`Passo ${i + 1}: step "resolveByEmail" sem "resolveAs" configurado.`);
          }
          const fieldPath = stepDef.resolveField ?? "_id";
          const rawValue = result.document[fieldPath];
          const resolvedValue = typeof rawValue === "string" ? rawValue : String(rawValue);
          resolvedValues[stepDef.resolveAs] = resolvedValue;
          changelogSteps.push({
            stepIndex: i + 1,
            collection: stepDef.collection,
            operation: "resolveByEmail",
            result: `${stepDef.resolveAs} = ${resolvedValue}`,
            documentCount: 1,
            filter: Object.keys(filter).length > 0 ? filter : undefined,
            stepName: stepDef.name,
            stepDescription: stepDef.description,
          });
          resolveLastLog(`✓ Passo ${i + 1}: ${stepDef.resolveAs} resolvido (${resolvedValue})`);
          continue;
        }

        if (stepDef.operation === "backup") {
          const data = await callPipeonApi("/api/pipeon/backup/create-generic", {
            collection: stepDef.collection,
            filter,
            ticket: ticketLabel,
            database: config?.database,
            connectionString: config?.connectionString,
          }) as { backupId: string; documentCount: number };
          changelogSteps.push({
            stepIndex: i + 1,
            collection: stepDef.collection,
            operation: "backup",
            result: `${data.documentCount} documento(s) salvo(s)`,
            documentCount: data.documentCount,
            backupId: data.backupId,
            filter: Object.keys(filter).length > 0 ? filter : undefined,
            stepName: stepDef.name,
            stepDescription: stepDef.description,
          });
          resolveLastLog(
            `✓ Passo ${i + 1}: Backup — ${data.documentCount} doc(s) salvo(s) [id: ${data.backupId}]`,
          );
          try {
            const backupDoc = await callPipeonGet(`/api/pipeon/backup/${data.backupId}`);
            backupAccumulator.push({
              collection: stepDef.collection,
              documents: (backupDoc.documents as unknown[]) ?? [],
            });
          } catch {
            // fetch falhou mas backup já está salvo no banco
          }
        } else if (stepDef.operation === "findOne") {
          const result = await atlasCall<{ document: Record<string, unknown> | null }>(
            "findOne",
            stepDef.collection,
            { filter },
          );
          const found = result.document != null;
          const resultMsg = found ? "Documento encontrado" : "Nenhum documento encontrado";
          changelogSteps.push({
            stepIndex: i + 1,
            collection: stepDef.collection,
            operation: "findOne",
            result: resultMsg,
            documentCount: found ? 1 : 0,
            filter: Object.keys(filter).length > 0 ? filter : undefined,
            stepName: stepDef.name,
            stepDescription: stepDef.description,
          });
          resolveLastLog(`✓ Passo ${i + 1}: ${resultMsg}`);
        } else {
          const update = stepDef.update
            ? interpolate(stepDef.update, procedure.inputs, inputValues, resolvedValues)
            : {};
          const result = await atlasCall<{ matchedCount: number; modifiedCount: number }>(
            stepDef.operation,
            stepDef.collection,
            { filter, update },
          );
          affectedDocs[stepDef.collection] =
            (affectedDocs[stepDef.collection] ?? 0) + result.modifiedCount;
          const changes = buildChangeSummary(update);
          changelogSteps.push({
            stepIndex: i + 1,
            collection: stepDef.collection,
            operation: stepDef.operation,
            result: `${result.modifiedCount} documento(s) modificado(s)`,
            documentCount: result.modifiedCount,
            matchedCount: result.matchedCount,
            filter: Object.keys(filter).length > 0 ? filter : undefined,
            update: Object.keys(update).length > 0 ? update : undefined,
            changes: changes.length > 0 ? changes : undefined,
            stepName: stepDef.name,
            stepDescription: stepDef.description,
          });
          const matchInfo = result.matchedCount !== result.modifiedCount
            ? ` (${result.matchedCount} encontrado(s))`
            : "";
          resolveLastLog(`✓ Passo ${i + 1}: ${result.modifiedCount} doc(s) modificado(s)${matchInfo}`);
        }
      }

      if (backupAccumulator.length > 0) {
        await downloadBackupsAsZip(backupAccumulator, ticketLabel).catch(() => {});
      }

      setExecState("done");

      await Promise.all([
        logOperation({
          procedureId: procedure._id ?? id,
          procedureName: procedure.name,
          projectId: procedure.projectId,
          projectName: procedure.projectId,
          ticketId: ticketLabel,
          status: "success",
          affectedDocs,
        }),
        callPipeonApi("/api/pipeon/changelogs", {
          ticket: ticketLabel,
          procedureId: procedure._id ?? id,
          procedureName: procedure.name,
          projectId: procedure.projectId,
          executedBy: currentUserEmail(),
          executedByName: currentUserName(),
          executedAt: new Date().toISOString(),
          database: config?.database ?? "",
          status: "success",
          steps: changelogSteps,
        }),
      ]).catch(() => {});
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha durante a execução.";
      resolveLastLog(`✗ ${msg}`, true);
      setExecError(msg);
      if (backupAccumulator.length > 0) {
        await downloadBackupsAsZip(backupAccumulator, ticketLabel).catch(() => {});
      }
      setExecState("done");

      await Promise.all([
        logOperation({
          procedureId: procedure._id ?? id,
          procedureName: procedure.name,
          projectId: procedure.projectId,
          projectName: procedure.projectId,
          ticketId: ticketLabel,
          status: "error",
          affectedDocs,
          error: msg,
        }),
        callPipeonApi("/api/pipeon/changelogs", {
          ticket: ticketLabel,
          procedureId: procedure._id ?? id,
          procedureName: procedure.name,
          projectId: procedure.projectId,
          executedBy: currentUserEmail(),
          executedByName: currentUserName(),
          executedAt: new Date().toISOString(),
          database: config?.database ?? "",
          status: "error",
          steps: changelogSteps,
          error: msg,
        }),
      ]).catch(() => {});
    }
  }

  if (!dbAllowed) {
    return (
      <Shell>
        <DbBadge />
        <BackLink to="/procedure" search={{ nucleo: "" }} />
        <BrandHeader subtitle={false} />
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <strong>Banco não permitido:</strong> procedimentos só podem ser executados contra o banco{" "}
          <code className="font-mono text-xs">target-database</code>. Banco atual:{" "}
          <code className="font-mono text-xs">{cfg?.database ?? "desconhecido"}</code>.
        </div>
      </Shell>
    );
  }

  if (loading) {
    return (
      <Shell>
        <DbBadge />
        <BackLink to="/procedure" search={{ nucleo: "" }} />
        <BrandHeader subtitle={false} />
        <div className="flex items-center gap-2 py-12 text-muted-foreground">
          <Spinner /> Carregando procedimento…
        </div>
      </Shell>
    );
  }

  if (notFound || !procedure) {
    return (
      <Shell>
        <DbBadge />
        <BackLink to="/procedure" search={{ nucleo: "" }} />
        <BrandHeader subtitle={false} />
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          Procedimento não encontrado.
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <DbBadge />
      <BackLink to="/procedure" search={{ nucleo: procedure.nucleo ?? "" }} />
      <BrandHeader subtitle={false} />

      {readOnly && <ReadOnlyBanner />}

      <div className="mb-5">
        <div className="flex flex-wrap items-center gap-2">
          {procedure.nucleo && (
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary">
              {procedure.nucleo}
            </span>
          )}
          <h2 className="text-lg font-semibold">{procedure.name}</h2>
        </div>
        {procedure.description && (
          <p className="mt-1 text-sm text-muted-foreground">{procedure.description}</p>
        )}
      </div>

      {execState === "idle" && (
        <Card>
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Dados da execução
          </h3>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Número do chamado (ticket)
              </span>
              <input
                value={ticket}
                onChange={(e) => setTicket(e.target.value)}
                className="input"
                placeholder="Ex.: 123456"
              />
            </label>

            {procedure.inputs.map((inp) => (
              <label key={inp.key} className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {inp.label}
                  {inp.required && <span className="ml-1 text-destructive">*</span>}
                </span>
                <input
                  value={inputValues[inp.key] ?? ""}
                  onChange={(e) =>
                    setInputValues((v) => ({ ...v, [inp.key]: e.target.value }))
                  }
                  className={inp.type === "objectId" ? "input font-mono" : "input"}
                  placeholder={inp.type === "objectId" ? "65a1b2c3d4e5f6a7b8c9d0e1" : ""}
                />
              </label>
            ))}

            <ErrorBanner message={formError} />

            <button
              onClick={handleExecute}
              disabled={readOnly}
              title={readOnly ? "Seu perfil tem acesso apenas para visualização." : undefined}
              className="btn-primary w-full"
            >
              Executar procedimento
            </button>
          </div>
        </Card>
      )}

      {(execState === "running" || execState === "done") && (
        <Card>
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Execução
          </h3>
          <ul className="space-y-2 text-sm">
            {execLog.map((e, i) => (
              <li
                key={i}
                className={`flex items-center gap-2 rounded-md border px-3 py-2 ${
                  e.error
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : e.done
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border bg-muted/30 text-muted-foreground"
                }`}
              >
                {e.done ? <span>{e.error ? "✗" : "✓"}</span> : <Spinner />}
                <span>{e.msg}</span>
              </li>
            ))}
          </ul>

          <ErrorBanner message={execError} />

          {execState === "done" && !execError && (
            <div className="mt-6 rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
              Procedimento concluído com sucesso.
            </div>
          )}

          {execState === "done" && (
            <div className="mt-4 flex gap-3">
              <button
                onClick={() =>
                  navigate({ to: "/procedure", search: { nucleo: procedure?.nucleo ?? "" } })
                }
                className="btn-ghost flex-1"
              >
                ← Voltar
              </button>
              <button
                onClick={() => navigate({ to: "/menu" })}
                className="btn-primary flex-1"
              >
                Ir ao menu
              </button>
            </div>
          )}
        </Card>
      )}

      <Style />
    </Shell>
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
        padding: 0.6rem 0.8rem;
        font-size: 0.875rem;
        color: var(--color-foreground);
        outline: none;
        transition: border-color .15s, box-shadow .15s;
      }
      .input:focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px color-mix(in oklab, var(--color-primary) 25%, transparent); }
      .btn-primary {
        display: inline-flex; align-items: center; justify-content: center; gap: .5rem;
        background: var(--color-primary); color: var(--color-primary-foreground);
        font-weight: 600; padding: .7rem 1rem; border-radius: .5rem;
        transition: filter .15s;
      }
      .btn-primary:hover { filter: brightness(1.05); }
      .btn-primary:disabled { opacity: .6; cursor: not-allowed; }
      .btn-ghost {
        display: inline-flex; align-items: center; justify-content: center;
        border: 1px solid var(--color-border); color: var(--color-muted-foreground);
        font-weight: 500; padding: .7rem 1rem; border-radius: .5rem;
        transition: border-color .15s, color .15s;
      }
      .btn-ghost:hover { border-color: var(--color-primary); color: var(--color-foreground); }
    `}</style>
  );
}
