import type { Conteos } from "@/lib/analitica/metricas";
import type { Periodo } from "@/lib/analitica/periodos";
import {
  type AnaliticaClient,
  agregarPorRecurso,
  agregarPorUsuario,
  agregarSugerencias,
  leerDimensiones,
} from "@/lib/analitica/repository";
import type { Dependencias } from "@/lib/analitica/servicio";

/**
 * The engine's reads, bound to a database client — the one line both callers of
 * `calcularAnalitica` need and neither should own.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THIS LEFT THE ROUTE HANDLER
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Item #18 wrote this binding inline in `app/api/analitica/route.ts` because
 * there was exactly one caller. Item #19 adds the second: the screen reads its
 * first period on the server, in the Server Component, rather than painting a
 * skeleton and then asking its own portal for data it is already holding a
 * database connection for.
 *
 * Copying six lines would have been cheaper to write and would have put the
 * decision "how many round trips does one period cost" in two files. The three
 * aggregations run TOGETHER on purpose — they are independent, so their
 * latencies overlap — and a second copy is a second place for that `Promise.all`
 * to quietly become a sequence.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  IT TAKES A CLIENT, NOT `prisma`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `AnaliticaClient` is the narrow slice of the client the repository actually
 * uses, which is what lets the suite hand it a fake object with three methods
 * instead of a database. The service still never learns what Prisma is: it
 * receives `Dependencias`, and this module is the only thing that knows both
 * halves.
 */
export function dependenciasDe(client: AnaliticaClient): Dependencias {
  return {
    leerDimensiones: () => leerDimensiones(client),

    /*
     * The three `GROUP BY`s of one period, together. A comparison calls this
     * twice — once per range — and each call spends one round trip's worth of
     * latency rather than three.
     */
    agregar: async (periodo: Periodo): Promise<Conteos> => {
      const [porRecurso, porUsuario, sugerencias] = await Promise.all([
        agregarPorRecurso(client, periodo),
        agregarPorUsuario(client, periodo),
        agregarSugerencias(client, periodo),
      ]);

      return { porRecurso, porUsuario, sugerencias };
    },
  };
}
