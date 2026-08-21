# Item #15 — Suggestion management (admin)

**Backlog reference:** Item #15 ("Gestión de sugerencias (admin)"), repository `portal`.
**Depends on:** #13 (collaborator suggestions box) — satisfied, along with #4, whose admin guard this
item reuses.
**Unblocks:** #16 (grouping) and #18/#19 (analytics over `sugerencia` and `historial_sugerencia`).

Delivered through a three-phase cycle — Explore, Implement, Verify — rather than the full SDD
artefact chain. This file is the record of those three phases.

---

## Phase 1 — Explore

### What was read

| Source | What it settled |
|---|---|
| `BACKLOG.md` #15 | The scope in one line: full listing with state chips, state change, and an immutable asiento in `historial_sugerencia` per transition |
| `TECH-DESIGN.md` §"Gestión de sugerencias (admin)" | The four acceptance criteria, including "ningún estado anterior se pierde al avanzar el embudo" and the toast |
| `PRD.md` §"Alcance" and §"Criterios de éxito" | That the review belongs to the Área de Innovación alone, that the state must be "visible para todos", and that the admin sees "el listado completo … no solo por correo" |
| `adrs/0003` | `PATCH /api/sugerencias/{id}/estado` by name, and the convention that admin endpoints carry no `admin` prefix (`/api/enlaces`, `/api/admins`) |
| `adrs/0007` | The revalidation policy this screen inherits |
| `adrs/0002` + `prisma/schema.prisma` | That `historial_sugerencia` already exists with its nullable `estado_anterior`, and that `sugerencia_estado_check` closes the vocabulary |
| `DESIGN.md` | The five state chips colour by colour, the filter chips, the toast, and the amber/red split |
| `openspec/specs/buzon-de-sugerencias-colaborador/README.md` | **Its three open items addressed to this one**, and in particular #2: "Item #15 must not widen this GET by role" |
| `lib/sugerencias/*`, `app/api/sugerencias/route.ts`, `app/(portal)/sugerencias/*` | Item #13's shapes: schema → errors → repository → route, and server read + SWR on the client |
| `app/admin/enlaces/*`, `app/admin/procesadores/*` | The established administration screen: `guardPageAdmin`, server read, per-screen boundaries, `router.refresh()` after a mutation |

### What the exploration settled before any code was written

**No migration is needed.** Item #2 shipped all nine entities and item #13 already writes the ledger's
entry row. This item writes transitions; it does not touch the schema.

**Item #13 wrote this item's most important constraint, and it is a negative one.** Three separate
places — the repository, the route handler and the cycle README — say the same thing: the admin list
must be a *separate* read behind `guardRouteAdmin`, never a conditional `where` or an `esAdmin`
branch on the collaborator's GET. "A scope that silently widens for some readers is a scope that will
one day widen for the wrong one, and the symptom is a collaborator's screen quietly showing other
people's ideas with no error anywhere."

**The ledger's truthfulness is a concurrency problem, not a schema problem.** `estado_anterior` is a
claim about what the row held at the instant it changed. Reading the state and then updating
unconditionally makes that claim *plausible*; only a conditional update makes it *true*. This turned
out to be the item's central design decision — see below.

**`PATCH /api/sugerencias/{id}/estado` being a sub-resource is doing real work.** ADR 0003 names the
path, and the shape is what keeps the endpoint safe to describe: there is no route at
`/api/sugerencias/{id}` at all, so the words a collaborator wrote are not addressable by anything the
portal exposes.

---

## Phase 2 — Implement

### New modules

| File | Responsibility |
|---|---|
| `lib/sugerencias/fechas.ts` | `ZONA_HORARIA` and `formatearFecha`, moved down from item #13's client so both screens format one row's timestamps identically |
| `app/api/sugerencias/todas/route.ts` | `GET` — the widened read, behind `guardRouteAdmin`, on a path of its own |
| `app/api/sugerencias/[id]/estado/route.ts` | `PATCH` — the transition, behind `guardRouteAdmin` |
| `app/admin/sugerencias/page.tsx` | The screen's server half: guard, then the full read |
| `app/admin/sugerencias/sugerencias-admin.tsx` | The list, the five review buttons, the filter chips, the trail and the two failure treatments |
| `app/admin/sugerencias/sugerencias-client.ts` | The fetcher, the PATCH, the revalidation policy and the copy this screen owns |
| `app/admin/sugerencias/{loading,error}.tsx`, `sugerencias.module.css` | The screen's own boundaries and styles |

**Extended:** `lib/sugerencias/schema.ts` (`idSugerenciaSchema`, `cambiarEstadoSchema`),
`lib/sugerencias/errors.ts` (the review's failure vocabulary), `lib/sugerencias/etiquetas.ts`
(`textoDeAsiento`), `lib/sugerencias/repository.ts` (`SugerenciaAdminDTO`, `listarSugerencias`,
`cambiarEstadoSugerencia`).

**Changed:** `app/(portal)/sugerencias/buzon.tsx` and `sugerencias-client.ts` — both now read the
shared helpers instead of holding their own copies. Neither changed behaviour, and item #13's suite
passed unmodified throughout.

### Decisions taken during implementation

**The update is conditional on the state that was read, and that is the item's load-bearing
decision.** `updateMany({ where: { id, estado: actual }, data: { estado: nuevo } })` is optimistic
concurrency, and it is what makes `estado_anterior` true rather than merely plausible. Two
administrators reviewing the same suggestion in the same seconds both read `pendiente`; without the
condition, both updates succeed and both write an asiento claiming the row was `pendiente` when they
changed it — so the ledger shows `pendiente → aprobada` followed by `pendiente → rechazada`, a trail
that is internally impossible and, worse, silently wrong about the first decision. With the condition
the second update matches zero rows, the whole transaction rolls back, and the second reviewer is
told to look again. This was confirmed against SQL Server itself; see Phase 3.

**`$transaction` finally earned its place, and it arrived as a new type.** `crearSugerencia` argued
against adding it to `SugerenciasClient` — a nested create is already atomic and there was no third
statement to justify the cost. `cambiarEstadoSugerencia` is that third statement: it reads a state,
writes the row conditionally on it, and writes the asiento that quotes it. It is a *separate*
`SugerenciasAdminClient` rather than a widened shared slice, so every existing test double of the
collaborator's box stayed valid — a widened slice would have made the compiler demand a
`$transaction` stub from suites that never open one.

**The refusals are thrown, not returned.** Three cases are decided *inside* the interactive
transaction, and throwing is what rolls it back. A result type would leave the caller holding a "no"
with the transaction still open and the row already updated on two of the three paths — so the
mechanism that reports the refusal has to be the same one that undoes the work, or the refusal is a
lie.

**A transition to the same state is refused with a 409.** `aprobada → aprobada` is not a transition;
it is a double click, or two administrators agreeing. Writing it would put non-events into a ledger
whose whole value is that every row in it is a change somebody made — and the trail the author reads
on their own screen would fill with lines saying that nothing happened, twice.

**The funnel's order is deliberately NOT enforced.** TECH-DESIGN.md describes the path as "pendiente
→ en revisión → aprobada/rechazada/implementada", and it would be easy to read that as a graph to
police. It is a description of the normal case, and no document asks for the other moves to be
impossible. Refusing them would cost more than it buys: an administrator who clicks "Rechazada"
instead of "Aprobada" needs to correct it, and with a one-way graph the only correction left is a
database edit — outside the portal, outside the ledger, and therefore outside the accountability the
PRD asks for. A rejected idea revived months later is a real thing that happens. What the product
actually asked for is that nothing is *lost*, and that is what the asiento gives: every move —
forward, back or sideways — recorded with who made it and when. The vocabulary stays closed either
way, by `cambiarEstadoSchema` and by `sugerencia_estado_check`.

**A separate DTO, not a widened `SugerenciaDTO`.** The author's name and area are exactly the fields
`GET /api/sugerencias` must never grow. Making `autor` optional on the shared DTO would have put that
distinction in an `undefined` check instead of in the type, and the day a screen forgets the check
the mistake renders rather than failing to compile.

**`correo` is deliberately not selected.** The Área de Innovación already receives item #14's
notification with the author's address in it, and a management screen listing every collaborator's
corporate e-mail is a copy of the directory that nothing on this screen needs.

**`/todas` under the resource, not `/api/admin/sugerencias`.** ADR 0003 lists the portal's
administrative endpoints as `/api/enlaces`, `/api/procesadores`, `/api/usuarios/{id}/asignaciones`,
`/api/admins` — the resource first, never an `admin` prefix. That prefix exists on *screens*
(`/admin/enlaces`) because a person reads the address bar; inventing it on the API for one route
would have left the portal with two conventions and no rule for choosing between them.

**SWR here, `router.refresh()` on the other admin screens, and the difference is real.**
`enlaces-admin` and `procesadores-admin` keep no local copy because a catalogue only ever changes
when an administrator on that very screen changes it. This list does not work that way: a
collaborator sending a suggestion is a row appearing in front of a reviewer who did nothing, which is
exactly the case ADR 0007 wrote the revalidation policy for. So this screen took the collaborator
box's shape instead.

**The filter is client-side, over a list that is already loaded.** No round trip per chip, no second
SWR key per state, and — the part that matters — no state parameter on a route whose scope item #13
asked us to be careful with. The counts beside each label are computed from the same array, so they
cannot disagree with the list under them. `listarSugerencias` documents the lifespan of that
decision: the day this table is in the thousands, the filter moves to the server and the read takes a
cursor.

**Three helpers moved down to `lib/` rather than being copied.** `formatearFecha`, `ZONA_HORARIA` and
`textoDeAsiento` were written beside item #13's screen when one screen showed these rows. Two screens
now show *the same rows*, and a collaborator and an administrator reading one suggestion's ledger
have to see one timestamp and one wording — not two that agree until somebody edits one copy.
`sugerencias-client.ts` re-exports the date helpers, so item #13's call sites and its suite were
untouched by the move.

**The ambiguous success is worded as a doubt, and it points the opposite way from item #13's.** A 200
whose body is not a suggestion is treated as a failure on both screens, but for opposite reasons.
There, the doubtful answer had to read as "not sent", so nobody believes an unwritten idea is safe.
Here the ambiguous outcome is a change that probably *did* apply, so `ERROR_SIN_CONFIRMACION`
promises neither and points at a list that revalidates within the minute.

**Two error constants, not one.** `ERROR_INTERNO` says "no pudimos registrar tu sugerencia … no se
guardó nada", which would be actively misleading to a reviewer: the suggestion exists, it is the
state change that did not apply. `ERROR_INTERNO_REVISION` says "quedó como estaba", and
`ERROR_INTERNO_LISTADO` promises nothing about writes because nothing was being written.

**The current state is a chip *and* a disabled button.** The chip reports where the suggestion is, the
buttons offer where it can go, and the one it is already in is not somewhere it can go. That is the
client half of the repository's same-state refusal — the server enforces it, the screen only avoids
asking.

**Every review button carries an `aria-label` naming its suggestion.** With five cards on screen there
are five buttons reading "Aprobada", and the visible label alone does not say which row it belongs
to.

---

## Phase 3 — Verify

| Check | Command | Result |
|---|---|---|
| Full suite | `pnpm test` | **1363 passed**, 96 files (was 1200 in 91 files) |
| Types | `pnpm typecheck` | clean |
| Lint | `pnpm lint` | clean |
| Production build | `npx next build` | succeeds; `/admin/sugerencias`, `/api/sugerencias/todas` and `/api/sugerencias/[id]/estado` all registered dynamic (`ƒ`) |
| Migrations | `pnpm db:migrate:status` | "Database schema is up to date" — this item adds none |

**163 tests were added by this item**, across five new suites and four extended ones.

| Suite | New | Covers |
|---|---|---|
| `lib/sugerencias/schema.test.ts` | 29 | The id parsed rather than coerced (including that it refuses `"todas"`, the sibling route), the state vocabulary against the CHECK, and that `titulo`, `descripcion`, `areaDestino` and `cambiadoPor` are all stripped |
| `lib/sugerencias/errors.test.ts` | 17 | One status and one sentence per refusal, that the reviewer is never told their suggestion was not saved, and that nothing Prisma or SQL Server said is ever forwarded |
| `lib/sugerencias/etiquetas.test.ts` | 4 | That the entry row reads as an event, that both ends of a transition go through the label, and that a backwards move can be written |
| `lib/sugerencias/repository.test.ts` | 19 | The `where`-less admin read, the conditional update, the asiento's two ends, the three refusals with nothing written, and that the funnel's order is not policed |
| `app/api/sugerencias/todas/route.test.ts` | 10 | The admin guard before any query, that the read is never filtered by the caller's id, and the 500's copy |
| `app/api/sugerencias/[id]/estado/route.test.ts` | 26 | Guard before id before body, the conditional update reaching Prisma, the asiento signed from the session, the three refusals, and that no mail is sent |
| `app/admin/sugerencias/sugerencias-client.test.ts` | 24 | That the fetcher throws on every failure, the PATCH's four outcomes, and that the ambiguous 200 is reported as a doubt |
| `app/admin/sugerencias/sugerencias-admin.test.tsx` | 27 | The cards, the chips, the full trail, the five buttons with the current one disabled, the filters with their counts, the two empty states, and the alert/status split |
| `app/admin/sugerencias/page.test.tsx` | 7 | The guard before the read, and that the collaborator's author-scoped read is never called |

### Verification against the live database

The suite never opens a connection, so the write path was also exercised against SQL Server itself —
inside a transaction that was deliberately rolled back, exactly as items #10 and #13 did:

```
Transición real (en transacción):
  estado de la fila = en_revision
  asientos = 2
  asiento nuevo: anterior=pendiente nuevo=en_revision por=Verificación temporal
  fecha del asiento la puso la base = 2026-08-21T17:17:43.418Z

Doble clic al mismo estado: sin_cambio

Update condicionado a un estado que ya cambió: filas afectadas = 0
  la fila quedó intacta en = en_revision

Vocabulario de estado, escrito a través del CHECK:
  ACEPTA  aprobada    ACEPTA  rechazada    ACEPTA  implementada
  ACEPTA  pendiente   RECHAZA archivada

listarSugerencias la ve: autor=Verificación temporal área=Peajes

Transacción revertida a propósito.
  filas en sugerencia que sobrevivieron = 0
  usuarios temporales que sobrevivieron = 0
```

The third block is the one that mattered. A unit test can only prove that `updateMany` is *called*
with the condition; running it against SQL Server proves the engine *honours* it — zero rows matched
once the state had moved, and the row was left exactly where the first reviewer put it. That is the
guarantee the ledger's truthfulness rests on, and it is now verified where it actually executes.
Every write ran inside a transaction that was rolled back, so nothing survived and no temporary user
was left behind.

### Acceptance criteria from `TECH-DESIGN.md`

- [x] "El admin ve el listado completo de sugerencias con sus chips de estado (colores por estado
      según DESIGN.md)." — `listarSugerencias` behind `guardPageAdmin` / `guardRouteAdmin`, rendered
      with `TONO_ESTADO`, which item #13's suite already pins colour by colour against the document.
- [x] "El admin cambia el estado (pendiente → en revisión → aprobada/rechazada/implementada); el
      cambio se confirma con toast y el nuevo estado es visible para el colaborador autor." — the five
      buttons, `confirmacionDeCambio`, and the author's own screen revalidating on focus and every
      minute (ADR 0007). The funnel's *order* is not enforced; see the decision above.
- [x] "Cada cambio de estado escribe un asiento inmutable en `historial_sugerencia` (estado_anterior,
      estado_nuevo, admin que lo hizo, fecha); el recorrido completo es consultable y ningún estado
      anterior se pierde al avanzar el embudo." — one transaction, the conditional update, and the
      trail rendered on both screens.
- [ ] "El admin agrupa 2+ sugerencias similares en un grupo; las sugerencias agrupadas se muestran
      juntas y conservan su estado y autor individuales." — **item #16**, and deliberately not started
      here. `grupoId` stays absent from both DTOs.

### Item #13's open items, answered

1. **"Item #15 must not widen this GET by role."** Held. `listarSugerenciasDeAutor` was not touched;
   the widened read is a different function with no `where`, on a different path, behind a different
   guard, and `app/admin/sugerencias/page.test.tsx` asserts the author-scoped read is never called
   from this screen.
2. **Free-text `area_destino` drift** — untouched, as that README said it should be: the fix belongs
   in #19 where the grouping happens. This screen now shows both the destination area and the
   author's own area, which makes the drift visible to the people who will have to normalise it.
3. **The copied topbar** — this screen has none, matching the other three admin screens. Still #17's
   to extract.

---

## Open items

1. **No navigation reaches `/admin/sugerencias`.** It is typed into the address bar, exactly like
   `/admin/enlaces`, `/admin/procesadores` and `/admin/asignaciones` — this item followed the existing
   shape rather than inventing an admin nav on the way past. Item #17 adds a button beside the theme
   toggle and extracts the shared topbar; that is the moment the four admin screens should get a way
   in that is not a URL.

2. **The list is unpaginated and the filter is client-side.** Honest today — a suggestions box for one
   company's staff grows by a handful of rows a week — and written down in `listarSugerencias` so the
   day it stops being honest is a day somebody reads about it. The trigger is the same for both: when
   the whole list no longer fits in one answer, the filter moves to the server and the read takes a
   cursor.

3. **A conflicting review costs the second reviewer their decision, by design.** They are told to
   reload and decide again against the current state, rather than having their change applied on top.
   That is the right default for a two-person review — the alternative is silently overwriting a
   colleague's decision — but it means a reviewer can lose a click to a race. If it ever becomes
   frequent, the answer is to show *who* moved it and *where to*, not to drop the condition.

4. **No mail is sent on a state change.** Item #14's notification exists so the Área de Innovación
   hears about something it did not know about; a review is made by that area, so mailing them their
   own click would be noise. The author learns the new state from their own screen. If the product
   later wants the author notified, that is a new best-effort send hooked in after the transaction
   commits — the same placement item #14 uses, and for the same reason.
