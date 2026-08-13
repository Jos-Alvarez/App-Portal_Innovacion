"use client";

import { useId, useState, type FormEvent } from "react";
import type { ZodError } from "zod";

import { Button } from "@/components/button/button";
import { Input } from "@/components/input/input";
import { Switch } from "@/components/switch/switch";
import { errorDeValidacion } from "@/lib/procesadores/errors";
import type { ProcesadorDTO } from "@/lib/procesadores/repository";
import {
  CLAVE_MAX,
  DESCRIPCION_MAX,
  FORMATOS_MAX,
  NOMBRE_MAX,
  SALIDAS_ESPERADAS,
  actualizarProcesadorSchema,
  afectaAlContrato,
  contratoProcesadorSchema,
  crearProcesadorSchema,
  fusionarContrato,
  normalizarFormatos,
  type ActualizarProcesador,
  type CrearProcesador,
} from "@/lib/procesadores/schema";

import { aEntero, bytesAMegabytes, cambiosDelProcesador, megabytesABytes } from "./edicion";
import { ETIQUETA_SALIDA } from "./etiquetas";
import styles from "./procesadores.module.css";

/**
 * The alta and the edición of one procesador, as one inline panel.
 *
 * THE SCHEMAS ARE THE VALIDATION, NOT A COPY OF THEM, and the pipeline below is
 * the route handlers' own, run one round trip earlier:
 *
 *   · An ALTA carries the whole execution contract at once, so
 *     `crearProcesadorSchema` settles ADR 0002's cross-field rules by itself —
 *     exactly what `POST /api/procesadores` does.
 *   · An EDICIÓN is a fragment. `actualizarProcesadorSchema` judges each field
 *     on its own and deliberately carries no cross-field rules, so the change
 *     set is merged into the row it is being applied to and the RESULT is
 *     judged with `contratoProcesadorSchema` — exactly what
 *     `PATCH /api/procesadores/{id}` does after reading the stored contract.
 *     The form already holds that row, so the administrator sees the same
 *     violation the server would raise, before the request leaves.
 *
 * Every message comes from `errorDeValidacion`, the mapper that writes the
 * API's own 400, and lands on the field the issue is attributed to. That
 * attribution is the whole reason `schema.ts` uses `.superRefine` instead of
 * `.refine`: "el máximo no puede ser menor que el mínimo" belongs beside the
 * maximum, not in a banner at the bottom of the panel.
 *
 * THE SIZE BOXES HOLD MEGABYTES; THE COLUMNS HOLD BYTES. `edicion.ts` owns the
 * conversion and explains why the PATCH-only-what-changed rule is what makes it
 * safe.
 *
 * THE NUMERIC BOXES ARE type="text" ON PURPOSE, like the address field of the
 * enlaces form: the browser's own number control disagrees with these schemas
 * about a decimal comma, an empty value and a leading sign, and two validators
 * disagreeing about one field is worse than one deciding alone.
 */

/**
 * ADR 0006: the key is validated for FORMAT and never for existence, and the
 * module it names does not exist yet — items #9 and #10 build it. Saying so is
 * the honest thing to put under the box: a hint that implied the portal had
 * checked would make a typo look like a working configuration.
 */
const PISTA_CLAVE =
  "Es el nombre con el que el servicio de procesamiento encuentra el código de este procesador: " +
  "solo minúsculas, números y guiones, empezando por una letra — por ejemplo, maestro-excel. " +
  "El portal no comprueba que ese código exista, así que escríbela igual que quien lo programó.";

/**
 * ADR 0002: `salida_esperada` is "declarativo para la UI", and the pipeline
 * packages the result by the real number of files the module returns — "una
 * discrepancia entre lo declarado y lo real no rompe la ejecución". So this is
 * an announcement, and the copy says so instead of pretending it is a setting.
 */
const PISTA_SALIDA =
  "Es lo que la pantalla le adelanta al colaborador antes de que suba sus archivos. " +
  "No decide nada: el resultado se arma con los archivos que el procesador devuelva, " +
  "y si no coincide con lo anunciado la ejecución igual funciona.";

const PISTA_FORMATOS = "Sepáralos con comas, sin repetirlos — por ejemplo: xlsx, csv.";

const SIN_TOPE_ENTRADAS = "Sin tope: admite todos los archivos que el colaborador suba.";
const SIN_TOPE_TAMANO = "Sin tope: solo se aplica el límite de cada archivo.";

/**
 * The fields whose own box can carry the message. The two caps are missing on
 * purpose — their input is only on screen while the cap is switched on, so they
 * are decided at render time; `salidaEsperada` is missing because a <select>
 * cannot hold a value outside the vocabulary it was built from.
 */
const CAMPOS_CON_MENSAJE = [
  "nombre",
  "descripcion",
  "claveProcesador",
  "formatosAceptados",
  "tamanoMax",
  "entradasMin",
];

export interface ProcesadorFormProps {
  /** `null` opens the alta; a procesador opens its edición, already filled in. */
  procesador: ProcesadorDTO | null;
  /** Blocks a second submit while the first is still travelling. */
  enviando: boolean;
  /**
   * Receives the schema's OUTPUT: the whole contract for an alta, and only the
   * fields that moved for an edición.
   */
  onSubmit: (datos: CrearProcesador | ActualizarProcesador) => void;
  /** Leaves the edit without applying it. */
  onCancelar: () => void;
}

interface ErrorDeCampo {
  campo: string;
  mensaje: string;
}

/** Which field an issue belongs to, when it belongs to one at all. */
function campoDe(path: PropertyKey | undefined): string {
  return typeof path === "string" ? path : "";
}

/** A rejected parse, as this form shows it: one sentence, on one field. */
function errorDe(error: ZodError): ErrorDeCampo {
  return {
    campo: campoDe(error.issues[0]?.path?.[0]),
    mensaje: errorDeValidacion(error).error.mensaje,
  };
}

export function ProcesadorForm({
  procesador,
  enviando,
  onSubmit,
  onCancelar,
}: ProcesadorFormProps) {
  const editando = procesador !== null;
  const salidaId = useId();

  /*
   * Seeded from the row and never synchronised afterwards: the owner remounts
   * this form with a `key` when the row changes, which is React's own way of
   * resetting state and costs no effect that could fire out of order.
   */
  const [nombre, setNombre] = useState(procesador?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(procesador?.descripcion ?? "");
  const [clave, setClave] = useState(procesador?.claveProcesador ?? "");
  const [formatos, setFormatos] = useState(procesador?.formatosAceptados ?? "");
  const [tamanoMax, setTamanoMax] = useState(
    procesador === null ? "" : bytesAMegabytes(procesador.tamanoMax),
  );
  /* ADR 0002: "entradas_min (int, ≥ 1, por defecto 1)". */
  const [entradasMin, setEntradasMin] = useState(String(procesador?.entradasMin ?? 1));

  /*
   * The caps are two facts, not one: whether there is a cap at all, and what it
   * is. A single text box conflates them — an empty box says nothing about
   * whether the absence was meant — so the switch carries the first and the
   * input appears only for the second.
   */
  const [conTopeEntradas, setConTopeEntradas] = useState(
    procesador !== null && procesador.entradasMax !== null,
  );
  const [entradasMax, setEntradasMax] = useState(String(procesador?.entradasMax ?? ""));
  const [conTopeTamano, setConTopeTamano] = useState(
    procesador !== null && procesador.tamanoMaxTotal !== null,
  );
  const [tamanoMaxTotal, setTamanoMaxTotal] = useState(
    procesador?.tamanoMaxTotal == null ? "" : bytesAMegabytes(procesador.tamanoMaxTotal),
  );

  const [salida, setSalida] = useState<string>(procesador?.salidaEsperada ?? SALIDAS_ESPERADAS[0]);
  const [error, setError] = useState<ErrorDeCampo | null>(null);

  function mensajeDe(campo: string): string | undefined {
    return error?.campo === campo ? error.mensaje : undefined;
  }

  /** What the boxes currently say, in the units and shapes the schemas expect. */
  function valores() {
    return {
      nombre,
      descripcion,
      claveProcesador: clave,
      formatosAceptados: formatos,
      tamanoMax: megabytesABytes(tamanoMax),
      entradasMin: aEntero(entradasMin),
      /* A switched-off cap is a real `null`, never an omission. */
      entradasMax: conTopeEntradas ? aEntero(entradasMax) : null,
      tamanoMaxTotal: conTopeTamano ? megabytesABytes(tamanoMaxTotal) : null,
      salidaEsperada: salida,
    };
  }

  /** The alta: one parse, cross-field rules included. */
  function enviarAlta() {
    const datos = crearProcesadorSchema.safeParse(valores());

    if (!datos.success) {
      setError(errorDe(datos.error));
      return;
    }

    setError(null);
    onSubmit(datos.data);
  }

  /** The edición: per-field parse, change set, then the merged contract. */
  function enviarEdicion(actual: ProcesadorDTO) {
    const datos = actualizarProcesadorSchema.safeParse(valores());

    if (!datos.success) {
      setError(errorDe(datos.error));
      return;
    }

    const cambios = cambiosDelProcesador(actual, datos.data);

    if (Object.keys(cambios).length === 0) {
      /*
       * The same refusal the API answers to an empty PATCH, taken from the API's
       * own schema rather than written again here — and the request is spared.
       */
      const vacio = actualizarProcesadorSchema.safeParse({});
      if (!vacio.success) setError(errorDe(vacio.error));
      return;
    }

    if (afectaAlContrato(cambios)) {
      const fusionado = contratoProcesadorSchema.safeParse(fusionarContrato(actual, cambios));

      if (!fusionado.success) {
        setError(errorDe(fusionado.error));
        return;
      }
    }

    setError(null);
    onSubmit(cambios);
  }

  function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (procesador === null) {
      enviarAlta();
      return;
    }

    enviarEdicion(procesador);
  }

  const listaFormatos = normalizarFormatos(formatos);

  /*
   * An issue nobody's box can show still has to be readable somewhere: the "sin
   * cambios" refusal owns no field at all, and a cap's own message cannot be
   * rendered while its input is hidden.
   */
  const conCampoVisible =
    error !== null &&
    (CAMPOS_CON_MENSAJE.includes(error.campo) ||
      (error.campo === "entradasMax" && conTopeEntradas) ||
      (error.campo === "tamanoMaxTotal" && conTopeTamano));
  const errorGeneral = error !== null && !conCampoVisible ? error.mensaje : null;

  return (
    <form className={styles.panel} onSubmit={enviar} noValidate>
      <h2 className={styles.panelTitle}>
        {editando ? "Editar procesador" : "Nuevo procesador"}
      </h2>

      <div className={styles.fields}>
        <Input
          label="Nombre"
          value={nombre}
          maxLength={NOMBRE_MAX}
          error={mensajeDe("nombre")}
          onChange={(event) => setNombre(event.target.value)}
        />

        <div className={styles.campo}>
          <Input
            label="Clave del procesador"
            value={clave}
            maxLength={CLAVE_MAX}
            placeholder="maestro-excel"
            error={mensajeDe("claveProcesador")}
            onChange={(event) => setClave(event.target.value)}
          />
          <p className={styles.pista}>{PISTA_CLAVE}</p>
        </div>
      </div>

      <Input
        label="Descripción (opcional)"
        value={descripcion}
        maxLength={DESCRIPCION_MAX}
        error={mensajeDe("descripcion")}
        onChange={(event) => setDescripcion(event.target.value)}
      />

      <div className={styles.fields}>
        <div className={styles.campo}>
          <Input
            label="Formatos aceptados"
            value={formatos}
            maxLength={FORMATOS_MAX}
            placeholder="xlsx, csv"
            error={mensajeDe("formatosAceptados")}
            onChange={(event) => setFormatos(event.target.value)}
          />
          <p className={styles.pista}>
            {listaFormatos.length === 0
              ? PISTA_FORMATOS
              : `Se guardarán como: ${listaFormatos.join(", ")}`}
          </p>
        </div>

        <Input
          label="Tamaño máximo por archivo (MB)"
          inputMode="decimal"
          value={tamanoMax}
          placeholder="25"
          error={mensajeDe("tamanoMax")}
          onChange={(event) => setTamanoMax(event.target.value)}
        />

        <Input
          label="Mínimo de archivos por ejecución"
          inputMode="numeric"
          value={entradasMin}
          error={mensajeDe("entradasMin")}
          onChange={(event) => setEntradasMin(event.target.value)}
        />
      </div>

      <div className={styles.topes}>
        <div className={styles.tope}>
          <div className={styles.topeCabecera}>
            <Switch
              label="Poner un tope al número de archivos"
              checked={conTopeEntradas}
              onCheckedChange={setConTopeEntradas}
              disabled={enviando}
            />
            <span className={styles.topeTitulo}>Tope de archivos por ejecución</span>
          </div>

          {conTopeEntradas ? (
            <Input
              label="Máximo de archivos"
              inputMode="numeric"
              value={entradasMax}
              error={mensajeDe("entradasMax")}
              onChange={(event) => setEntradasMax(event.target.value)}
            />
          ) : (
            <p className={styles.pista}>{SIN_TOPE_ENTRADAS}</p>
          )}
        </div>

        <div className={styles.tope}>
          <div className={styles.topeCabecera}>
            <Switch
              label="Poner un tope al tamaño del conjunto"
              checked={conTopeTamano}
              onCheckedChange={setConTopeTamano}
              disabled={enviando}
            />
            <span className={styles.topeTitulo}>Tope de tamaño del conjunto</span>
          </div>

          {conTopeTamano ? (
            <Input
              label="Tamaño máximo del conjunto (MB)"
              inputMode="decimal"
              value={tamanoMaxTotal}
              error={mensajeDe("tamanoMaxTotal")}
              onChange={(event) => setTamanoMaxTotal(event.target.value)}
            />
          ) : (
            <p className={styles.pista}>{SIN_TOPE_TAMANO}</p>
          )}
        </div>
      </div>

      <div className={styles.campo}>
        <label className={styles.label} htmlFor={salidaId}>
          Resultado que se le anuncia al colaborador
        </label>
        <select
          id={salidaId}
          className={styles.select}
          value={salida}
          onChange={(event) => setSalida(event.target.value)}
        >
          {SALIDAS_ESPERADAS.map((valor) => (
            <option key={valor} value={valor}>
              {ETIQUETA_SALIDA[valor]}
            </option>
          ))}
        </select>
        <p className={styles.pista}>{PISTA_SALIDA}</p>
      </div>

      {errorGeneral ? (
        <p className={styles.alerta} role="alert">
          {errorGeneral}
        </p>
      ) : null}

      <div className={styles.acciones}>
        <Button type="submit" variant="primary" disabled={enviando}>
          {editando ? "Guardar cambios" : "Agregar procesador"}
        </Button>
        {editando ? (
          <Button variant="secondary" disabled={enviando} onClick={onCancelar}>
            Cancelar
          </Button>
        ) : null}
      </div>
    </form>
  );
}
