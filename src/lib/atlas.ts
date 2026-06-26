// API client — calls .NET local API (http://localhost:5000)

export type AtlasAction =
  | "find"
  | "findOne"
  | "updateMany"
  | "updateOne"
  | "replaceOne"
  | "aggregate"
  | "insertOne";

export interface AtlasConfig {
  token: string;
  database: string;
  connectionString?: string;
  systemName?: string;
  sessionLabel?: string;
}

// ─── Systems config (admin-managed, localStorage) ────────────────────────────

export interface SystemSession {
  id: string;
  label: string;
  database: string;
  environment: "production" | "staging" | "local";
}

export interface SystemDefinition {
  id: string;
  name: string;
  description?: string;
  connectionString?: string;
  sessions: SystemSession[];
  createdAt: string;
}

const SYSTEMS_KEY = "pipeon-systems";

const SEED_SYSTEMS: SystemDefinition[] = [
  {
    id: "local",
    name: "Banco Local",
    description: "MongoDB local — mongodb://localhost:27017/",
    connectionString: undefined,
    sessions: [
      { id: "sample-local-conn", label: "target-database", database: "target-database", environment: "local" },
      { id: "local-pipeon", label: "pipeon", database: "pipeon", environment: "local" },
    ],
    createdAt: new Date(0).toISOString(),
  },
];

export function loadSystems(): SystemDefinition[] {
  if (typeof window === "undefined") return SEED_SYSTEMS;
  try {
    const raw = localStorage.getItem(SYSTEMS_KEY);
    if (!raw) {
      localStorage.setItem(SYSTEMS_KEY, JSON.stringify(SEED_SYSTEMS));
      return SEED_SYSTEMS;
    }
    return JSON.parse(raw) as SystemDefinition[];
  } catch {
    return SEED_SYSTEMS;
  }
}

export function saveSystems(systems: SystemDefinition[]): void {
  if (typeof window !== "undefined") localStorage.setItem(SYSTEMS_KEY, JSON.stringify(systems));
}

// ─── Pending auth (token stored between login and session selection) ──────────

const PENDING_AUTH_KEY = "pipeon-pending-auth";

export function savePendingToken(token: string) {
  if (typeof window !== "undefined") sessionStorage.setItem(PENDING_AUTH_KEY, token);
}
export function loadPendingToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(PENDING_AUTH_KEY);
}
export function clearPendingToken() {
  if (typeof window !== "undefined") sessionStorage.removeItem(PENDING_AUTH_KEY);
}

// ─── Selected system ID (stored between select-system and select-session) ─────

const SELECTED_SYSTEM_KEY = "pipeon-selected-system";

export function saveSelectedSystemId(id: string) {
  if (typeof window !== "undefined") sessionStorage.setItem(SELECTED_SYSTEM_KEY, id);
}
export function loadSelectedSystemId(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(SELECTED_SYSTEM_KEY);
}
export function clearSelectedSystemId() {
  if (typeof window !== "undefined") sessionStorage.removeItem(SELECTED_SYSTEM_KEY);
}

// ─── Conexões salvas (admin-only, localStorage) ─────────────────────────────

export interface SavedConnection {
  id: string;
  name: string;
  connectionString: string;
  database: string;
  createdAt: string;
}

const CONNECTIONS_KEY = "pipeon-connections";

export function loadSavedConnections(): SavedConnection[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CONNECTIONS_KEY);
    return raw ? (JSON.parse(raw) as SavedConnection[]) : [];
  } catch {
    return [];
  }
}

export function addSavedConnection(
  conn: Omit<SavedConnection, "id" | "createdAt">,
): SavedConnection {
  const list = loadSavedConnections();
  const entry: SavedConnection = {
    ...conn,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  localStorage.setItem(CONNECTIONS_KEY, JSON.stringify([...list, entry]));
  return entry;
}

export function removeSavedConnection(id: string): void {
  const list = loadSavedConnections().filter((c) => c.id !== id);
  localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(list));
}

// ────────────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "fase-cli-atlas-config";
export const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

export function saveConfig(cfg: AtlasConfig) {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function loadConfig(): AtlasConfig | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AtlasConfig;
  } catch {
    return null;
  }
}

export function clearConfig() {
  sessionStorage.removeItem(STORAGE_KEY);
}

export function setDatabase(database: string) {
  const cfg = loadConfig();
  if (cfg) saveConfig({ ...cfg, database });
}

export async function atlasCall<T = unknown>(
  action: AtlasAction,
  collection: string,
  payload: Record<string, unknown>,
  override?: Partial<AtlasConfig>,
): Promise<T> {
  const cfg = { ...(loadConfig() ?? { token: "", database: "" }), ...override };
  if (!cfg.token) {
    throw new Error("Sessão não iniciada. Faça login novamente.");
  }

  const body = {
    database: cfg.database,
    ...(cfg.connectionString ? { connectionString: cfg.connectionString } : {}),
    collection,
    ...payload,
  };

  const res = await fetch(`${API_BASE}/api/mongodb/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    if (res.status === 401) {
      clearConfig();
      sessionStorage.setItem(
        "pipeon-auth-error",
        "Sessão expirada. Faça login novamente.",
      );
      window.location.replace("/");
      throw new Error("Sessão expirada.");
    }
    let detail = "";
    try {
      const j = await res.json();
      detail = j?.error || JSON.stringify(j);
    } catch {
      detail = await res.text();
    }
    throw new Error(`API ${res.status}: ${detail || res.statusText}`);
  }
  return (await res.json()) as T;
}
