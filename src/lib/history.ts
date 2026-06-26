import { API_BASE, loadConfig } from "./atlas";
import { currentUserEmail, currentUserName } from "./auth";

export interface ProcedureStep {
  name: string;
  detail: string;
  changes?: string[];
}

export interface DiffSnapshot {
  before: { statusCounts: Record<string, number>; fieldsPresent: string[] };
  after: { statusCounts: Record<string, number> };
}

export interface ProcedureLog {
  _id?: unknown;
  ticket: string;
  procedureName: string;
  noticeId: string;
  evaluatorName: string;
  evaluatorEmail: string;
  evaluatorUserId?: string;
  affectedCount: number;
  executedBy: string;
  executedByName?: string;
  database: string;
  executedAt: string;
  steps: ProcedureStep[];
  diffSnapshot?: DiffSnapshot;
  autoExecuted?: boolean;
}

function pipeonHeaders(): Record<string, string> {
  const cfg = loadConfig();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cfg?.token ?? ""}`,
  };
}

export async function logProcedure(
  entry: Omit<ProcedureLog, "_id" | "executedBy" | "executedByName" | "database" | "executedAt">,
): Promise<void> {
  const cfg = loadConfig();
  const document: Omit<ProcedureLog, "_id"> = {
    ...entry,
    executedBy: currentUserEmail(),
    executedByName: currentUserName(),
    database: cfg?.database ?? "",
    executedAt: new Date().toISOString(),
  };
  await fetch(`${API_BASE}/api/pipeon/logs`, {
    method: "POST",
    headers: pipeonHeaders(),
    body: JSON.stringify(document),
  });
}

export async function fetchLogs(limit = 200): Promise<ProcedureLog[]> {
  try {
    const res = await fetch(`${API_BASE}/api/pipeon/logs?limit=${limit}`, {
      headers: pipeonHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const docs: ProcedureLog[] = data.documents ?? [];
    return [...docs].sort(
      (a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime(),
    );
  } catch {
    return [];
  }
}
