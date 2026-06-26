import { createFileRoute, useNavigate } from "@tanstack/react-router";
import React, { useEffect, useState } from "react";
import { Shell, BrandHeader, Card, Spinner, ErrorBanner } from "@/components/Shell";
import { DbBadge, BackLink } from "@/components/DbBadge";
import { loadConfig } from "@/lib/atlas";
import { decodeToken } from "@/lib/auth";
import {
  PERMISSION_DEFS,
  DEFAULT_PERMISSIONS,
  loadRolePermissions,
  saveRolePermissions,
  savePermissionsToDb,
  resetRolePermissions,
  resetPermissionsInDb,
  type PermissionKey,
  type RolePermissions,
} from "@/lib/permissions";
import {
  loadSystems,
  saveSystems,
  type SystemDefinition,
  type SystemSession,
} from "@/lib/atlas";
import {
  fetchProcedures,
  createProcedure,
  type ProcedureCatalog,
} from "@/lib/procedures-catalog";
import { fetchProjects, createProject, updateProject, deleteProject, type Project } from "@/lib/projects";

// â"€â"€â"€ Interfaces â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

interface PipeonUser {
  id: string;
  name?: string;
  email?: string;
  role?: string;
  isActive?: boolean;
  createdAt?: string;
}

type AdminTab = "users" | "permissions" | "systems" | "projects" | "procedures";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

function authHeaders(): HeadersInit {
  const cfg = loadConfig();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cfg?.token ?? ""}`,
  };
}

// â"€â"€â"€ Route â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Pipeon — Admin" }] }),
  component: AdminPage,
});

// â"€â"€â"€ Main Page â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function AdminPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<AdminTab>("users");

  useEffect(() => {
    const cfg = loadConfig();
    const token = decodeToken();
    if (!cfg || (token?.role as string)?.toLowerCase() !== "admin") {
      navigate({ to: "/menu" });
    }
  }, [navigate]);

  return (
    <Shell>
      <DbBadge />
      <BackLink to="/menu" />
      <BrandHeader subtitle={false} />

      <h2 className="mb-5 text-xl font-semibold">🛡️ Painel de administração</h2>

      {/* Tab bar */}
      <div className="mb-6 flex gap-1 border-b border-border">
        <TabButton
          active={activeTab === "users"}
          onClick={() => setActiveTab("users")}
          label="Usuários"
        />
        <TabButton
          active={activeTab === "permissions"}
          onClick={() => setActiveTab("permissions")}
          label="Permissões por cargo"
        />
        <TabButton
          active={activeTab === "systems"}
          onClick={() => setActiveTab("systems")}
          label="Sistemas e Ambientes (Strings)"
        />
        <TabButton
          active={activeTab === "projects"}
          onClick={() => setActiveTab("projects")}
          label="Projetos"
        />
        <TabButton
          active={activeTab === "procedures"}
          onClick={() => setActiveTab("procedures")}
          label="Procedimentos"
        />
      </div>

      {activeTab === "users" && <UsersTab />}
      {activeTab === "permissions" && <PermissionsTab />}
      {activeTab === "systems" && <SystemsTab />}
      {activeTab === "projects" && <ProjectsTab />}
      {activeTab === "procedures" && <ProceduresTab />}

      <Style />
    </Shell>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

// â"€â"€â"€ Users Tab â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function UsersTab() {
  const [users, setUsers] = useState<PipeonUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/users`, { headers: authHeaders() });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const data = (await res.json()) as { documents: PipeonUser[] };
      setUsers(data.documents ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar usuários.");
    } finally {
      setLoading(false);
    }
  }

  function flash(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  async function toggleActive(user: PipeonUser) {
    setUpdatingId(user.id);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/users/${user.id}/update`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      setUsers((prev) =>
        prev.map((u) => (u.id === user.id ? { ...u, isActive: !user.isActive } : u)),
      );
      flash(user.isActive ? "Conta desativada." : "Conta ativada.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao atualizar usuário.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function changeRole(user: PipeonUser, role: string) {
    setUpdatingId(user.id);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/users/${user.id}/update`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role } : u)));
      flash("Permissão atualizada.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao atualizar permissão.");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-sm uppercase tracking-wider text-muted-foreground">Usuários</h2>
          {!loading && (
            <p className="mt-0.5 text-xs text-muted-foreground">{users.length} usuário(s)</p>
          )}
        </div>
        <button onClick={() => setShowCreate((v) => !v)} className="btn-primary-sm">
          {showCreate ? "Cancelar" : "+ Novo usuário"}
        </button>
      </div>

      {showCreate && (
        <CreateUserForm
          onCreated={() => {
            setShowCreate(false);
            loadUsers();
            flash("Usuário criado com sucesso.");
          }}
          onError={(msg) => setError(msg)}
        />
      )}

      <ErrorBanner message={error} />

      {successMsg && (
        <div className="mb-4 rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
          {successMsg}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Spinner /> Carregando…
        </div>
      )}

      {!loading && !error && users.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Nenhum usuário encontrado.
        </p>
      )}

      <div className="space-y-3">
        {users.map((u) => (
          <UserCard
            key={u.id}
            user={u}
            busy={updatingId === u.id}
            onToggleActive={() => toggleActive(u)}
            onRoleChange={(role) => changeRole(u, role)}
          />
        ))}
      </div>
    </>
  );
}

// â"€â"€â"€ Permissions Tab â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function PermissionsTab() {
  const [perms, setPerms] = useState<RolePermissions>(() => loadRolePermissions());
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  function togglePerm(role: "operator" | "user", key: PermissionKey) {
    setPerms((prev) => {
      const list = prev[role];
      const next = list.includes(key) ? list.filter((k) => k !== key) : [...list, key];
      return { ...prev, [role]: next };
    });
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    saveRolePermissions(perms);
    await savePermissionsToDb(perms);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  async function handleReset() {
    resetRolePermissions();
    setPerms(DEFAULT_PERMISSIONS);
    setSaved(false);
    await resetPermissionsInDb();
  }

  const DISPLAY_DEFS = PERMISSION_DEFS;
  const ROLES: { key: "operator" | "user"; label: string }[] = [
    { key: "operator", label: "Operador" },
    { key: "user", label: "Usuário" },
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm uppercase tracking-wider text-muted-foreground">
            Permissões por cargo
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Admin sempre possui acesso total. Configure as permissões de Operador e Usuário.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleReset} disabled={saving} className="btn-ghost-sm">
            Redefinir padrões
          </button>
          <button onClick={handleSave} disabled={saving} className="btn-primary-sm">
            {saving ? "Salvando…" : "Salvar alterações"}
          </button>
        </div>
      </div>

      {saved && (
        <div className="mb-4 rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
          Permissões salvas com sucesso.
        </div>
      )}

      <Card className="overflow-hidden p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Funcionalidade
              </th>
              <th className="w-40 px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Admin
              </th>
              {ROLES.map((r) => (
                <th
                  key={r.key}
                  className="w-40 px-4 py-3 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground"
                >
                  {r.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {DISPLAY_DEFS.map((def) => (
              <tr key={def.key} className="transition hover:bg-muted/20">
                <td className="px-5 py-3.5">
                  <p className="font-medium text-foreground">{def.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{def.description}</p>
                </td>
                <td className="px-4 py-3.5 text-center">
                  <Toggle checked disabled />
                </td>
                {ROLES.map((r) => {
                  const checked = perms[r.key].includes(def.key);
                  return (
                    <td key={r.key} className="px-4 py-3.5 text-center">
                      <Toggle checked={checked} onChange={() => togglePerm(r.key, def.key)} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

// â"€â"€â"€ Systems Tab â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

const ENV_LABELS: Record<string, string> = {
  production: "Produção",
  staging: "Homologação",
  local: "Local",
};

function SystemsTab() {
  const [systems, setSystems] = useState<SystemDefinition[]>(() => loadSystems());
  const [showAddSystem, setShowAddSystem] = useState(false);
  const [addingSessionTo, setAddingSessionTo] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showUri, setShowUri] = useState<Record<string, boolean>>({});
  const [flash, setFlash] = useState<string | null>(null);

  const [sysForm, setSysForm] = useState({ name: "", description: "", connectionString: "" });
  const [sysFormError, setSysFormError] = useState<string | null>(null);

  const [sesForm, setSesForm] = useState({
    label: "",
    database: "",
    environment: "production" as SystemSession["environment"],
  });
  const [sesFormError, setSesFormError] = useState<string | null>(null);

  function persist(updated: SystemDefinition[]) {
    saveSystems(updated);
    setSystems(updated);
  }

  function showFlash(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 2500);
  }

  function handleAddSystem(e: React.FormEvent) {
    e.preventDefault();
    setSysFormError(null);
    if (!sysForm.name.trim()) {
      setSysFormError("O nome do sistema é obrigatório.");
      return;
    }
    if (sysForm.connectionString && !sysForm.connectionString.startsWith("mongodb")) {
      setSysFormError("A string de conexão deve começar com mongodb:// ou mongodb+srv://");
      return;
    }
    const newSys: SystemDefinition = {
      id: crypto.randomUUID(),
      name: sysForm.name.trim(),
      description: sysForm.description.trim() || undefined,
      connectionString: sysForm.connectionString.trim() || undefined,
      sessions: [],
      createdAt: new Date().toISOString(),
    };
    persist([...systems, newSys]);
    setSysForm({ name: "", description: "", connectionString: "" });
    setShowAddSystem(false);
    setExpandedId(newSys.id);
    showFlash("Sistema adicionado.");
  }

  function handleRemoveSystem(id: string) {
    persist(systems.filter((s) => s.id !== id));
    showFlash("Sistema removido.");
  }

  function handleAddSession(e: React.FormEvent, systemId: string) {
    e.preventDefault();
    setSesFormError(null);
    if (!sesForm.label.trim() || !sesForm.database.trim()) {
      setSesFormError("Label e banco de dados são obrigatórios.");
      return;
    }
    const newSession: SystemSession = {
      id: crypto.randomUUID(),
      label: sesForm.label.trim(),
      database: sesForm.database.trim(),
      environment: sesForm.environment,
    };
    const updated = systems.map((s) =>
      s.id === systemId ? { ...s, sessions: [...s.sessions, newSession] } : s,
    );
    persist(updated);
    setSesForm({ label: "", database: "", environment: "production" });
    setAddingSessionTo(null);
    showFlash("Ambiente adicionado.");
  }

  function handleRemoveSession(systemId: string, sessionId: string) {
    const updated = systems.map((s) =>
      s.id === systemId
        ? { ...s, sessions: s.sessions.filter((ses) => ses.id !== sessionId) }
        : s,
    );
    persist(updated);
    showFlash("Ambiente removido.");
  }

  function maskUri(uri: string) {
    return uri.replace(/\/\/([^:@]+)(:[^@]+)?@/, "//***@");
  }

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm uppercase tracking-wider text-muted-foreground">
            Sistemas e ambientes
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Configure os sistemas e seus ambientes de acesso (produção, homologação, local).
          </p>
        </div>
        <button
          onClick={() => {
            setShowAddSystem((v) => !v);
            setSysFormError(null);
          }}
          className="btn-primary-sm"
        >
          {showAddSystem ? "Cancelar" : "+ Novo sistema"}
        </button>
      </div>

      {flash && (
        <div className="mb-4 rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
          {flash}
        </div>
      )}

      {showAddSystem && (
        <Card className="mb-5 p-5">
          <h3 className="mb-4 text-sm font-semibold">Novo sistema</h3>
          <form onSubmit={handleAddSystem} className="space-y-3" autoComplete="off">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome do sistema">
                <input
                  value={sysForm.name}
                  onChange={(e) => setSysForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder='ex: "[INTERNAL-SYSTEM] Expresso", "APAA"'
                  className="input"
                />
              </Field>
              <Field label="Descrição (opcional)">
                <input
                  value={sysForm.description}
                  onChange={(e) => setSysForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder='ex: "Ciclos culturais [INTERNAL-SYSTEM]"'
                  className="input"
                />
              </Field>
            </div>
            <Field label="String de conexão MongoDB (deixe em branco para API padrão)">
              <input
                type="password"
                value={sysForm.connectionString}
                onChange={(e) =>
                  setSysForm((f) => ({ ...f, connectionString: e.target.value }))
                }
                placeholder="mongodb+srv://usuario:senha@cluster.mongodb.net"
                autoComplete="new-password"
                className="input"
              />
            </Field>
            {sysFormError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {sysFormError}
              </div>
            )}
            <button type="submit" className="btn-primary w-full">
              Criar sistema
            </button>
          </form>
        </Card>
      )}

      {systems.length === 0 && !showAddSystem && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nenhum sistema cadastrado. Crie o primeiro sistema para configurar os ambientes.
        </p>
      )}

      <div className="space-y-3">
        {systems.map((sys) => {
          const isExpanded = expandedId === sys.id;
          return (
            <Card key={sys.id} className="overflow-hidden p-0">
              <div className="flex items-center justify-between px-5 py-4">
                <button
                  className="flex-1 text-left"
                  onClick={() => setExpandedId(isExpanded ? null : sys.id)}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{sys.name}</span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                      {sys.sessions.length} ambiente(s)
                    </span>
                  </div>
                  {sys.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{sys.description}</p>
                  )}
                </button>
                <div className="ml-3 flex items-center gap-2">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : sys.id)}
                    className="text-xs text-muted-foreground transition hover:text-foreground"
                  >
                    {isExpanded ? "▲" : "▼"}
                  </button>
                  <button onClick={() => handleRemoveSystem(sys.id)} className="btn-danger">
                    Remover
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-border px-5 pb-4 pt-3">
                  {sys.connectionString && (
                    <div className="mb-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="font-mono">
                        {showUri[sys.id]
                          ? sys.connectionString
                          : maskUri(sys.connectionString)}
                      </span>
                      <button
                        onClick={() =>
                          setShowUri((v) => ({ ...v, [sys.id]: !v[sys.id] }))
                        }
                        className="underline hover:text-foreground"
                      >
                        {showUri[sys.id] ? "ocultar" : "exibir URI"}
                      </button>
                    </div>
                  )}

                  {sys.sessions.length > 0 && (
                    <div className="mb-3 space-y-2">
                      {sys.sessions.map((ses) => (
                        <div
                          key={ses.id}
                          className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-4 py-2.5"
                        >
                          <div>
                            <span className="text-sm font-medium">{ses.label}</span>
                            <span className="ml-2 font-mono text-xs text-muted-foreground">
                              {ses.database}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span
                              className={`text-[11px] font-semibold uppercase ${
                                ses.environment === "production"
                                  ? "text-destructive"
                                  : ses.environment === "staging"
                                    ? "text-yellow-500"
                                    : "text-primary"
                              }`}
                            >
                              {ENV_LABELS[ses.environment] ?? ses.environment}
                            </span>
                            <button
                              onClick={() => handleRemoveSession(sys.id, ses.id)}
                              className="text-xs text-muted-foreground transition hover:text-destructive"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {addingSessionTo === sys.id ? (
                    <form
                      onSubmit={(e) => handleAddSession(e, sys.id)}
                      className="space-y-3 rounded-lg border border-border p-4"
                    >
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Novo ambiente
                      </h4>
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Field label="Label">
                          <input
                            value={sesForm.label}
                            onChange={(e) =>
                              setSesForm((f) => ({ ...f, label: e.target.value }))
                            }
                            placeholder='ex: "Produção"'
                            className="input"
                          />
                        </Field>
                        <Field label="Database">
                          <input
                            value={sesForm.database}
                            onChange={(e) =>
                              setSesForm((f) => ({ ...f, database: e.target.value }))
                            }
                            placeholder='ex: "target-database"'
                            className="input"
                          />
                        </Field>
                        <Field label="Tipo">
                          <select
                            value={sesForm.environment}
                            onChange={(e) =>
                              setSesForm((f) => ({
                                ...f,
                                environment: e.target.value as SystemSession["environment"],
                              }))
                            }
                            className="input"
                          >
                            <option value="production">Produção</option>
                            <option value="staging">Homologação</option>
                            <option value="local">Local</option>
                          </select>
                        </Field>
                      </div>
                      {sesFormError && (
                        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                          {sesFormError}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button type="submit" className="btn-primary-sm">
                          Salvar ambiente
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAddingSessionTo(null);
                            setSesFormError(null);
                          }}
                          className="btn-ghost-sm"
                        >
                          Cancelar
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      onClick={() => {
                        setAddingSessionTo(sys.id);
                        setSesFormError(null);
                      }}
                      className="btn-ghost-sm text-xs"
                    >
                      + Adicionar ambiente
                    </button>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}

// ─── System Procedure Register Card ─────────────────────────────────────────

function SystemProcedureRegisterCard({
  sp,
  projects,
  allNucleos,
  onRegistered,
}: {
  sp: { id: string; name: string; description: string; legacyRoute: string };
  projects: Project[];
  allNucleos: string[];
  onRegistered: () => Promise<void>;
}) {
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?._id ?? "");
  const [selectedNucleo, setSelectedNucleo] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRegister() {
    if (!selectedProjectId) return;
    setSaving(true);
    setError(null);
    try {
      await createProcedure({
        projectId: selectedProjectId,
        nucleo: selectedNucleo || undefined,
        name: sp.name,
        description: sp.description,
        inputs: [],
        steps: [],
        isActive: true,
        order: 0,
        legacyRoute: sp.legacyRoute,
      });
      await onRegistered();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao registrar.");
      setSaving(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{sp.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{sp.description}</p>

          {open && (
            <div className="mt-3 space-y-3 border-t border-border pt-3">
              {projects.length === 0 ? (
                <p className="text-xs text-yellow-500">
                  Nenhum projeto cadastrado. Crie um projeto primeiro.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Projeto
                    </p>
                    <select
                      value={selectedProjectId}
                      onChange={(e) => setSelectedProjectId(e.target.value)}
                      className="select w-full"
                    >
                      {projects.map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Núcleo
                    </p>
                    <select
                      value={selectedNucleo}
                      onChange={(e) => setSelectedNucleo(e.target.value)}
                      className="select w-full"
                    >
                      <option value="">Nenhum</option>
                      {allNucleos.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              {error && <p className="text-xs text-destructive">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => void handleRegister()}
                  disabled={saving || projects.length === 0}
                  className="btn-primary-sm"
                >
                  {saving ? <><Spinner /> Registrando…</> : "Confirmar registro"}
                </button>
                <button onClick={() => setOpen(false)} className="btn-ghost-sm">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        {!open && (
          <button onClick={() => setOpen(true)} className="btn-primary-sm shrink-0">
            Registrar
          </button>
        )}
      </div>
    </Card>
  );
}

// ─── Nucleo Manager ──────────────────────────────────────────────────────────

function NucleoManager({
  project,
  onUpdated,
}: {
  project: Project;
  onUpdated: (nucleos: string[]) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [newNucleo, setNewNucleo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nucleos = project.nucleos ?? [];

  async function handleAdd() {
    const trimmed = newNucleo.trim();
    if (!trimmed || !project._id) return;
    if (nucleos.includes(trimmed)) {
      setError("Esse núcleo já existe.");
      return;
    }
    setSaving(true);
    setError(null);
    const updated = [...nucleos, trimmed];
    try {
      await updateProject(project._id, { nucleos: updated });
      onUpdated(updated);
      setNewNucleo("");
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(nucleo: string) {
    if (!project._id) return;
    const updated = nucleos.filter((n) => n !== nucleo);
    try {
      await updateProject(project._id, { nucleos: updated });
      onUpdated(updated);
    } catch {
      // silencia — UI não atualiza se falhar
    }
  }

  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Núcleos
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {nucleos.map((n) => (
          <span
            key={n}
            className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 pl-2.5 pr-1.5 py-0.5 text-[11px] font-semibold text-primary"
          >
            {n}
            <button
              onClick={() => void handleRemove(n)}
              className="ml-0.5 rounded-full transition-colors hover:text-destructive"
              title={`Remover ${n}`}
            >
              ×
            </button>
          </span>
        ))}
        {adding ? (
          <div className="flex items-center gap-1.5">
            <input
              value={newNucleo}
              onChange={(e) => setNewNucleo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleAdd();
                if (e.key === "Escape") { setAdding(false); setNewNucleo(""); setError(null); }
              }}
              placeholder="Nome do núcleo"
              className="input h-6 w-32 px-2 text-xs"
              autoFocus
            />
            <button
              onClick={() => void handleAdd()}
              disabled={saving || !newNucleo.trim()}
              className="btn-primary-sm px-2 py-0.5 text-[11px]"
            >
              {saving ? <Spinner /> : "OK"}
            </button>
            <button
              onClick={() => { setAdding(false); setNewNucleo(""); setError(null); }}
              className="text-[11px] text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="rounded-full border border-dashed border-border px-2.5 py-0.5 text-[11px] text-muted-foreground transition hover:border-primary/40 hover:text-primary"
          >
            + Núcleo
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

// ─── Projects Tab ────────────────────────────────────────────────────────────

function ProjectsTab() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [form, setForm] = useState({
    name: "",
    slug: "",
    description: "",
    targetDatabase: "target-database",
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  async function loadProjects() {
    setLoading(true);
    setError(null);
    try {
      setProjects(await fetchProjects());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar projetos.");
    } finally {
      setLoading(false);
    }
  }

  function showFlash(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 3000);
  }

  function slugify(str: string) {
    return str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function handleNameChange(name: string) {
    setForm((f) => ({ ...f, name, slug: slugify(name) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!form.name.trim() || !form.slug.trim() || !form.targetDatabase.trim()) {
      setFormError("Nome, slug e banco de dados são obrigatórios.");
      return;
    }
    setSaving(true);
    try {
      await createProject({
        name: form.name.trim(),
        slug: form.slug.trim(),
        description: form.description.trim() || undefined,
        targetDatabase: form.targetDatabase.trim(),
        isActive: true,
      });
      setForm({ name: "", slug: "", description: "", targetDatabase: "target-database" });
      setShowForm(false);
      await loadProjects();
      showFlash("Projeto criado com sucesso.");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Erro ao criar projeto.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteProject(id);
      setProjects((prev) => prev.filter((p) => p._id !== id));
      showFlash("Projeto removido.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao remover projeto.");
    }
  }

  if (loading)
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
        <Spinner /> Carregando…
      </div>
    );

  return (
    <>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm uppercase tracking-wider text-muted-foreground">Projetos</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Projetos cadastrados em pipeon_projects. Procedimentos herdam o ID do projeto.
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm((v) => !v);
            setFormError(null);
          }}
          className="btn-primary-sm"
        >
          {showForm ? "Cancelar" : "+ Novo projeto"}
        </button>
      </div>

      {flash && (
        <div className="mb-4 rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
          {flash}
        </div>
      )}

      <ErrorBanner message={error} />

      {showForm && (
        <Card className="mb-5 p-5">
          <h3 className="mb-4 text-sm font-semibold">Novo projeto</h3>
          <form onSubmit={handleSubmit} className="space-y-3" autoComplete="off">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome do projeto">
                <input
                  value={form.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder='ex: "[INTERNAL-SYSTEM] Expresso"'
                  className="input"
                />
              </Field>
              <Field label="Slug (identificador único)">
                <input
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  placeholder='ex: "target-database"'
                  className="input"
                />
              </Field>
            </div>
            <Field label="Descrição (opcional)">
              <input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder='ex: "Ciclos culturais [INTERNAL-SYSTEM]"'
                className="input"
              />
            </Field>
            <Field label="Banco de dados alvo">
              <input
                value={form.targetDatabase}
                onChange={(e) => setForm((f) => ({ ...f, targetDatabase: e.target.value }))}
                placeholder="target-database"
                className="input"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Os procedimentos deste projeto operarão neste banco.
              </p>
            </Field>
            {formError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {formError}
              </div>
            )}
            <button type="submit" disabled={saving} className="btn-primary w-full">
              {saving ? <><Spinner /> Criando…</> : "Criar projeto"}
            </button>
          </form>
        </Card>
      )}

      {projects.length === 0 && !showForm ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Nenhum projeto cadastrado. Crie o primeiro projeto para associar procedimentos.
        </p>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <Card key={p._id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase ${
                        p.isActive
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {p.isActive ? "Ativo" : "Inativo"}
                    </span>
                    <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                      {p.slug}
                    </span>
                  </div>
                  {p.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{p.description}</p>
                  )}
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    banco: {p.targetDatabase}
                  </p>
                  {p._id && (
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      id: {p._id}
                    </p>
                  )}

                  {/* Núcleos do projeto */}
                  <NucleoManager
                    project={p}
                    onUpdated={(nucleos: string[]) =>
                      setProjects((prev) =>
                        prev.map((x) => (x._id === p._id ? { ...x, nucleos } : x))
                      )
                    }
                  />
                </div>
                <button
                  onClick={() => p._id && void handleDelete(p._id)}
                  className="btn-danger shrink-0 self-start"
                >
                  Remover
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Procedure Card ──────────────────────────────────────────────────────────

// ─── Nucleo Group Card ───────────────────────────────────────────────────────

const NUCLEO_ACCENT_COLORS = [
  { dot: "#3b82f6", border: "border-blue-500/40",   header: "bg-blue-500/5"   },
  { dot: "#f59e0b", border: "border-amber-500/40",  header: "bg-amber-500/5"  },
  { dot: "#8b5cf6", border: "border-violet-500/40", header: "bg-violet-500/5" },
  { dot: "#10b981", border: "border-emerald-500/40",header: "bg-emerald-500/5"},
  { dot: "#ef4444", border: "border-rose-500/40",   header: "bg-rose-500/5"   },
];

function NucleoNavCard({
  nucleo,
  colorIndex,
  count,
}: {
  nucleo: string;
  colorIndex: number;
  count: number;
}) {
  const navigate = useNavigate();
  const color =
    NUCLEO_ACCENT_COLORS[colorIndex % NUCLEO_ACCENT_COLORS.length] ??
    NUCLEO_ACCENT_COLORS[0]!;

  return (
    <button
      onClick={() =>
        void navigate({ to: "/admin-nucleus/$nucleo", params: { nucleo } })
      }
      className={`group w-full overflow-hidden rounded-xl border text-left transition hover:shadow-md ${color.border}`}
    >
      <div className="h-1" style={{ backgroundColor: color.dot }} />
      <div className={`px-5 py-5 ${color.header}`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: color.dot }}
            />
            <span className="font-semibold">{nucleo}</span>
          </div>
          <span className="text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground">
            →
          </span>
        </div>
        <p className="mt-3 text-3xl font-bold tabular-nums">{count}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {count === 1 ? "procedimento" : "procedimentos"}
        </p>
        <p className="mt-4 text-xs font-medium text-muted-foreground transition group-hover:text-foreground">
          Ver procedimentos →
        </p>
      </div>
    </button>
  );
}


// ─── Unlinked Nucleo Card ────────────────────────────────────────────────────

function UnlinkedNucleoCard({ count }: { count: number }) {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => void navigate({ to: "/admin-nucleus/$nucleo", params: { nucleo: "sem-vinculo" } })}
      className="group w-full overflow-hidden rounded-xl border border-dashed border-border text-left transition hover:shadow-md"
    >
      <div className="h-1 bg-muted" />
      <div className="px-5 py-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/40" />
            <span className="font-semibold text-muted-foreground">Sem vínculo</span>
          </div>
          <span className="text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground">
            →
          </span>
        </div>
        <p className="mt-3 text-3xl font-bold tabular-nums text-muted-foreground">{count}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {count === 1 ? "procedimento" : "procedimentos"}
        </p>
        <p className="mt-4 text-xs font-medium text-muted-foreground transition group-hover:text-foreground">
          Ver e vincular →
        </p>
      </div>
    </button>
  );
}

// ─── Procedures Tab ──────────────────────────────────────────────────────────

/** Procedimentos nativos do sistema que podem ser registrados no catálogo */
const SYSTEM_PROCEDURES_CATALOG = [
  {
    id: "reset-evaluations",
    name: "Retornar avaliações para pendentes para substituição de avaliador(a)",
    description:
      "Reseta avaliações de um avaliador para NOTSTARTED, com backup automático e limpeza dos campos de formulário.",
    legacyRoute: "/procedure/reset-evaluations",
  },
] as const;

function ProceduresTab() {
  const [procedures, setProcedures] = useState<ProcedureCatalog[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [procs, projs] = await Promise.all([fetchProcedures(), fetchProjects()]);
      setProcedures(procs);
      setProjects(projs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar dados.");
    } finally {
      setLoading(false);
    }
  }

  if (loading)
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
        <Spinner /> Carregando…
      </div>
    );

  const allNucleos = [...new Set(projects.flatMap((p) => p.nucleos ?? []))];
  const unlinkedProcedures = procedures.filter((p) => !p.nucleo);

  return (
    <>
      {(() => {
        const unregistered = SYSTEM_PROCEDURES_CATALOG.filter(
          (sp) => !procedures.some((p) => p.legacyRoute === sp.legacyRoute),
        );
        if (unregistered.length === 0) return null;
        return (
          <div className="mb-6">
            <h2 className="mb-2 text-sm uppercase tracking-wider text-muted-foreground">
              Procedimentos do sistema
            </h2>
            <p className="mb-3 text-xs text-muted-foreground">
              Procedimentos nativos ainda não visíveis no catálogo. Registre-os para que apareçam
              na aba de execução e possam receber um núcleo.
            </p>
            <div className="space-y-2">
              {unregistered.map((sp) => (
                <SystemProcedureRegisterCard
                  key={sp.id}
                  sp={sp}
                  projects={projects}
                  allNucleos={allNucleos}
                  onRegistered={async () => {
                    await loadData();
                  }}
                />
              ))}
            </div>
          </div>
        );
      })()}

      <div className="mb-5">
        <h2 className="text-sm uppercase tracking-wider text-muted-foreground">
          Procedimentos por núcleo
        </h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {procedures.length} procedimento(s) · {allNucleos.length} núcleo(s)
        </p>
      </div>

      <ErrorBanner message={error} />

      {allNucleos.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Configure núcleos na aba <strong>Projetos</strong> para organizá-los aqui.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {allNucleos.map((nucleo, idx) => (
            <NucleoNavCard
              key={nucleo}
              nucleo={nucleo}
              colorIndex={idx}
              count={procedures.filter((p) => p.nucleo === nucleo).length}
            />
          ))}
          {unlinkedProcedures.length > 0 && (
            <UnlinkedNucleoCard count={unlinkedProcedures.length} />
          )}
        </div>
      )}
    </>
  );
}

// â"€â"€â"€ Shared components â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€â"€

function CreateUserForm({
  onCreated,
  onError,
}: {
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);
    if (!name.trim() || !email.trim() || !password.trim()) {
      setLocalError("Preencha todos os campos.");
      return;
    }
    if (password.length < 6) {
      setLocalError("A senha deve ter ao menos 6 caracteres.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/users`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password, role }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { message?: string }).message ?? `API ${res.status}: ${res.statusText}`,
        );
      }

      onCreated();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao criar usuário.";
      setLocalError(msg);
      onError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mb-5 p-5">
      <h3 className="mb-4 text-sm font-semibold">Novo usuário</h3>
      <form onSubmit={handleCreate} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome completo"
              className="input"
            />
          </Field>
          <Field label="E-mail">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@exemplo.com"
              className="input"
            />
          </Field>
          <Field label="Senha">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="input"
            />
          </Field>
          <Field label="Perfil">
            <select value={role} onChange={(e) => setRole(e.target.value)} className="input">
              <option value="admin">Admin</option>
              <option value="operator">Operador</option>
              <option value="user">Usuário</option>
            </select>
          </Field>
        </div>

        {localError && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {localError}
          </div>
        )}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? (
            <>
              <Spinner /> Criando…
            </>
          ) : (
            "Criar usuário"
          )}
        </button>
      </form>
    </Card>
  );
}

function UserCard({
  user,
  busy,
  onToggleActive,
  onRoleChange,
}: {
  user: PipeonUser;
  busy: boolean;
  onToggleActive: () => void;
  onRoleChange: (role: string) => void;
}) {
  const ROLES = [
    { value: "admin", label: "Admin" },
    { value: "operator", label: "Operador" },
    { value: "user", label: "Usuário" },
  ];

  const [changingPw, setChangingPw] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    if (newPw.length < 6) {
      setPwError("A senha deve ter ao menos 6 caracteres.");
      return;
    }
    if (newPw !== confirmPw) {
      setPwError("As senhas não coincidem.");
      return;
    }
    setPwLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/users/${user.id}/update`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ password: newPw }),
      });
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      setPwSuccess(true);
      setNewPw("");
      setConfirmPw("");
      setTimeout(() => {
        setPwSuccess(false);
        setChangingPw(false);
      }, 2000);
    } catch (e) {
      setPwError(e instanceof Error ? e.message : "Erro ao alterar senha.");
    } finally {
      setPwLoading(false);
    }
  }

  function cancelPw() {
    setChangingPw(false);
    setNewPw("");
    setConfirmPw("");
    setPwError(null);
    setPwSuccess(false);
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{user.name || "(sem nome)"}</span>
            <span
              className={`rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                user.isActive !== false
                  ? "bg-primary/15 text-primary"
                  : "bg-destructive/15 text-destructive"
              }`}
            >
              {user.isActive !== false ? "Ativo" : "Inativo"}
            </span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{user.email}</div>
          {user.createdAt && (
            <div className="mt-0.5 text-xs text-muted-foreground">
              Cadastro: {new Date(user.createdAt).toLocaleDateString("pt-BR")}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {busy ? (
            <Spinner />
          ) : (
            <>
              <select
                value={user.role ?? "user"}
                onChange={(e) => onRoleChange(e.target.value)}
                className="select"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setChangingPw((v) => !v)}
                className="btn-ghost-sm"
              >
                Alterar senha
              </button>
              <button
                onClick={onToggleActive}
                className={user.isActive !== false ? "btn-danger" : "btn-success"}
              >
                {user.isActive !== false ? "Desativar" : "Ativar"}
              </button>
            </>
          )}
        </div>
      </div>

      {changingPw && (
        <form
          onSubmit={(e) => void handlePasswordChange(e)}
          className="mt-4 border-t border-border pt-4"
        >
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Nova senha — {user.name || user.email}
          </p>
          {pwSuccess ? (
            <div className="rounded-md border border-primary/40 bg-primary/10 px-4 py-3 text-sm text-primary">
              Senha alterada com sucesso.
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Nova senha">
                <input
                  type="password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="input w-48"
                  autoComplete="new-password"
                />
              </Field>
              <Field label="Confirmar senha">
                <input
                  type="password"
                  value={confirmPw}
                  onChange={(e) => setConfirmPw(e.target.value)}
                  placeholder="Repita a senha"
                  className="input w-48"
                  autoComplete="new-password"
                />
              </Field>
              <div className="flex gap-2 pb-0.5">
                <button type="submit" disabled={pwLoading} className="btn-primary-sm">
                  {pwLoading ? <><Spinner /> Salvando…</> : "Salvar"}
                </button>
                <button type="button" onClick={cancelPw} className="btn-ghost-sm">
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {pwError && (
            <p className="mt-2 text-xs text-destructive">{pwError}</p>
          )}
        </form>
      )}
    </Card>
  );
}

function Toggle({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors focus:outline-none ${
        checked ? "bg-primary" : "bg-muted"
      } ${disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-md transition-transform ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
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
      .select {
        background: var(--color-input);
        border: 1px solid var(--color-border);
        border-radius: 0.5rem;
        padding: 0.4rem 0.7rem;
        font-size: 0.8rem;
        color: var(--color-foreground);
        outline: none;
        cursor: pointer;
        transition: border-color .15s;
      }
      .select:focus { border-color: var(--color-primary); }
      .btn-primary {
        display: inline-flex; align-items: center; justify-content: center; gap: .5rem;
        background: var(--color-primary); color: var(--color-primary-foreground);
        font-weight: 600; padding: .7rem 1rem; border-radius: .5rem;
        transition: filter .15s;
      }
      .btn-primary:hover { filter: brightness(1.05); }
      .btn-primary:disabled { opacity: .6; cursor: not-allowed; }
      .btn-primary-sm {
        display: inline-flex; align-items: center; justify-content: center; gap: .4rem;
        background: var(--color-primary); color: var(--color-primary-foreground);
        font-size: .8rem; font-weight: 600; padding: .45rem .9rem; border-radius: .5rem;
        transition: filter .15s;
      }
      .btn-primary-sm:hover { filter: brightness(1.05); }
      .btn-danger {
        display: inline-flex; align-items: center; justify-content: center;
        background: var(--color-destructive); color: #fff;
        font-size: .8rem; font-weight: 600; padding: .4rem .85rem; border-radius: .5rem;
        transition: filter .15s;
      }
      .btn-danger:hover { filter: brightness(1.1); }
      .btn-success {
        display: inline-flex; align-items: center; justify-content: center;
        background: var(--color-primary); color: var(--color-primary-foreground);
        font-size: .8rem; font-weight: 600; padding: .4rem .85rem; border-radius: .5rem;
        transition: filter .15s;
      }
      .btn-success:hover { filter: brightness(1.05); }
      .btn-ghost-sm {
        display: inline-flex; align-items: center; justify-content: center;
        border: 1px solid var(--color-border); color: var(--color-muted-foreground);
        font-size: .8rem; font-weight: 500; padding: .45rem .9rem; border-radius: .5rem;
        transition: border-color .15s, color .15s;
      }
      .btn-ghost-sm:hover { border-color: var(--color-primary); color: var(--color-foreground); }
    `}</style>
  );
}
