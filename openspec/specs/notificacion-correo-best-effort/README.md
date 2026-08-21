# Item #14 — Best-effort e-mail notification

**Backlog reference:** Item #14 ("Notificación por correo best-effort"), repository `portal`.
**Depends on:** #13 (suggestions box) — satisfied; this item hooks into the `POST` that item shipped.
**Unblocks:** nothing. It is a leaf: no later item reads what it writes, because it writes nothing.

Delivered through a three-phase cycle — Explore, Implement, Verify — rather than the full SDD
artefact chain. This file is the record of those three phases.

---

## Phase 1 — Explore

### What was read

| Source | What it settled |
|---|---|
| `BACKLOG.md` #14 | The scope in one line: send via mail API on registration, ignore the failure silently, no queue, no retry — "(ADR 0008 rechazado)" |
| `PRD.md` §"Casos borde" | The exact sentence the whole item is built from: the failure "se ignora silenciosamente. La sugerencia no se pierde porque ya está garantizada en la base de datos" |
| `PRD.md` §"Criterios de éxito" | "llega como correo al Área de Innovación en menos de 1 minuto desde el envío" — a minute, not a millisecond, and the reason the send can be deferred |
| `PRD.md` §"Supuestos" | "El envío de correos se hará mediante una **API de correo** (no SMTP directo)" — the only thing settled about the provider |
| `TECH-DESIGN.md` §"Componentes" | "envío de correos **best-effort** … sin jobs en segundo plano" — the constraint `after` had to be justified against |
| `TECH-DESIGN.md` §"Buzón de sugerencias" | The two acceptance criteria this item closes |
| `adrs/0008` (rejected) | Why there is no outbox: the rejection removed *background job infrastructure*, which turned out to be the precise thing that decides how this send is scheduled |
| `.env.example` | That `MAIL_API_BASE_URL`, `MAIL_API_KEY` and `MAIL_FROM_ADDRESS` were already reserved for this item, and marked "BLOQUEADAS POR TI" |
| `app/api/sugerencias/route.ts` | The hook point, already described in a comment item #13 left: "When #14 lands it hooks in AFTER the insert has succeeded" |
| `lib/procesadores/servicio.ts`, `lib/auth/env.ts` | The established shape for an external integration: a validated env reader that throws naming its variables, plus a transport module that interprets nothing |

### What the exploration settled before any code was written

**There is no provider yet, and that is a fact to design around rather than a blocker.**
`.env.example` marks the three `MAIL_*` variables as blocked on TI, and the PRD only commits to "una
API de correo (no SMTP directo)". So two things in this item are assumptions rather than verified
facts — the send path and the JSON body shape — and the design question was not "how do we avoid
assuming" but "where do the assumptions go so that replacing them is an edit and not an
investigation". They are both in `lib/correo/servicio.ts`, in forty lines, named and commented as
assumptions. `lib/procesadores/servicio.ts` made the same bet against FastAPI and it paid off: when
the real service turned out to mount `/interno/procesadores/{clave}` without the `/ejecutar` the ADR
promised, the correction was one constant.

**The item is a guarantee, not a feature.** Everything about sending mail is ordinary. What is not
ordinary is the requirement that this send can *never* affect the suggestion — and every interesting
decision below is that sentence applied to one more failure mode: a failure of the API, a failure of
the network, a failure of the configuration, a failure of the scheduling call itself.

**A recipient variable was missing.** The three reserved names say how to reach the mail API and who
it sends *from*. None says who it sends *to*. `MAIL_INNOVACION_ADDRESS` was added to
`.env.example` — an area mailbox, deliberately not an administrator's personal one, so the aviso
does not depend on who currently holds the role.

**Nothing needed to be added to the database, the UI or the API contract.** No migration (the item
persists nothing — that is the point of rejecting the outbox), no screen (the author already gets a
toast, and telling them the mail failed would contradict "se ignora silenciosamente"), and no change
to the shape of `POST /api/sugerencias`'s request or response.

---

## Phase 2 — Implement

### New modules

| File | Responsibility |
|---|---|
| `lib/correo/env.ts` | The four `MAIL_*` variables, validated once, with the throw that `notificar.ts` is built to catch |
| `lib/correo/mensaje.ts` | What the Área de Innovación reads: a pure function from `SugerenciaDTO` to subject and body |
| `lib/correo/servicio.ts` | The wire: one URL, one bearer header, one JSON shape, nothing interpreted |
| `lib/correo/notificar.ts` | Where "best-effort" becomes a guarantee — scheduling, swallowing, and the log line that keeps swallowing honest |

**Changed:** `app/api/sugerencias/route.ts` (the hook, and the comment item #13 left for it),
`app/api/sugerencias/route.test.ts` (four tests replacing the one that pinned "no mail yet"), and
`.env.example` (the recipient, plus a note that the block now has a consumer).

### Decisions taken during implementation

**The send is scheduled with `after`, and that had to be argued against ADR 0008.** The objection is
real: ADR 0008 was rejected to eliminate "toda infraestructura de jobs en segundo plano", and
TECH-DESIGN repeats it — "notificación directa al registrar una sugerencia; sin jobs en segundo
plano". Does deferring the send contradict that?

No, and the distinction is not a technicality. What ADR 0008 rejected was a **scheduler**: a second
process on its own clock, with its own deployment, reading state written by the first — the piece
whose hosting assumption was the design's open warning A5. `after` is none of that. It is the same
invocation of the same request finishing its work after the bytes are on the wire: no clock, no
queue, no state shared between two processes, nothing extra to deploy. If the invocation dies, the
send dies with it — which is exactly the semantics the PRD asked for.

The alternative was awaiting the send inside the handler. It was rejected because it makes a
collaborator's form wait on a third party that the same document says may fail without consequence.
The success criterion is "llega en menos de 1 minuto", not "llega before the toast".

**The call sits outside the `try` that builds the answer, and that placement is the design.** Inside
it, a throw from the notification would be caught by a `catch` that answers `errorDePrisma` — a 500
blaming the database for a write that succeeded, sending the author back to resend an idea the
portal already has. Out there, there is no handler left to get it wrong. `programarNotificacion`
returns `void` and catches everything by contract, so the call can neither delay the 201 nor fail it.

**`programarNotificacion` returns `void` on purpose.** Handing back the promise would let a caller
`await` it — the one thing the module exists to prevent — and it would do so silently, costing a
collaborator ten seconds on a bad day with nothing in the code to show why.

**A missing configuration is a warning, not an incident, and gets its own log line.** The env is read
separately from the send so that "TI has not handed over the credentials yet" does not look like a
gateway failure in the log. A portal deployed before the credentials exist registers suggestions
perfectly well and says so once per send. It is the expected state of a pre-production deployment.

**"Silenciosamente" is about the user, never about the log.** Every failure — missing config, non-2xx
answer, refused connection, timeout — leaves exactly one `console.warn` naming the suggestion by id.
A report of "no llegó el correo" is then one grep, not an investigation. A genuinely silent failure
would make this item unobservable, and an unobservable best-effort integration is indistinguishable
from one that was never wired.

**A non-2xx answer is a failure exactly like a refused connection.** No retry, no queue, no
distinction in behaviour. The status code is in the log line because it is the one thing separating
"our credentials are wrong" from "their gateway is down", and whoever reads that line is deciding
which.

**The message is plain text.** Every field in it is free text a collaborator typed. In HTML each one
becomes an escaping obligation, and the one that is forgotten renders somebody's markup inside the
Área de Innovación's mail client. Plain text has no such obligation. The subject is the exception,
because a header genuinely can be broken by its content: CR and LF are collapsed to a space before
anything else, and the 200-character title is trimmed to fit a 120-character subject with an
ellipsis, so the portal decides where the cut lands instead of each mail client cutting somewhere
different and silently.

**The body says the suggestion is already registered.** This mail is the only part of the flow that
can be lost, and the reader cannot know that from the outside. Telling them in the message itself
that the record lives in the portal is what keeps a missing notification from becoming a lost idea.
The id is in the body for the same reason: it is what an administrator types into the panel when the
mail is all they have.

**One recipient, and it is a role.** Not the author — they already got the toast and have the
suggestion in their own list — and not an administrator's personal inbox, which would turn a role
into a person. Item #15 gives the Área de Innovación its panel; this gives it its aviso; neither
should depend on who currently holds the post.

**Ten seconds of timeout, and it is not about the user.** Nobody is waiting: the response was already
flushed. It is about the server — an unbounded `fetch` against a hanging gateway holds a socket and
an invocation open for as long as the gateway feels like it, and there is no retry that would make
the wait worth anything.

**Dates in the body are formatted in `America/Lima`**, the same fixed zone item #13 pinned in the UI
and for a weaker but real version of the same reason: the DTO's dates are UTC, and a suggestion sent
at 21:00 in Lima is already the next day in UTC. The reader is in Lima, so the mail says Lima and
labels it.

---

## Phase 3 — Verify

| Check | Command | Result |
|---|---|---|
| Full suite | `pnpm test` | **1200 passed**, 91 files |
| Types | `pnpm typecheck` | clean |
| Lint | `pnpm lint` | clean |
| Production build | `pnpm build` | succeeds; `/api/sugerencias` still registered dynamic (`ƒ`) |
| Migrations | — | none; this item persists nothing |

**31 tests across four new suites were added by this item**, plus `route.test.ts` extended by a net
three — the single test that pinned "no mail is sent yet" was replaced by four that pin when, with
what, and under which conditions it now is.

| Suite | Covers |
|---|---|
| `lib/correo/env.test.ts` | The four variables at their limits, that a blank is as loud as a missing one, and that the API key never reaches the error message — which is a log line |
| `lib/correo/mensaje.test.ts` | The subject's prefix and its cap, that a newline in a title cannot split a header, the author/area/id/date in the body, Lima time rather than UTC, and that a 4000-character description survives whole |
| `lib/correo/servicio.test.ts` | The URL built from origin plus the one owned path, the bearer header, the exact JSON body, one recipient, the deadline, and that neither a 500 nor a rejection is interpreted here |
| `lib/correo/notificar.test.ts` | The four failure modes resolving to `false` instead of throwing, that an unconfigured environment never reaches the network, that every failure leaves a line naming the suggestion, and that `after` is handed the work rather than awaited |
| `app/api/sugerencias/route.test.ts` (extended) | That the notification is scheduled with the created row and the session's author, that a failed insert schedules nothing, that no `fetch` happens inside the request, and that the mail carries exactly the suggestion the author was shown |

### The two tests that are about placement rather than behaviour

`no avisa de nada cuando el insert falló` and `avisa con exactamente la misma sugerencia que le
devuelve al autor` do not test a bug anybody expects to see. They pin the two ways this item could be
broken later without any error appearing: a notification moved above the write would announce
suggestions that do not exist, and a notification built from the request body rather than the
returned row would carry an id or a state the database never had. Both would be discovered by an
administrator failing to find a suggestion in the panel — days later, with nothing in a log.

### Acceptance criteria from `TECH-DESIGN.md`

- [x] "En operación normal, el Área de Innovación recibe el correo de aviso al registrarse la
      sugerencia; el envío es best-effort y el registro se confirma con toast." — `after` schedules
      the send once the 201 is flushed; the toast is item #13's and is unchanged and unblocked.
- [x] "Con la API de correo caída, la sugerencia **queda registrada igualmente** y es visible en el
      panel del admin; el fallo de correo se ignora silenciosamente (sin reintento ni cola)." — the
      write commits before anything is scheduled, `notificarSugerencia` resolves `false` for every
      failure mode instead of throwing, and there is no table, no queue and no second attempt
      anywhere in `lib/correo`.

### What was NOT verified, and why it cannot be yet

**No message has been sent to a real mail API**, because there is no mail API: the credentials are
blocked on TI and the provider is not chosen. Everything up to the `fetch` is exercised — the URL,
the header, the body, the timeout, the four failure paths — and the two assumptions that remain are
the ones named in Phase 1: the send path and the JSON body shape. The first real send will confirm or
correct exactly those two definitions, in one file, and nothing else in the portal is coupled to
them.

---

## Open items

1. **The two assumptions in `lib/correo/servicio.ts` are unverified by construction.** `RUTA_ENVIO`
   (`/messages`) and the `{ from, to[], subject, text }` body are the common shape of JSON mail APIs
   in this class, not a contract anybody has read. When TI names the provider, those two definitions
   are the change — and if the provider needs a different auth header or a per-recipient field, this
   is the file, and it is the only one.

2. ~~**`.env.example` names `PROCESADORES_SERVICE_BASE_URL`; the code reads
   `PROCESADORES_BASE_URL`.**~~ **Fixed.** Found while adding the mail variables and initially left
   alone as item #10's surface, then corrected on request in the same cycle. It was a real trap:
   someone copying the template set a variable nothing reads and got a throw naming a variable that
   was not in the file. The block's note was corrected with it — it still claimed these variables had
   no consumer, which stopped being true when item #10 shipped the proxy route.

   A second, larger drift in the same file was fixed in the same pass: the Ítem #3 block named
   `ENTRA_CLIENT_ID` / `ENTRA_CLIENT_SECRET` / `ENTRA_TENANT_ID` / `ENTRA_ISSUER` /
   `ENTRA_REDIRECT_URI`, none of which any module reads, while `ALLOWED_EMAIL_DOMAIN` — the rule
   that decides which domain may sign in — was not in the template at all, nor was `ADMIN_EMAIL`.
   The names are now the ones Auth.js v5 auto-detects (`AUTH_MICROSOFT_ENTRA_ID_*`), the tenant id
   lives inside the issuer URL where the provider expects it, and the redirect URI is documented as
   what it actually is: a registration TI performs in Entra ID, not a variable this file sets. The
   template is now consistent with every env reader in both directions — nothing required is
   missing, nothing listed goes unread.

   The groups were then re-cut along the line that actually matters. Group A used to mean "required
   now" and held only the two database URLs; it now holds everything without which the portal will
   not start or will let nobody in — the database and the login — all uncommented with placeholders,
   so copying the template fails on a *value* rather than on an absence. `AUTH_URL` and `ADMIN_EMAIL`
   sit there too but stay commented, because `lib/auth/env.ts` does not require them and an
   unreplaced placeholder would be worse than their absence: a wrong `AUTH_URL` breaks the login
   callback. Group B stopped meaning "no consumer yet" — every variable in it has one — and now means
   "does not block startup": each block names the single feature that fails without it.

3. **A link into the admin panel would make the mail far more useful, and it needs `AUTH_URL`.** The
   body tells the reader to go to the portal but cannot say where, because building an absolute URL
   means depending on a variable this item otherwise does not touch (`AUTH_URL`, reserved for item
   #3 and still commented). Item #15 builds the panel and knows its route; adding the deep link is
   its natural moment.

4. **Nothing observes the send rate.** `console.warn` is enough to answer "did this one fail", and
   nothing answers "how many failed this week". That is fine for the volume the PRD describes, and it
   is worth remembering if the aviso ever becomes something anybody depends on — at which point it
   would no longer be best-effort, and this item's premise would have changed.
