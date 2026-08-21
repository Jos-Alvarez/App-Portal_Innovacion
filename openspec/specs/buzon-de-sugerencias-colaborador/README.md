# Item #13 — Suggestions box (collaborator)

**Backlog reference:** Item #13 ("Buzón de sugerencias (colaborador)"), repository `portal`.
**Depends on:** #3 (Entra ID login and session) — satisfied, along with #4, whose session guard this
item reuses.
**Unblocks:** #14 (best-effort e-mail notification), #15 (admin management of suggestions), and
through #15, #16 (grouping) and #18/#19 (analytics over `sugerencia`).

Delivered through a three-phase cycle — Explore, Implement, Verify — rather than the full SDD
artefact chain. This file is the record of those three phases.

---

## Phase 1 — Explore

### What was read

| Source | What it settled |
|---|---|
| `BACKLOG.md` #13 | The scope: send form, alta in `pendiente`, own list with visible traceability, general access |
| `PRD.md` §"Supuestos" | The access rule, stated twice: the box is outside the assignment system entirely |
| `PRD.md` §"Casos borde" | That a failed e-mail is ignored because the suggestion "ya está garantizada en la base de datos" — the reason #14 can be deferred without damage |
| `TECH-DESIGN.md` §"Buzón de sugerencias" | The three acceptance criteria, including the toast confirmation |
| `adrs/0002` | The `sugerencia` / `historial_sugerencia` split: the row holds the current state, the ledger holds the trail |
| `adrs/0003` | `POST /api/sugerencias` and `GET /api/sugerencias` as the collection route |
| `adrs/0007` | The revalidation policy this screen inherits, and the note that a second SWR key was the moment to reconsider a provider |
| `DESIGN.md` | The five state chips, colour by colour — the only mapping the document specifies that precisely — and "El buzón es solo para ideas nuevas" |
| `prisma/schema.prisma` + `20260813040410_init_esquema_portal` | That every column and the `sugerencia_estado_check` constraint already exist |
| `app/(portal)/*`, `app/admin/enlaces/*`, `lib/enlaces/*` | The established shapes: schema → errors → repository → route, and server read + SWR on the client |

### What the exploration settled before any code was written

**No migration is needed.** Item #2 shipped all nine entities, and `sugerencia_estado_check`
already enumerates the five states. This item writes rows; it does not touch the schema.

**The access rule is the item.** Two documents say the same thing in different words — the
backlog's "Acceso general: no requiere asignación" and the PRD's "el buzón de ideas de innovación
es de acceso general … la asignación individual del administrador se limita a decidir quién accede
a cada app/agente/procesador". So the guard is `guardPage` / `guardRoute`, the session-only pair
that until now had exactly one caller each.

**The ledger's first entry belongs to this item.** `prisma/schema.prisma` says what
`estado_anterior`'s nullability is for: "NULL for the entry row of a suggestion that has no previous
state". That row can only be written at creation — and without it, "trazabilidad visible" would be
an empty list on every suggestion nobody had reviewed yet.

---

## Phase 2 — Implement

### New modules

| File | Responsibility |
|---|---|
| `lib/sugerencias/schema.ts` | What a valid suggestion is: the state vocabulary, `ESTADO_INICIAL`, the three field rules and the widths |
| `lib/sugerencias/errors.ts` | Every failure as ADR 0003's envelope, in Spanish, with the limits interpolated from the schema's own constants |
| `lib/sugerencias/etiquetas.ts` | The five states as words and as chip tones — DESIGN.md's mapping, in one place both #13 and #15 read |
| `lib/sugerencias/repository.ts` | The nested write that opens the ledger, the author-scoped list, and the one-column area read |
| `app/api/sugerencias/route.ts` | `GET` (yours) and `POST` (201), both behind the session guard |
| `app/(portal)/sugerencias/page.tsx` | The screen's server half: guard, two parallel reads, first paint |
| `app/(portal)/sugerencias/buzon.tsx` | The list, the trail, the SWR wiring and the three failure treatments |
| `app/(portal)/sugerencias/sugerencia-form.tsx` | The send form, validating with the server's own schema |
| `app/(portal)/sugerencias/sugerencias-client.ts` | The fetcher, the send, the revalidation policy and the one way a date is written |
| `app/(portal)/sugerencias/{loading,error}.tsx`, `sugerencias.module.css` | The screen's own boundaries and styles |

**Changed:** `app/(portal)/page.tsx` and `portal.module.css` (the link into the box), and
`app/(portal)/page.test.tsx` (two tests for it).

### Decisions taken during implementation

**The row's state and its first ledger entry both come from one constant.** This is the opposite of
what `crearEnlace` does with `activo`, and the difference is the invariant. There, the column's
default is the only writer of a flag nothing mirrors. Here, `sugerencia.estado` and
`historial_sugerencia.estado_nuevo` must agree — so taking one from the database's default and the
other from a TypeScript literal would create two sources for one fact, and the day they disagree the
trail contradicts the chip above it. Both read `ESTADO_INICIAL`.

**One nested write, not two calls in a transaction.** Prisma runs a nested create in an implicit
transaction, so the row and its first entry either both exist or neither does. Doing it as
`$transaction` would buy the same atomicity while costing the repository's client slice a
`$transaction` member that every test double would then have to implement.

**`GET /api/sugerencias` is always "mine", including for an administrator.** `esAdmin` is not
consulted; `listarSugerenciasDeAutor` has no "all" mode and no default author. Item #15 must add an
explicitly widened, explicitly admin-guarded read rather than making this default depend on the
caller's role. A scope that silently widens for some readers is a scope that will one day widen for
the wrong one, and the symptom is a collaborator's screen quietly filling with other people's ideas
with no error anywhere.

**The description's cap is a product limit, not the column's.** `descripcion` is `NVARCHAR(MAX)` and
an App Router handler has no default body-size limit, so without a number the endpoint takes
whatever anyone sends and writes it. 4000 characters — about two pages — is generous for an idea and
far below the point where one request becomes anyone else's problem. The column stays `MAX`, so the
number can be raised without a migration.

**Dates leave the repository as ISO strings.** The same list arrives as `Date` objects through the
RSC boundary and as strings through SWR's JSON. A DTO carrying `Date` would be right on the first
paint and wrong on the first revalidation — a failure that appears a minute after the page loads and
never in a test that renders once. Converting in the repository removes the possibility instead of
documenting it.

**One fixed time zone, `America/Lima`.** The list is server-rendered and then hydrated, so a date
formatted with the ambient zone is formatted twice — once with the server's, once with the reader's.
A suggestion sent at 21:00 in Lima is already the next day in UTC, which is a hydration mismatch and
a date that changes under the reader. Pinning the zone makes both renders agree by construction, and
Lima is where the company operates.

**Three failures, three treatments.** A failed *send* is a red alert beside the form with everything
the reader typed still in the fields. A failed background *refresh* is an amber `role="status"`
notice above a list that is still true. A *successful* send is a toast. DESIGN.md separates them and
so does the screen.

**Still no `<SWRConfig>` provider, and the note that asked for a reconsideration was answered.**
`mis-recursos-client.ts` named this item as the moment to reconsider ("when item #10 or #13 adds a
second key with the SAME needs"). Only the third of its three reasons expired. The first two hold:
a provider is a client component, so mounting it at the root wraps every page — including the pure
Server Components — in a client boundary; and it hides a policy that is a claim about *this* data.
Two keys that agree by coincidence are not evidence of a shared policy.

**The link into the box lives on the dashboard, not in the topbar.** The topbar lockup is currently
copied into each screen that has one rather than extracted, so putting the link there would mean
editing every copy or shipping a portal whose topbar gains and loses an entry by page. The dashboard
is where every collaborator lands, including the ones whose list is empty, so it is the one place a
link is certain to be seen. Extracting a shared topbar is worth doing and belongs to #17, which adds
a second button beside the theme toggle.

**The form prefills the author's own area, and that costs one column.** The PRD lets someone write
for "sí mismo, su área u otra área", and the first two are their own area. `area_destino` is free
text — it has to be, since an area with no registered user yet is a legal destination — so without a
default the common case is someone typing their department from memory. Prefilling does not fix
spelling drift; it removes its most frequent occasion. See the open item below.

### Two defects the tests caught before the screen shipped

Both were found by the component suite, not by review, and both are recorded here because they are
the kind of thing that would otherwise have reached a collaborator.

1. **`mutate`'s updater receives `undefined` while only `fallbackData` exists.** `fallbackData` is
   not written into SWR's cache — it is what the hook returns while the cache is empty. Falling back
   to `[]` there replaced the whole list with the one suggestion just sent, and the next
   revalidation quietly put the others back: everything you had ever written vanishing for a minute,
   right after pressing a button. The fallback is now the server's own list, which is exactly what
   is on screen whenever the cache is still empty.
2. **A `key` collision between the form and the toast.** Both are remounted by the same
   send counter and both are children of the same fragment, so after the first send they shared the
   key `1` — which React reports as "Encountered two children with the same key" and resolves by
   dropping or duplicating one of them. The keys are now namespaced (`envio-`, `toast-`), and the
   duplicate nonce state that had grown beside the counter went away with it.

---

## Phase 3 — Verify

| Check | Command | Result |
|---|---|---|
| Full suite | `pnpm test` | **1166 passed**, 87 files |
| Types | `pnpm typecheck` | clean |
| Lint | `pnpm lint` | clean |
| Production build | `npx next build` | succeeds; `/sugerencias` and `/api/sugerencias` both registered dynamic (`ƒ`) |
| Migrations | `pnpm db:migrate:status` | "Database schema is up to date" — this item adds none |

**144 tests across nine new suites were added by this item**, plus the dashboard's own suite
extended with two tests for the link.

| Suite | Covers |
|---|---|
| `lib/sugerencias/schema.test.ts` | The vocabulary against the CHECK, the three fields at their limits, and that `autorId`, `estado`, `grupoId` and `id` are stripped rather than honoured |
| `lib/sugerencias/errors.test.ts` | One message per field, that absent/empty/over-long answer identically, that no zod or SQL Server text is ever forwarded, and that there is no invented "duplicate" |
| `lib/sugerencias/etiquetas.test.ts` | DESIGN.md's five colours exactly, and that red is spent on the one state the document names |
| `lib/sugerencias/repository.test.ts` | The nested ledger write, one constant behind both states, the author-scoped `where` with no "all" mode, and that no `Date` escapes towards a browser |
| `app/api/sugerencias/route.test.ts` | Session-only guard, that an administrator gets their own list, that the author comes from the session, the status codes, and that no mail is sent yet |
| `app/(portal)/sugerencias/sugerencias-client.test.ts` | That the fetcher throws on every failure, the send's four outcomes, and that the date does not move with the process's time zone |
| `app/(portal)/sugerencias/sugerencia-form.test.tsx` | The local check in both directions, that its sentence is the API's own, and the in-flight button |
| `app/(portal)/sugerencias/buzon.test.tsx` | The cards, the full trail including the entry row, the empty state, the local prepend, and the three failure treatments |
| `app/(portal)/sugerencias/page.test.tsx` | The guard before the reads, both reads scoped to the identified user, and the way back |

### Verification against the live database

The suite never opens a connection, so the write path was also exercised against SQL Server itself —
inside a transaction that was deliberately rolled back, exactly as item #10's follow-up did:

```
CHECK en la base sobre sugerencia.estado:
  ([estado]='implementada' OR [estado]='rechazada' OR [estado]='aprobada' OR
   [estado]='en_revision' OR [estado]='pendiente')

Alta real (en transacción):
  sugerencia.estado = pendiente
  asientos del historial = 1
  asiento de entrada: anterior=null nuevo=pendiente por=Verificación temporal

Vocabulario de estado, escrito a través del CHECK:
  ACEPTA  pendiente      ACEPTA  aprobada      ACEPTA  implementada
  ACEPTA  en_revision    ACEPTA  rechazada     RECHAZA archivada

Transacción revertida a propósito: no quedó ninguna fila.
Filas en sugerencia después de revertir: 0
```

Reading the constraint proves it *says* the right thing; writing through it proves SQL Server
*enforces* it, which is what the route depends on at runtime. The nested create was confirmed to
produce the row and its entry ledger together, with `estado_anterior` NULL. Every write ran inside a
transaction that was rolled back, so `sugerencia` was left empty and no temporary user survived.

### Acceptance criteria from `TECH-DESIGN.md`

- [x] "Cualquier colaborador autenticado (con o sin asignaciones) puede enviar una sugerencia para
      sí, su área u otra área; queda en estado `pendiente` y visible con su trazabilidad." — the
      session-only guard, the free-text destination prefilled with the author's own area,
      `ESTADO_INICIAL`, and the ledger rendered on every card.
- [x] "El registro se confirma con toast." — `CONFIRMACION_ENVIO`, restarted per send.
- [ ] "En operación normal, el Área de Innovación recibe el correo de aviso." — **item #14**, and
      deliberately not started here. The PRD makes the send best-effort precisely so the suggestion
      does not depend on it. *(Delivered afterwards by item #14 — see
      `openspec/specs/notificacion-correo-best-effort/README.md`.)*
- [x] "Con la API de correo caída, la sugerencia queda registrada igualmente." — trivially true
      today, since nothing is sent. When #14 lands it must hook in *after* the insert has succeeded,
      and the route's test pins that nothing calls `fetch` today. *(It did, and the pin held: the
      test now asserts no `fetch` happens inside the request, because the send is scheduled with
      `after`.)*

---

## Open items

1. **Free-text `area_destino` will drift, and item #19 is where it hurts.** "Peajes", "peajes" and
   "Área de Peajes" are three bars in a chart that should have one. The field cannot be a closed
   list — an area with no registered user yet is a legal destination, and `usuario.area` itself is
   whatever Entra ID's `department` claim says — so the fix belongs where the grouping happens: #19
   should normalise (trim, case-fold, and probably match against the distinct areas of `usuario`)
   rather than #13 refusing a valid answer. Prefilling the author's own area removes the most
   frequent occasion for drift and nothing more.

2. **Item #15 must not widen this GET by role.** Stated here because it is the one way this item can
   be broken from outside: a conditional `where` in `listarSugerenciasDeAutor`, or an `esAdmin`
   branch in the route, turns a collaborator's screen into everyone's inbox with no error anywhere.
   The admin list needs its own read behind `guardRouteAdmin`.

3. **The topbar lockup is copied into three screens now** (`/`, `/procesadores/[id]`,
   `/sugerencias`). It was already duplicated before this item and this item followed the existing
   shape rather than refactoring on the way past. Item #17 adds a button beside the theme toggle and
   is the natural moment to extract it — at which point the link to the buzón should probably move
   there.

4. **The turbopack build cache could not be written during `next build`** — `Espacio en disco
   insuficiente (os error 112)` on `L:`. The build itself compiled, typechecked and emitted every
   route successfully; only the incremental cache write failed. It is an environment condition, not
   a defect of this item, but it will make every local build slower until the drive has room.
