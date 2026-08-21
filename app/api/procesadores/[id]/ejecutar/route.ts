import { NextResponse } from "next/server";

import { failureResponse } from "@/lib/api/errors";
import { guardRouteResource } from "@/lib/authz";
import { type TipoEvento, registrarEvento } from "@/lib/eventos/repository";
import {
  desenlaceDeFallo,
  envioInvalido,
  procesadorNoDisponible,
} from "@/lib/procesadores/ejecucion-errores";
import { ERROR_INTERNO, identificadorInvalido } from "@/lib/procesadores/errors";
import { leerClaveProcesador } from "@/lib/procesadores/repository";
import { interpretarFallo, interpretarRespuesta } from "@/lib/procesadores/resultado";
import { idProcesadorSchema } from "@/lib/procesadores/schema";
import { TIMEOUT_MS, ejecutarEnServicio } from "@/lib/procesadores/servicio";
import { prisma } from "@/lib/prisma";

/**
 * Executing an assigned procesador — the proxy of ADR 0006, and backlog item
 * #10.
 *
 *   POST /api/procesadores/{id}/ejecutar → the resulting file, or a JSON error
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE SECOND ROUTE UNDER /api THAT DOES NOT ANSWER JSON — AND WHY THIS ONE
 *  DOES NOT NEED THE ADR THE FIRST ONE NEEDED
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `app/api/enlaces/[id]/abrir/route.ts` documents itself as "the one route
 * under /api that does not answer JSON", and that is still true of what it
 * does: it answers a REDIRECT, a control-flow answer that had to be argued for.
 * This route answers a FILE, which is the thing the caller asked for. ADR 0003
 * describes this endpoint as a proxy that "retransmite la respuesta" — a proxy
 * that re-encoded the file as JSON would not be one.
 *
 * The failure path is still JSON, still ADR 0003's `{codigo, mensaje}`, and
 * still shown to the reader as it stands. So the shape is: a file when it
 * worked, the standard envelope when it did not, and the caller tells them
 * apart the way it always has — by the status.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT THIS ROUTE DOES NOT DO, AND MUST NOT START DOING
 * ══════════════════════════════════════════════════════════════════════════
 *
 * IT DOES NOT VALIDATE THE FILES. Not the count, not the formats, not the
 * sizes — even though the `procesador` row is right there and the guard just
 * read it. ADR 0002 makes the row "la única fuente de verdad de la
 * cardinalidad" and ADR 0006 puts its enforcement in the service's common
 * pipeline, which is also the only place that can do the parts the portal
 * cannot: the uncompressed-size inspection that stops a zip bomb, and the
 * content rules that belong to the module.
 *
 * A second enforcement point here would not be belt and braces. It would be a
 * second copy of a rule that drifts from the first, and the drift is silent in
 * the direction that matters: the portal accepting what the service refuses is
 * merely a wasted upload, while the portal refusing what the service accepts is
 * a collaborator locked out of a resource that works. The upload form gives the
 * reader the same limits as guidance — see `ejecutar-client.ts`, which says in
 * as many words that it grants nothing.
 *
 * IT DOES NOT READ THE FILES. `request.body` is handed to `fetch` as a stream
 * and never parsed, so no file is ever materialised in the portal's heap. The
 * reasoning, and its one visible consequence, are in
 * `lib/procesadores/servicio.ts`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE ORDER
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   1. read the id           — a request that names nothing cannot be authorised
 *   2. authorise             — against SQL Server, on THIS request
 *   3. check the envelope    — a body that is not multipart never leaves the portal
 *   4. resolve the clave     — the row's key becomes the service's URL
 *   5. forward, with a clock — 2 minutes, the portal's own deadline
 *   6. interpret             — status AND body; see `resultado.ts`
 *   7. record, then answer   — the event, then the file or the error
 *
 * Steps 1 and 2 are in that order for the same reason as in the enlaces route:
 * the guard is asked about a specific row, and a segment that is not an
 * identifier names none.
 */

/**
 * Required by `lib/authz/index.ts` on every protected route. `auth()` reads
 * cookies and so forces dynamic rendering today, but that is a property of the
 * current code shape rather than a promise.
 */
export const dynamic = "force-dynamic";

/** Next 16 hands dynamic route params to the handler as a promise. */
interface Contexto {
  params: Promise<{ id: string }>;
}

/**
 * Response headers the portal repeats from the service, and nothing else.
 *
 * AN ALLOWLIST AND NOT A COPY OF EVERYTHING. Forwarding every upstream header
 * would hand the browser whatever the service or an intermediary happened to
 * set — `Server`, a `Set-Cookie` from a misconfigured proxy, a caching
 * directive written for an internal network. Three headers describe the file
 * and none of them describes the service.
 *
 * `Content-Disposition` is repeated verbatim rather than rebuilt: Starlette
 * already encoded it, including the `filename*` form a non-ASCII name needs,
 * and re-deriving it here would be a second encoder to get wrong.
 */
const CABECERAS_REENVIADAS = ["content-type", "content-disposition", "content-length"] as const;

/** What the browser is told when the service names no file. */
const DESCARGA_POR_DEFECTO = 'attachment; filename="resultado"';

function cabecerasDeSalida(respuesta: Response): Headers {
  const cabeceras = new Headers();

  for (const nombre of CABECERAS_REENVIADAS) {
    const valor = respuesta.headers.get(nombre);
    if (valor) {
      cabeceras.set(nombre, valor);
    }
  }

  /*
   * A file the browser DOWNLOADS, never one it renders. Without a disposition
   * the browser is free to display the body inline, and a processor's output is
   * attacker-influenced content — it came from a file somebody uploaded. Served
   * inline from the portal's own origin, an HTML-shaped output would run there.
   */
  if (!cabeceras.has("content-disposition")) {
    cabeceras.set("content-disposition", DESCARGA_POR_DEFECTO);
  }

  /* Same reasoning: the declared type is the only type, never one the browser
     sniffs out of the bytes. */
  cabeceras.set("x-content-type-options", "nosniff");

  /*
   * The result belongs to one execution by one collaborator. A cached copy
   * would be served to the next request for this URL without the guard, without
   * the service, and without the files that produced it.
   */
  cabeceras.set("cache-control", "no-store");

  return cabeceras;
}

/**
 * Records the event, and never lets its failure change the answer.
 *
 * THIS IS THE OPPOSITE DECISION TO THE APERTURA ROUTE, AND BOTH ARE RIGHT.
 * `GET /api/enlaces/{id}/abrir` treats its `apertura` as a precondition and
 * refuses to redirect if the row cannot be written, because recording the open
 * is the only reason that click goes through the portal at all.
 *
 * Here the reason is the file, and ADR 0006 settles it in as many words: "si la
 * respuesta del servicio se pierde en el camino de vuelta, ese evento no se
 * registra; es analítica, no un dato transaccional, y el archivo del usuario no
 * depende de ello". Throwing away a finished execution — two minutes of a
 * worker, and a file the collaborator is waiting for — to protect an analytics
 * row would be the wrong trade in the only direction that costs a person
 * something.
 *
 * So a failure is logged and swallowed. `null` means there was nothing to
 * record in the first place: see `EVENTO_POR_TIPO`.
 */
async function registrar(
  usuarioId: number,
  idRecurso: number,
  tipoEvento: TipoEvento | null,
): Promise<void> {
  if (tipoEvento === null) {
    return;
  }

  try {
    await registrarEvento(prisma, {
      usuarioId,
      tipoRecurso: "procesador",
      idRecurso,
      tipoEvento,
    });
  } catch (error) {
    console.error("POST /api/procesadores/[id]/ejecutar", error);
  }
}

export async function POST(request: Request, { params }: Contexto): Promise<Response> {
  const id = idProcesadorSchema.safeParse((await params).id);

  if (!id.success) {
    return failureResponse(identificadorInvalido());
  }

  /*
   * Re-read from SQL Server on this request, so a revocation applies to the
   * very next execution — including one whose upload is already in flight from
   * a tab that has not revalidated yet (ADR 0007).
   */
  const acceso = await guardRouteResource({ tipo: "procesador", id: id.data });

  if (!acceso.allowed) {
    return acceso.response;
  }

  /*
   * Before the database read and before the network call: an envelope the
   * service could not parse is refused here, where the answer is a sentence,
   * rather than there, where it comes back as an empty 422 that says nothing.
   * `startsWith` because the header carries the boundary after the type.
   */
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().startsWith("multipart/form-data") || request.body === null) {
    return failureResponse(envioInvalido());
  }

  let clave: string | null;

  try {
    clave = await leerClaveProcesador(prisma, id.data);
  } catch (error) {
    console.error("POST /api/procesadores/[id]/ejecutar", error);
    return failureResponse(ERROR_INTERNO);
  }

  if (clave === null) {
    /* The guard passed, so the grant existed a moment ago: the row went away in between. */
    return failureResponse(procesadorNoDisponible());
  }

  /*
   * THE CLOCK IS THE PORTAL'S, AND IT IS THE OUTER ONE. The service gives up
   * first by construction — it refuses to start unless its own timeout is
   * strictly below two minutes — so this fires only when the service stopped
   * answering at all. Either way the reader is told the same thing, because
   * from where they sit it is the same event.
   */
  const resultado = await ejecutarEnServicio({
    clave,
    cuerpo: request.body,
    contentType,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
    .then(interpretarRespuesta)
    .catch((error: unknown) => {
      console.error("POST /api/procesadores/[id]/ejecutar", error);
      return interpretarFallo(error);
    });

  if (resultado.clase !== "exito") {
    const { falla, evento } = desenlaceDeFallo(resultado);

    await registrar(acceso.usuario.id, id.data, evento);

    return failureResponse(falla);
  }

  /*
   * The event is recorded HERE — after the service committed to an answer, and
   * before a single byte reaches the browser — rather than after the transfer
   * finishes. The execution is what happened; whether the download completed is
   * the browser's business, and a route that waited for it would have to hold
   * the request open to find out.
   */
  await registrar(acceso.usuario.id, id.data, "ejecucion");

  /*
   * The upstream body is piped straight through, unread. It is a file of up to
   * hundreds of megabytes and the portal has no reason to hold one: reading it
   * to hand it on would put the whole thing in the heap for the sake of
   * producing the same bytes.
   */
  return new NextResponse(resultado.respuesta.body, {
    status: 200,
    headers: cabecerasDeSalida(resultado.respuesta),
  });
}
