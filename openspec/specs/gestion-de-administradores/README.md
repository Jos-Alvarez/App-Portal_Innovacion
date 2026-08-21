# Item #17 — Managing administrators

**Backlog reference:** Item #17 ("Gestión de administradores"), repository `portal`.
**Depends on:** #4 (authentication and the authorization guard) — satisfied.
**Unblocks:** nothing directly. #18/#19 read `evento_uso` and `sugerencia`, neither of which this
item changes.

Delivered through the same three-phase cycle items #15 and #16 used — Explore, Implement, Verify —
rather than the full SDD artefact chain. This file is the record of those three phases.

---

## Phase 1 — Explore

### What was read

| Source | What it settled |
|---|---|
| `BACKLOG.md` #17 | The scope in one line: a button beside sign-out visible only to admins, a directory search with degradation, promotion and revocation, and the transactional minimum-one rule |
| `PRD.md` §"Alcance" and §"Criterios de éxito" | That the button is placed **junto al de cerrar sesión**, that people are found in the **company directory** and not in the portal, and that a collaborator neither sees the button nor can reach the screen |
| `TECH-DESIGN.md` §"Gestión de administradores" | The four acceptance criteria verbatim, including "nunca 0 admins, ni con dos revocaciones simultáneas" |
| `adrs/0009` | That Entra ID only authenticates and `usuario.es_admin` is the sole truth; that promotion is an **upsert**; and the agreed mitigation if TI never consents to `User.Read.All` |
| `adrs/0007` | That the role is re-read on every request, which is what makes a promotion apply "a más tardar en su siguiente ingreso" without touching any session |
| `adrs/0003` | `/api/admins` by name, "alta/revocación de rol, con regla de mínimo 1 administrador" |
| `lib/auth/usuario-repository.ts` | **An obligation addressed to this item**: the login re-promotes `ADMIN_EMAIL` on every sign-in, so item #17 "MUST refuse the revocation outright and explain that this account is pinned" |
| `lib/auth/graph.ts` | The precedent for talking to Graph — and the explicit note that its `User.Read` is *not* the `User.Read.All` this item needs |
| `lib/authz/index.ts` | That a component may hide an admin link but may never be the only thing deciding access; and that no layout does the guarding |
| `app/(portal)/page.tsx` | The comment from item #8 predicting this item: "extracting a shared topbar is worth doing — item #17 adds a second button beside the theme toggle and will need it" |
| `lib/sugerencias/repository.ts` | The house pattern for a rule enforced inside `$transaction`, and for throwing to roll one back |
| `lib/asignaciones/handlers.ts` | The baja asymmetry: granting requires an active account, removing does not |
| `DESIGN.md` | The toast on every action, the inline confirmation instead of a modal, and the red reserved for destruction |

### What the exploration settled before any code was written

**No migration is needed, and this was verified rather than assumed.** `usuario.es_admin` shipped in
the initial migration with item #2. `prisma migrate status` was run at the end and reports the schema
up to date with the same three migrations the repository already had.

**The portal had no sign-out button at all.** The PRD anchors this item's button to one — "junto al
de cerrar sesión" — so the anchor had to be built before the thing it anchors. This is why the item
ships `components/topbar`, and why the topbar extraction item #8 deferred happens here: three screens
carried a byte-identical copy of the lockup, and adding two buttons to a copied bar means forgetting
one of them.

**The search cannot be delegated, and that was decided from `auth.ts` rather than from Graph's
docs.** The session carries identity and nothing else (ADR 0007), so there is no stored access token
to search with, and adding one would put a bearer token for the corporate directory in every
administrator's cookie. The application flow was the only option left that ADR 0009 already
authorised.

**The minimum-one rule is a concurrency problem, not a validation.** TECH-DESIGN says so out loud —
"ni con dos revocaciones simultáneas" — and reading it before writing anything is what produced the
statement order in Phase 2 rather than the intuitive one.

**The degradation has two faces, and the write side is the one that is easy to miss.** ADR 0009's
mitigation is usually read as "the search falls back". It also constrains the PROMOTION: without
Graph, a person with no `usuario` row has no name and no area to write, so that promotion has to be
refused — with a sentence that names a fix.

---

## Phase 2 — Implement

### New modules

| File | Responsibility |
|---|---|
| `lib/admins/schema.ts` | `terminoBusquedaSchema`, `idUsuarioSchema`, `promoverSchema`, and the shared caps |
| `lib/admins/errors.ts` | The twelve refusals, `RolRechazado` and `errorDeRol` |
| `lib/admins/repository.ts` | The reads, the promotion upsert and the transactional revocation |
| `lib/admins/directorio-env.ts` | The Entra ID credentials for the application flow, and `tenantFromIssuer` |
| `lib/admins/directorio.ts` | The Graph token request and the `users` search — throws for every failure |
| `lib/admins/busqueda.ts` | The one place the degradation is decided, and where the two lists are merged |
| `app/api/admins/route.ts` | `POST` — the promotion, behind `guardRouteAdmin` |
| `app/api/admins/[usuarioId]/route.ts` | `DELETE` — the revocation, behind `guardRouteAdmin` |
| `app/api/admins/directorio/route.ts` | `GET` — the search, and the only wiring that knows both sources exist |
| `app/admin/administradores/*` | The screen: page, interactive half, fetch wrappers, stylesheet, loading and error boundaries |
| `components/topbar/topbar.tsx` | The shared bar: identity, theme, the administrator door, the way out |
| `components/topbar/sign-out-button.tsx` | The portal's first sign-out action |

**Changed:** `app/(portal)/page.tsx`, `app/(portal)/sugerencias/page.tsx` and
`app/(portal)/procesadores/[id]/page.tsx` now render `<Topbar />`; their stylesheets lost the four
duplicated rules; the dashboard's comment about why the buzón link is not in the topbar was rewritten,
because its original reason had just stopped being true.

### Decisions taken during implementation

**The count happens after the update, inside a Serializable transaction.** The intuitive shape —
count, refuse if it is 1, then update — is wrong and not subtly: with two administrators left, one
transaction revoking A and another revoking B both count 2, both accept, and the portal ends with
zero. Counting after the update makes the number mean "how many are left if this commits". That still
needs `Serializable`: under SQL Server's default READ COMMITTED neither transaction sees the other's
uncommitted write, so both would count 1 remaining and both would commit. The invariant spans rows
the transaction never wrote, which is exactly what range locks are for. Prisma reports the loser as
P2034, and `errorDeRol` turns it into a retry the reader can act on.

**Self-revocation has no special case.** Nothing in the handler or the transaction asks who is
calling. An administrator alone in the list is refused whether they are revoking themselves or
somebody else; one with a colleague left may step down. The screen does change its QUESTION —
"¿Quitarte a ti el rol?" — because that is the one revocation that changes what the reader can do
next, but the rule behind it is the same rule.

**The `ADMIN_EMAIL` account is refused, not accepted-and-undone.** `lib/auth/usuario-repository.ts`
addressed this obligation to this item, and it is discharged in two places: the transaction refuses
it where the row's address is known, and the screen does not draw the button at all — a click whose
only possible outcome is a refusal about something the reader cannot change from here is not a
button, it is a trap.

**`POST /api/admins` carries an address and nothing else.** The obvious design POSTs the whole person
the screen found. It was rejected: the client would then be the source of an identity the portal
stores, and a hand-made request could create a `usuario` row with any name and area it liked. The
server resolves the rest — from the row when the person has signed in, from Graph when they have not.

**The domain check fails closed.** `isEmailFromAllowedDomain` is the same function the sign-in uses,
and an unset `ALLOWED_EMAIL_DOMAIN` promotes nobody. Without it, a promotion could write a row holding
the administrator role under an address the login itself would reject — a role granted to nobody,
sitting in the list forever. The SEARCH filters by the same domain as a courtesy only, and an unset
domain widens that list rather than narrowing it; the write path is where the rule is enforced.

**A directory hit must match the address exactly.** The filter is a `startswith`, so searching for
`ana@corp.com` can legitimately return `ana@corp.com.pe`. Promoting the wrong person because their
address shares a prefix is not a mistake anybody would find by reading the screen afterwards.

**The search runs as the application, and nothing is cached.** Client credentials reuse the login's
own `AUTH_MICROSOFT_ENTRA_ID_*` with the tenant derived from the issuer, so no deployment gets a
second copy of the same secret to rotate. A token cached in module scope would outlive a rotated
secret and start failing searches long after the deployment believed it had rotated it; a role change
is a rare administrative act, so the extra round trip costs nothing worth keeping.

**`directorio.ts` throws for everything, on purpose.** It is the deliberate opposite of
`lib/auth/graph.ts`, which returns `""` for every failure because a missing department must never
block a login. Here the caller MUST tell "the directory says nobody matches" from "the directory could
not be asked", and `busqueda.ts` is the only module that turns the second into a different answer.

**`origen` travels to the screen.** In degraded mode the search only sees people who have signed in,
and an administrator who is not told that reads an empty list as "esa persona no trabaja acá" — the
wrong conclusion, and the one that ends with somebody asking IT for an account that already exists.

**Grouping the search results is local state; the administrator list is not.** The list comes from the
Server Component and a successful write calls `router.refresh()`, as every other admin screen does.
The results are the answer to a question this screen asked, so they stay local — and after a promotion
they are NOT patched with an answer the directory never gave: the promoted address is remembered and
the row redraws from that until the next search.

**No SWR here, unlike the suggestions inbox.** That list changes because somebody else sent something;
this one changes only when somebody uses this screen. A poll would spend a request a minute to redraw
a list that is already right.

**No ledger row and no mail.** `historial_sugerencia` is the ledger of one specific funnel (ADR 0002)
and has no vocabulary for a role; `evento_uso` is closed by a CHECK over `apertura`, `ejecucion` and
the five typed processing errors. An audit trail for role changes would be a new table and a new
decision, and no document asks for one.

---

## Phase 3 — Verify

| Check | Result |
|---|---|
| `pnpm test` | 113 files, 1781 tests, all passing (1509 before this item; 272 added) |
| `pnpm typecheck` | clean |
| `pnpm lint` | clean |
| `pnpm build` | compiles; `/admin/administradores`, `/api/admins`, `/api/admins/[usuarioId]` and `/api/admins/directorio` appear as dynamic routes |
| `pnpm db:migrate:status` | "Database schema is up to date!", the same three migrations as before — this item adds none |

Every screen and route in the item is covered: the two writes and the search at the route level, the
transaction and its statement order at the repository level, the degradation at the orchestrator
level, the copy and the status codes at the error level, and the screen's own refusals — the two
buttons it must not draw — at the component level.

### The tests were checked against mutations, not just run

Two deliberate mutations were applied and reverted, to confirm the assertions bite:

| Mutation | What failed |
|---|---|
| `{usuario.esAdmin ? (` → `{true ? (` in `Topbar` | `no le muestra la puerta de administradores a un colaborador` |
| Counting the remaining administrators BEFORE the update in `revocarAdministrador` | `cuenta después de escribir, no antes`, plus two more |

The second one is the mutation that matters. It is the shape a well-meaning refactor would produce —
it reads more naturally, and it is the bug TECH-DESIGN warned about.

### Acceptance criteria from `TECH-DESIGN.md`

- [x] The administrator button appears beside sign-out, only for admins; a collaborator reaching the
      URL directly gets 403 — the button decides only what is drawn, and `guardPageAdmin` /
      `guardRouteAdmin` decide what is reachable, on every page and every route.
- [x] The search queries the Entra directory through Graph; with no results, or when the person is
      already an administrator, the screen says so and offers no promotion, so no duplicate role can
      be created.
- [x] A promoted person has administrator capabilities from their next request — the role is re-read
      from the database per request (ADR 0007), which is sooner than the PRD's "siguiente ingreso".
- [x] Revoking the last remaining administrator, self-revocation included, is refused with a clear
      message, and the check is transactional: never 0 admins, not even with two simultaneous
      revocations.

---

## Open items

Deliberately out of scope, and none of them is a gap in the acceptance criteria:

- **No audit trail of role changes.** Who promoted whom and when is not recorded anywhere. It would
  need a new table and an ADR; no document asks for one today.
- **No screen deactivates an account.** `usuario.activo` is still only ever written by the database.
  This item reads it — a deactivated account cannot receive the role, and a deactivated administrator
  is listed so the role can be taken away — but it does not manage it.
- **The admin screens still have no topbar.** `components/topbar` exists now, and the three portal
  screens use it; `/admin/*` renders its own header instead, so an administrator returns through the
  browser. Giving the admin screens a bar of their own is a UI item, not this one.
- **The `User.Read.All` consent is still an open risk**, exactly as `BACKLOG.md` and `TECH-DESIGN.md`
  record it. The difference is that the portal now behaves correctly on both sides of it, and says
  which side it is on.
