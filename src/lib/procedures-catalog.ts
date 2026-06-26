import { API_BASE, loadConfig } from "./atlas";

export interface ProcedureInput {
  key: string;
  label: string;
  type: "string" | "objectId";
  required: boolean;
}

export interface ProcedureStep {
  collection: string;
  operation: "updateOne" | "updateMany" | "findOne" | "backup" | "resolveByEmail";
  filter: Record<string, unknown>;
  update?: Record<string, unknown>;
  name?: string;
  description?: string;
  /**
   * Apenas para operation "resolveByEmail": campo do documento encontrado a
   * extrair (ex: "_id"). Default: "_id".
   */
  resolveField?: string;
  /**
   * Apenas para operation "resolveByEmail": nome da variável que recebe o
   * valor extraído, disponível como {{variavel}} nos steps seguintes (filter
   * e update), sempre interpolado como ObjectId.
   */
  resolveAs?: string;
}

export interface ProcedureCatalog {
  _id?: string;
  projectId: string;
  nucleo?: string;
  name: string;
  description?: string;
  inputs: ProcedureInput[];
  steps: ProcedureStep[];
  isActive: boolean;
  order: number;
  /** Rota dedicada usada em vez do executor genérico */
  legacyRoute?: string;
  createdAt?: string;
}

function pipeonHeaders(): Record<string, string> {
  const cfg = loadConfig();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cfg?.token ?? ""}`,
  };
}

/**
 * Ordem fixa e determinística dos procedimentos: por `order`, depois `name`,
 * e por fim `_id` como desempate único — garante que a posição de cada
 * procedimento nunca mude entre carregamentos, independente da ordem que o
 * backend devolva ou de procedimentos sem `order` definido.
 */
export function compareProceduresStable(a: ProcedureCatalog, b: ProcedureCatalog): number {
  const ao = typeof a.order === "number" ? a.order : Number.MAX_SAFE_INTEGER;
  const bo = typeof b.order === "number" ? b.order : Number.MAX_SAFE_INTEGER;
  if (ao !== bo) return ao - bo;
  const byName = a.name.localeCompare(b.name, "pt-BR");
  if (byName !== 0) return byName;
  return (a._id ?? "").localeCompare(b._id ?? "");
}

export async function fetchProcedures(projectId?: string): Promise<ProcedureCatalog[]> {
  const url = projectId
    ? `${API_BASE}/api/pipeon/procedures?projectId=${encodeURIComponent(projectId)}`
    : `${API_BASE}/api/pipeon/procedures`;
  const res = await fetch(url, { headers: pipeonHeaders() });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  const data = await res.json();
  const documents: ProcedureCatalog[] = data.documents ?? [];
  return documents.sort(compareProceduresStable);
}

export async function createProcedure(
  procedure: Omit<ProcedureCatalog, "_id" | "createdAt">,
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/pipeon/procedures`, {
    method: "POST",
    headers: pipeonHeaders(),
    body: JSON.stringify(procedure),
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  const data = await res.json();
  return data.insertedId;
}

export async function updateProcedure(
  id: string,
  fields: Partial<Omit<ProcedureCatalog, "_id" | "createdAt">>,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/pipeon/procedures/${id}/update`, {
    method: "POST",
    headers: pipeonHeaders(),
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
}

export async function deleteProcedure(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/pipeon/procedures/${id}/delete`, {
    method: "POST",
    headers: pipeonHeaders(),
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
}
