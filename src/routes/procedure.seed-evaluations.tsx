import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Shell, BrandHeader, Card, Spinner, ErrorBanner, ReadOnlyBanner } from "@/components/Shell";
import { DbBadge, BackLink } from "@/components/DbBadge";
import { atlasCall, loadConfig } from "@/lib/atlas";
import { logProcedure } from "@/lib/history";
import { useIsReadOnly } from "@/hooks/use-permission";

export const Route = createFileRoute("/procedure/seed-evaluations")({
  head: () => ({ meta: [{ title: "Pipeon — Criar avaliações de teste" }] }),
  component: SeedEvaluationsPage,
});

const STATUS_OPTIONS = [
  { value: "SUBMITTED", label: "Avaliação concluída (SUBMITTED)" },
  { value: "COMPLETED", label: "Avaliação concluída (COMPLETED)" },
  { value: "NOTSTARTED", label: "Pendente (NOTSTARTED)" },
  { value: "STARTED", label: "Rascunho (STARTED)" },
];

function SeedEvaluationsPage() {
  const navigate = useNavigate();
  const readOnly = useIsReadOnly();

  // Step 1 fields
  const [ticket, setTicket] = useState("");
  const [noticeId, setNoticeId] = useState("6838b3554ff3330404eeb85f");
  const [evaluatorEmail, setEvaluatorEmail] = useState("evaluator@example.com");
  const [commissionName, setCommissionName] = useState("Romance");
  const [count, setCount] = useState("10");
  const [status, setStatus] = useState("SUBMITTED");

  // Resolved evaluator
  const [evaluatorId, setEvaluatorId] = useState<string | null>(null);
  const [evaluatorName, setEvaluatorName] = useState<string>("");

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Execution
  const [execLog, setExecLog] = useState<{ msg: string; done: boolean }[]>([]);
  const [execDone, setExecDone] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

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

  async function handleSearch() {
    setError(null);
    const n = parseInt(count, 10);
    if (!ticket.trim()) {
      setError("Informe o número do chamado.");
      return;
    }
    if (!noticeId.trim() || noticeId.trim().length !== 24) {
      setError("ObjectId do ciclo inválido (deve ter 24 caracteres).");
      return;
    }
    if (!evaluatorEmail.trim()) {
      setError("Informe o e-mail do avaliador.");
      return;
    }
    if (!commissionName.trim()) {
      setError("Informe o nome da comissão.");
      return;
    }
    if (isNaN(n) || n < 1 || n > 100) {
      setError("Quantidade deve ser entre 1 e 100.");
      return;
    }

    setLoading(true);
    try {
      const res = await atlasCall<{
        documents: Array<{ _id: string; firstName?: string; lastName?: string; email?: string }>;
      }>("find", "users", {
        filter: { email: evaluatorEmail.trim().toLowerCase() },
        projection: { firstName: 1, lastName: 1, email: 1 },
        limit: 1,
      });

      if (!res.documents.length) {
        setError(`Usuário não encontrado com o e-mail "${evaluatorEmail.trim()}".`);
        return;
      }

      const user = res.documents[0];
      setEvaluatorId(user._id);
      const full = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || user._id;
      setEvaluatorName(full);
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao buscar avaliador.");
    } finally {
      setLoading(false);
    }
  }

  async function handleExecute() {
    if (!evaluatorId) return;
    setError(null);
    setExecLog([]);
    setExecDone(false);
    setStep(3);

    const n = parseInt(count, 10);
    const now = new Date().toISOString();
    const cfg = loadConfig();
    const dbInfo = cfg
      ? `${cfg.database}${cfg.connectionString ? ` (${cfg.connectionString.replace(/\/\/[^@]+@/, "//*****@")})` : " (mongodb://localhost:27017/)"}`
      : "desconhecido";

    try {
      pushLog(`Banco alvo: ${dbInfo}`);
      markLastDone(`✓ Banco: ${dbInfo}`);

      pushLog(`Inserindo ${n} avaliação(ões) em evaluations…`);

      const baseDoc: Record<string, unknown> = {
        notice: { $oid: noticeId.trim() },
        noticeEvaluator: {
          userId: { $oid: evaluatorId },
          email: evaluatorEmail.trim().toLowerCase(),
          name: evaluatorName,
        },
        commissionName: commissionName.trim(),
        status,
        createdAt: now,
        updatedAt: now,
        _seedTest: true,
      };
      if (status === "SUBMITTED" || status === "COMPLETED") {
        baseDoc.submittedDate = now;
      }

      const insertedIds: string[] = [];
      for (let i = 0; i < n; i++) {
        const result = await atlasCall<{ insertedId: string }>("insertOne", "evaluations", { document: baseDoc });
        insertedIds.push(result.insertedId);
      }

      markLastDone(`✓ ${n} avaliação(ões) inserida(s) (IDs: ${insertedIds.slice(0, 3).join(", ")}${n > 3 ? "…" : ""})`);

      // Verificação imediata
      pushLog("Verificando inserção no banco…");
      const verifyRes = await atlasCall<{ documents: Array<{ count: number }> }>("aggregate", "evaluations", {
        pipeline: [
          { $match: { notice: { $oid: noticeId.trim() }, "noticeEvaluator.userId": { $oid: evaluatorId }, _seedTest: true } },
          { $count: "count" },
        ],
      });
      const found = verifyRes.documents[0]?.count ?? 0;
      if (found === 0) {
        markLastDone(`⚠ Verificação: 0 documentos encontrados — possível problema de banco ou ObjectId`);
      } else {
        markLastDone(`✓ Verificação: ${found} documento(s) confirmado(s) no banco`);
      }

      setExecDone(true);

      try {
        await logProcedure({
          ticket: ticket.trim(),
          procedureName: "Criar avaliações de teste",
          noticeId: noticeId.trim(),
          evaluatorName,
          evaluatorEmail: evaluatorEmail.trim(),
          affectedCount: n,
          steps: [
            {
              name: "Inserção de avaliações",
              detail: `${n} documento(s) inserido(s) na collection evaluations — banco: ${cfg?.database}`,
              changes: [
                `status: ${status}`,
                `commissionName: ${commissionName.trim()}`,
                `notice: ${noticeId.trim()}`,
                `noticeEvaluator.userId: ${evaluatorId}`,
                `_seedTest: true`,
                `verificação pós-inserção: ${found} doc(s) encontrados`,
              ],
            },
          ],
        });
      } catch {
        // log failure não bloqueia
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha durante a inserção.");
    }
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
          <h2 className="mb-1 text-lg font-semibold">Configuração</h2>
          <p className="mb-5 text-sm text-muted-foreground">
            Preencha os dados para criar avaliações de teste no banco.
          </p>
          <div className="space-y-4">
            <Field label="Número do chamado">
              <input
                value={ticket}
                onChange={(e) => setTicket(e.target.value)}
                className="input"
                placeholder="Ex.: 123456"
              />
            </Field>
            <Field label="ObjectId do ciclo (notice)">
              <input
                value={noticeId}
                onChange={(e) => setNoticeId(e.target.value)}
                className="input font-mono"
                placeholder="6838b3554ff3330404eeb85f"
              />
            </Field>
            <Field label="E-mail do avaliador">
              <input
                value={evaluatorEmail}
                onChange={(e) => setEvaluatorEmail(e.target.value)}
                className="input"
                placeholder="avaliador@exemplo.com"
                type="email"
              />
            </Field>
            <Field label="Comissão">
              <input
                value={commissionName}
                onChange={(e) => setCommissionName(e.target.value)}
                className="input"
                placeholder="Ex.: Romance"
              />
            </Field>
            <Field label="Quantidade de avaliações">
              <input
                value={count}
                onChange={(e) => setCount(e.target.value)}
                className="input"
                type="number"
                min={1}
                max={100}
                placeholder="10"
              />
            </Field>
            <Field label="Status das avaliações">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="input"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <ErrorBanner message={error} />
            <button
              onClick={handleSearch}
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? (
                <>
                  <Spinner /> Buscando avaliador…
                </>
              ) : (
                "Continuar"
              )}
            </button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold">Confirmação</h2>
          <p className="mb-5 text-sm text-muted-foreground">
            Revise os dados antes de inserir as avaliações.
          </p>

          <dl className="space-y-3 rounded-md border border-border bg-muted/30 p-4 text-sm">
            <Row label="Chamado" value={ticket} />
            <Row label="Ciclo (notice)" value={noticeId} mono />
            <Row label="Avaliador" value={`${evaluatorName} (${evaluatorEmail})`} />
            <Row label="ID do avaliador" value={evaluatorId ?? ""} mono />
            <Row label="Comissão" value={commissionName} />
            <Row label="Quantidade" value={count} />
            <Row label="Status" value={STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status} />
          </dl>

          <div className="mt-5 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-500">
            <strong>Atenção:</strong> Esta operação é para testes. Os documentos criados terão o campo <code className="font-mono text-xs">_seedTest: true</code> para identificação.
          </div>

          <label className="mt-5 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            Confirmo que os dados estão corretos
          </label>

          <ErrorBanner message={error} />

          <div className="mt-6 flex gap-3">
            <button onClick={() => setStep(1)} className="btn-ghost">
              ← Voltar
            </button>
            <button
              onClick={handleExecute}
              disabled={readOnly || !confirmed}
              title={readOnly ? "Seu perfil tem acesso apenas para visualização." : undefined}
              className="btn-primary flex-1"
            >
              Inserir avaliações
            </button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold">Execução</h2>
          <p className="mb-5 text-sm text-muted-foreground">
            Acompanhe o progresso da inserção.
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
                {count} avaliação(ões) criada(s) com sucesso.
              </div>
              <div className="mt-4 flex gap-3">
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
  const steps = ["Configuração", "Confirmação", "Execução"];
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
      <dd className={`text-right break-all ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
