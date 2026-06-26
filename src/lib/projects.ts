import { API_BASE, loadConfig } from "./atlas";

export interface Project {
  _id?: string;
  slug: string;
  name: string;
  description?: string;
  targetDatabase: string;
  nucleos?: string[];
  isActive: boolean;
  createdAt?: string;
}

function pipeonHeaders(): Record<string, string> {
  const cfg = loadConfig();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cfg?.token ?? ""}`,
  };
}

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/api/pipeon/projects`, { headers: pipeonHeaders() });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  const data = await res.json();
  return data.documents ?? [];
}

export async function createProject(
  project: Omit<Project, "_id" | "createdAt">,
): Promise<string> {
  const res = await fetch(`${API_BASE}/api/pipeon/projects`, {
    method: "POST",
    headers: pipeonHeaders(),
    body: JSON.stringify(project),
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
  const data = await res.json();
  return data.insertedId;
}

export async function updateProject(
  id: string,
  fields: Partial<Omit<Project, "_id" | "createdAt">>,
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/pipeon/projects/${id}/update`, {
    method: "POST",
    headers: pipeonHeaders(),
    body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
}

export async function deleteProject(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/pipeon/projects/${id}/delete`, {
    method: "POST",
    headers: pipeonHeaders(),
  });
  if (!res.ok) throw new Error(`Erro ${res.status}`);
}
