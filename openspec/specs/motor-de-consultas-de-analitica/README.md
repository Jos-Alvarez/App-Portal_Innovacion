# Item #18 — The analytics query engine

**Backlog reference:** Item #18 ("Motor de consultas de analítica"), repository `portal`.
**Depends on:** #8 (`apertura` events), #10 (`ejecucion` and the typed errors) and #15 (the
suggestion funnel) — all satisfied. Through them, #4.
**Unblocks:** #19, the analytics screen, which is the only consumer this endpoint has.

Delivered through the same three-phase cycle items #15, #16 and #17 used — Explore, Implement,
Verify — rather than the full SDD artefact chain. This file is the record of those three phases.

---

## Phase 1 — Explore

### What was read

| Source | What it settled |
|---|---|
| `BACKLOG.md` #18 | The scope in one line: the endpoint, the four periods, the comparison, live SQL aggregation over `evento_uso` |
| `PRD.md` §"Pantalla de analítica" | The six metrics verbatim, and the one word that decided a query: suggestions are cut "por área **de origen**", which is the author's area and not `area_destino` |
| `TECH-DESIGN.md` §"Analítica (admin)" | The three acceptance criteria, including that an execution done today shows up in "hoy" on reload |
| `adrs/0010` | Live aggregation, no summary tables, no external telemetry — and the formal acceptance that adoption crosses historical use with the CURRENT photo of permissions |
| `adrs/0003` | `GET /api/analitica?desde=&hasta=&comparar=` by name |
| `adrs/0002` | That `evento_uso.id_recurso` is polymorphic **with no foreign key**, which is why the join happens where it does |
| `prisma/schema.prisma` + the initial migration | The four indexes on `evento_uso`, all closing on `fecha` — and `DEFAULT CURRENT_TIMESTAMP`, which turned out to be the most important line in the item |
| `lib/eventos/repository.ts` | The seven-member event vocabulary and its warning: a wrong polymorphic pair joins to the wrong catalogue row and shows up here as usage of a resource nobody touched |
| `lib/sugerencias/fechas.ts` | That the portal already pins `America/Lima`, and why |
| `lib/usuarios/repository.ts` | The `_count` idiom for assignments, which became adoption's denominator |
| `app/api/admins/directorio/route.ts` | The precedent for an admin read that is an endpoint rather than a page read: a question the reader changes several times a minute |

### What the exploration settled before any code was written

**No migration is needed, and it was verified rather than assumed.** `evento_uso` and its four
indexes shipped with the initial migration; this item only reads them. `prisma migrate status` at the
end reports the schema up to date with the same three migrations.

**The day boundary is the whole of the risk.** `evento_uso.fecha` is `DATETIME2` defaulted to
`CURRENT_TIMESTAMP` — the database host's wall clock, carrying no offset — and Prisma reads that
naive value back as if it were UTC. Everything else in the item is arithmetic; this is the one place
where a plausible-looking line silently reassigns hours of events to the wrong period.

**"Por área de origen" is not `area_destino`.** Both columns exist and they answer different
questions — where the idea came from, and who it is aimed at. The PRD says origin, so the query
groups by author.

**Adoption's denominator is today's permissions, and that is a decision already taken.** ADR 0010
accepts formally that there is no history of assignments: the metric answers "of the people who have
access today, how many use it". Nothing in this item had to re-litigate it — only to implement it and
say so.

---

## Phase 2 — Implement

### New modules

| File | Responsibility |
|---|---|
| `lib/zona-horaria.ts` | `ZONA_HORARIA`, moved down one level for its second consumer |
| `lib/analitica/periodos.ts` | Where a period begins and ends, and the two clock conversions |
| `lib/analitica/schema.ts` | What a valid question is: `rango`, the two calendar days, `comparar` |
| `lib/analitica/errors.ts` | The two ways this endpoint can fail |
| `lib/analitica/repository.ts` | Three `GROUP BY`s over the facts, three reads of the dimensions |
| `lib/analitica/metricas.ts` | Counts in, the six metrics out — pure |
| `lib/analitica/servicio.ts` | The orchestration: which period, how many reads, what is skipped |
| `app/api/analitica/route.ts` | `GET`, behind `guardRouteAdmin` |

**Changed:** `lib/sugerencias/fechas.ts` re-exports `ZONA_HORARIA` from its new home, so item #13's
and item #15's call sites are untouched.

### Decisions taken during implementation

**The boundary is built with `Date.UTC` and is NOT shifted.** The column is a naive local timestamp
that Prisma hands back as UTC, so "the wall clock read 00:00 on the 21st" is literally
`2026-08-21T00:00:00.000Z`. Correcting it by −05:00 "to convert Lima to UTC" is the intuitive move
and is exactly wrong: it would compare 05:00 against a column that never left local time and start
every period five hours late. The OTHER conversion — the instant `ahora` into the calendar day the
reader is living in — does need the zone, and it asks `Intl` rather than assuming −5, so a future
change to Peru's offset is the platform's problem and not this module's.

**Which wall clock is an assumption about the deployment, and it is stated rather than hidden.** The
portal assumes the database host keeps Lima's clock. A SQL Server running in UTC would stamp rows
five hours ahead of the day its readers live in, and the fix is one line of infrastructure — not a
correction smeared through this module, which would then have to be undone the day somebody fixes
the host.

**Whole calendar days, never a rolling window.** "Últimos 7 días" ends at the end of today and begins
at the start of the day six days ago. A rolling 168 hours would make two reloads a minute apart
return different numbers, and would make the comparison impossible to explain — a Tuesday morning
compared against half of the Tuesday before it. Whole days also make `hoy` fall out as the same rule
with a length of one rather than as a special case. The ranges are half-open, so the last millisecond
of a day belongs to exactly one period.

**`rango` is an addition to the ADR's query string, and the reason is the clock.** ADR 0003 writes
`?desde=&hasta=&comparar=`, which describes the custom range only. The three presets had to be
resolved somewhere, and doing it in the browser would let an administrator in Madrid ask for a
"today" that started at 19:00 Lima time the previous evening. `rango` names the period; the server
resolves it. The query string stays a superset of the one the ADR wrote.

**The response carries `YYYY-MM-DD`, not ISO instants.** Item #19 renders dates through
`formatearFecha`, which converts to Lima — and would draw a period starting on the 21st as "20/08,
19:00". A calendar day has no time and no zone, so there is nothing left to convert. `hasta` is the
last day INCLUDED, which is the day the reader named; the half-open boundary stays inside.

**Errors are reported and never counted as use.** A procesador that rejected forty files was tried
forty times and worked none of them. Ranking those attempts as usage would put it at the top of a
list an administrator reads as "esto es lo que la empresa usa", when the honest reading is the
opposite: it is what the company cannot get to work. Both numbers travel; only one is ranked. For the
same reason errors are not attributed to people at all — a failed upload says something about the
procesador, not about whoever tried it, and a ranking of "who caused the most errors" is a scoreboard
nobody asked for.

**The aggregation is in SQL; the joins are not.** Each period runs three `GROUP BY`s over the fact
tables, bounded by the indexed date range — ADR 0010's live aggregation, and what the four indexes on
`evento_uso` exist for. What is folded in TypeScript is the RESULT: tens of rows, bounded by the size
of the catalogue and the staff list rather than by the history. Raw SQL was rejected for three
reasons — the expensive half is already in the database; `id_recurso` has no foreign key, so "join to
the resource" is really two `LEFT JOIN`s and a `COALESCE`; and a raw query would be the first place in
this portal where the schema's shape is duplicated as text the compiler cannot check.

**Dimensions once, facts twice.** A comparison asks the same questions of a shifted range, and the
catalogue of resources is not a question about a period. Reading it twice would spend a round trip on
an identical answer and would let the two halves disagree about somebody's area if a login landed
between them. And `comparar=false` costs nothing: the previous period only runs when it was asked
for, so the default view — the one opened every morning — is not paying for a number nobody put on
screen.

**Zero is a result and absence is not.** Lists contain only what happened; `porEstado` carries all
five states with their zeros because the distribution is read as a whole, and `adopcion` reports its
numbers even when both are zero — "0 de 14 personas con acceso lo usaron" is the finding. The 500's
copy makes the same distinction out loud: "no es que no haya datos: no pudimos leerlos."

**Events survive their resources.** `evento_uso` has no foreign key to the catalogue, so a row can
outlive what it points at. Those events keep their counts with `nombre: null` rather than being
dropped (which would erase usage that really happened) or renamed (which would report a resource that
does not exist). A `tipo_recurso` outside the two-word vocabulary is skipped instead of guessed at.

**`ZONA_HORARIA` moved down one level.** Item #15 moved it from a screen into `lib/sugerencias/`
when a second screen needed it; item #18 is a second FEATURE needing the same fact, so it moved into
`lib/zona-horaria.ts` and the old module re-exports it. Same argument, one level further down, and no
call site had to change.

---

## Phase 3 — Verify

| Check | Result |
|---|---|
| `pnpm test` | 120 files, 1920 tests, all passing (1789 before this item; 131 added) |
| `pnpm typecheck` | clean |
| `pnpm lint` | clean |
| `pnpm build` | compiles; `/api/analitica` appears as a dynamic route |
| `pnpm db:migrate:status` | "Database schema is up to date!", the same three migrations — this item adds none |

The endpoint's own suite exercises the real schema, the real period arithmetic and the real metrics
against a Prisma double, so what it asserts is the contract rather than a description of it: which
`where` reaches the database, how many aggregations a comparison costs, and that a query the engine
cannot answer is refused before anything is read.

### The tests were checked against mutations, not just run

Two deliberate mutations were applied and reverted:

| Mutation | What failed |
|---|---|
| `inicioDeDia` shifted by five hours — the plausible "convert Lima to UTC" fix | 12 tests, across `periodos`, `servicio` and the route |
| Errors added into `usos` in `armarRecursos` | `los errores no cuentan como uso, aunque se informen` and `un procesador que solo falló aparece con cero usos` |

The first is the mutation that matters, and it is why that assertion exists at the boundary level and
again at the route level: a five-hour shift produces numbers that look entirely reasonable on screen.

### Acceptance criteria from `TECH-DESIGN.md`

- [x] For each period (hoy, 7 días, 30 días, custom range) the engine answers with the ranking of
      resources by use, activity per person and per area, adoption (active vs. assigned), suggestions
      by state and by area, and processing errors per procesador and kind.
- [x] With the comparison on, every metric comes back a second time for the equivalent previous
      period — same length, ending exactly where the current one starts.
- [x] Events count from the moment they are recorded: the "hoy" range covers the whole Lima calendar
      day up to its last millisecond, so an execution done this afternoon is inside it on reload.
- [ ] **The screen** that renders all of this is item #19. This item is the engine only.

---

## Open items

Deliberately out of scope, and none of them is a gap in the acceptance criteria:

- **No screen.** Item #19 owns it. `calcularAnalitica` takes injected reads precisely so that page can
  call it directly for its first paint instead of fetching its own endpoint.
- **No cap on the length of a custom range.** ADR 0010 accepts live aggregation at the expected
  volume; inventing a limit nobody asked for would be a rule to explain and later remove. The ADR
  already names the escape hatch if the volume ever changes: precomputed summaries.
- **No history of assignments.** Adoption crosses historical use with today's permissions, which
  ADR 0010 accepts formally. A grant handed out mid-period moves the denominator, and that is the
  intended behaviour.
- **The author's area is today's area.** A person who transferred has their old suggestions counted
  under their new area. The alternative is a copy of the area on every `sugerencia` row — a schema
  change and a second source of truth for an attribute Entra ID owns.
- **The database host's time zone is an assumption**, stated in `lib/analitica/periodos.ts`. It is
  the kind of thing worth confirming with TI before the analytics screen is shown to anybody.
