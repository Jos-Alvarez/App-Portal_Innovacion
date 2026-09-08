import type { EnlaceDTO } from "@/lib/enlaces/repository";
import type { TipoEnlace } from "@/lib/enlaces/schema";
import type { ProcesadorDTO } from "@/lib/procesadores/repository";
import type { SalidaEsperada } from "@/lib/procesadores/schema";

import {
  describirEntradas,
  describirFormatos,
  describirTamanos,
} from "./etiquetas-procesadores";

/**
 * The one real decision of the Catálogo screen, in a module of its own — the
 * same shape `edicion.ts` and `agrupacion.ts` already use: a pure function that
 * can be tested without mounting anything.
 *
 * TWO TABLES, ONE LIST. `enlace` and `procesador` stay two separate rows in the
 * database, with two schemas and two APIs, and NOTHING here changes that. What
 * is unified is the READING: an administrator thinks about "what the portal
 * offers", not about which table it came from, and asking them to hold two
 * screens in their head to answer one question was the cost.
 *
 * A COLUMN THAT DOES NOT APPLY IS `null`, NOT AN EMPTY STRING. An enlace has no
 * execution contract and a procesador has no web address — those facts are not
 * missing data, they are the shape of each resource, and the table draws them
 * as such rather than as a gap that looks like something failed to load.
 *
 * THE PROCESADOR'S FIGURES ARE ALREADY WRITTEN OUT HERE. `describirEntradas`
 * and `describirTamanos` are the same functions the procesadores screen used,
 * so "Sin tope" still says so in words — ADR 0002 reads NULL as an absent cap,
 * which no blank cell communicates on its own.
 */

/** The three things the portal offers, as one vocabulary. */
export type TipoRecurso = TipoEnlace | "procesador";

/** What every row carries, whichever table it came from. */
interface CamposComunes {
  /** React identity. The two id spaces overlap, so the class is part of it. */
  readonly clave: string;
  readonly id: number;
  readonly nombre: string;
  readonly descripcion: string | null;
  readonly tipo: TipoRecurso;
  readonly activo: boolean;
  /** Enlaces only. */
  readonly url: string | null;
  /** Procesadores only, all five. */
  readonly claveProcesador: string | null;
  readonly formatos: string | null;
  readonly entradas: string | null;
  readonly tamanos: string | null;
  readonly salida: SalidaEsperada | null;
}

/**
 * One row of the unified catalogue.
 *
 * It keeps the DTO it came from, and that is not redundancy: the flattened
 * fields are what the TABLE reads, and the DTO is what the FORM needs when the
 * row is edited. Rebuilding one from the other would mean parsing back the
 * sentences this module just wrote.
 */
export type FilaCatalogo =
  | (CamposComunes & { readonly clase: "enlace"; readonly enlace: EnlaceDTO })
  | (CamposComunes & { readonly clase: "procesador"; readonly procesador: ProcesadorDTO });

function deEnlace(enlace: EnlaceDTO): FilaCatalogo {
  return {
    clase: "enlace",
    enlace,
    clave: `enlace:${enlace.id}`,
    id: enlace.id,
    nombre: enlace.nombre,
    descripcion: enlace.descripcion,
    tipo: enlace.tipo,
    activo: enlace.activo,
    url: enlace.url,
    claveProcesador: null,
    formatos: null,
    entradas: null,
    tamanos: null,
    salida: null,
  };
}

function deProcesador(procesador: ProcesadorDTO): FilaCatalogo {
  return {
    clase: "procesador",
    procesador,
    clave: `procesador:${procesador.id}`,
    id: procesador.id,
    nombre: procesador.nombre,
    descripcion: procesador.descripcion,
    tipo: "procesador",
    activo: procesador.activo,
    url: null,
    claveProcesador: procesador.claveProcesador,
    formatos: describirFormatos(procesador.formatosAceptados),
    entradas: describirEntradas(procesador),
    tamanos: describirTamanos(procesador),
    salida: procesador.salidaEsperada,
  };
}

/**
 * The two catalogues, merged and sorted as one list.
 *
 * BY NAME, NOT BY KIND. Both repositories already order by `nombre`, and
 * keeping that order across the merge is what makes the screen searchable by
 * eye: an administrator looking for "Conciliador de peajes" finds it under the
 * C, without first having to know whether someone registered it as a link or
 * as a processor. `localeCompare` and not `<`, so an accent sorts where a
 * Spanish reader expects it rather than after Z.
 */
export function filasDelCatalogo(
  enlaces: readonly EnlaceDTO[],
  procesadores: readonly ProcesadorDTO[],
): FilaCatalogo[] {
  return [...enlaces.map(deEnlace), ...procesadores.map(deProcesador)].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, "es"),
  );
}
