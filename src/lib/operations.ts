import { API_BASE, loadConfig } from "./atlas";
import { currentUserEmail, currentUserName } from "./auth";

export interface Operation {
  _id?: string;
  procedureId: string;
  procedureName: string;
  projectId: string;
  projectName: string;
  ticketId: string;
  executedBy: string;
  executedByName?: string;
  executedAt: string;
  database: string;
  status: "success" | "error";
  affectedDocs: Record<string, number>;
  error?: string;
}

function pipeonHeaders(): Record<string, string> {
  const cfg = loadConfig();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cfg?.token ?? ""}`,
  };
}

export async function logOperation(
  entry: Omit<Operation, "_id" | "executedBy" | "executedByName" | "executedAt" | "database">,
): Promise<void> {
  const cfg = loadConfig();
  const document: Omit<Operation, "_id"> = {
    ...entry,
    executedBy: currentUserEmail(),
    executedByName: currentUserName(),
    database: cfg?.database ?? "",
    executedAt: new Date().toISOString(),
  };
  await fetch(`${API_BASE}/api/pipeon/operations`, {
    method: "POST",
    headers: pipeonHeaders(),
    body: JSON.stringify(document),
  });
}

export async function fetchOperations(filters?: {
  ticketId?: string;
  procedureId?: string;
  projectId?: string;
  limit?: number;
}): Promise<Operation[]> {
  const params = new URLSearchParams();
  if (filters?.ticketId) params.set("ticketId", filters.ticketId);
  if (filters?.procedureId) params.set("procedureId", filters.procedureId);
  if (filters?.projectId) params.set("projectId", filters.projectId);
  if (filters?.limit) params.set("limit", String(filters.limit));
  try {
    const res = await fetch(`${API_BASE}/api/pipeon/operations?${params}`, {
      headers: pipeonHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.documents ?? [];
  } catch {
    return [];
  }
}
