# Exploration: Backlog Item #1 — "Fundación UI y sistema de diseño"

**Repo**: `portal` (this repo, `L:\App_Portal`). Read-only investigation — no files created, nothing scaffolded, nothing installed.

**Scope note**: this exploration covers the WHOLE of Backlog Item #1, before the decision to split it into three sequential slices was made. It deliberately lives in its own `ui-foundation-design-system` folder shared by all three slices (`ui-foundation-scaffold-tokens-theme`, and the two later slices for the 4 mandatory states and base components), rather than being scoped to any single slice.

**Why this item matters**: Backlog text — "Scaffold Next.js + TS, tokens CSS claro/oscuro, tipografía Archivo, logo con variante dark, toggle con `localStorage`, componentes base y los 4 estados obligatorios de DESIGN.md". No declared dependencies; sequence notes say Item #1 can start independently.

---

## 1. Current repo reality (grounded — confirmed by directory listing)

`L:\App_Portal` today contains ONLY: `PRD.md`, `TECH-DESIGN.md`, `DESIGN.md`, `BACKLOG.md`, `REVISION-ADVERSARIAL.md`, `adrs/*.md`, `skills-lock.json`, `.claude/` and `.agents/` skill folders, `.atl/`, and `openspec/` (config.yaml, empty `specs/`, `changes/local-dev-environment/{exploration.md,proposal.md}`, empty `changes/archive/`). No `package.json`, no `node_modules`, no `src/`, no `app/`, no `.env*`, no `.gitignore`, no `README.md` (at exploration time — since created by the parallel `local-dev-environment` change), no image/logo assets of any kind (confirmed via glob for `*.png,*.svg,*.jpg,*.jpeg,*.webp,*.ico` — zero matches repo-wide). No `.codegraph/` index either (irrelevant — there is no application source yet to index).

This confirms "scaffold" here means a literal from-zero Next.js + TypeScript project bootstrap, not touching an existing app. Per the `local-dev-environment` change (Item #0, reduced scope), `.env.example`, `.gitignore`, and `README.md` are being created by that parallel change and must be treated as pre-existing (not re-created, not conflicted with) when this change lands — this change's own `.gitignore` additions (if any beyond Node/Next.js basics already covered) should be additive/compatible, not competing.

## 2. The 4 mandatory states — verbatim from DESIGN.md, "Estados obligatorios" section

DESIGN.md line 49: "Toda vista de datos define sus 4 estados:" followed by a bullet list. Verbatim (Spanish, as authored):

- **Carga:** skeleton shimmer (`lx-shimmer`) con la geometría del contenido real; nunca pantalla en blanco.
- **Vacío:** icono suave + título + explicación de quién asigna + salida útil (contactar Innovación). El buzón es solo para ideas nuevas.
- **Error:** círculo rojo "!", lenguaje claro sin códigos, botón Reintentar.
- **Sin permiso (403):** candado + explicación + "Volver al portal" / "Solicitar acceso". Aplica de inmediato al revocar.

**Discrepancy flagged and resolved during proposal review**: DESIGN.md's own list under "Estados obligatorios" actually contains a FIFTH bullet immediately after the four above: "Errores de procesador: banner rojo con título 700 + motivo específico (formato / tamaño / contenido) + Reintentar." — even though the section header text says "sus 4 estados". Reading (confirmed, not re-opened): the 5th bullet is a specialized elaboration of the generic "Error" state applied specifically to the processor-upload banner (per TECH-DESIGN.md's acceptance criteria for format/size/content errors, which describes inline banners, not full-view state swaps), not a genuinely distinct 5th mandatory state. This matters for Slice 2, not Slice 1.

**Completeness assessment per state** (relevant to Slice 2, carried forward for continuity):
- **Carga**: Implementable as a generic primitive (shimmer animation `lx-shimmer` + a `Skeleton` box primitive). Per-screen skeleton geometry is deferred to each consuming feature item (#5 onward).
- **Vacío**: Implementable as a generic `EmptyState` component (icon slot + title + description + action slot). Per-screen copy is owned by consuming items (#8 dashboard, #13 buzón). Gap: DESIGN.md does not specify what icon set/asset to use — see "Icons" note below.
- **Error**: Fully specified (red circle "!" icon, plain-language copy rule, Retry button). Implementable generically as an `ErrorState` component.
- **Sin permiso (403)**: Structure specified (lock icon + explanation + two actions). Gap: DESIGN.md does not define what "Solicitar acceso" actually does (mailto link? contact form? navigates to buzón?) — a legitimate open question for Slice 2's proposal, not inferable from DESIGN.md/PRD/TECH-DESIGN. The "aplica de inmediato al revocar" requirement is a functional requirement belonging to Item #4, not this UI-foundation item.

**Icons note (cross-cutting, affects all 4 states)**: DESIGN.md's global "Reglas" section states: "Emojis/iconos unicode solo como iconografía funcional discreta (⇄, 🔒, ⚠); no decorativos." Suggests literal Unicode glyphs (styled via CSS) as functional icons rather than an SVG icon library. Option (a) Unicode-glyph icons only, zero new dependency, matches the literal rule; or (b) a minimal SVG icon set for higher visual quality, contradicting the literal rule unless reinterpreted. Recommend option (a) as the literal-compliant default — decision for Slice 2.

## 3. Scaffolding decisions — what's already fixed vs. genuinely open

**Already fixed — do NOT re-open as a decision:**
- **Next.js App Router + TypeScript**: fixed by ADR 0004. Not a choice for this change.
- **Token/theme mechanism**: fixed by DESIGN.md — "Definidos como variables CSS con par claro/oscuro (`body[data-lx-dark="1"]`)". Any styling-approach choice must implement tokens as CSS variables keyed off that exact attribute/selector, not e.g. a CSS-in-JS theme object or Tailwind's built-in `dark:` class strategy replacing it (Tailwind could still be layered on top, reading the same CSS variables, but must not replace the `body[data-lx-dark="1"]` mechanism).
- **Theme preference persistence**: fixed — `localStorage`, stated in DESIGN.md, TECH-DESIGN.md, and the backlog item text itself. Cookies-based theme is explicitly NOT what this project wants.

**Genuinely open — present as options with tradeoffs in propose phase:**
1. **Package manager** (npm / pnpm / yarn) — no document states a preference. npm is the zero-friction default; pnpm is faster/more disk-efficient but adds a tool dependency for a one-person team; yarn has no clear advantage. Low-stakes decision.
2. **TypeScript strictness** (`strict: true` plus optional extras like `noUncheckedIndexedAccess`) — not specified anywhere. `strict: true` is the sane default but still an explicit decision.
3. **Component-styling authoring approach** (given the token mechanism is fixed as CSS variables + `body[data-lx-dark="1"]`): (a) plain global CSS / CSS Modules, directly `var(--navy)` etc. — simplest, zero dependency, matches DESIGN.md's own vocabulary; (b) Tailwind CSS with `theme.extend` colors mapped to the same CSS variables — utility-class ergonomics while still driving off the DESIGN.md-mandated variables, adds a build dependency; (c) CSS-in-JS — generally discouraged for Next.js App Router Server Components, weakest fit. Recommend narrowing to (a) vs (b), with (a) as the lower-risk default.
4. **Flash-of-wrong-theme avoidance mechanism**: (a) hand-rolled inline blocking `<script>` in the root layout `<head>`, synchronously reading `localStorage` and setting `data-lx-dark` before first paint — zero new dependency; (b) the `next-themes` package, which automates the same inline-script injection, needs reconfiguring its default `class` attribute to match `data-lx-dark="1"`. Grounded via WebSearch: the standard credible technique for avoiding flash-of-wrong-theme is exactly this blocking-inline-script-before-paint pattern; there is no way to solve it purely server-side because `localStorage` is client-only.

## 4. Typography — Archivo

DESIGN.md: "Única familia: Archivo (Google Fonts), 400–800." States Google Fonts as the nominal source but does not address corporate-network build-time reachability.

Grounded via WebSearch (Next.js official docs + multiple 2026 sources): `next/font/google` downloads and self-hosts font files **at build time** — the browser never makes a request to Google's servers at runtime. This build-time download requires the **build machine** to have outbound network access to Google's font CDN; if blocked, the font silently falls back to system fonts with no build error.

**Question not resolved by any document read**: whether the build/dev machine has outbound internet access to Google Fonts' servers. Resolved during proposal review: attempt `next/font/google` first; if the build fails for lack of egress, fall back to `next/font/local` with the Archivo `.woff2` files committed to the repository — functionally equivalent either way.

## 5. Logo assets — CONFIRMED MISSING, blocking for Slice 3 only

Repo-wide glob for `*.png,*.svg,*.jpg,*.jpeg,*.webp,*.ico` returned zero files anywhere in `L:\App_Portal`. PRD.md states the logo is meant to be "incluido como archivo dentro del propio proyecto" but no such file exists yet.

DESIGN.md prescribes a technique for deriving light/dark presentation from a single source image: "Imagen del logo con `mix-blend-mode: multiply` en claro... En oscuro: `mix-blend-mode: screen` + `filter: invert(1) hue-rotate(185deg) saturate(1.15) brightness(1.1)` como variante adaptada. **En producción reemplazar por SVG transparente + variante oficial dark.**" This means "logo con variante dark" does NOT require two separate logo files right now — one PNG suffices via CSS blend-mode + filter, with production later getting a proper transparent SVG plus an official dark variant.

**Resolved during proposal review**: the logo is deliberately NOT in Slice 1. It lands in Slice 3, and the user must supply at least one source file (PNG or SVG) before that slice starts.

## 6. Base components — derived minimum set (avoid gold-plating)

**Definitely foundational, split across slices:**
- Slice 1: design tokens (full CSS custom-property set, light/dark), typography setup (Archivo via `next/font`, weight range 400-800, type scale), theme toggle (pill with ☾/☀, `localStorage`-backed, no-flash inline script).
- Slice 3: Logo component (theme-aware), Button (primary + secondary), Input (with error variant), Chip (filter-pill and type/status-pill variants), Switch, Toast, Table.
- Slice 2: the 4 state primitives (`Skeleton`/shimmer, `EmptyState`, `ErrorState`, `Forbidden403`).

**Borderline — recommend deferring to the item that first actually needs it:**
- Modal: no item in the #1→#4 critical path needs a modal. Defer to whichever item first needs it (likely #5/#6 or #16).
- Topbar shell: a *static, auth-unaware* topbar shell (logo + separator + title text) is arguably foundational, but real navigation/session content requires Item #3 at minimum. Recommend shipping only the static/presentational shell when the logo lands (Slice 3), not wired into a real authenticated layout (that belongs to #3).

**Explicitly NOT this item's job**: per-screen skeleton geometry, empty-state copy, table columns/data, any actual API-backed data fetching, any auth-aware chrome, processor-error banner copy variants (belongs to #10's error-vocabulary work).

## 7. Testing — no test runner exists yet; this change establishes it

`test_command: none-yet` per session preflight — this is the first change in the project to pick a test runner. Strict TDD is globally enabled.

**Options for the runner**, grounded via WebSearch:
- **Vitest + React Testing Library**: the 2026 default recommendation for new Next.js projects generally (native ESM support, no `@next/jest`-style transform config, faster startup, Jest-compatible API). Good fit for a from-zero greenfield project.
- **Jest + `@next/jest`**: still Next.js's own official first-party recommendation, with built-in handling for server-only imports and App Router conventions. Slower startup, more config surface.
- **Playwright** (an addition, not a replacement): Next.js's own docs steer *unit* testing of async Server Components away from jsdom-based runners toward E2E tools like Playwright/Cypress. Worth flagging as a probable second tool needed later, even if this item only sets up the unit-test runner.

**What "strict TDD" realistically means for this content**: design tokens (raw CSS custom-property values, hex codes) are not meaningfully TDD-able — there is no red/green failing-test state for "is `--navy` the string `#1A4293`" that adds real confidence beyond a visual/manual check. Recommend: strict TDD applies fully to *component behavior* (Button disabled state, theme toggle read/write of `localStorage` and `data-lx-dark` flip, ErrorState's Retry callback, EmptyState's action slot) via Vitest + RTL, written before the component; token *values* and pure visual/CSS-variable correctness are explicitly carved out of the strict-TDD requirement and left to manual/visual verification. This carve-out should be an explicit decision, not a silent assumption.

## 8. Size forecast — likely exceeds the 400-line review budget for the WHOLE item

Rough estimate for the full, unsliced Item #1 (inference, not measured — no code exists yet to measure):
- Scaffold boilerplate: ~100-150 lines.
- Global tokens CSS: ~150-250 lines.
- Root layout + font wiring + no-flash inline script: ~80-120 lines.
- Theme toggle component + hook: ~60-100 lines.
- Logo component: ~40-60 lines.
- ~6-7 base components at roughly 60-120 lines each: ~400-700 lines.
- 4 state primitives at roughly 50-100 lines each: ~200-400 lines.
- Vitest/RTL setup + config: ~40-80 lines.
- Component tests, if strict TDD is applied roughly 1:1 or higher: another ~600-1200+ lines.

**Total honest estimate for the whole item: roughly 1000-1500 lines of implementation, and 1500-2700+ lines including tests.** Well over the stated `review_budget_lines: 400`, almost certainly by 3-6x even before counting tests.

**Resolution (decided during proposal review, not re-opened here)**: Item #1 is split into three sequential slices, each its own independent SDD change, each fitting the 400-line budget on its own — no chained/stacked PR machinery needed because each slice is independently sized and reviewed:
- **Slice 1** (`ui-foundation-scaffold-tokens-theme`): Next.js + TS scaffold, CSS tokens, Archivo typography, theme toggle with `localStorage` and flash-free first paint. ~350-450 lines.
- **Slice 2**: the 4 mandatory UI states.
- **Slice 3**: base components (Button, Input, Chip, Switch, Toast, Table) and the logo.

## 9. Sources consulted (WebSearch, for currency on fast-moving Next.js/testing guidance)

- Next.js official docs — Font Optimization / `next/font` (self-hosting, build-time download behavior).
- Multiple 2026 sources on `next/font/google` build-time-fetch failure mode with no outbound internet (silent fallback to system fonts, no build error).
- Multiple sources on Next.js App Router flash-of-wrong-theme avoidance (blocking inline script before paint; `next-themes` package behavior; why cookies are the alternative but this project has already fixed `localStorage`).
- Multiple 2026 sources comparing Vitest vs Jest for Next.js (Vitest as the increasingly common default for new projects; Jest still the framework-vendor's own official recommendation; Next.js docs steering async Server Component testing toward Playwright/Cypress E2E instead of jsdom unit tests).

## 10. Risks / open questions carried into propose (Item #1, all slices)

1. DESIGN.md's "4 estados obligatorios" section text vs. its own 5-bullet list — resolved (see §2), relevant to Slice 2.
2. "Solicitar acceso" action on the 403 screen has no defined target/behavior anywhere — relevant to Slice 2.
3. Whether the build/dev machine has outbound internet access to Google Fonts' CDN — resolved with a decided fallback approach (see §4), relevant to Slice 1.
4. Logo asset(s) are completely absent from the repo — hard blocking input from the user before Slice 3 implementation, not Slice 1.
5. Size forecast exceeded the 400-line review budget by a wide margin for the whole item — resolved by the three-slice split (see §8).
6. Strict-TDD scope carve-out for non-testable token/CSS-value content needs an explicit decision — relevant across all slices, especially Slice 1's tokens.
7. Package manager, TypeScript strictness config, component-styling authoring approach, flash-avoidance mechanism, and test runner remain open choices for Slice 1's proposal to present with tradeoffs.

**Learned**: This repo (`L:\App_Portal`) was purely documentation + `openspec/` scaffolding at exploration time — zero application code, zero assets, zero `.codegraph/` index. ADR 0004 already fixes Next.js App Router + TS; DESIGN.md already fixes the token mechanism as CSS variables keyed by `body[data-lx-dark="1"]` and persistence as `localStorage` — these are not open decisions to re-litigate. The real open decisions are narrower than the backlog text implies: package manager, TS strictness, component-styling authoring layer on top of the fixed token mechanism, the flash-avoidance script's implementation detail, and the test runner.
