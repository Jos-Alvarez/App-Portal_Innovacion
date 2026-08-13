# Proposal: UI Foundation — Scaffold, Design Tokens, Typography, and Theme Toggle (Slice 1 of Backlog Item #1)

## Intent

Backlog Item #1 ("Fundación UI y sistema de diseño") is the critical-path root for the whole portal (`#0 → #1 → #2 → #3 → #4`). Nothing downstream can start until the repository has a real Next.js + TypeScript application, a working light/dark token system, and Archivo typography. This proposal covers **Slice 1 only**: the from-zero scaffold, CSS design tokens, typography, and the flash-free theme toggle. It exists because the full Item #1 was forecast at 1000–2700 lines against a 400-line review budget — too large to review as one change.

## Scope

### In Scope
- Next.js (App Router) + TypeScript project scaffold (ADR 0004), with lint/format tooling.
- Full light/dark CSS custom-property token set from DESIGN.md, keyed by `body[data-lx-dark="1"]`.
- Archivo typography via `next/font` (400–800), with the type-scale rules from DESIGN.md.
- Theme toggle (pill, ☾/☀), `localStorage`-persisted, with a flash-free first paint.
- First test runner setup for the project (component-behavior tests only, per the TDD carve-out below).

### Out of Scope (explicit non-goals of Slice 1 — planned successors, not dropped work)
- **Slice 2** (later, separate SDD change): the 4 mandatory UI states (Carga, Vacío, Error, Sin permiso/403) from DESIGN.md.
- **Slice 3** (later, separate SDD change): base components (Button, Input, Chip, Switch, Toast, Table) and the logo.
- The logo/theme-aware logo component — no image asset exists anywhere in the repo yet; the user must supply at least one source file (PNG or SVG) before Slice 3. DESIGN.md's blend-mode/filter technique derives the dark look from a single file.
- Any auth-aware chrome, real Topbar, or data-backed screens.
- No chained/stacked-PR machinery — each slice is independently sized to fit the 400-line budget.

## Capabilities

### New Capabilities
- `ui-design-tokens`: CSS custom-property token set (light/dark palettes) driven by `body[data-lx-dark="1"]`.
- `ui-theme-toggle`: persisted theme preference with flash-free first paint.
- `ui-typography`: Archivo font loading and type scale.

### Modified Capabilities
None — greenfield repository.

## Approach

Bootstrap Next.js App Router + TypeScript (ADR 0004). Author tokens as plain CSS custom properties matching DESIGN.md's exact palette and scale, toggled by the already-fixed `body[data-lx-dark="1"]` attribute. Load Archivo via `next/font/google` first; if the build machine lacks outbound access to Google's font CDN, fall back to `next/font/local` with committed `.woff2` files — both are self-hosted, zero-runtime-request outcomes. Persist theme preference in `localStorage` (fixed by DESIGN.md), guarded against flash-of-wrong-theme by a blocking mechanism evaluated before first paint (see open decisions).

## Decisions Confirmed by the User

All five are settled. Four were accepted as recommended; the package manager was changed by the user.

| Decision | Confirmed choice | Tradeoff |
|---|---|---|
| Package manager | **pnpm** (user override — the recommendation was npm) | Faster installs and a content-addressed store that avoids duplicating packages across projects. Costs a tool dependency beyond the one bundled with Node. pnpm 11.9.0 is already installed on this host, so the dependency is satisfied. |
| TypeScript strictness | `strict: true` | Matches "TypeScript everywhere" intent; extras like `noUncheckedIndexedAccess` add safety but more friction on array/object access. |
| Styling authoring layer (on top of the fixed CSS-variable token mechanism) | Plain CSS / CSS Modules, `var(--navy)` etc. | Zero dependency, matches DESIGN.md's own variable vocabulary directly. Tailwind gives utility-class ergonomics if `theme.extend` colors map to the same variables, but it must layer on `body[data-lx-dark="1"]`, not substitute Tailwind's own `dark:` class strategy — extra reconciliation work and a build dependency. |
| Anti-flash mechanism | Hand-written inline blocking `<script>` in `<head>` | Zero dependency, fully explicit; the theme lives in `localStorage`, unreadable by the server, so without a blocking script before paint the first render flips visibly. `next-themes` automates the same pattern but needs reconfiguring its default `class` attribute to emit `data-lx-dark="1"` instead — a dependency for a well-understood ~15-line script. |
| Test runner | Vitest + React Testing Library | Faster startup, native ESM, no `@next/jest` transform config; the 2026 default for new Next.js projects. Jest + `@next/jest` remains the framework vendor's own first-party recommendation, with more built-in App Router handling but slower startup and more config. Strict TDD applies fully to component *behavior* (toggle read/write, `data-lx-dark` flip); token/CSS *values* have no meaningful red/green and are explicitly carved out to manual/visual verification — record this exemption, don't assume it silently. |

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `package.json`, `tsconfig.json`, Next config, lint/format config | New | Project scaffold |
| `app/layout.tsx`, `app/globals.css` | New | Root layout, token CSS, font wiring, anti-flash script |
| `components/theme-toggle/` | New | Toggle component + hook |
| Test runner config + first tests | New | Establishes the project's only test runner |
| `.gitignore` | Modified (additive) | Must stay compatible with `local-dev-environment`'s existing entries, not competing |

## Size Forecast

Estimated **~350–450 lines** (scaffold ~100–150, tokens CSS ~150–250, layout/font/anti-flash ~80–120, toggle ~60–100, test setup ~40–80 — trimmed to Slice 1's narrower scope only). This sits at or slightly over the 400-line budget; if the toggle's tests push it over, defer non-essential token entries (e.g. states not yet consumed) to Slice 2 rather than trim test coverage.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Google Fonts build-time egress blocked on the build machine | Medium | Fallback to `next/font/local` with committed `.woff2`, functionally equivalent |
| Anti-flash script misconfigured, causing a visible theme flip on load | Low | Cover with a behavior test asserting `data-lx-dark` is set before first paint |
| Styling-layer choice (CSS vs Tailwind) picked without user confirmation, causing rework in Slice 3 | Medium | This proposal blocks on the open-decisions table above before design |
| `.gitignore`/env additions conflicting with `local-dev-environment` | Low | Treat that change's additions as pre-existing; only add Node/Next.js entries not already covered |

## Rollback Plan

Slice 1 introduces no database, no deployed environment, and no consumer code yet (Item #2 has not started). Rollback means deleting the scaffold directory contents and reverting the commit(s) — no data or schema migration is at stake.

## Dependencies

- None declared in BACKLOG.md; Item #1 can start independently. Runs in parallel with (not blocked by) `local-dev-environment`.

## Success Criteria

- [ ] `npm run dev` (or chosen package manager equivalent) serves a Next.js + TypeScript app with no build errors.
- [ ] Toggling theme flips `body[data-lx-dark="1"]`, persists to `localStorage`, and survives a full page reload with no visible flash.
- [ ] Archivo renders at the specified weights (400–800) and type scale from DESIGN.md.
- [ ] Test runner executes at least the toggle's behavior tests (TDD-first) with token-value tests explicitly exempted.
- [ ] Total changed lines stay at or near the 400-line budget; any overrun is disclosed at review time, not discovered.

## Proposal question round — closed

The five decisions above were presented with a recommendation each. The user confirmed four as recommended (TypeScript `strict: true`, plain CSS / CSS Modules, hand-written inline anti-flash script, Vitest + React Testing Library) and overrode one: the package manager is **pnpm**, not npm.

No open decisions remain for this slice.

## Environment facts verified on this host

Checked directly before implementation, not assumed:

| Fact | Value |
|---|---|
| Node.js | v22.17.0 |
| pnpm | 11.9.0 (already installed) |
| npm registry reachable | Yes — `pnpm view next version` resolved successfully |
| Latest Next.js | 16.3.0 |

Outbound internet egress from this host is therefore confirmed, which makes `next/font/google` the expected working path for Archivo. The `next/font/local` fallback documented above remains the contingency if Google's domains specifically turn out to be blocked, but it is no longer the likely outcome.

## Scaffolding method

`create-next-app` is **not** used. It would overwrite the `README.md` and `.gitignore` written by the `local-dev-environment` change, and it rejects directories containing files it does not recognise — which this repository has, in the form of the project documentation. The scaffold is written file by file instead.
