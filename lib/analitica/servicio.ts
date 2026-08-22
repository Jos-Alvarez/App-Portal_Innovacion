import { type Conteos, type Metricas, armarMetricas } from "@/lib/analitica/metricas";
import {
  type Periodo,
  type PeriodoDTO,
  aPeriodoDTO,
  periodoAnterior,
  periodoDePreset,
  periodoPersonalizado,
} from "@/lib/analitica/periodos";
import type { Dimensiones } from "@/lib/analitica/repository";
import type { Consulta } from "@/lib/analitica/schema";

/**
 * The analytics engine, assembled — backlog item #18.
 *
 * This is the only module that knows the shape of an answer: which period was
 * asked for, which one it is compared against, and that the dimensions are read
 * once for both. Everything it uses is either pure (`periodos`, `metricas`) or
 * injected (`Dependencias`), so the orchestration itself — how many reads
 * happen, in what order, and which ones are skipped — is exercised for real
 * rather than mocked around.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE DIMENSIONS ARE READ ONCE, THE FACTS TWICE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A comparison is "the same questions over the shifted range" (ADR 0010), and
 * the questions are the three `GROUP BY`s. The catalogue of resources and the
 * roster of people are not questions about a period at all — they are what turns
 * an id into a name — so reading them twice would spend two round trips to get
 * two identical answers, and would open the door to a comparison whose two
 * halves disagree about somebody's area because a login landed between them.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  `comparar=false` COSTS NOTHING, AND THAT IS ENFORCED HERE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The previous period's aggregations only run when they were asked for. Reading
 * them always and letting the route drop them would double the load of the
 * default view — the one an administrator opens every morning — to serve a
 * number nobody put on screen.
 */

/** What the engine needs from the outside world. */
export interface Dependencias {
  /** The catalogues and the roster. Called at most once per request. */
  leerDimensiones(): Promise<Dimensiones>;
  /** The three `GROUP BY`s over one range. Called once, or twice with `comparar`. */
  agregar(periodo: Periodo): Promise<Conteos>;
}

/** One period and everything it answers. */
export interface Reporte {
  periodo: PeriodoDTO;
  metricas: Metricas;
}

/** The body of `GET /api/analitica`. */
export interface RespuestaAnalitica extends Reporte {
  /** The equivalent period immediately before, or `null` when not requested. */
  comparacion: Reporte | null;
}

/**
 * The range the query asks for.
 *
 * `personalizado` is the only branch that reads `desde` and `hasta`, and the
 * schema has already guaranteed both are there — the non-null assertions are the
 * cost of expressing a cross-field rule in zod's `refine` rather than in the
 * type. The presets never look at them, which is why the schema refuses a preset
 * that carries dates instead of ignoring them.
 */
export function periodoDe(consulta: Consulta, ahora: Date): Periodo {
  if (consulta.rango === "personalizado") {
    return periodoPersonalizado(consulta.desde!, consulta.hasta!);
  }

  return periodoDePreset(consulta.rango, ahora);
}

/**
 * The whole answer to one analytics request.
 *
 * `ahora` is a parameter and not `new Date()` read inside: the presets are
 * resolved against it, so a test can ask what "hoy" meant on a Tuesday in
 * February without waiting for one.
 */
export async function calcularAnalitica(
  consulta: Consulta,
  ahora: Date,
  { leerDimensiones, agregar }: Dependencias,
): Promise<RespuestaAnalitica> {
  const periodo = periodoDe(consulta, ahora);
  const anterior = consulta.comparar ? periodoAnterior(periodo) : null;

  /*
   * All of it at once. The three reads are independent — nothing about the
   * previous period depends on the current one, and neither depends on the
   * names — so waiting for them in sequence would spend three round trips of
   * latency to produce one answer.
   */
  const [dimensiones, conteos, conteosAnteriores] = await Promise.all([
    leerDimensiones(),
    agregar(periodo),
    anterior === null ? Promise.resolve(null) : agregar(anterior),
  ]);

  return {
    periodo: aPeriodoDTO(periodo),
    metricas: armarMetricas(conteos, dimensiones),
    comparacion:
      anterior === null || conteosAnteriores === null
        ? null
        : {
            periodo: aPeriodoDTO(anterior),
            metricas: armarMetricas(conteosAnteriores, dimensiones),
          },
  };
}
