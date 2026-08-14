import { NextResponse } from "next/server";

import { failureResponse } from "@/lib/api/errors";
import { guardRouteResource } from "@/lib/authz";
import { crearEnlaceSchema, idEnlaceSchema } from "@/lib/enlaces/schema";
import { registrarEvento } from "@/lib/eventos/repository";
import {
  aperturaNoRegistrada,
  destinoNoPermitido,
  enlaceNoEncontrado,
  identificadorInvalido,
} from "@/lib/mis-recursos/errors";
import { leerUrlDeEnlace } from "@/lib/mis-recursos/repository";
import { prisma } from "@/lib/prisma";

/**
 * Opening an assigned enlace — ADR 0003's `GET /api/enlaces/{id}/abrir`.
 *
 *   GET /api/enlaces/{id}/abrir → 302 Location: <the enlace's own address>
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE ONE ROUTE UNDER /api THAT DOES NOT ANSWER JSON, AND WHY
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ADR 0003 documents the exception rather than leaving it as a tacit
 * precedent. The short version is that the two alternatives both fail. Awaiting
 * a JSON call that records the apertura and then opening the tab spends the
 * click's transient activation, and the popup blocker cancels what follows. An
 * anchor pointing straight at the external address never reaches the portal, so
 * a revoked assignment would still open. A 302 is the only shape where the
 * portal decides BEFORE the navigation happens.
 *
 * The exception is this route and nothing else: another `/api/*` route that
 * wants to answer something other than JSON needs a reason this concrete.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE ORDER IS THE FEATURE
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   1. read the id from the path      — a request that names nothing is not a
 *                                       question the guard can be asked
 *   2. authorise                      — `guardRouteResource`, whose first
 *                                       caller in this codebase is this line
 *   3. re-validate the destination    — see below; this is not paranoia
 *   4. record the apertura            — a precondition, not a side effect
 *   5. redirect
 *
 * A handler that redirected first and recorded afterwards would answer the same
 * 302 on the happy path and be a different route entirely.
 *
 * A FAILURE HERE IS JSON IN A BROWSER TAB, and that is a known cost of the
 * shape. This is a top-level navigation, so a refusal renders as the raw error
 * body rather than as DESIGN.md's screen. It is the same body every other route
 * answers with — the guard's denial is returned untouched — so the message is at
 * least Spanish and readable. Turning it into a rendered page would mean a
 * second denial shape for one route; the dashboard of part 2 is the better place
 * to keep a reader from arriving here at all.
 */

/**
 * Required by `lib/authz/index.ts` on every protected route. `auth()` reads
 * cookies and so forces dynamic rendering today, but that is a property of the
 * current code shape rather than a promise; a statically rendered protected
 * route would run its guard once at build time and never again.
 */
export const dynamic = "force-dynamic";

/** Next 16 hands dynamic route params to the handler as a promise. */
interface Contexto {
  params: Promise<{ id: string }>;
}

/**
 * The schema that validated this address when an administrator wrote it,
 * borrowed rather than restated.
 *
 * Reaching into `crearEnlaceSchema.shape` is deliberate. A second rule written
 * here would be a second rule to keep in step — and the two would diverge
 * exactly once, quietly, in whichever direction is less safe. This IS the write
 * side's rule: the same normalisation (control characters stripped, then
 * trimmed) followed by the same allowlist of parsed schemes.
 */
const urlAlmacenadaSchema = crearEnlaceSchema.shape.url;

export async function GET(_request: Request, { params }: Contexto): Promise<NextResponse> {
  /*
   * Before the guard, because the guard is asked about a specific row and a
   * segment that is not an identifier names no row. This is not an
   * authorization decision and discloses nothing: a malformed id is malformed
   * for everyone.
   */
  const id = idEnlaceSchema.safeParse((await params).id);
  if (!id.success) {
    return failureResponse(identificadorInvalido());
  }

  /*
   * `guardRouteResource` refuses both a missing assignment and an assignment
   * over an enlace given de baja, re-read from SQL Server on this request. That
   * is what makes a revocation apply to the very next click (ADR 0007) instead
   * of to the next time the dashboard happens to refresh.
   */
  const acceso = await guardRouteResource({ tipo: "enlace", id: id.data });
  if (!acceso.allowed) {
    return acceso.response;
  }

  let destino: string | null;

  try {
    destino = await leerUrlDeEnlace(prisma, id.data);
  } catch (error) {
    console.error("GET /api/enlaces/[id]/abrir", error);
    return failureResponse(enlaceNoEncontrado());
  }

  if (destino === null) {
    /* The guard passed, so the grant existed a moment ago: the row went away in between. */
    return failureResponse(enlaceNoEncontrado());
  }

  /*
   * ══════════════════════════════════════════════════════════════════════════
   *  RE-VALIDATE THE STORED ADDRESS. THIS IS NOT PARANOIA.
   * ══════════════════════════════════════════════════════════════════════════
   *
   * The value was checked when it was written, and that is not the same as
   * being safe to redirect to now. The database is not a trusted input: a row
   * can predate the validation, arrive through a migration or a manual fix, or
   * come from any future path that writes `enlace.url` without going through
   * `crearEnlaceSchema`. None of those leave a trace this handler could notice.
   *
   * What is at stake is an OPEN REDIRECT, and it is a serious vulnerability
   * precisely because the portal is trusted. A reader who follows a link from
   * their own company's portal is not inspecting the address bar; the portal's
   * domain is what vouches for wherever they land. A `javascript:` value would
   * run in the reader's session, and a `data:` one would serve attacker HTML
   * that appears to have come from here. Either way the portal has lent its name
   * to a destination it never approved — the one thing the write-side allowlist
   * exists to prevent, applied one step too early to be enough on its own.
   *
   * The check costs one parse of a string already in memory. It runs before the
   * event is recorded so that a refusal leaves no row claiming the enlace was
   * opened.
   */
  const validada = urlAlmacenadaSchema.safeParse(destino);
  if (!validada.success) {
    console.error("GET /api/enlaces/[id]/abrir", `enlace ${id.data}: dirección almacenada inválida`);
    return failureResponse(destinoNoPermitido());
  }

  try {
    /*
     * THE RECORD IS A PRECONDITION OF THE REDIRECT, NOT A SIDE EFFECT OF IT.
     *
     * The alternative — redirect anyway, treat the write as best-effort — was
     * rejected, and the two consequences are worth naming because neither is
     * obvious.
     *
     * Recording first means a database blip stops a collaborator from opening a
     * link they are entitled to. That is a real cost, and it is a LOUD one: the
     * reader sees a Spanish sentence saying the portal did not open it, and can
     * retry immediately.
     *
     * Redirecting anyway would trade that for a silent one. Nothing downstream
     * can tell a missing event from a resource nobody used: item #19 reads
     * `evento_uso` as the whole history of usage and reports adoption from it,
     * so dropped rows come out as a resource with no interest in it — a
     * conclusion an administrator would act on, by revoking or retiring
     * something people were in fact using. And the apertura is the only reason
     * this click comes through the portal at all; a route that skips it on
     * failure is an expensive plain anchor.
     *
     * PRD.md marks exactly one write as best-effort — item #14's notification
     * e-mail, "el error se ignora silenciosamente" — and says nothing of the
     * sort about this one. The silence is not permission.
     */
    await registrarEvento(prisma, {
      usuarioId: acceso.usuario.id,
      tipoRecurso: "enlace",
      idRecurso: id.data,
      tipoEvento: "apertura",
    });
  } catch (error) {
    console.error("GET /api/enlaces/[id]/abrir", error);
    return failureResponse(aperturaNoRegistrada());
  }

  /*
   * 302 and not Next's default 307. The distinction 307 exists to make — that
   * the method survives the redirect — is meaningless for a GET, and ADR 0003
   * names the 302 as the contract of this route.
   *
   * `validada.data` and NOT `destino`: the reader goes to the value the check
   * approved. Redirecting to the raw column while validating its normalised form
   * would make the check decorative — a stored `java\tscript:` passes as
   * nothing, and the browser reads it as `javascript:`.
   *
   * `no-store` because a cached 302 is a redirect the portal never sees. The
   * next click would jump straight to the destination without the guard and
   * without an apertura, which is every reason this route exists.
   */
  return NextResponse.redirect(validada.data, {
    status: 302,
    headers: { "cache-control": "no-store" },
  });
}
