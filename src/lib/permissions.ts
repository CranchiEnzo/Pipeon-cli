import { API_BASE, loadConfig } from "./atlas";

export type PermissionKey =
  | "procedure"
  | "history"
  | "restore"
  | "scheduled";

export interface PermissionDef {
  key: PermissionKey;
  label: string;
  description: string;
}

export const PERMISSION_DEFS: PermissionDef[] = [
  {
    key: "procedure",
    label: "Executar procedimento",
    description: "Acesso à seleção e execução de procedimentos de manutenção.",
  },
  {
    key: "history",
    label: "Histórico de operações",
    description: "Visualização do histórico de operações executadas.",
  },
  {
    key: "restore",
    label: "Restaurar backup",
    description: "Restauração de documentos a partir de um arquivo de backup.",
  },
  {
    key: "scheduled",
    label: "Procedimentos agendados",
    description: "Visualização e gerenciamento de procedimentos agendados.",
  },
];

export interface RolePermissions {
  operator: PermissionKey[];
  user: PermissionKey[];
}

export const DEFAULT_PERMISSIONS: RolePermissions = {
  operator: ["procedure", "history", "restore", "scheduled"],
  user: ["procedure", "history", "restore", "scheduled"],
};

const STORAGE_KEY = "pipeon-role-permissions";
const PERMISSIONS_DOC_ID = "role_permissions";

function pipeonHeaders(): Record<string, string> {
  const cfg = loadConfig();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cfg?.token ?? ""}`,
  };
}

// ─── Cache local (localStorage) ─────────────────────────────────────────────

export function loadRolePermissions(): RolePermissions {
  if (typeof window === "undefined") return DEFAULT_PERMISSIONS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PERMISSIONS;
    const parsed = JSON.parse(raw) as Partial<RolePermissions>;
    return {
      operator: parsed.operator ?? DEFAULT_PERMISSIONS.operator,
      user: parsed.user ?? DEFAULT_PERMISSIONS.user,
    };
  } catch {
    return DEFAULT_PERMISSIONS;
  }
}

export function saveRolePermissions(perms: RolePermissions): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(perms));
}

export function resetRolePermissions(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// ─── Persistência no MongoDB (sempre banco pipeon via endpoint dedicado) ──────

export async function savePermissionsToDb(perms: RolePermissions): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/pipeon/settings/${PERMISSIONS_DOC_ID}`, {
      method: "POST",
      headers: pipeonHeaders(),
      body: JSON.stringify(perms),
    });
  } catch {
    // Falha silenciosa — localStorage já foi atualizado
  }
}

export async function resetPermissionsInDb(): Promise<void> {
  try {
    await fetch(`${API_BASE}/api/pipeon/settings/${PERMISSIONS_DOC_ID}`, {
      method: "POST",
      headers: pipeonHeaders(),
      body: JSON.stringify(DEFAULT_PERMISSIONS),
    });
  } catch {
    // Falha silenciosa
  }
}

/** Busca as permissões do banco pipeon e atualiza o cache local.
 *  Chamado no login para garantir que as configurações do admin
 *  sejam aplicadas independente do banco de avaliações selecionado. */
export async function syncPermissionsFromDb(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/api/pipeon/settings/${PERMISSIONS_DOC_ID}`, {
      headers: pipeonHeaders(),
    });
    if (!res.ok) return;
    const data = await res.json() as { document: (RolePermissions & { _id: string }) | null };
    const doc = data.document;
    if (doc) {
      saveRolePermissions({
        operator: doc.operator ?? DEFAULT_PERMISSIONS.operator,
        user: doc.user ?? DEFAULT_PERMISSIONS.user,
      });
    } else {
      saveRolePermissions(DEFAULT_PERMISSIONS);
    }
  } catch {
    // Falha de rede — mantém cache local
  }
}

// ─── Verificação ─────────────────────────────────────────────────────────────

export function checkPermission(role: string, key: PermissionKey): boolean {
  const r = role.toLowerCase();
  if (r === "admin") return true;
  const perms = loadRolePermissions();
  const list: PermissionKey[] = r === "operator" ? perms.operator : perms.user;
  return list.includes(key);
}
