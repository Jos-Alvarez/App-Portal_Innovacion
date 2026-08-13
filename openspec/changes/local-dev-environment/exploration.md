# Exploration: Local development environment (DEV) — `.env` structure and DEV database connection (Backlog Item #0, reduced scope)

> Recovered verbatim from Engram observation #8 (`sdd/local-dev-environment/explore`), persisted 2026-08-12 17:05:11. The `sdd-explore` agent that produced this had no filesystem write tool, so this file is the disk copy of that memory record, reproduced faithfully rather than rewritten.

### Scope note
Full Backlog Item #0 covers: deployment pipelines per repo, environments, secrets management, a provisioned DB with two privilege-split users, and network isolation of the internal FastAPI endpoint. The user explicitly narrowed this cycle to: (a) local `.env` structure for personal DEV use, (b) how to connect to a local/DEV database. Deployment pipelines, environment promotion, and network isolation between portal and processors service are deferred, not cancelled.

### Current State

**Repository contents (evidence-based, `L:\App_Portal`):**
- No `package.json`, no `prisma/` directory, no `next.config.*`, no `tsconfig.json`, no application code of any kind was found (verified via full-tree glob).
- Only documentation and SDD tooling exist: `PRD.md`, `TECH-DESIGN.md`, `BACKLOG.md`, `DESIGN.md`, `REVISION-ADVERSARIAL.md`, `adrs/0001`–`0010`, `.claude/skills/`, `.agents/skills/`, `.atl/skill-registry.md`, `openspec/config.yaml`, `openspec/specs/.gitkeep`, `openspec/changes/archive/.gitkeep`.
- `openspec/config.yaml` self-describes: *"Project: Portal de Innovación — Lima Expresa (documentation-only repo today)... No application code scaffolded yet; first code item is Backlog #0/#1... Testing: no runner established yet."* This is the project's own explicit self-assessment, consistent with the glob evidence.
- Single git commit (`ce0ee52 Primer commit del proyecto final`), no other branches/worktrees evidence available from the filesystem.
- No `.env`, `.env.example`, `docker-compose.yml`, `Dockerfile`, or CI config of any kind exists yet.

**What the ADRs mandate about environments/secrets/DB (grounded reading):**
- ADR 0001 (`0001-monolito-full-stack.md`, despite its filename, its actual decision title is "two deployables"): the system is **two deployables** — Portal (Next.js, one repo/process) and Servicio de procesadores (FastAPI/Python) — sharing one SQL Server database. Both need separate deploy pipelines and toolchains ("dos pipelines de despliegue", explicitly named as a real cost).
- ADR 0005: DB engine is **Microsoft SQL Server**, ORM is Prisma or Drizzle with the `mssql` driver. Dev: "SQL Server en contenedor Docker o la edición Express/Developer (gratuita)"; prod: corporate instance or Azure SQL. **Portal/Prisma is the sole schema owner and sole migrator.** FastAPI is strictly read-only, including at the data level (`SELECT` only, no DDL, no INSERT/UPDATE/DELETE) — enforced via **a distinct, low-privilege SQL login**, separate from the portal's DDL+data login. This is the "two users of different privilege" requirement from Backlog Item #0.
- ADR 0004: Auth via **Auth.js/MSAL** against Entra ID in Next.js; FastAPI needs a **service token** to trust calls from the portal (ADR 0007 confirms: backend-to-backend token issued by Next.js, identifies the portal not the end user).
- ADR 0009: Entra ID only authenticates; `usuario.es_admin` lives in the portal DB. Directory search (promote/revoke admins) uses **Microsoft Graph** with `User.Read.All` (needs TI consent — Backlog prerequisite table, blocks Item #17 partially, not #0).
- TECH-DESIGN.md "Riesgos técnicos abiertos": the **service-token detail (format, rotation)** and **guaranteeing the internal FastAPI endpoint is unreachable from outside the internal network** are both explicitly still open, "resolver en la primera spec del servicio de procesadores" (i.e., Item #9 — correctly deferred by the user's narrowing).
- REVISION-ADVERSARIAL.md (adversarial review of the TDD) independently flags: **the deployment model was never fixed** — several designs implicitly assume a long-lived process, and if the portal deploys serverless, background-job assumptions silently break. This corroborates that deployment topology remains a genuinely open, unresolved question beyond just Item #0's reduced scope — worth keeping visible even though out of scope now.
- BACKLOG.md prerequisites table: "Provisión de SQL Server (instancia, base, usuarios)" and "Red interna... inalcanzable desde fuera" are both TI-owned and explicitly block **#0 and #2** / **#0 and #9** respectively. The user's narrowing removes the network-isolation half of #0 from this cycle but keeps the DB-connection half — consistent with unblocking #2 while leaving #9 blocked, exactly as BACKLOG.md's own dependency notes describe.

### Open Question 1 — Repository shape (must be resolved before `sdd-propose`)

ADR 0001 and BACKLOG.md are explicit: the project is **two separate repositories**, `portal` (Next.js/TS) and `procesadores` (FastAPI/Python). `L:\App_Portal` today contains only planning/SDD artifacts for the whole project (both components' ADRs, one shared BACKLOG, one shared PRD) — no code for either component.

Two readings, both consistent with the evidence, presented without a decision:

- **Option A — `L:\App_Portal` becomes the `portal` repo.** Item #1 ("Scaffold Next.js + TS") runs in-place here; `procesadores` is created later as a sibling, separate repo/clone; existing docs stay at the root or move under a `docs/` folder. Weak evidence for: the directory is literally named `App_Portal`.
- **Option B — `L:\App_Portal` is a third, docs/SDD-only planning repo**, and `portal` + `procesadores` are both still-to-be-created separate repositories/clones (e.g., siblings on disk). Item #1 would scaffold Next.js into a new directory outside this repo, not here. Stronger evidence for: BACKLOG.md's own "Repo" column treats `portal`, `procesadores`, and `ambos` as three named logical repos distinct from "this repo" — it never says "here" or uses this directory's name; `openspec/config.yaml` explicitly labels this repo "documentation-only... today," phrased as a project-wide planning artifact covering both components, which is an unusual shape for a repo that is itself supposed to become one of the two code deployables.

**Consequence of not resolving this now:** the `.env` file location, the `openspec/changes/local-dev-environment/` artifact path (which currently lives under `L:\App_Portal`), and where `prisma/schema.prisma` will physically live for Item #2 all depend on this answer. A proposal written before this is settled risks specifying paths that don't match where the code will actually be scaffolded.

### Open Question 2 — DEV database choice (ranked, not decided)

ADR 0005 mandates SQL Server; Prisma is the intended ORM (Item #2, not yet built). Three realistic options for local DEV, ranked by practical viability **on this specific host** (Windows Server 2019 Standard, per environment info — not a Windows 10/11 workstation):

1. **SQL Server Express/Developer Edition installed natively on this Windows Server host — HIGH viability today.**
   - Pros: real SQL Server engine (not an emulation), first-class Windows Auth support, no virtualization dependency, straightforward to create the two ADR-0005-mandated SQL logins (one DDL+data for the portal, one `SELECT`-only for the future FastAPI reader) with full local admin control, self-serviceable today without waiting on IT.
   - Cons: Developer Edition is licensed for non-production use only (must never be pointed at by a real deployment); Express caps DB size (~10 GB) and buffer pool (~1.4 GB) — irrelevant at dev scale; SQL Server Configuration Manager must have TCP/IP protocol enabled for Prisma/any TCP client to connect (confirmed friction point, see Prisma research below); installing/patching/managing the service becomes the user's own ongoing maintenance burden; this environment then diverges from whatever containerized/cloud runtime production ends up using — pure local fidelity to a corporate Azure SQL/managed instance is not perfect either way.
   - Two-user privilege split: fully honorable — user has sysadmin control over the local instance.

2. **SQL Server in Docker — MEDIUM-LOW viability specifically because of this host's OS.**
   - Pros (in general, on a normal workstation): reproducible, disposable/recreatable via init scripts, closer to how many teams run ephemeral DEV databases, easy to script both privilege-split logins in one `docker-compose`/init SQL file.
   - Cons here: the official `mcr.microsoft.com/mssql/server` image is **Linux-only**. Microsoft suspended the SQL Server *Windows container* beta in 2021 and does not support it — so running the real, supported image requires Docker's Linux-container path, which on a bare Windows Server 2019 Standard host needs either the Hyper-V role (isolated Linux containers) or WSL2 — neither is confirmed present on this host, and WSL2/Docker Desktop are primarily targeted and licensed for Windows 10/11 workstations, not Windows Server SKUs, historically requiring extra manual setup on Server editions. This is a real, unverified infrastructure prerequisite, not a simple "docker run" on this specific machine. SA password must meet complexity rules (8+ chars, 3 of 4 character classes).
   - Two-user privilege split: fully honorable once the container runs (same as option 1 — full instance control).
   - Recommendation for the design phase: verify Docker + Linux-container capability on this exact host before treating this as viable; do not assume parity with a typical developer laptop.

3. **IT-provisioned shared DEV instance — LOW viability today, but useful in parallel.**
   - Pros: highest fidelity to whatever corporate SQL Server/Azure SQL production actually is; TI can provision the two privilege-split logins exactly as ADR 0005 describes, removing ambiguity about what "SELECT-only" should mean in practice; no local install/maintenance.
   - Cons: this is precisely the item BACKLOG.md's own prerequisites table flags as **TI-owned and blocking #0/#2** — i.e., the dependency the user is explicitly trying to avoid waiting on for *this* narrowed cycle; shared instances commonly restrict a developer's ability to self-provision logins/schemas; turnaround is unpredictable ("si TI demora, el camino crítico se detiene").
   - Worth requesting in parallel regardless (doesn't cost anything to ask now), but cannot be the path that lets the user proceed "today" per their stated goal.

None of the three is picked here — that is explicitly reserved for the design phase, per the investigation's instructions.

### Environment variables — derived inventory

| Variable (naming illustrative, not final) | Purpose | Needed now (local DEV) or later | Self-suppliable vs. blocked on IT |
|---|---|---|---|
| `DATABASE_URL` | Prisma connection string, portal's DDL+data SQL login | **Now** — required for Item #2 immediately after this cycle | Self-suppliable (any of the 3 DB options above) |
| A second connection string/login for FastAPI's `SELECT`-only user | Read-only mirror access (ADR 0005) | Later (Item #9) — but can be pre-provisioned locally now for fidelity, at no real cost, if Option 1/2 is chosen | Self-suppliable now; IT-owned in real environments |
| `NEXTAUTH_SECRET` / `AUTH_SECRET` (Auth.js) | Session/cookie signing | Later — only needed once Auth.js is wired (Item #3) | Self-suppliable (random local secret) |
| `NEXTAUTH_URL` / `AUTH_URL` | Auth.js base URL, must match the registered redirect URI | Later (Item #3) | Self-suppliable locally (`http://localhost:3000`) but must match what gets registered in Entra ID |
| Entra ID client ID | OIDC app registration | Later (Item #3) | **Blocked on IT** — Backlog's own prerequisites table names this as the #1 blocker of the whole critical path |
| Entra ID client secret | OIDC app registration | Later (Item #3) | **Blocked on IT** |
| Entra ID tenant ID / issuer | OIDC app registration | Later (Item #3) | **Blocked on IT** |
| Entra ID redirect URI(s), per environment | Must be pre-registered per environment (dev/staging/prod) in the Entra app | Later (Item #3) | **Blocked on IT** — and explicitly named per-environment in the Backlog prerequisites row |
| Internal service base URL (portal → FastAPI) | Reverse-proxy target for processor execution | Later (Item #9/#10) | Self-suppliable locally (e.g. `http://localhost:8000`) — no IT dependency for a same-machine local setup |
| Service token (portal → FastAPI backend-to-backend auth) | ADR 0006/0007 | Later (Item #9/#10) — format/rotation still explicitly undefined per TECH-DESIGN's own open risks list | Self-suppliable as a local dev value; the *design* of the token (format/rotation) is a genuinely open architectural question, not an IT blocker |
| Mail API credentials | Best-effort suggestion-box notification (Item #14) | Later, and PRD explicitly says the whole feature degrades gracefully without it | **Blocked on IT / Área de Innovación** — Backlog prerequisites table names this explicitly, blocking only #14, not #13 |

Nothing in this table is required to unblock the user's stated immediate goal beyond `DATABASE_URL`; everything Entra-ID- and mail-related is correctly out of reach until IT acts, regardless of scope narrowing.

### Prisma + SQL Server connection specifics (external research, cited)

- Connection string is JDBC-style (semicolon-separated), not the Postgres-style URL format: `sqlserver://HOST[:PORT];database=DB;user=USER;password=PWD;encrypt=true;trustServerCertificate=true` for local/self-signed dev use. Named instances use `sqlserver://HOST\INSTANCE;...`. Windows-integrated auth is possible via `integratedSecurity=true`. Values containing `: \ = ; /` must be wrapped in `{ }`. — [Prisma SQL Server docs](https://www.prisma.io/docs/orm/overview/databases/sql-server), [connection string reference](https://www.prisma.io/docs/concepts/components/preview-features/sql-server/sql-server-connection-string)
- Local/dev friction point independent of the DB-hosting choice: **TCP/IP protocol must be explicitly enabled** in SQL Server Configuration Manager — off by default on a fresh native install, which directly affects Option 1 above.
- As of Prisma v6.10.0 (June 2025), Prisma is transitioning SQL Server off its Rust query engine toward a driver-adapter model: `@prisma/adapter-mssql` + `previewFeatures = ["queryCompiler", "driverAdapters"]`. The classic Rust-engine path still works today (not removed), but this is a live, moving target the design phase (Item #2) should account for when picking the exact Prisma setup, since it changes what packages/adapters `package.json` needs beyond just `DATABASE_URL`. — [Prisma changelog 2025-06-17](https://www.prisma.io/changelog/2025-06-17)
- SQL Server Docker SA password complexity: minimum 8 characters, at least 3 of {uppercase, lowercase, digit, symbol} — relevant if Option 2 is eventually chosen. — [microsoft/mssql-docker password issue](https://github.com/Microsoft/mssql-docker/issues/46)

### Sequencing risk assessment

- Full Item #0 was a stated dependency of **#2** (schema/migrations) and **#9** (processors service pipeline).
- The reduced scope **does unblock #2**: Item #2 needs a working `DATABASE_URL` and a real place to run Prisma migrations — that's exactly what this cycle resolves once Open Question 1 and 2 are answered.
- The reduced scope **does not unblock #9**, by design and correctly so: BACKLOG.md's own sequencing notes are explicit — "#0 puede arrancar en paralelo con #1 y #2, pero tiene que estar terminado antes de #9: el aislamiento de red del endpoint interno es un requisito de seguridad, no un detalle de despliegue posterior." Network isolation and the deployment pipeline remain fully deferred and #9 stays correctly blocked until a later cycle explicitly picks that back up.
- BACKLOG.md's own dependency table lists **Item #1 with no dependency at all** ("Depende de: —"), even though the prose "Notas de secuencia" narratively frames the critical path as "#0 → #1 → #2 → #3 → #4." There's a minor internal inconsistency between the formal dependency column and the narrative ordering, but it does not create risk here: doing a reduced #0 before #1 is still consistent with, not contradicted by, either reading.
- **Confirmed, not challenged: jumping straight to Item #1 after this cycle is safe.** Item #1 (UI foundation/design system) has no formal dependency on #0 or #2, and needs no database or auth wiring — pure frontend scaffold, tokens, components, and the 4 mandatory states from DESIGN.md.
- Real residual risk to flag explicitly for the user, independent of #1's safety: deferring the deployment pipeline and network isolation leaves **no defined path to a reachable, demoable deployment** of this project for as long as that deferral lasts. REVISION-ADVERSARIAL.md already flags, independently, that the deployment model (serverless vs. long-lived process) was never fixed in the TDD — this narrowing doesn't create that gap, but it does mean the gap stays open through #1 and #2 as well, and should be revisited explicitly before #9 (or before any real demo/defense deadline), not forgotten.
- Also worth tracking (not blocking): the exact SQL principal/permission recipe for the two-privilege-split DB users should be recorded precisely enough (login vs. contained user, exact GRANTs) during the design phase so that, whenever TI provisions a real DEV/prod instance later, they can be handed a literal spec rather than having it re-improvised.

### Approaches (for the .env/DB local-setup mechanics, not full Item #0)

1. **Minimal `.env` scoped to what Item #1/#2 actually need right now** (DB connection only; all Entra/mail vars deferred, documented in `.env.example` as commented-out placeholders with a note on what blocks them).
   - Pros: no dead/unusable secrets sitting around; matches "for local DEV, exclusive personal use" framing exactly; easy to extend later without redesign, since each future var is additive.
   - Cons: `.env.example` needs to be kept honest as more items land, or it silently rots.
   - Effort: Low.

2. **Full `.env.example` up front covering the entire eventual variable set** (including Entra/mail placeholders marked "blocked on IT"), even though most can't be filled in yet.
   - Pros: documents the complete target shape once, useful as a checklist for what IT still owes; avoids repeatedly re-deriving this same list at Items #3/#9/#14.
   - Cons: risk of the file looking "ready" when it isn't; more surface to keep in sync with ADRs as they evolve.
   - Effort: Low-Medium.

### Recommendation

Not made here by design — the investigation's explicit constraint is not to pick the DB option or decide the repository-shape question; both are reserved for `sdd-propose`/`sdd-design`. What this exploration recommends procedurally: resolve Open Question 1 (repo shape) and Open Question 2 (DB hosting choice, informed by verifying actual Docker/Hyper-V/WSL2 capability on this host if Option 2 is even considered) as explicit decisions inside the next `sdd-propose`, before any `.env` file or `prisma/schema.prisma` is written.

### Risks

- Repository-shape ambiguity (Option A vs B) could cause the proposal to specify file paths that don't match where code actually gets scaffolded.
- SQL Server Docker on this specific Windows Server 2019 Standard host is unverified — treat as a real infra prerequisite check, not a given, before it's chosen.
- Deployment pipeline / network isolation remain deferred with no re-entry trigger defined yet — risk of silently staying deferred past the point it's actually needed (#9), especially since REVISION-ADVERSARIAL.md already found the deployment model undefined independently.
- Service-token format/rotation (portal↔FastAPI) is still an open architectural question per TECH-DESIGN's own risk list — out of scope for this cycle but shouldn't be assumed "already decided" when #9 starts.
- SQL Server Express/Developer Edition licensing is non-production-only; must never be pointed at by anything beyond this developer's own machine.

### Ready for Proposal
Yes — with the explicit precondition that `sdd-propose` opens by resolving Open Question 1 (repository shape) and states which DEV database option it is choosing and why, using the ranked comparison above as input, before defining the `.env` schema and connection details.

Session: manual-save-proyectofinal_josealvarezfernandez
Project: proyectofinal_josealvarezfernandez
Scope: project
Topic: sdd/local-dev-environment/explore
Duplicates: 1
Revisions: 1
Created: 2026-08-12 17:05:11
