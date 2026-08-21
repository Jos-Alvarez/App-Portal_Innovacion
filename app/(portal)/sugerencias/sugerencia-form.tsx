"use client";

import { useId, useState, type FormEvent } from "react";

import { Button } from "@/components/button/button";
import { Input } from "@/components/input/input";
import { errorDeValidacion } from "@/lib/sugerencias/errors";
import {
  AREA_DESTINO_MAX,
  crearSugerenciaSchema,
  type CrearSugerencia,
  DESCRIPCION_MAX,
  TITULO_MAX,
} from "@/lib/sugerencias/schema";

import styles from "./sugerencias.module.css";

/**
 * El formulario de envío — the half of item #13 that writes.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  IT VALIDATES WITH THE SERVER'S OWN SCHEMA, NOT WITH A COPY OF ITS RULES
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `crearSugerenciaSchema` is the module `POST /api/sugerencias` parses with, and
 * `errorDeValidacion` is the module that route turns a rejection into. Both are
 * imported here rather than reimplemented, so the form cannot accept something
 * the API would refuse, and — the direction that actually annoys people — cannot
 * refuse something the API would have taken.
 *
 * The local check is a courtesy, never a permission: everything it does, the
 * route does again on a request it does not trust. What it buys is that an empty
 * title is answered instantly and in the field, instead of after a round trip.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  UNCONTROLLED SUBMISSION, CONTROLLED FIELDS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `noValidate` turns off the browser's own bubbles for the same reason the
 * catalogue form does: they are the browser's wording, in the browser's
 * language, and DESIGN.md asks for "copys en español, directos". The `required`
 * attribute is therefore absent too — an attribute whose only effect is a
 * message we suppress is a lie in the markup.
 *
 * `maxLength` IS set, and it is not the same kind of claim. It stops a paste
 * from silently exceeding a limit the reader cannot see, and it agrees with the
 * schema because it reads the same constants.
 */

export interface SugerenciaFormProps {
  /**
   * The author's own area, as Entra ID reported it — the default destination.
   * The empty string means Entra ID reported no department, and the field simply
   * opens empty.
   */
  areaPropia: string;
  /** True while a send is in flight; the submit button says so and refuses. */
  enviando: boolean;
  onSubmit: (datos: CrearSugerencia) => void;
}

const CAMPOS_CON_ERROR_PROPIO = ["titulo", "descripcion", "areaDestino"];

function campoDe(path: PropertyKey | undefined): string {
  return typeof path === "string" ? path : "";
}

export function SugerenciaForm({ areaPropia, enviando, onSubmit }: SugerenciaFormProps) {
  const descripcionId = useId();

  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [areaDestino, setAreaDestino] = useState(areaPropia);
  const [error, setError] = useState<{ campo: string; mensaje: string } | null>(null);

  function errorDe(campo: string): string | undefined {
    return error?.campo === campo ? error.mensaje : undefined;
  }

  function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const datos = crearSugerenciaSchema.safeParse({ titulo, descripcion, areaDestino });

    if (!datos.success) {
      setError({
        campo: campoDe(datos.error.issues[0]?.path?.[0]),
        mensaje: errorDeValidacion(datos.error).error.mensaje,
      });
      return;
    }

    setError(null);
    onSubmit(datos.data);
  }

  /**
   * The parent clears the fields by remounting this component after a
   * successful send (see the `key` in `buzon.tsx`), so nothing here has to
   * reset state — and a failed send keeps everything the reader typed, which is
   * the whole reason the reset is not done here.
   */
  const errorGeneral =
    error !== null && !CAMPOS_CON_ERROR_PROPIO.includes(error.campo) ? error.mensaje : null;

  return (
    <form className={styles.panel} onSubmit={enviar} noValidate>
      <h2 className={styles.panelTitle}>Nueva sugerencia</h2>

      <div className={styles.fields}>
        <Input
          label="Título"
          value={titulo}
          maxLength={TITULO_MAX}
          placeholder="Resume tu idea en una línea"
          error={errorDe("titulo")}
          onChange={(event) => setTitulo(event.target.value)}
        />

        <Input
          label="Área a la que va dirigida"
          value={areaDestino}
          maxLength={AREA_DESTINO_MAX}
          placeholder="Tu área u otra área"
          error={errorDe("areaDestino")}
          onChange={(event) => setAreaDestino(event.target.value)}
        />
      </div>

      {/*
        * A <textarea> and not the shared Input: an idea is a paragraph, and a
        * single-line field that scrolls sideways hides everything the reader
        * already wrote just as they are deciding whether it says what they mean.
        * The components layer does not ship one, so this is dressed with the
        * very treatment DESIGN.md prescribes for inputs — the same thing the
        * catalogue screen does with its <select>.
        */}
      <div className={styles.field}>
        <label className={styles.label} htmlFor={descripcionId}>
          Tu idea
        </label>
        <textarea
          id={descripcionId}
          className={`${styles.textarea} ${errorDe("descripcion") ? styles.textareaInvalid : ""}`}
          value={descripcion}
          rows={5}
          maxLength={DESCRIPCION_MAX}
          placeholder="¿Qué propones y qué problema resuelve? Cuanto más concreto, mejor."
          aria-invalid={errorDe("descripcion") ? true : undefined}
          aria-describedby={errorDe("descripcion") ? `${descripcionId}-error` : undefined}
          onChange={(event) => setDescripcion(event.target.value)}
        />
        {errorDe("descripcion") ? (
          <p id={`${descripcionId}-error`} className={styles.errorCampo} role="alert">
            {errorDe("descripcion")}
          </p>
        ) : null}
      </div>

      {errorGeneral ? (
        <p className={styles.alerta} role="alert">
          {errorGeneral}
        </p>
      ) : null}

      <div className={styles.acciones}>
        {/*
          * The one primary action of this view — DESIGN.md: "una acción primaria
          * (navy) por vista". Everything else on the screen is a link back or a
          * list.
          *
          * Disabled while a send is in flight, and the label says why. DESIGN.md:
          * "Deshabilitado: opacity .5 + cursor not-allowed (nunca ocultarlo)".
          */}
        <Button type="submit" variant="primary" disabled={enviando}>
          {enviando ? "Enviando…" : "Enviar sugerencia"}
        </Button>
      </div>
    </form>
  );
}
