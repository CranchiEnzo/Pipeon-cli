# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Pipeon** — internal process automation system for [COMPANY], built with React 19 + TanStack Start (full-stack meta-framework). It manages MongoDB evaluation procedures, user permissions, and scheduled operations.

## Commands

```bash
# Frontend (project root) — uses npm as package manager
npm install          # Install dependencies
npm run dev          # Vite dev server (port 5173)
npm run build        # Production build for Cloudflare Workers
npm run lint         # ESLint + TypeScript check
npm run format       # Prettier formatting

# Backend (local-api/) — uses npm
cd local-api && npm install && npm start   # Express proxy on port 5000
```

There are no test commands — this project has no test suite.

## Architecture

### Routing & Pages

File-based routing via TanStack Router in [src/routes/](src/routes/). Key flows:

1. `/` → login → `/select-system` → `/select-session` → `/menu`
2. From menu: `/procedure/*`, `/history`, `/restore`, `/admin`, `/scheduled`

The generated route tree is [src/routeTree.gen.ts](src/routeTree.gen.ts) — never edit manually.

### Core Libraries (`src/lib/`)

| File | Responsibility |
|------|---------------|
| [atlas.ts](src/lib/atlas.ts) | MongoDB API calls (`find`, `updateOne`, etc.) via `VITE_API_URL`; manages connection config, system definitions, and saved connections in `localStorage`/`sessionStorage` |
| [auth.ts](src/lib/auth.ts) | JWT decode (client-side only); extracts user identity from token in `sessionStorage`; normalizes .NET long-form claim names |
| [permissions.ts](src/lib/permissions.ts) | Role-based access control (`admin`/`operator`/`user`); syncs from MongoDB on login, cached in `localStorage` |
| [procedures-catalog.ts](src/lib/procedures-catalog.ts) | CRUD for procedure definitions stored in the `pipeon` database |
| [projects.ts](src/lib/projects.ts) | CRUD for projects; procedures are grouped under projects via `projectId` |
| [operations.ts](src/lib/operations.ts) | Audit trail; logs every procedure execution to `pipeon_operations` in the `pipeon` database |
| [scheduled.ts](src/lib/scheduled.ts) | Scheduled procedure CRUD; records stored in `pipeon_scheduled` |
| [history.ts](src/lib/history.ts) | Audit log display operations |

Use the `usePermission` hook ([src/hooks/use-permission.ts](src/hooks/use-permission.ts)) to check permissions in components; `admin` role always has full access.

### Two-Tier Backend

- **Production**: Cloudflare Worker at [src/server.ts](src/server.ts) + `wrangler.jsonc`
- **Development**: Express server in [local-api/server.js](local-api/server.js) (port 5000) proxying requests to MongoDB with JWT verification

Set `VITE_API_URL` in `.env` (dev: `http://localhost:5000`, prod: `https://your-worker.your-subdomain.workers.dev`).

`local-api/.env` variables (copy from `local-api/.env.example` and extend):
- `PIPEON_MONGO_URL` — MongoDB connection string for the Pipeon database (default: `mongodb://localhost:27017/`)
- `PIPEON_DB_NAME` — Pipeon database name (default: `pipeon`)

### Dual-Database Architecture

The backend always operates against **two separate MongoDB instances**:

| Database | Env var | Default | Contents |
|----------|---------|---------|----------|
| `pipeon` (internal) | `PIPEON_MONGO_URL` / `PIPEON_DB_NAME` | `localhost:27017/pipeon` | Users, procedures catalog, projects, operations log, scheduled jobs, settings, auto-backups |
| Target (user-selected at login) | `connectionString` in session | `localhost:27017/target-database` | Evaluation documents that procedures operate on |

All `/api/pipeon/*` routes always write to the `pipeon` database. The generic `/api/mongodb/:action` proxy targets the user-selected database passed in the request body.

### Procedure Execution

Procedures are `ProcedureCatalog` documents stored in `pipeon_procedures`. Each has `inputs` (typed template values) and `steps` (sequence of MongoDB operations). At runtime, `{{key}}` placeholders in `filter`/`update` objects are interpolated with user-supplied values; `objectId`-typed inputs emit `{ $oid: value }`, which local-api's `resolveExtendedJson` converts to `ObjectId`. The optional `nucleo` field is displayed as a badge label in the executor UI.

If a procedure's `legacyRoute` field is set, it routes to a dedicated page (e.g. `procedure.reset-evaluations.tsx`) instead of the generic `/procedure/$id` executor.

### Local-API Extra Features

Beyond the MongoDB proxy, [local-api/server.js](local-api/server.js) provides:

- **Cron scheduler**: checks `pipeon_scheduled` every minute and auto-executes pending procedures (backup → reset evaluation status → clean form fields)
- **Backup** (`POST /api/pipeon/backup/create`): saves a snapshot of evaluation documents to `pipeon_auto_backups` before any mutation

### State & Sessions

- Auth token + MongoDB connection config → `sessionStorage` (key: `fase-cli-atlas-config`; cleared on 401 or logout)
- User permissions → `localStorage` (key: `pipeon-role-permissions`)
- System definitions + saved connections → `localStorage`
- Server state → TanStack Query (`QueryClient` initialized in [src/router.tsx](src/router.tsx))

### UI Stack

Shadcn/ui components live in [src/components/ui/](src/components/ui/) (Radix primitives + Tailwind). Application-level layout primitives (`Shell`, `BrandHeader`, `Card`, `Spinner`, `ErrorBanner`, `BackLink`) are in [src/components/Shell.tsx](src/components/Shell.tsx). Tailwind v4, CSS variables for theming in [src/styles.css](src/styles.css).

## Critical Constraint

**MongoDB target for Pipeon procedures**: procedure execution (`/procedure/$id`) is hard-gated to the `target-database` database via the `ALLOWED_DATABASES` constant in [src/routes/procedure.$id.tsx](src/routes/procedure.$id.tsx). Never relax or remove this check, and never point procedure logic at other databases.

## Path Alias

`@/*` maps to `src/*` (configured in `tsconfig.json` and `vite.config.ts`).
