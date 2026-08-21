import { type ApiFailure, apiFailure } from "@/lib/api/errors";
import type { TipoEvento } from "@/lib/eventos/repository";
import { mensajeDeError } from "@/lib/procesadores/mensajes";
import type {
  MotivoInfraestructura,
  ResultadoEjecucion,
  TipoErrorServicio,
} from "@/lib/procesadores/resultado";

/**
 * What the portal ANSWERS about a failed execution, and what it RECORDS.
 *
 * The sentences themselves live in `mensajes.ts`, which the upload form shares;
 * this module is the half that only the server can have — HTTP statuses, stable
 * `codigo` handles, and the `evento_uso` mapping.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  EVERY TYPED ERROR IS RECORDED, AND THE MAPPING IS ONE TO ONE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `evento_uso.tipo_evento` is closed at the DATABASE, not by convention — a
 * value outside its CHECK constraint is rejected by SQL Server, not quietly
 * stored. It now carries a member for each of the service's five typed errors:
 *
 *     ALTER TABLE [dbo].[evento_uso] ADD CONSTRAINT [evento_uso_tipo_evento_check]
 *       CHECK ([tipo_evento] IN ('apertura', 'ejecucion', 'error_formato',
 *                                'error_tamano', 'error_contenido',
 *                                'error_cantidad', 'error_clave_inexistente'));
 *
 * THAT TOTALITY IS THE DESIGN, AND IT WAS BOUGHT. ADR 0006 names the mapping
 * for only three — "`error_formato`, `error_tamano` o `error_contenido` según
 * el error tipificado que reciba" — and is silent about `cantidad` and
 * `clave_inexistente`. This item shipped first with that silence honoured:
 * those two recorded nothing. That was wrong, and the migration
 * `20260821143000_evento_uso_errores_tipificados_completos` fixed it.
 *
 * Both alternatives to a total mapping are bad, and it is worth naming which
 * kind of bad each one is:
 *
 *   * Filing an error under the nearest-looking member reports a problem that
 *     never happened. `lib/eventos/repository.ts` explains why that is the
 *     worst bug this table can have: nothing downstream can detect it.
 *   * Recording NOTHING looks conservative and is not. A procesador whose
 *     `clave_procesador` matches no module in the registry produces no events
 *     at all — people try it, fail, and stop trying. In item #19 that is
 *     indistinguishable from a procesador nobody wants, and an administrator
 *     acting on it would retire the resource people were failing to use.
 *
 * With a member per error the choice does not arise, and this map has no `null`
 * branch left to reason about.
 */

/**
 * One event per typed error, with no gaps.
 *
 * A `Record` over the full union rather than a `switch`, so adding a sixth type
 * to `TipoErrorServicio` is a compile error here instead of a silent
 * `undefined` at runtime — and the type is `TipoEvento`, not `TipoEvento |
 * null`, so "record nothing" is no longer expressible without changing this
 * signature and reading the comment above.
 */
export const EVENTO_POR_TIPO: Record<TipoErrorServicio, TipoEvento> = {
  formato: "error_formato",
  tamano: "error_tamano",
  contenido: "error_contenido",
  cantidad: "error_cantidad",
  clave_inexistente: "error_clave_inexistente",
};

const HTTP_POR_TIPO: Record<TipoErrorServicio, { codigo: string; status: number }> = {
  /*
   * 422 AND NOT 400 for the four the collaborator can act on. The request was
   * perfectly well formed — it parsed, it authorised, it reached the service —
   * and what failed is the content of the files. That is the distinction 422
   * exists to make, and it is the status the service itself answers, so the two
   * hops agree instead of translating.
   */
  formato: { codigo: "formato_no_permitido", status: 422 },
  tamano: { codigo: "tamano_excedido", status: 422 },
  contenido: { codigo: "contenido_invalido", status: 422 },
  cantidad: { codigo: "cantidad_invalida", status: 422 },
  /*
   * 502 and not 500: the portal is fine and did its job; the thing it depends
   * on is not configured to answer this. The distinction matters to whoever
   * reads the portal's logs looking for the portal's own faults.
   */
  clave_inexistente: { codigo: "procesador_no_disponible", status: 502 },
};

/**
 * The failures that are not about the files.
 *
 * ALL SEVEN ARE DISTINCT SENTENCES, and the temptation to collapse them into
 * one "algo salió mal" is worth resisting once, here, in writing. The reader's
 * next action differs: wait and retry (saturado), retry now (inalcanzable),
 * send something smaller (expirado), or stop trying and report it
 * (no_autenticado, peticion_invalida). A single message would make three of
 * those four readers do the wrong thing.
 *
 * None of them blames the collaborator, because none of them is their doing.
 */
const INFRAESTRUCTURA: Record<MotivoInfraestructura, ApiFailure> = {
  no_autenticado: apiFailure(
    502,
    "servicio_no_autenticado",
    "El portal no pudo identificarse ante el servicio de procesamiento, así que no ejecutamos " +
      "nada. No es algo que puedas resolver: avisa al Área de Innovación.",
  ),
  peticion_invalida: apiFailure(
    502,
    "peticion_no_aceptada",
    "El servicio de procesamiento no pudo leer el envío que hizo el portal. Vuelve a intentarlo; " +
      "si sigue igual, avisa al Área de Innovación.",
  ),
  saturado: apiFailure(
    503,
    "servicio_saturado",
    "El servicio de procesamiento está atendiendo varias ejecuciones en este momento. Espera unos " +
      "segundos y vuelve a intentarlo.",
  ),
  expirado: apiFailure(
    504,
    "procesamiento_expirado",
    "El procesamiento tardó más de dos minutos, así que lo cortamos. Prueba con archivos más " +
      "chicos; si sigue igual, avisa al Área de Innovación.",
  ),
  fallo_interno: apiFailure(
    502,
    "fallo_del_servicio",
    "El servicio de procesamiento falló mientras trabajaba con tus archivos. Vuelve a intentarlo; " +
      "si sigue igual, avisa al Área de Innovación.",
  ),
  inalcanzable: apiFailure(
    502,
    "servicio_inalcanzable",
    "No pudimos conectar con el servicio de procesamiento. Vuelve a intentarlo; si sigue igual, " +
      "avisa al Área de Innovación.",
  ),
  respuesta_inesperada: apiFailure(
    502,
    "respuesta_inesperada",
    "El servicio de procesamiento respondió algo que el portal no supo interpretar, así que no te " +
      "entregamos un archivo. Avisa al Área de Innovación.",
  ),
};

/**
 * What the portal does about a failed execution: what it answers, and what — if
 * anything — it records.
 *
 * The two travel together because they are one decision made from one input,
 * and separating them is how they drift: a new branch that adds a message and
 * forgets the event, or files an event under a type whose message says
 * something else.
 */
export interface DesenlaceFallido {
  readonly falla: ApiFailure;
  /**
   * `null` means no row is written, and after the mapping above became total
   * there is exactly ONE situation left that produces it: an infrastructure
   * failure.
   *
   * That is not the gap the typed errors had. A refused token, a saturated
   * service, a dropped connection or a crashed worker are failures of the
   * plumbing between the portal and the service — the service's own docs put
   * its four non-typed failures deliberately outside ADR 0014's vocabulary for
   * the same reason. None of them says anything about a procesador's
   * configuration or about the files someone chose, so recording them as usage
   * of that procesador would put infrastructure noise into a table item #19
   * reads as a history of what people did. They belong in the log and in
   * whatever monitors the service.
   */
  readonly evento: TipoEvento | null;
}

/**
 * Maps an interpreted result to the portal's answer.
 *
 * Success is NOT handled here: it has no message and its event is always
 * `ejecucion`, so the route writes that one directly and this function is typed
 * to refuse it — passing a success is a compile error rather than a runtime
 * surprise.
 */
export function desenlaceDeFallo(
  resultado: Exclude<ResultadoEjecucion, { clase: "exito" }>,
): DesenlaceFallido {
  if (resultado.clase === "infraestructura") {
    return { falla: INFRAESTRUCTURA[resultado.motivo], evento: null };
  }

  const { codigo, status } = HTTP_POR_TIPO[resultado.tipo];

  return {
    falla: apiFailure(status, codigo, mensajeDeError(resultado.tipo, resultado.contexto)),
    evento: EVENTO_POR_TIPO[resultado.tipo],
  };
}

/**
 * The request never got as far as the service, because the browser did not send
 * a multipart body.
 *
 * A 400 and not a 422: this one IS malformed. It is unreachable from the
 * portal's own upload form, so the message is written for whoever is calling
 * the endpoint by hand rather than for a collaborator.
 */
export function envioInvalido(): ApiFailure {
  return apiFailure(
    400,
    "envio_invalido",
    "No recibimos ningún archivo para procesar. Vuelve al portal y envíalos desde la pantalla del " +
      "procesador.",
  );
}

/**
 * The guard allowed the assignment and the row was gone by the time we read it
 * — the same race `app/api/enlaces/[id]/abrir/route.ts` handles for an enlace.
 */
export function procesadorNoDisponible(): ApiFailure {
  return apiFailure(
    404,
    "procesador_no_encontrado",
    "Ese procesador ya no está disponible. Actualiza tu panel para ver lo que tienes asignado.",
  );
}
