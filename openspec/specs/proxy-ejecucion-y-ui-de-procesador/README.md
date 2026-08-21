# Item #10 — Execution proxy and processor UI

**Backlog reference:** Item #10 ("Proxy de ejecución y UI de procesador"), repository `portal`.
**Depends on:** #4 (server-side authorization), #8 (collaborator dashboard), #9 (processors service — shipped).
**Unblocks:** #11 (fixture processor, end-to-end proof), #18 (analytics, which reads the events this item writes).

Delivered through a three-phase cycle — Explore, Implement, Verify — rather than the full SDD
artefact chain. This file is the record of those three phases.

---

## Phase 1 — Explore

### What was read

| Source | What it settled |
|---|---|
| `BACKLOG.md` #10 | The scope: authorise, forward, retransmit, record the event, multi-upload UI, banners, 2-minute timeout, download |
| `adrs/0006` | The proxy shape, the typed-error vocabulary, and that **the portal writes `evento_uso`, not the service** |
| `adrs/0002`, `lib/procesadores/schema.ts` | The `procesador` row as the only source of truth for the execution contract |
| `TECH-DESIGN.md` §"Flujo de ejecución" | The acceptance criteria, and the 2-minute deadline as the portal's own |
| `app/api/enlaces/[id]/abrir/route.ts` | The precedent for a non-JSON route, and the opposite event-recording decision |
| `lib/eventos/repository.ts` | The single writer of `evento_uso`, which already declared this item's four event types |
| `app/(portal)/mis-recursos.tsx` | The `"Disponible próximamente"` placeholder this item was written to remove |
| **`T:\API-Portal`** (the shipped service) | The wire contract — see below |

### The blocking uncertainty, and how it was resolved

The item's contract could not be derived from the ADRs alone, because the shipped service
**deviates from them in ways the documents do not record**. `L:\API-Portal` was empty; the real
repository was located at `T:\API-Portal` and read directly. Every constant in
`lib/procesadores/servicio.ts` is pinned to that source, not to a document.

### The wire contract, as it actually is

```
POST {PROCESADORES_BASE_URL}/interno/procesadores/{clave_procesador}
Authorization: Bearer <PROCESADORES_SERVICE_TOKEN>
Content-Type: multipart/form-data          field "archivos", repeated per file
```

| Answer | Meaning | Portal maps to |
|---|---|---|
| `200` + file | Success (`FileResponse`, with `Content-Disposition`) | `200`, event `ejecucion` |
| `422` + `{tipo, contexto}` | Typed error the collaborator can act on | `422`, specific Spanish banner |
| `422` + **empty body** | The portal built a request the service could not parse | `502` |
| `500` + `{tipo: "clave_inexistente"}` | Row/registry desync | `502` |
| `500` + **empty body** | Module crashed, child died, packaging malformed | `502` |
| `401` / `503` / `504` | Bad token / service saturated / execution timed out | `502` / `503` / `504` |

**Three findings worth carrying forward:**

1. **The internal path has no `/ejecutar` segment.** ADR 0006 and `TECH-DESIGN.md` both write
   `POST /interno/procesadores/{clave}/ejecutar`; `app/recepcion.py` mounts
   `POST /interno/procesadores/{clave}`. The code is what answers requests, so the code is what
   this item follows. Recorded in `lib/procesadores/servicio.test.ts` so a future "correction"
   back to the document fails.
2. **The status code alone is not enough.** `422` means two opposite things and only the presence
   of a body separates them. A handler mapping on status would tell a collaborator to fix their
   file when the portal is what is broken. This is why `lib/procesadores/resultado.ts` exists.
3. **`evento_uso.tipo_evento` is closed by a database CHECK constraint**, not by convention —
   five values, of which three are errors. The service has **five** typed errors. See the open
   item below.

---

## Phase 2 — Implement

### New modules

| File | Responsibility |
|---|---|
| `lib/procesadores/servicio.ts` | The wire contract and its environment: URL, token, field name, 2-minute deadline. The only module that knows the service exists |
| `lib/procesadores/resultado.ts` | Interprets the answer — status **and** body — into a discriminated union. No user-facing text |
| `lib/procesadores/mensajes.ts` | Every Spanish sentence about a refused execution, built from the service's `contexto`. Imports no HTTP |
| `lib/procesadores/ejecucion-errores.ts` | Maps a result onto an HTTP status, a stable `codigo`, and an `evento_uso` row |
| `lib/procesadores/tamanos.ts` | Bytes as a person reads them, in mebibytes with a Spanish decimal comma |
| `app/api/procesadores/[id]/ejecutar/route.ts` | The proxy: authorise → check envelope → resolve clave → forward → interpret → record → answer |
| `app/(portal)/procesadores/[id]/*` | The execution screen: page, client component, fetch/download module, styles, loading and error boundaries |

**Changed:** `lib/procesadores/repository.ts` (two reads added), `app/(portal)/mis-recursos.tsx`
and its stylesheet (the placeholder replaced by a real link).

### Decisions taken during implementation

**The body is streamed, never parsed.** `request.body` is handed to `fetch` as a stream with
`duplex: "half"`. Parsing it into a `FormData` and rebuilding it would hold up to
`entradas_max × 25 MB` in the portal's heap — 250 MB for a ten-file processor — plus a second
serialised copy. The price is that the multipart field name the browser writes is the field name
the service reads; it is therefore one exported constant (`CAMPO_ARCHIVOS`) rather than two string
literals that happen to match.

**The route does not validate the files.** Not the count, not the formats, not the sizes — even
though the row is right there. ADR 0002 makes the row the only source of truth and ADR 0006 puts
enforcement in the service's common pipeline, which is also the only place that can inspect the
uncompressed size a zip bomb hides. A second enforcement point would drift, and the dangerous
direction is the portal refusing what the service accepts. The route's database read is one
column: `clave_procesador`.

**The browser checks anyway, and grants nothing.** The upload form runs the same rules locally to
avoid spending a 25 MB upload on a file it can already tell will be refused. It builds the
`contexto` the service would have sent and calls the same `mensajeDeError`, so both detectors
produce identical sentences. It may only refuse what the service would certainly refuse.

**A lost event never costs a file.** The apertura route treats its event as a precondition and
refuses to redirect if it cannot be written. This route does the opposite, because ADR 0006 settles
it: "es analítica, no un dato transaccional, y el archivo del usuario no depende de ello". A failed
insert is logged and the file is delivered.

**Reintentar is shown only when retrying could help.** A server-side failure might go differently
(busy service, dropped network, long execution). A locally-detected bad selection cannot — the
answer is different files, and the file field clears the banner as soon as the selection changes.
This reads DESIGN.md's "banner + Reintentar" narrowly rather than literally, and it is the one
place in this item where that happens.

---

## Phase 3 — Verify

| Check | Command | Result |
|---|---|---|
| Full suite | `pnpm test` | **1014 passed**, 78 files |
| Types | `pnpm typecheck` | clean |
| Lint | `pnpm lint` | clean |
| Production build | `npx next build` | succeeds; `/procesadores/[id]` and `/api/procesadores/[id]/ejecutar` both registered dynamic (`ƒ`) |

**167 tests across nine new suites were added by this item**, plus the dashboard's own suite updated for the new link.

| Suite | Covers |
|---|---|
| `lib/procesadores/servicio.test.ts` | The path with no `/ejecutar`, key encoding, bearer auth, `duplex`, the two constants pinned to the other repository |
| `lib/procesadores/resultado.test.ts` | The full status/body matrix, including both meanings of 422 and both of 500; success leaves the body unread |
| `lib/procesadores/mensajes.test.ts` | Specific reasons, both `tamano` context shapes, and that every type degrades to a sentence on an empty context |
| `lib/procesadores/ejecucion-errores.test.ts` | The event mapping, that it only ever names events the CHECK accepts, and that no infrastructure failure is recorded as usage |
| `app/api/procesadores/[id]/ejecutar/route.test.ts` | The order of operations, that nothing leaves the portal before the guard, that only one column is read, and that a failed event still delivers the file |
| `app/(portal)/procesadores/[id]/ejecutar-client.test.ts` | The local check in both directions, `Content-Disposition` parsing, and that there is no second clock |
| `app/(portal)/procesadores/[id]/ejecutar-procesador.test.tsx` | Every affordance built from the row; the wait, the refusal and the confirmation |
| `app/(portal)/procesadores/[id]/page.test.tsx` | The 403 on a direct URL to an unassigned processor, verified on the server |

### Acceptance criteria from `TECH-DESIGN.md`

Covered by tests: multi-upload driven by the row, count/format/size/content banners with their
specific reasons, the three `evento_uso` error types, `ejecucion` on success, single file vs. ZIP
passed through unchanged, the 2-minute cut-off, the 403 on a direct URL, and a clear error for a
`clave_procesador` missing from the registry.

**Not verifiable here:** the end-to-end circuit browser → portal → FastAPI → download. It needs a
running service and is item **#11**'s explicit purpose ("#11 es el que prueba la tubería, no #12").
Everything on the portal's side of that circuit is tested against the real contract.

---

## Open items

1. **Two environment variables must be added to `.env.example` and to every deployment.** The file
   is outside this session's write permissions, so it was not modified:

   ```dotenv
   # Internal origin of the FastAPI service. Unreachable from the browser.
   PROCESADORES_BASE_URL="http://procesadores.interno:8000"
   # Service token (ADR 0006/0007). MUST match the service's own TOKEN_SERVICIO.
   PROCESADORES_SERVICE_TOKEN=""
   ```

   `readServicioEnv` throws naming both if either is missing, so a misconfigured deployment fails
   at the first execution with one log line rather than a chain of 502s.

2. ~~**`cantidad` errors are invisible to analytics, by decision.**~~ **Closed — see below.**

3. **The service's contract table is static, not read from SQL Server.** `app/core/contrato.py`
   documents this as a deliberate deviation from its ADR 0013 while no database is provisioned. The
   portal's row and the service's table can therefore disagree, which surfaces as a
   `clave_inexistente` or an unexpected refusal. The portal handles both with a clear message; the
   fix belongs to the service.

---

## Follow-up — the event vocabulary was widened

Item #10 shipped with a gap it documented rather than closed: the service defines **five** typed
errors and `evento_uso.tipo_evento` accepted **three**, so `cantidad` and `clave_inexistente`
recorded nothing. That was reconsidered and fixed.

### What changed the decision

The original reasoning kept `cantidad` out because widening a CHECK constraint is a data-model
change, and kept `clave_inexistente` out on the grounds that a misconfiguration is not "usage".
The second half was wrong, and it fails on the same argument that rules out misfiling:

> A procesador whose `clave_procesador` matches no module in the registry produces **no events at
> all**. People try it, fail, and stop trying. In item #19 that is indistinguishable from a
> procesador nobody wants — so an administrator reading the analytics would retire the very
> resource people were failing to use.

Silence and disuse look identical. `lib/eventos/repository.ts` already warned that this table's
worst failures are the undetectable ones; recording nothing is one of them, not an escape from
them.

### The change

| Artefact | Change |
|---|---|
| `prisma/schema.prisma` | `tipoEvento` vocabulary extended to seven members, with the reasoning on the column |
| `prisma/migrations/20260821143000_evento_uso_errores_tipificados_completos/` | Drops and re-adds `evento_uso_tipo_evento_check` with the widened list |
| `lib/eventos/repository.ts` | `TIPOS_EVENTO` gains `error_cantidad` and `error_clave_inexistente` |
| `lib/procesadores/ejecucion-errores.ts` | `EVENTO_POR_TIPO` is now `Record<TipoErrorServicio, TipoEvento>` — **not** `| null`, so "record nothing" is no longer expressible for a typed error |

The five `error_*` members are now a one-to-one mirror of the service's five typed errors. A sixth
typed error upstream needs a member, a migration and a branch — and the type system asks for the
branch.

**Infrastructure failures still record nothing, and that is a different case.** A refused token, a
saturated service, a dropped connection or a crashed worker say nothing about a procesador's
configuration or about the files someone chose. The service's own design puts its four non-typed
failures outside its typed vocabulary for the same reason. They belong in the log.

### Migration notes

The datamodel is structurally unchanged — `migrate diff` emits `-- This is an empty migration.`,
because Prisma cannot express a CHECK constraint on SQL Server. The migration folder was therefore
written by hand, as `MIGRACIONES.md` §4 requires for every enum-shaped column.

The widening is a **strict superset**, so no existing row can stop satisfying it; the constraint is
added with validation (the default `WITH CHECK`) rather than `WITH NOCHECK`, so a row that somehow
did not pass would fail the migration instead of leaving the table partly uncovered.

### Verification against the live database

Applied with `pnpm db:migrate:apply`; `pnpm db:migrate:status` reports the schema up to date. The
constraint was then checked against the database itself, not against the file:

```
CHECK en la base:
  ([tipo_evento]='error_clave_inexistente' OR [tipo_evento]='error_cantidad' OR
   [tipo_evento]='error_contenido' OR [tipo_evento]='error_tamano' OR
   [tipo_evento]='error_formato' OR [tipo_evento]='ejecucion' OR [tipo_evento]='apertura')

Escritura real (en transacción revertida):
  ACEPTA  error_cantidad          ACEPTA  apertura        ACEPTA  error_tamano
  ACEPTA  error_clave_inexistente ACEPTA  ejecucion       ACEPTA  error_contenido
                                  ACEPTA  error_formato

Valor fuera del vocabulario ("error_densidad"): RECHAZADO — correcto
```

Reading the definition proves it *says* the right thing; writing through it proves SQL Server
*enforces* the right thing, which is what the portal depends on at runtime. Every write ran inside
a transaction that was deliberately rolled back — `evento_uso` was left with the one pre-existing
row it already had, and no leftover users.
