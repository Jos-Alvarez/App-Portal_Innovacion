# Local development environment — `.env` structure and DEV database connection

**Backlog reference:** Item #0 ("Entornos, despliegue y red"), **reduced scope**. Depends on: Prerrequisitos externos (BACKLOG.md). Unblocks: Item #2 (Prisma schema/migrations). Does **not** unblock: Item #9 (processors service — needs the deferred network isolation).

This change gives the developer a working local DEV environment — a documented `.env` structure and a safe way to point Prisma at an already-running, shared SQL Server instance — so that Item #1 (UI foundation) and, right after it, Item #2 (schema/migrations) can start without waiting on IT. It resolves the two open questions the exploration phase deliberately left for this phase: where the code lives, and which DEV database to use.

## Quick path

1. Treat `L:\App_Portal` as the `portal` repository from now on (decision below); portal code, `.env*`, and `prisma/` land here.
2. The user manually creates a dedicated database, a dedicated shadow database, and the portal's SQL login on the existing corporate QAS instance (`172.16.50.100`) — this is a precondition of this change, not a task this change performs.
3. Commit a secret-free `.env.example` (placeholders only) and place the real `DATABASE_URL` / `SHADOW_DATABASE_URL` values in a gitignored `.env.local`.
4. Verification: a `sqlcmd`/client connection succeeds with the portal login against the dedicated database before Item #2 starts.

## Decisions made in this phase

### 1. Repository shape: `L:\App_Portal` is the `portal` repository

`L:\App_Portal` **is** the `portal` repository (Next.js + TypeScript), effective now. It currently holds only documentation because no code item has landed yet — that is a project stage, not a signal that this is a separate planning-only repo. The `procesadores` (FastAPI + Python) repository, per ADR 0001's two-deployables decision, will be created later as a separate repository at Item #9, not before.

Consequence: `.env`, `.env.example`, `prisma/`, and all future portal application code belong at the root of this repository, alongside the existing `PRD.md`, `TECH-DESIGN.md`, `adrs/`, `BACKLOG.md`, and `openspec/`. This resolves Open Question 1 from the exploration phase and removes the path ambiguity that exploration flagged as a blocker for this proposal.

### 2. DEV database: an already-running corporate QAS SQL Server instance

The DEV database is **an existing Microsoft SQL Server instance at `172.16.50.100`**, already running on the company's QAS server and already in active use by the user's other projects. Nothing gets installed for this change — no local install, no Docker, no new IT provisioning request.

| Alternative | Why rejected |
|---|---|
| SQL Server installed natively on the local host | Not needed — a real, reachable instance already exists and is already in daily use for other work. Installing a second, redundant instance would add maintenance burden with no benefit. |
| SQL Server in Docker | Same reasoning: unnecessary given a working instance already exists. Also would have carried real friction on this specific host (official image is Linux-only; Windows-container support for SQL Server was discontinued in 2021; Hyper-V/WSL2 availability on this Windows Server 2019 Standard host is unverified). |
| A brand-new IT-provisioned DEV instance | Unnecessary — the existing QAS instance already serves this purpose and needs no new request. |

This choice actually **improves fidelity** to the eventual production environment compared to a local install: the instance is a real corporate SQL Server, reached over the network exactly as production connections will be, rather than a single-machine simulation. The trade-off this introduces — shared, corporate, multi-project instance — is treated as the change's central operational risk and is addressed below (dedicated database, dedicated shadow database, and a hard prohibition on destructive Prisma commands).

**Authentication mode is resolved as a direct consequence:** the instance is reached over the network by IP (`172.16.50.100`), so Windows Authentication (`integratedSecurity=true`) is not realistic here — it ties a connection to a local OS session, not a remote one. The portal connects with a **SQL Server login and password**, and `DATABASE_URL` is shaped accordingly.

## Scope

### In scope

- The `.env` file structure for this repository: which variables exist, which are needed now vs. later, and the `.env.example` / `.env.local` split.
- Documenting exactly what the user must manually provision on the existing `172.16.50.100` instance (dedicated database, dedicated shadow database, portal login and its permissions) so that manual step is unambiguous.
- The migration-isolation strategy that keeps Prisma from touching anything but this portal's own dedicated database and dedicated shadow database on a shared corporate instance.
- A committed `.gitignore` covering the Node/Next.js project this repository now also is, so `.env.local`, `node_modules/`, and build output never get committed.
- Documenting the Prisma + SQL Server connection string shape (JDBC-style) as it applies to `DATABASE_URL` and `SHADOW_DATABASE_URL`.

### Explicitly NOT in scope (hard constraints, not just omissions)

- **Prisma must never create the database.** Database and shadow-database creation on `172.16.50.100` is the user's manual precondition, done by hand with their own existing privileges — it is not automated or scripted by this change or by any Prisma command.
- **`prisma migrate reset` must never run against this instance.** It drops and recreates the database and reapplies all migrations — destructive by design and unacceptable on a shared corporate server (see "Migration isolation" below).

### Out of scope / deferred (not cancelled)

| Deferred item | Owner of the re-entry decision | Trigger to pick it back up |
|---|---|---|
| Deployment pipelines (portal, processors) | Item #0 revisited later, or a dedicated deploy-pipeline change | A defined delivery/defense date, per REVISION-ADVERSARIAL.md's independent finding that the deployment model (serverless vs. long-lived process) was never fixed in TECH-DESIGN.md |
| Environment promotion (DEV → staging/prod) | Same as above | Same as above |
| Network isolation of the internal FastAPI endpoint (making it unreachable from outside the internal network) | Item #9 | Starting Item #9's spec — BACKLOG.md's own sequencing note is explicit that #0 must be complete on this point before #9 begins |
| IT-provisioned DEV/prod SQL Server instance with the two logins created by IT | Whoever owns the eventual real-environment provisioning | When TI actually provisions an instance; this change's local recipe should be handed to them as a literal spec, not re-improvised |
| ADR 0005's second SQL login — FastAPI's `SELECT`-only reader | Item #9 (`procesadores` service creation) | The `procesadores` service is a separate future project (ADR 0001's two-deployables split) with no code today; creating its DB login now would have no consumer and nothing to test it against. **This is a postponement of ADR 0005's intent, not an abandonment of it** — the privilege split is still mandatory and gets provisioned when Item #9 actually creates the FastAPI service |
| Entra ID app registration (client ID/secret, redirect URIs) | Item #3 | IT completing the registration (BACKLOG.md prerequisites table) |
| Mail API credentials | Item #14 | IT / Área de Innovación providing credentials |
| Prisma `@prisma/adapter-mssql` driver-adapter migration decision | Item #2 design phase | Explicitly **not** a decision for this change — noted here only so Item #2 doesn't assume it was already settled |

Nothing above is silently lost: each row names who revisits it and what event triggers that.

## Environment variable inventory

Two groups, matching the exploration's grounded mapping.

### Group A — needed now, self-provisionable today

| Variable | Purpose | Value source |
|---|---|---|
| `DATABASE_URL` | Prisma connection string for the portal's dedicated database and its login on the `172.16.50.100` instance | Manually provisioned by the user on the existing instance (see "Database provisioning" below) |
| `SHADOW_DATABASE_URL` | Connection string for the dedicated shadow database Prisma Migrate needs to compute migration diffs | Manually provisioned by the user, same instance, dedicated and separate from the real database (see "Migration isolation" below) |

Both variables are required before Item #2 can run `prisma migrate dev` at all; neither is optional on a shared instance.

### Group B — later, placeholders for now (blocked on IT or on a future item's own design decisions)

| Variable | Needed by | Why it is a placeholder now |
|---|---|---|
| `AUTH_SECRET` | Item #3 (Auth.js) | Not blocked on IT — self-suppliable — but not consumed until #3; listed as a placeholder to avoid inventing a value with no consumer yet |
| `AUTH_URL` | Item #3 | Same as above; must match whatever redirect URI gets registered in Entra ID |
| Entra ID client ID / client secret / tenant ID / issuer | Item #3 | **Blocked on IT** — Entra ID app registration (BACKLOG.md prerequisites table, blocks the whole critical path from #3 onward) |
| Entra ID redirect URI(s), per environment | Item #3 | **Blocked on IT** — must be pre-registered per environment |
| Internal processors service base URL | Item #9/#10 | Self-suppliable locally later (e.g. `http://localhost:8000`), but has no consumer until the proxy route exists |
| Service token (portal → FastAPI) | Item #9/#10 | Format/rotation is a genuinely open architectural question per TECH-DESIGN's own risk list, not an IT blocker — deferred to Item #9's design, not defined here |
| Mail API credentials | Item #14 | **Blocked on IT / Área de Innovación**; PRD already defines graceful degradation without it |

`.env.example` will list every Group A and Group B variable name (Group B commented out or with an obvious placeholder value) so the file documents the complete target shape without pretending it is ready to use.

## `.env.example` vs. `.env.local` — Next.js conventions

Next.js has its own env-file loading order, distinct from a generic Node project:

| File | Committed? | Purpose |
|---|---|---|
| `.env.example` | **Yes** — committed, secret-free | Documents every variable name and its shape; the template a developer copies |
| `.env.local` | **No** — gitignored | The real values for this developer's machine; Next.js loads it automatically in all environments except `test` |
| `.env` / `.env.development` / `.env.production` | Not used for secrets in this change | Next.js loads these as lower-priority defaults; committing them would leak nothing only if they hold no secrets, which this change does not rely on |

Next.js precedence (highest wins): `.env.$(NODE_ENV).local` → `.env.local` → `.env.$(NODE_ENV)` → `.env`. For this change, only `.env.local` (real secrets, gitignored) and `.env.example` (template, committed) are created; the other tiers are left for a future item to use if it needs environment-specific non-secret defaults. Any variable meant to reach the browser bundle would need a `NEXT_PUBLIC_` prefix — none of the variables in this change's inventory are browser-facing.

**Secret hygiene rule for `.env.example`:** it is committed to the repository, so it MUST contain **placeholders only** — no real host, no real IP (`172.16.50.100` must never appear in it), no database or login names that reveal internal infrastructure, and obviously no passwords. Real values live exclusively in the gitignored `.env.local` the user fills in by hand. This rule applies to every variable in both Group A and Group B.

## Database provisioning — a manual precondition, not this change's work

The user has full privileges on the `172.16.50.100` instance and provisions the following **by hand**, before Item #2 starts:

| Object | What it is | Permissions |
|---|---|---|
| A dedicated database for this portal, distinctly named so it can never be confused with another project's database on the same instance | Holds the schema Prisma will own and migrate from Item #2 onward | — |
| A dedicated shadow database, separate from the real one, also distinctly named | Used only by Prisma Migrate to compute migration diffs (see "Migration isolation" below) | — |
| The portal's SQL login | The credential `DATABASE_URL` authenticates with | `db_owner` on the dedicated database only — **not** a server-wide role, and no access to any other database on the shared instance |

This provisioning is a documented **precondition** of this change: the user does it manually, once, outside of any script or Prisma command this change introduces. **Prisma must never create the database** — `prisma migrate dev` and `prisma migrate deploy` both assume the target database already exists and only manage its schema, which is exactly the boundary this change relies on.

ADR 0005's two-login privilege split (portal DDL+data vs. FastAPI `SELECT`-only) still governs the portal login's own permissions here — `db_owner` scoped to one database is the DDL+data half of that split, honored today. The second, read-only half is deferred (see "Out of scope / deferred" above), not dropped.

## Prisma + SQL Server connection string

The connection string is **JDBC-style** (semicolon-separated), not the Postgres-style URL format Prisma users may expect from other projects:

```
sqlserver://HOST[:PORT];database=DB;user=USER;password=PWD;encrypt=true;trustServerCertificate=true
```

Named instances use `sqlserver://HOST\INSTANCE;...`. Values containing `: \ = ; /` must be wrapped in `{ }`. Both `DATABASE_URL` and `SHADOW_DATABASE_URL` follow this same shape, each pointing at its own dedicated database on `172.16.50.100`.

**Explicitly deferred to Item #2's design phase, not decided here:** whether the portal adopts Prisma's newer `@prisma/adapter-mssql` driver-adapter model (available since Prisma 6.10, June 2025) or stays on the classic Rust query engine. This change only defines the connection string `DATABASE_URL`/`SHADOW_DATABASE_URL` need to contain; it does not pick the Prisma client configuration that consumes them. The exact configuration surface for `shadowDatabaseUrl` also differs by Prisma major version — a `datasource` block in `schema.prisma` on Prisma 6, versus `prisma.config.ts` with `defineConfig` on Prisma 7 — but either way the environment variable name `SHADOW_DATABASE_URL` is fixed by this change, since this change owns the `.env` contract regardless of which major version Item #2 picks.

## Migration isolation — the technical centerpiece of this change

Because `172.16.50.100` is a **shared corporate QAS instance already hosting other projects**, not an isolated DEV box, Prisma's default migration behavior is unsafe here unless constrained. Grounded in the official Prisma documentation:

- [`prisma migrate dev` requires a **shadow database**](https://www.prisma.io/docs/orm/prisma-migrate/understanding-prisma-migrate/shadow-database), which Prisma **creates and drops automatically by default**. That default is unacceptable on a shared instance — Prisma must never be allowed to create or drop a database it doesn't own on a server other projects depend on.
- The official remedy for cloud-hosted or otherwise restricted databases is to **manually create a dedicated shadow database** and declare its connection string via `shadowDatabaseUrl`, sourced from a `SHADOW_DATABASE_URL` environment variable — exactly the provisioning step documented above.
- [`prisma migrate reset`](https://www.prisma.io/docs/cli/migrate/reset) **drops the database, recreates it, and reapplies all migrations**. It is destructive by design.

This change adopts the following isolation strategy as a direct consequence:

- **A dedicated, distinctly-named database** for this portal on the shared instance. `DATABASE_URL` names it explicitly, so Prisma never operates against `master` or any other project's database.
- **A dedicated, manually created shadow database**, wired through `SHADOW_DATABASE_URL`. This is what stops Prisma from auto-creating and auto-dropping a database on a shared corporate server.
- **`prisma migrate reset` is forbidden against this instance.** This is an explicit operational guardrail, not a footnote — it should be written into the repository README so it survives past this change and is visible to anyone who works in this codebase later.

## `.gitignore`

This repository has no `.gitignore` for a Node/Next.js project yet — it was never needed while the repo held only documentation. This change adds one covering, at minimum: `.env*.local`, `node_modules/`, `.next/`, and standard build/log output, so the real `.env.local` values and installed dependencies are never committed. `.env.example` is explicitly **not** ignored — it is the committed template.

## Risks

| Risk | Notes |
|---|---|
| Shared, multi-project corporate instance | `172.16.50.100` is a QAS server already hosting other projects, not an isolated DEV box. This is the change's central operational risk and is why a dedicated database, a dedicated shadow database, a `db_owner`-scoped (not server-wide) login, and a hard prohibition on `prisma migrate reset` are all treated as mandatory guardrails above, not optional hardening |
| Pre-existing deployment-model gap | REVISION-ADVERSARIAL.md already flagged, independently of this change, that TECH-DESIGN.md never fixed the deployment model (serverless vs. long-lived process); this change does not create that gap and does not attempt to close it, but leaves it open through Items #1 and #2 as well — it must be revisited before Item #9 or before any real delivery/defense date, not forgotten |
| `.env.example` rot | As more items land (#3, #9, #14), `.env.example` must be kept honest with each newly-introduced variable, or it silently becomes an inaccurate checklist |
| Manual provisioning drift | Database name, shadow-database name, and login permissions live only in this document and the user's own memory, not in a script; if they diverge from what's documented here, `DATABASE_URL`/`SHADOW_DATABASE_URL` in `.env.local` could silently point at the wrong object on a multi-project instance |

## Rollback plan

Rollback is low-risk: no application code or committed schema depends on this change yet. Rolling back means dropping the two manually created databases (real + shadow) and revoking the portal login, then deleting the local `.env.local` — no data migration or code change is at stake because Item #2 (the first consumer) has not started. Because the dedicated database and shadow database are isolated from every other project on the shared instance by construction, this rollback carries no risk to any other project hosted on `172.16.50.100`.

## Checklist

- [ ] Dedicated database created manually by the user on `172.16.50.100`, distinctly named
- [ ] Dedicated shadow database created manually by the user, separate from the real database, distinctly named
- [ ] Portal SQL login created with `db_owner` on the dedicated database only — no server-wide role, no access to other databases on the instance
- [ ] `.env.example` committed, secret-free (no real host/IP/names), covering every Group A and Group B variable
- [ ] `.env.local` created locally, gitignored, holding real `DATABASE_URL` and `SHADOW_DATABASE_URL` values
- [ ] `.gitignore` added, covering `.env*.local`, `node_modules/`, `.next/`
- [ ] The `prisma migrate reset` prohibition is written into the repository README
- [ ] A test connection with the portal login succeeds against the dedicated database before Item #2 starts

## Next step

Proceed to `sdd-spec` and `sdd-design` (can run in parallel) for this change, using the decisions above as fixed inputs. Item #1 (UI foundation) can start independently of this change's completion, since it has no formal dependency on Item #0 or #2.

## Decisions resolved during proposal review

An earlier draft of this proposal carried a "Proposal question round" with three open secondary questions. All three are now resolved by the user's corrections and are recorded as final, not reopened:

1. **SQL Server edition** — moot. The DEV database is the existing `172.16.50.100` instance; nothing gets installed, so no edition choice applies.
2. **Authentication mode** — resolved as **SQL Server login + password**. The instance is reached over the network by IP, so Windows Authentication (`integratedSecurity=true`) does not apply.
3. **Timing of the FastAPI read-only login** — resolved as **deferred to Item #9**, not created now. The `procesadores` service is a separate future project; ADR 0005's privilege split is postponed, not abandoned (see "Out of scope / deferred" above).
