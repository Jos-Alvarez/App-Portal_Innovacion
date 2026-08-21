# Item #16 — Grouping suggestions (admin)

**Backlog reference:** Item #16 ("Agrupación de sugerencias"), repository `portal`.
**Depends on:** #15 (suggestion management) — satisfied. Through it, #13 and #4.
**Unblocks:** nothing directly. #18/#19 read `sugerencia` and `historial_sugerencia`, neither of
which this item changes.

Delivered through the same three-phase cycle item #15 used — Explore, Implement, Verify — rather than
the full SDD artefact chain. This file is the record of those three phases.

---

## Phase 1 — Explore

### What was read

| Source | What it settled |
|---|---|
| `BACKLOG.md` #16 | The scope in one line: `grupo_sugerencia`, two or more similar suggestions grouped, each keeping its own state and author |
| `TECH-DESIGN.md` §"Gestión de sugerencias (admin)" | The acceptance criterion verbatim, including "2+ sugerencias similares" and "conservan su estado y autor individuales" |
| `PRD.md` §"Alcance" | That grouping exists "para no gestionarlas por separado" — a convenience of the Área de Innovación, not something the author participates in |
| `adrs/0003` | `POST /api/sugerencias/grupos` by name, and the resource-first convention with no `admin` prefix |
| `adrs/0002` | That `historial_sugerencia` is one row per state **transition** — which is what kept grouping out of the ledger |
| `prisma/schema.prisma` + `prisma/migrations/20260813040410_init_esquema_portal` | That `grupo_sugerencia` and `sugerencia.grupo_id` already exist, with `ON DELETE SET NULL` |
| `openspec/specs/gestion-de-sugerencias-admin/README.md` | Item #15's unchecked fourth criterion, addressed to this item, and its note that `grupoId` stays absent from both DTOs until now |
| `app/api/enlaces/[id]/route.ts` | The established reading of `DELETE`: the verb describes what happens to the resource the client addressed |
| `app/admin/procesadores/edicion.ts` | The precedent for putting a screen's one real decision in its own module, testable without mounting anything |
| `DESIGN.md` | The toast on "agrupar", and the amber/red split this screen already implements |

### What the exploration settled before any code was written

**No migration is needed, and this was verified rather than assumed.** `grupo_sugerencia` shipped in
the initial migration with item #2, and `sugerencia.grupo_id` already carries
`ON DELETE SET NULL`. That last detail turned out to be load-bearing: it is what lets a group be
dissolved with a single `DELETE` instead of a `DELETE` plus a compensating `UPDATE`.

**Grouping must not write to the ledger, and ADR 0002 is why.** The ledger is defined as one row per
state *transition*. Filing an idea into a bucket is not one, and the author reading their own trail
would find a line about an event that never happened to their idea. This is enforced by the type and
not only by the intent: the repository's grouping functions take a Prisma slice with no
`historialSugerencia` in it.

**The response shape is the item's central design problem, and it was visible before any code.** A
grouping write can reach a row the caller never named — see Phase 2. Every other write in this portal
answers with the row it wrote, and here that answer would be true and insufficient.

**A correction path is part of the feature, not an extra.** Item #15 made the same argument about the
funnel's order: without a way back inside the portal, a mis-filed idea is fixable only against the
database, and a convenience becomes a decision nobody can undo.

---

## Phase 2 — Implement

### New modules

| File | Responsibility |
|---|---|
| `app/admin/sugerencias/agrupacion.ts` | `armarBloques` and `resumenDeGrupo` — how a flat list becomes the blocks the screen draws |
| `app/api/sugerencias/grupos/route.ts` | `POST` — creating a group, behind `guardRouteAdmin` |
| `app/api/sugerencias/[id]/grupo/route.ts` | `DELETE` — leaving a group, behind `guardRouteAdmin` |

**Extended:** `lib/sugerencias/schema.ts` (`crearGrupoSchema`, `MINIMO_POR_GRUPO`,
`TITULO_GRUPO_MAX`, `SUGERENCIAS_POR_GRUPO_MAX`), `lib/sugerencias/errors.ts`
(`AgrupacionRechazada` and its four refusals, `errorDeAgrupacion`, `errorDeGrupo`),
`lib/sugerencias/repository.ts` (`grupo` on `SugerenciaAdminDTO`, `crearGrupoSugerencias`,
`quitarSugerenciaDeGrupo`, `disolverGruposSinMinimo`), `app/admin/sugerencias/sugerencias-client.ts`
(`agruparSugerencias`, `quitarDeGrupo`, `ResultadoGrupo` and the copy),
`app/admin/sugerencias/sugerencias-admin.tsx` and its stylesheet (the checkbox, the bar, the group
block, the way out).

**Changed:** `app/api/sugerencias/todas/route.test.ts` and
`app/api/sugerencias/[id]/estado/route.test.ts` — their Prisma fixtures predated this item and
carried no `grupo` key. See Phase 3.

### Decisions taken during implementation

**Both grouping writes answer with the whole list, and that is the item's load-bearing decision.**
Filing a suggestion into a new group can leave its *previous* group below the minimum, which deletes
that group, which nulls the `grupo_id` of a suggestion the caller never named and has no way to know
it should ask about. The same happens on the way out: removing the second-to-last member dissolves
the group and frees the survivor. A response carrying only the named rows would be true and
insufficient, and a screen patching its cache from it would keep drawing a group that no longer
exists until the next revalidation. Answering with the list removes the possibility rather than
documenting it — and it costs nothing new, because the read is already unpaginated and the screen
already holds all of it.

**A group below two members is deleted, not tolerated.** `MINIMO_POR_GRUPO` is not only a rule about
*requests*; it stays true after writes. `disolverGruposSinMinimo` runs inside the same transaction as
every grouping write, and it deletes the row rather than updating the survivor: the
`ON DELETE SET NULL` on `sugerencia_grupo_id_fkey` nulls the survivor's `grupo_id` in the same
statement. There is no second `UPDATE`, and therefore no window in which the two disagree.

**The count check turns a filter into a lookup.** `findMany` with `id: { in: ids }` silently returns
fewer rows when one of the ids is gone. Without comparing counts, a selection of two where one had
just been deleted would create a group with a single member — precisely the state
`disolverGruposSinMinimo` exists to prevent, arrived at through the front door. Refusing beats
grouping-what-is-left, because the administrator picked a set and a different set is not what they
approved.

**The duplicate check lives in the schema, so the refusal names the real problem.** `[7, 7]` has two
entries and one suggestion. Without the check it clears the minimum, and the repository then reports
that a suggestion is missing when all of them are there — a refusal that is a lie about its own
reason.

**`SUGERENCIAS_POR_GRUPO_MAX` is a bound on a request, not a rule of the domain.** The column cannot
express it and the database does not care. Without it the endpoint turns an array of any length into
an `UPDATE … WHERE id IN (…)` of any length, which is a request anyone can make expensive. A hundred
is far past what a bucket a person *reads* can be.

**Already-loose is a 409, not a silent success.** The same argument item #15 made for refusing a
same-state transition: the caller is acting on a screen that disagrees with the database, and
answering "done" would confirm the stale assumption instead of correcting it.

**`DELETE /api/sugerencias/{id}/grupo`, and the resource is the membership.** The verb describes what
happens to the resource the client addressed, matching `app/api/enlaces/[id]`. The suggestion itself
is untouched — its words, its author, its state and its whole ledger survive, which is exactly what
"conservan su estado y autor individuales" promises. Growing an existing group is deliberately *not*
a second mode of this route and there is no `PATCH` beside it: the screen regroups by selecting the
members it wants and naming the group again. One control instead of two, and no endpoint shipped that
nothing calls.

**A group is drawn where its newest member would have sat.** The list is ordered newest-first and
that ordering is a promise the screen makes. Sorting groups separately — all groups on top, or by
group id — would quietly break it: a bucket created today holding an idea from March would jump to
the head of a list that claims to be chronological. `armarBloques` is a single pass over the
already-ordered list that emits a group at the position of the first member it meets, folds the rest
in, and sorts nothing.

**The filter filters suggestions, not groups — and `total` is why.** Two members of one group can be
in two different states; that is the whole point of the item. Showing the *whole* group because one
member matches would put a `pendiente` card on screen under an "Aprobada" filter, and the filter
would be lying. Showing only the matches with no further comment would leave a block that looks like
a group of one. So the members are filtered and `total` is counted from the complete list, letting
the header say "1 de 2" — the only honest thing on screen. `resumenDeGrupo` stays silent when nothing
is hidden, because "5 de 5" is a sentence that makes a reader look for the missing one.

**The bar's own existence is the message that one card is not a group.** It appears only once the
selection reaches the minimum. `crearGrupoSchema` refuses fewer than two and the endpoint would
answer 400, so an enabled control the server is certain to reject is a promise the screen cannot
keep.

**The group is a `<section>` with a heading, not a box with a border.** "Las sugerencias agrupadas se
muestran juntas" is structure a screen reader can navigate, and the accessible name is the title
somebody typed. The screen tests find the block by `role="region"` for exactly that reason: swap the
section for a styled `<div>` and they stop finding it.

**A native checkbox, dressed by the stylesheet.** The components layer ships none, and inventing a
shared checkbox for a single screen is a component nobody else asked for — the same treatment
`enlaces.module.css` gives its `<select>`. It carries a visually hidden name, because five cards on
screen mean five identical checkboxes.

**The selection is dropped after a successful write.** The ticks described rows whose grouping just
changed; keeping them invites a second action against a list that has moved on.

**No mail, no `evento_uso`, no asiento.** For the reasons `/api/sugerencias/[id]/estado` already
gives at length, plus ADR 0002 for the ledger.

---

## Phase 3 — Verify

| Check | Command | Result |
|---|---|---|
| Full suite | `pnpm test` | **1509 passed**, 99 files (was 1363 in 96 at the close of item #15) |
| Types | `pnpm typecheck` | clean |
| Lint | `pnpm lint` | clean |
| Production build | `npx next build` | succeeds; `/api/sugerencias/grupos` and `/api/sugerencias/[id]/grupo` both registered dynamic (`ƒ`) |
| Migrations | `pnpm db:migrate:status` | "Database schema is up to date" — 3 migrations, this item adds none |

**146 tests were added by this item**, across three new suites and five extended ones.

| Suite | Tests | Covers |
|---|---|---|
| `app/admin/sugerencias/agrupacion.test.ts` | 13 *(new)* | That a group is emitted at its first member's position, that nothing is reordered, that a group is never repeated, and the filter's two honest halves — visible members and a real `total` |
| `app/api/sugerencias/grupos/route.test.ts` | 18 *(new)* | The admin guard before any write, the 400s from the schema, the creator taken from the session and never from the body, the 201, and that no asiento and no mail are written |
| `app/api/sugerencias/[id]/grupo/route.test.ts` | 17 *(new)* | The guard, the id parsed rather than coerced, the 404/409 split, and that the body is the whole list |
| `lib/sugerencias/repository.test.ts` | 57 | The count check, the previous groups read *before* the update, dissolution by `DELETE`, the four refusals with nothing written, and that the ledger is never touched |
| `lib/sugerencias/schema.test.ts` | 71 | The minimum, the maximum, the duplicate refusal, and that `creadoPor` is stripped |
| `lib/sugerencias/errors.test.ts` | 51 | One status and one sentence per refusal, and that nothing Prisma or SQL Server said is forwarded |
| `app/admin/sugerencias/sugerencias-client.test.ts` | 40 | The POST, the DELETE, and the ambiguous 200 reported as a doubt rather than a success |
| `app/admin/sugerencias/sugerencias-admin.test.tsx` | 45 | The group block and its summary, that members keep their own chip and author, the bar's threshold, the two writes reaching the client, the list redrawn wholesale, the toasts, and the failure alerts |

### The two stale fixtures, and why they were fixed rather than worked around

`app/api/sugerencias/todas/route.test.ts` and `app/api/sugerencias/[id]/estado/route.test.ts` were
failing with a 500 across five tests. The cause was not the routes: `SELECT_ADMIN` now always
requests `grupo`, so a real Prisma row always carries the key, but those hand-written fixtures
predated this item and omitted it. `undefined === null` is false, so the mapper took the branch for a
present group and dereferenced `undefined`.

The tempting fix was `fila.grupo ?? null` in the mapper. It was rejected: that would make the mapper
tolerate a shape Prisma cannot produce, and would silently swallow a genuinely wrong `select` — the
one mistake the mapper is positioned to catch. The fixture was the thing that was lying, so the
fixture was corrected.

### The screen tests were checked against mutations, not just run

Fifteen new screen tests passing on the first run proves nothing until they are seen to fail, so two
deliberate mutations were introduced and reverted:

| Mutation | Result |
|---|---|
| `armarBloques` counting `total` over the *visible* list instead of the complete one | "con un filtro puesto, dice cuántas está viendo y cuántas hay" fails — 1 of 45 |
| `setSeleccion([])` removed after a successful grouping write | "suelta la selección después de agrupar" fails — 1 of 45 |

Both bit exactly one test and the right one. Working tree restored and the full suite re-run green
afterwards.

### Acceptance criterion from `TECH-DESIGN.md`

- [x] "El admin agrupa 2+ sugerencias similares en un grupo; las sugerencias agrupadas se muestran
      juntas y conservan su estado y autor individuales." — `crearGrupoSchema` enforces the 2+ on the
      way in and `disolverGruposSinMinimo` keeps it true after every write; the group renders as a
      named `<section>` holding its members; each member keeps its own chip, its own author line, its
      own five review buttons and its own ledger, which
      `sugerencias-admin.test.tsx` pins directly.

This closes the fourth and last criterion left open by item #15's cycle.

---

## Open items

1. **A group's title cannot be renamed, and a group cannot be grown.** Both are deliberate: the
   screen regroups by selecting the members and naming the group again, which reuses one control
   instead of shipping two more endpoints. If renaming turns out to be asked for in practice, it is a
   `PATCH /api/sugerencias/grupos/{id}` carrying only `titulo` — the members are already reachable
   through the two routes that exist.

2. **Nothing prevents two groups with the same title.** `grupo_sugerencia.titulo` carries no unique
   constraint and none was added: two buckets both called "Peajes" are a mess for the Área de
   Innovación to notice and fix, not an integrity violation, and a unique index would refuse a name
   whose original the reader may not be able to see under an active filter.

3. **`creadoPor` is stored and never shown.** The column is written from the session on every group,
   so the data is there the day a screen wants to say who filed a bucket. Nothing displays it today
   because nothing asked for it, and the group header is deliberately three words and a count.

4. **The list is still unpaginated, and grouping made that slightly more true.** Both grouping writes
   answer with the whole list, so the cost of a write is now the cost of the read. The trigger
   recorded in item #15 is unchanged and now has a second reason behind it: when the whole list no
   longer fits in one answer, the filter moves to the server, the read takes a cursor, and these two
   routes go back to answering with the rows they touched plus the ids they freed.

5. **`area_destino` drift is still untouched**, as items #13 and #15 both said it should be. Grouping
   is the manual answer to the same problem — an administrator can now put "Peajes" and "peajes" in
   one bucket by hand — which makes the normalisation less urgent, not less real. Still #19's.
