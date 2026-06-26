# Pipeon

**Pipeon** is an internal process-automation system that manages MongoDB-based evaluation
procedures, role-based user permissions, and scheduled operations. It provides a guided UI
for operators to run pre-defined, audited MongoDB procedures against a target database —
each procedure is a declarative sequence of steps (backup → mutation → cleanup) with typed
inputs, automatic snapshots, and a full operations audit trail.

> This is a sanitized public copy for portfolio purposes. Company names, internal hostnames,
> database names, and infrastructure identifiers have been replaced with placeholders such as
> `[COMPANY]`, `target-database`, `your-worker-name`, and `your-subdomain.workers.dev`.

## Features

- **Guided procedure executor** — declarative `inputs` + `steps` (MongoDB operations) with
  `{{key}}` placeholder interpolation and Extended-JSON / `ObjectId` resolution.
- **Role-based access control** — `admin` / `operator` / `user` roles, synced from MongoDB
  and cached client-side.
- **Audit trail** — every execution is logged, and evaluation documents are snapshotted
  before any mutation.
- **Scheduled jobs** — a cron-style scheduler auto-runs pending procedures.
- **Dual-database architecture** — an internal app database (users, catalog, logs, schedules)
  kept strictly separate from the user-selected target database that procedures operate on.
- **Admin panel** — manage procedures, projects, users, permissions, and connections.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | **React 19**, **TanStack Start** (full-stack meta-framework), **TanStack Router** (file-based routing), **TanStack Query** |
| Language | **TypeScript** |
| UI | shadcn/ui (Radix primitives) + **Tailwind CSS v4** |
| Build | Vite |
| Database | **MongoDB** (driver via a backend proxy) |
| Production backend | **Cloudflare Workers** (`src/server.ts` + Wrangler) |
| Development backend | **Express** proxy (`local-api/`) with JWT verification |
| Auth | Client-side JWT; optional (dormant) Microsoft Entra ID / Azure AD broker |

## Project Structure

```
.
├── src/
│   ├── routes/            # File-based routes (login → select-system → select-session → menu → procedure/*, admin, history, scheduled, …)
│   ├── lib/               # Core libraries: atlas (MongoDB API), auth (JWT), permissions (RBAC),
│   │                      #   procedures-catalog, projects, operations (audit), scheduled, history
│   ├── hooks/             # React hooks (e.g. use-permission)
│   ├── components/        # Shell layout primitives + ui/ (shadcn components)
│   ├── server.ts          # Cloudflare Worker entry (production backend)
│   └── routeTree.gen.ts   # Generated route tree — do not edit
├── local-api/             # Express dev backend (MongoDB proxy, cron scheduler, backups, seeds)
├── public/                # Static assets
├── docs/                  # Technical documentation
├── changelogs/            # Per-procedure execution documentation
├── wrangler.jsonc         # Cloudflare Workers config
└── vite.config.ts
```

### Routing flow

`/` → login → `/select-system` → `/select-session` → `/menu`, and from the menu into
`/procedure/*`, `/history`, `/restore`, `/admin`, and `/scheduled`.

### Dual-database model

The backend always operates against two separate MongoDB instances:

| Database | Contents |
|----------|----------|
| Internal app DB (`pipeon`) | Users, procedure catalog, projects, operations log, scheduled jobs, settings, auto-backups |
| Target DB (`target-database`) | Evaluation documents that procedures actually operate on |

All `/api/pipeon/*` routes write only to the internal DB. The generic `/api/mongodb/:action`
proxy targets the user-selected target database. Procedure execution is hard-gated to the
allowed target database via the `ALLOWED_DATABASES` constant.

## Local Setup

### Prerequisites

- Node.js 22+
- npm
- A MongoDB instance (local `mongodb://localhost:27017/` works out of the box)

### 1. Frontend (project root)

```bash
npm install
cp .env.example .env     # then edit values for your environment
npm run dev              # Vite dev server on http://localhost:5173
```

`.env` variables:

| Variable | Description | Dev default |
|----------|-------------|-------------|
| `VITE_API_URL` | URL of the backend (local-api) | `http://localhost:5000` |
| `VITE_ENTRA_CLIENT_ID` | (optional) Azure AD SPA client id — leave empty to keep Entra login disabled | _empty_ |
| `VITE_ENTRA_TENANT_ID` | (optional) Azure AD tenant id | _empty_ |
| `VITE_ENTRA_REDIRECT_URI` | (optional) override redirect URI | current origin |

### 2. Backend (`local-api/`)

```bash
cd local-api
npm install
cp .env.example .env     # then edit values
npm start                # Express proxy on http://localhost:5000
```

`local-api/.env` variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `PIPEON_MONGO_URL` | MongoDB connection string for the internal Pipeon database | `mongodb://localhost:27017/` |
| `PIPEON_DB_NAME` | Internal database name | `pipeon` |
| `ENTRA_TENANT_ID` | (optional) Azure AD tenant id for the login broker | _empty_ |
| `ENTRA_CLIENT_ID` | (optional) Azure AD client id for the login broker | _empty_ |

> You can also start both servers together from the project root with `npm run dev:local`
> (Windows / PowerShell), which boots Vite and the Express backend in parallel.

### Seeding (optional)

`local-api/` ships seed scripts (`seed-procedures.js`, `seed-evaluations.js`,
`seed-secondary-procedures.js`) to populate the procedure catalog and sample evaluation data.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Vite dev server (port 5173) |
| `npm run build` | Production build (Cloudflare Workers target) |
| `npm run lint` | ESLint + TypeScript check |
| `npm run format` | Prettier formatting |
| `npm run dev:local` | Start frontend + Express backend together (PowerShell) |

## Deployment

The production backend deploys to Cloudflare Workers via Wrangler. Set your worker name and
account id in `wrangler.jsonc` (`your-worker-name` / `YOUR_CLOUDFLARE_ACCOUNT_ID`) and point
`VITE_API_URL` at your deployed worker (`https://your-worker.your-subdomain.workers.dev`).

## License

This repository is published as a portfolio sample. No proprietary data or credentials are
included.
