<div align="center">

# Pipeon

**A guided, audited engine for running pre-defined MongoDB operations safely.**

Operators execute declarative, version-controlled database procedures through a UI — every run
is snapshotted, logged, and permission-gated, so risky production changes become repeatable and reversible.

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![TanStack](https://img.shields.io/badge/TanStack_Start-FF4154?logo=react-query&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?logo=mongodb&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-F38020?logo=cloudflare&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_v4-06B6D4?logo=tailwindcss&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

</div>

> [!NOTE]
> This is a **sanitized public copy** of an internal tool, published as a portfolio sample.
> Company names, hostnames, database names, and infrastructure identifiers have been replaced
> with placeholders (`[COMPANY]`, `target-database`, `your-worker-name`,
> `your-subdomain.workers.dev`). No proprietary data or credentials are included.

---

## The problem it solves

Internal teams routinely need to run delicate, one-off MongoDB mutations against production data
(reset a record's status, revert a workflow phase, fix a bad import). Done by hand in a shell,
these are error-prone, unauditable, and impossible to delegate safely.

**Pipeon turns each of those operations into a first-class, governed artifact:** a declarative
procedure with typed inputs and an ordered sequence of steps. Non-engineers run them through a UI;
every execution is backed up, logged, and gated by role — and the whole thing is hard-locked to a
single allowed database so a procedure can never touch the wrong target.

## Engineering highlights

- **🧩 Declarative procedure engine** — procedures are documents, not code. Each defines `inputs`
  (typed templates) and `steps` (MongoDB operations). At runtime, `{{key}}` placeholders are
  interpolated into `filter`/`update` objects and Extended-JSON `{ $oid }` values are resolved to
  real `ObjectId`s. New operations ship as data, with no redeploy.
- **🛡️ Safety by construction** — execution is hard-gated to an allowlisted database
  (`ALLOWED_DATABASES`); every mutating step is preceded by an automatic snapshot to a backup
  collection, and a separate restore flow can rebuild documents from those snapshots.
- **🗂️ Dual-database isolation** — the app's own data (users, catalog, logs, schedules) lives in a
  completely separate MongoDB instance from the target data procedures operate on. All internal
  writes are physically segregated from customer data.
- **📝 Full audit trail** — every run is recorded with who/what/when plus per-step results, exposed
  through a history view.
- **👥 Role-based access control** — `admin` / `operator` / `user`, synced from MongoDB and enforced
  via a `usePermission` hook.
- **⏰ Cron scheduler** — a background worker polls for due jobs every minute and auto-executes them
  (backup → reset → cleanup).
- **🌐 Two-tier backend** — the same API runs as a Cloudflare Worker in production and as an Express
  proxy in development, both verifying JWTs before touching MongoDB.
- **🔌 Pluggable auth** — a dormant Microsoft Entra ID (Azure AD) token-broker is wired in behind a
  feature flag, ready to replace password login without touching the rest of the app.

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | **React 19**, **TanStack Start** (full-stack meta-framework), **TanStack Router** (file-based routing), **TanStack Query** |
| Language | **TypeScript** (strict) |
| UI | shadcn/ui (Radix primitives) + **Tailwind CSS v4**, light/dark theming |
| Build | Vite |
| Database | **MongoDB** (accessed through a backend proxy, never from the browser) |
| Production backend | **Cloudflare Workers** (`src/server.ts` + Wrangler) |
| Development backend | **Express** proxy (`local-api/`) with JWT verification |
| Auth | Client-side JWT; optional (dormant) Microsoft Entra ID / Azure AD broker |

## Architecture at a glance

```
Browser (React 19 / TanStack Start)
        │  JWT in sessionStorage
        ▼
Backend proxy ──────────────┐         ┌─────────────────────────────┐
  • Cloudflare Worker (prod) │  reads/ │  Internal DB  (pipeon)      │
  • Express local-api (dev)  │  writes │  users · catalog · logs ·   │
  • verifies JWT             ├────────▶│  schedules · backups        │
  • /api/pipeon/*  ──────────┘         └─────────────────────────────┘
  • /api/mongodb/:action ────┐         ┌─────────────────────────────┐
                             │  gated  │  Target DB  (target-database)│
                             └────────▶│  documents procedures act on │
                                       └─────────────────────────────┘
```

- **Routing flow:** `/` → login → `/select-system` → `/select-session` → `/menu`, then into
  `/procedure/*`, `/history`, `/restore`, `/admin`, `/scheduled`.
- All `/api/pipeon/*` routes write **only** to the internal DB. The generic `/api/mongodb/:action`
  proxy targets the user-selected database and is hard-gated to the allowed target.

## Project structure

```
.
├── src/
│   ├── routes/            # File-based routes (login, menu, procedure/*, admin, history, scheduled, …)
│   ├── lib/               # Core libs: atlas (Mongo API), auth (JWT), permissions (RBAC),
│   │                      #   procedures-catalog, projects, operations (audit), scheduled, history
│   ├── hooks/             # React hooks (e.g. use-permission)
│   ├── components/        # Shell layout primitives + ui/ (shadcn components)
│   ├── server.ts          # Cloudflare Worker entry (production backend)
│   └── routeTree.gen.ts   # Generated route tree — do not edit
├── local-api/             # Express dev backend (Mongo proxy, cron scheduler, backups, seeds)
├── changelogs/            # Per-procedure execution documentation
├── docs/                  # Technical documentation
├── public/                # Static assets
└── wrangler.jsonc         # Cloudflare Workers config
```

## Local setup

### Prerequisites
- Node.js 22+ · npm · a MongoDB instance (local `mongodb://localhost:27017/` works out of the box)

### 1. Frontend (project root)

```bash
npm install
cp .env.example .env     # then edit for your environment
npm run dev              # Vite dev server → http://localhost:5173
```

| `.env` variable | Description | Dev default |
|-----------------|-------------|-------------|
| `VITE_API_URL` | URL of the backend (local-api) | `http://localhost:5000` |
| `VITE_ENTRA_CLIENT_ID` | (optional) Azure AD SPA client id — empty keeps Entra login off | _empty_ |
| `VITE_ENTRA_TENANT_ID` | (optional) Azure AD tenant id | _empty_ |
| `VITE_ENTRA_REDIRECT_URI` | (optional) override redirect URI | current origin |

### 2. Backend (`local-api/`)

```bash
cd local-api
npm install
cp .env.example .env     # then edit
npm start                # Express proxy → http://localhost:5000
```

| `local-api/.env` variable | Description | Default |
|---------------------------|-------------|---------|
| `PIPEON_MONGO_URL` | Connection string for the internal Pipeon database | `mongodb://localhost:27017/` |
| `PIPEON_DB_NAME` | Internal database name | `pipeon` |
| `ENTRA_TENANT_ID` | (optional) Azure AD tenant id for the login broker | _empty_ |
| `ENTRA_CLIENT_ID` | (optional) Azure AD client id for the login broker | _empty_ |

> 💡 From the project root, `npm run dev:local` (Windows / PowerShell) boots both the Vite frontend
> and the Express backend in parallel. Optional seed scripts in `local-api/` (`seed-procedures.js`,
> `seed-evaluations.js`, `seed-secondary-procedures.js`) populate the catalog and sample data.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Vite dev server (port 5173) |
| `npm run build` | Production build (Cloudflare Workers target) |
| `npm run lint` | ESLint + TypeScript check |
| `npm run format` | Prettier formatting |
| `npm run dev:local` | Start frontend + Express backend together (PowerShell) |

## Deployment

The production backend deploys to Cloudflare Workers via Wrangler. Set your worker name and account
id in `wrangler.jsonc` (`your-worker-name` / `YOUR_CLOUDFLARE_ACCOUNT_ID`) and point `VITE_API_URL`
at your deployed worker. The included CI (`.github/workflows/ci.yml`) builds on every push; deploys
are **opt-in** (manual `workflow_dispatch`, requires `CLOUDFLARE_API_TOKEN` /
`CLOUDFLARE_ACCOUNT_ID` secrets).

## License

[MIT](./LICENSE) © 2026 Enzo Cranchi
