import { NextResponse } from "next/server";

import { dependenciasDe } from "@/lib/analitica/dependencias";
import { ERROR_INTERNO, consultaInvalida } from "@/lib/analitica/errors";
import { calcularAnalitica } from "@/lib/analitica/servicio";
import { consultaSchema, leerConsulta } from "@/lib/analitica/schema";
import { failureResponse } from "@/lib/api/errors";
import { guardRouteAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

/**
 * La analítica — ADR 0003's `GET /api/analitica`, and the whole of item #18.
 *
 *   GET /api/analitica?rango=hoy|7d|30d|personalizado[&desde=&hasta=][&comparar=true]
 *     → 200 { periodo, metricas, comparacion }
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE ONLY READ IN THIS PORTAL THAT IS AN ENDPOINT RATHER THAN A PAGE READ
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Every admin screen so far reads its rows in the Server Component and refreshes
 * them with `router.refresh()`, and this item builds an endpoint instead. The
 * reason is what the reader does with it: the four periods and the comparison
 * are a QUESTION they change several times a minute, and re-rendering the whole
 * page for each one would throw away the rest of the screen to move one control.
 * It is the same argument `GET /api/admins/directorio` made in item #17 — a
 * search is not a page's initial state — and the same one `GET /api/mis-recursos`
 * made in item #8.
 *
 * Item #19 does exactly that, and still reads its FIRST period on the server:
 * `calcularAnalitica` takes injected reads, so the page calls it with the very
 * same bindings this handler uses (`lib/analitica/dependencias.ts`). The
 * endpoint serves every period after that one.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS FILE IS SO THIN
 * ══════════════════════════════════════════════════════════════════════════
 *
 * It parses, it binds three repository functions to Prisma, and it maps a
 * failure. Every decision worth arguing about lives somewhere testable without a
 * request: where a day starts (`periodos.ts`), what a valid question is
 * (`schema.ts`), what the numbers mean (`metricas.ts`) and how many reads a
 * comparison costs (`servicio.ts`).
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const acceso = await guardRouteAdmin();
  if (!acceso.allowed) {
    return acceso.response;
  }

  const consulta = consultaSchema.safeParse(leerConsulta(new URL(request.url).searchParams));

  if (!consulta.success) {
    /* One message for every malformed question: the four rules are on the
       reader's own screen as controls, so naming which one they broke would
       describe a form they are not filling in by hand. */
    return failureResponse(consultaInvalida());
  }

  try {
    /*
     * The reads are bound OUTSIDE the service so it never learns what a Prisma
     * client is, and outside this handler so item #19's page — the other caller
     * of `calcularAnalitica` — spends the same round trips this one does.
     */
    const respuesta = await calcularAnalitica(consulta.data, new Date(), dependenciasDe(prisma));

    return NextResponse.json(respuesta);
  } catch (error) {
    /* The detail stays in the server log; the browser gets a code and a sentence. */
    console.error("GET /api/analitica", error);
    return failureResponse(ERROR_INTERNO);
  }
}
