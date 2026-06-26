import { API_BASE, loadConfig } from "./atlas";
import { currentUserEmail } from "./auth";

export interface ScheduledProcedure {
  _id?: unknown;
  procedureName: string;
  ticket: string;
  noticeId: string;
  evaluatorUserId: string;
  evaluatorName: string;
  evaluatorEmail: string;
  scheduledFor: string;
  scheduledBy: string;
  database: string;
  connectionString?: string;
  recurring?: boolean;
  recurringTime?: string;
  status: "pending" | "executed" | "cancelled" | "failed";
  createdAt: string;
  executedAt?: string;
  autoExecuted?: boolean;
  failError?: string;
}

export interface ScheduledPrefill {
  ticket: string;
  noticeId: string;
  evaluatorUserId: string;
  evaluatorName: string;
  evaluatorEmail: string;
  scheduledId: string;
}

function pipeonHeaders(): Record<string, string> {
  const cfg = loadConfig();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cfg?.token ?? ""}`,
  };
}

export async function saveScheduledProcedure(
  data: Omit<ScheduledProcedure, "_id" | "scheduledBy" | "database" | "connectionString" | "createdAt" | "status">,
): Promise<void> {
  const cfg = loadConfig();
  const document: Omit<ScheduledProcedure, "_id"> = {
    ...data,
    scheduledBy: currentUserEmail(),
    database: cfg?.database ?? "",
    connectionString: cfg?.connectionString,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  const res = await fetch(`${API_BASE}/api/pipeon/scheduled`, {
    method: "POST",
    headers: pipeonHeaders(),
    body: JSON.stringify(document),
  });
  if (!res.ok) throw new Error(`Erro ao agendar: ${res.status}`);
}

export async function fetchDueProcedures(): Promise<ScheduledProcedure[]> {
  try {
    const res = await fetch(`${API_BASE}/api/pipeon/scheduled/due`, {
      headers: pipeonHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.documents ?? [];
  } catch {
    return [];
  }
}

export async function fetchAllScheduled(): Promise<ScheduledProcedure[]> {
  try {
    const res = await fetch(`${API_BASE}/api/pipeon/scheduled`, {
      headers: pipeonHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.documents ?? [];
  } catch {
    return [];
  }
}

export async function markScheduledExecuted(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/pipeon/scheduled/${id}/executed`, {
    method: "POST",
    headers: pipeonHeaders(),
  });
}

export async function cancelScheduled(id: string): Promise<void> {
  await fetch(`${API_BASE}/api/pipeon/scheduled/${id}/cancel`, {
    method: "POST",
    headers: pipeonHeaders(),
  });
}
