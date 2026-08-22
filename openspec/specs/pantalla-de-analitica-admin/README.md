# Item #19 — The analytics screen (admin)

**Backlog reference:** Item #19 ("Pantalla de analítica (admin)"), repository `portal`.
**Depends on:** #18, the query engine — satisfied. Through it, #8, #10 and #15, and through those, #4.
**Unblocks:** nothing. It is a leaf, and the last screen of the portal.

Delivered through the same three-phase cycle items #15 through #18 used — Explore, Implement,
Verify — rather than the full SDD artefact chain. This file is the record of those three phases.

---

## Phase 1 — Explore

### What was read

| Source | What it settled |
|---|---|
| `BACKLOG.md` #19 | The scope in one line: the five cuts, on screen, for a period |
| `PRD.md` §"Pantalla de analítica" | The six metrics verbatim — and that the four periods and the comparison are part of the screen's contract, not a nicety |
| `TECH-DESIGN.md` §"Analítica (admin)" | The three acceptance criteria, including that a comparison must show *every* metric's previous value |
| `lib/analitica/servicio.ts` + `metricas.ts` | The exact shape of an answer, and the four places item #18 says in writing that **item #19 decides how to draw it**: `""` for an unreported area, `null` for a resource whose row is gone, the five error types, and "zero is a result, absence is not" |
| `lib/analitica/periodos.ts` | That the wire carries `YYYY-MM-DD` calendar days *specifically so this screen would not convert them*, and that the presets always end today |
| `lib/analitica/schema.ts` | That a preset carrying dates is **refused**, not ignored — which decided how the query string is built |
| `app/api/analitica/route.ts` | Its own note: the endpoint exists because the period is a question the reader changes several times a minute, and "item #19 is still free to read the default period on the server for its first paint" |
| `app/admin/administradores/*` (item #17) | The current shape of an admin screen: self-guarding `page.tsx`, `Topbar`, own `loading.tsx` and `error.tsx`, screen-local client module |
| `app/admin/sugerencias/*` (items #15/#16) | The SWR precedent: server read for the first paint, revalidation policy at the call site, and a *notice* rather than an error state when a background read fails |
| `DESIGN.md` | The four obligatory states, the table anatomy, and the rule that decided the deltas: "el rojo jamás se usa fuera de error/destrucción" |

### What the exploration settled before any code was written

**There is nothing to compute here.** Item #18 answers all six metrics for both periods. This item's
entire job is the presentation and the question — which is why the interesting decisions below are
about vocabulary, caching and honesty rather than about arithmetic.

**Four storage tokens needed a word, and item #18 named this item as their owner.** `""`, `null`,
`error_tamano` and a raw integer are not things to put on an administrator's screen.

**No migration, no endpoint, no schema change.** The screen reads what already exists.

**One gap was found in item #18 and fixed here.** `TIPOS_ERROR` derived its type from a plain
`.filter()`, which narrows nothing: `TipoError` was the *whole* seven-member event vocabulary, so
`Record<TipoError, …>` demanded keys for `apertura` and `ejecucion`. This item is the first consumer
to feel it — it would have had to invent a label for "apertura" in a table of failures — so the
filter gained a type predicate. Runtime behaviour is unchanged and item #18's suite still passes
untouched.

---

## Phase 2 — Implement

### New modules

| File | Responsibility |
|---|---|
| `lib/analitica/dependencias.ts` | The engine's reads bound to a client — the binding both callers of `calcularAnalitica` now share |
| `app/admin/analitica/page.tsx` | The Server Component: guards itself, reads the first period, hands down today's date |
| `app/admin/analitica/analitica-admin.tsx` | The screen: the period controls and the six panels |
| `app/admin/analitica/analitica-client.ts` | How a question becomes a URL, how an answer is read, how often it is re-asked |
| `app/admin/analitica/comparacion.ts` | The arithmetic of "vs. el periodo anterior" — pure |
| `app/admin/analitica/etiquetas.ts` | The screen's vocabulary and its number formats |
| `app/admin/analitica/analitica.module.css` | Layout; no new components |
| `app/admin/analitica/loading.tsx` / `error.tsx` | DESIGN.md's Carga and Error states, with this screen's geometry |

**Changed:** `app/api/analitica/route.ts` now binds its reads through `dependenciasDe` instead of
inline. `lib/analitica/metricas.ts` gained the type predicate on `TIPOS_ERROR`.

### Decisions taken during implementation

**The first period is read on the server; every period after it is fetched.** A Server Component
already holds the database and the request's identity, so asking the portal's own endpoint for the
default view would mean building an absolute URL and forwarding the session cookie by hand to reach
the same three `GROUP BY`s through an extra round trip — and it would show a skeleton for one round
trip before a screen the server could have shipped complete. The endpoint keeps its reason for
existing, which is every period *after* the first one.

**Both callers bind their reads in one place.** Item #18 wrote the binding inline because there was
one caller. Copying six lines would have been cheaper and would have put "how many round trips does
one period cost" in two files — where the `Promise.all` in one of them could quietly become a
sequence. `dependenciasDe` is that decision, written once, and the page's test asserts the page uses
it.

**SWR is told not to revalidate on mount, and that was found by a failing test rather than by
reading.** SWR revalidates on mount *by default, `fallbackData` included*: without
`revalidateOnMount: false`, every load of the screen fired `GET /api/analitica?rango=hoy`
immediately — three aggregations over `evento_uso` to redraw numbers already present in the HTML and
at most one request old. The first version of the assertion passed only because it ran
synchronously; the full-suite run surfaced it as an intermittent failure, which is what led to the
fix. Later key changes still fetch, and returning to a cached period still revalidates it.

**The built URL is the cache key.** Every other admin screen holds a list; this one holds a
*question* — four periods times a comparison toggle — that an administrator moves through several
times a minute while reading. Keyed on the URL, going back to "Hoy" after reading the last 30 days is
instant and costs no request. A single `useState` holding "the metrics" would throw the previous
answer away on every chip.

**The poll follows the question, not the screen.** ADR 0007 asks for revalidation "al recuperar el
foco y en intervalos", and the two halves are not equally true of every period here. A closed range
in July cannot change: polling it would spend three `GROUP BY`s a minute to redraw identical
numbers. The three presets end today by construction, so they are polled. Focus revalidation stays
unconditional — coming back to the tab is the reader *asking*, and that costs one request they caused
themselves.

**A preset never carries dates.** `lib/analitica/schema.ts` refuses a preset that arrives with
`desde`, deliberately, so a caller whose dates were dropped hears about it. Leaving the fields' last
values in the query string would turn every switch back to "Hoy" into a 400. The two rules of a
custom range are also checked in the browser — not to replace the server's refusal, but because the
reader is looking at two date fields and deserves to be told *which end* is wrong while they are
still looking at them. An incomplete range asks nothing at all: SWR reads the `null` key as "do not
fetch", so half-written questions never reach the server.

**A comparison adds a column, never a row.** The ranking answers "what is being used", so a resource
used last week and not this one drops off rather than sitting at zero with a negative delta — a list
ordered by use with unused things in it is no longer that list. The summary still carries the fall,
which is what the summary is for.

**A row missing from the previous period is a zero, not an unknown.** That is `metricas.ts`'s own
rule read backwards: absence there means it happened zero times. So a procesador that appears this
week and did not exist last week rises from zero, and `+14` is true — it was used fourteen more times
than before.

**No colour on any delta.** Green-up/red-down is the obvious move and is wrong twice: DESIGN.md
reserves red for error and destruction, and — the half that survives the design system — up is not
good on every panel. More errors is worse; fewer suggestions may be worse or may be nothing.
Colouring the sign would have the screen make a judgment the portal has no way to make, so the sign
is written, left uncoloured, and the reader supplies the meaning. Both numbers always travel: "+3"
alone cannot be read without knowing whether it moved from 1 to 4 or from 300 to 303.

**One failure message, because the screen can never be left with nothing.** The server ships the
first report and `keepPreviousData` holds the last good one, so "the request failed" and "the request
failed and the screen is empty" are not two cases inside this component — the second belongs to
`error.tsx`. The first draft had both; the second was deleted when its test proved unreachable rather
than kept as a sentence nobody could be shown. The copy that remains says both true things at once:
the newest numbers did not arrive, and what is on screen is a real reading, labelled with its own
period directly above it.

**Every empty panel explains itself.** Five questions fail independently: a week with plenty of use
and no suggestions is not an empty report, and one "no hay datos" over the lot would hide the four
panels that do have an answer.

**Adoption with no denominator is a dash, not 0 %.** A portal where nobody holds access yet is not a
portal people refuse to use; it is a portal with nothing assigned, which is a different finding and
the one an administrator can act on.

**Days are formatted from their three numbers, never through `new Date`.** Item #18 put
`YYYY-MM-DD` on the wire precisely so this screen would not have to undo a time zone it never
applied: parsing one as an instant makes it midnight UTC, and the Lima formatter would draw a period
starting on the 21st as "20/08, 19:00". Today's date — the ceiling of both date fields and the input
to the polling decision — comes from the server as a string, resolved in the portal's zone, so an
administrator with a laptop in Madrid is not offered a "tomorrow" the server answers as empty, and
nothing read from the browser's clock can disagree with the HTML during hydration.

**No charts.** ADR 0010 serves live aggregations and the PRD asks for a *ranking*, a *distribution*
and a *ratio*: ordered lists and proportions, which a table states without asking the reader to
estimate a height. A chart earns its place when the shape of a series is the finding; here the
finding is which resource heads the list and by how much.

**The vocabulary stays screen-local.** Every other vocabulary in this portal moved down to `lib/` the
moment a *second* screen showed the same rows. Nothing here has a second reader: no other screen
names an error type, a report period or an empty area. The day one does, this file moves — exactly as
`lib/sugerencias/etiquetas.ts` did.

---

## Phase 3 — Verify

| Check | Result |
|---|---|
| `pnpm test` | 126 files, 2009 tests, all passing (1920 before this item; 89 added across 6 new files) |
| `pnpm typecheck` | clean |
| `pnpm lint` | clean |
| `pnpm build` | compiles; `/admin/analitica` appears as a dynamic route |
| `pnpm db:migrate:status` | "Database schema is up to date!", the same three migrations — this item adds none |

The full suite was run three consecutive times after the `revalidateOnMount` fix, because the defect
it corrected first appeared as an intermittent failure and a single green run would not have been
evidence.

### The tests were checked against mutations, not just run

Two deliberate mutations were applied and reverted:

| Mutation | What failed |
|---|---|
| `rutaDe` sends `desde`/`hasta` whenever the fields hold a value, instead of only for `personalizado` | `no arrastra las fechas del rango personalizado al volver a un preset`, plus the screen's `pide al servidor el preset elegido` |
| `claveDeRecurso` keys on the id alone, dropping `tipo` | `distingue el enlace 1 del procesador 1`, plus `trata como cero la fila que no existía en el periodo anterior` — the enlace's comparison silently picked up the procesador's figures |

The second is the one that matters: ADR 0002 splits resources into two tables, so id `1` exists twice
and means different things. Keyed on the id alone, the comparison column shows *plausible* numbers
belonging to the wrong resource — the failure mode nothing on screen would reveal.

### Acceptance criteria from `TECH-DESIGN.md`

- [x] For each period (hoy, 7 días, 30 días, custom range) the screen shows the ranking of resources
      by use, use per person and per area, adoption (active vs. assigned), suggestions by state and
      by area, and processing errors per procesador and kind.
- [x] With the comparison on, every metric shows its value for the equivalent previous period.
- [x] Events count from the moment they are recorded: the screen re-asks the server for "hoy" on
      focus and every minute, so an execution done this afternoon is on screen without a reload.

---

## Open items

Deliberately out of scope, and none of them is a gap in the acceptance criteria:

- ~~**No link to this screen from the topbar.**~~ **Done — see Follow-up below.** It was left out of
  this item because adding an entry for *this* screen alone would have made the panel's navigation
  more arbitrary, not less; it was worth one small change covering all six at once, and that change
  has since been made.
- **No export.** Nobody asked for CSV or PDF, and the numbers on screen are the report.
- **No cap on the length of a custom range**, matching item #18's decision and ADR 0010's acceptance
  of live aggregation. The date fields refuse a future day and an inverted range; nothing else.
- **No drill-down.** Clicking a resource does not open the events behind it. `evento_uso` has the
  rows for it, but "who opened what and when" is a different screen with its own privacy
  conversation, and the PRD asks for aggregates.
- **The database host's time zone is still the assumption** stated in `lib/analitica/periodos.ts`.
  Item #18 flagged it as worth confirming with TI *before the analytics screen is shown to anybody* —
  that screen now exists, so the confirmation is due.

---

## Follow-up (same day)

Two adjustments were made immediately after this item closed. They are recorded here rather than in
a spec of their own because both are consequences of item #19 rather than new scope.

### 1. The `revalidateOnMount` fix reached the other three screens

The defect this item found is not specific to analytics: **four** screens share the "Server Component
pre-reads, client component takes it as `fallbackData`" shape, and all four were re-fetching on
mount. The setting and the whole argument now live in `lib/swr-pre-lectura.ts`, and the dashboard,
the collaborator's inbox and the administrator's inbox import it by name at their own call sites —
not through an `<SWRConfig>` provider, which `app/(portal)/sugerencias/sugerencias-client.ts` refuses
for reasons that still hold.

`app/(portal)/mis-recursos-client.ts` had documented the opposite as deliberate: `revalidateIfStale`
was listed as a default kept on purpose, "what makes the mount after hydration re-ask". That
paragraph was rewritten rather than deleted — the mechanism it described was right, the trade was
not: it bought a correction the interval and the focus revalidation already provide, at the price of
a redundant read on every page load.

What is given up is stated in the module: SWR's cache outlives a screen and wins over `fallbackData`,
so a reader returning to the dashboard after ten minutes sees the cached list until the interval
fires. That is a change in LATENCY and not in what is shown — the same stale cached list rendered
first before the change too — and the interval is the freshness these screens already promise.

Thirteen existing tests asserted the old behaviour, directly or by relying on the mount fetch to
trigger their scenario. They now trigger the revalidation through the focus event, which is the half
of ADR 0007's policy that actually models a reader coming back, and the test wrappers set
`focusThrottleInterval: 0` so a test does not have to wait SWR's five real seconds.

### 2. The topbar now holds all six admin screens

`components/topbar/admin-nav.tsx` renders the six entries with `aria-current="page"` on the one being
read — exactly the trigger item #17 wrote down: "if the bar ever grows a set of entries rather than
one, that is the moment to add `aria-current`."

It is a client component so it can read `usePathname` itself. `topbar.tsx` had weighed a prop when
there was one entry and rejected it; with six entries and nine call sites the objection is stronger,
since a page naming the wrong route would highlight a screen the reader is not on. Matching is by
prefix so `/admin/asignaciones/7` still marks Asignaciones, and the prefixes are disjoint — a test
asserts no path can match two entries.

**The PRD's placement survives.** It asks for the Administradores entry "junto al de cerrar
sesión"; the nav sits immediately before the sign-out button and Administradores is its last entry,
so that line still holds. The order of `ENLACES_ADMIN` is therefore load-bearing, and a test asserts
it — an alphabetical sort would break a PRD requirement in silence.

### Verification of the follow-up

| Check | Result |
|---|---|
| `pnpm test` | 128 files, 2033 tests, all passing (2009 before; 24 added), run three consecutive times |
| `pnpm typecheck` / `pnpm lint` / `pnpm build` | clean |

Mutations, applied and reverted: flipping `SIN_REVALIDACION_AL_MONTAR` back to `true` failed 10 tests
across five files, and loosening the nav's prefix match to a bare `startsWith` failed the test that
proves `/admin/enlaces-viejos` must not light up Enlaces.
