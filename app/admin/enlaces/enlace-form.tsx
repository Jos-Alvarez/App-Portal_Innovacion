"use client";

import { useId, useState, type FormEvent } from "react";

import { Button } from "@/components/button/button";
import { Input } from "@/components/input/input";
import { errorDeValidacion } from "@/lib/enlaces/errors";
import type { EnlaceDTO } from "@/lib/enlaces/repository";
import {
  DESCRIPCION_MAX,
  NOMBRE_MAX,
  TIPOS_ENLACE,
  URL_MAX,
  crearEnlaceSchema,
  type CrearEnlace,
} from "@/lib/enlaces/schema";

import { ETIQUETA_TIPO } from "./etiquetas";
import styles from "./enlaces.module.css";

/**
 * The alta and the edición, as one inline panel.
 *
 * ONE FORM FOR BOTH, because an edit and a creation collect the same four
 * fields. `crearEnlaceSchema` describes all four as present, which is why it
 * validates the edit too even though a PATCH body may legally be partial.
 *
 * THE SCHEMA IS THE VALIDATION, NOT A COPY OF IT. `safeParse` runs the module
 * the route handler runs, and the message comes from `errorDeValidacion` — the
 * same mapper that writes the API's 400. The sentence shown before the round
 * trip and the one that would have come back from it are the same by
 * construction, and neither is written here.
 *
 * THE ADDRESS FIELD IS NOT type="url" ON PURPOSE: the browser's own rule
 * accepts `javascript:`, which `schema.ts`'s allowlist exists to refuse. Two
 * validators disagreeing about one field is worse than one deciding alone.
 */

export interface EnlaceFormProps {
  /** `null` opens the alta; an enlace opens its edición, already filled in. */
  enlace: EnlaceDTO | null;
  /** Blocks a second submit while the first is still travelling. */
  enviando: boolean;
  /** Receives the schema's OUTPUT — trimmed, normalised, blank collapsed to null. */
  onSubmit: (datos: CrearEnlace) => void;
  /** Leaves the edit without applying it. */
  onCancelar: () => void;
}

/** Which field an issue belongs to, when it belongs to one at all. */
function campoDe(path: PropertyKey | undefined): string {
  return typeof path === "string" ? path : "";
}

export function EnlaceForm({ enlace, enviando, onSubmit, onCancelar }: EnlaceFormProps) {
  const editando = enlace !== null;
  const tipoId = useId();

  /*
   * Seeded from the enlace and never synchronised afterwards: the owner
   * remounts this form with a `key` when the row changes, which is React's own
   * way of resetting state and costs no effect that could fire out of order.
   */
  const [nombre, setNombre] = useState(enlace?.nombre ?? "");
  const [descripcion, setDescripcion] = useState(enlace?.descripcion ?? "");
  const [url, setUrl] = useState(enlace?.url ?? "");
  const [tipo, setTipo] = useState<string>(enlace?.tipo ?? TIPOS_ENLACE[0]);
  const [error, setError] = useState<{ campo: string; mensaje: string } | null>(null);

  function errorDe(campo: string): string | undefined {
    return error?.campo === campo ? error.mensaje : undefined;
  }

  function enviar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const datos = crearEnlaceSchema.safeParse({ nombre, descripcion, url, tipo });

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

  /* Anything no field owns still has to be readable somewhere. */
  const errorGeneral =
    error !== null && !["nombre", "descripcion", "url"].includes(error.campo) ? error.mensaje : null;

  return (
    <form className={styles.panel} onSubmit={enviar} noValidate>
      <h2 className={styles.panelTitle}>{editando ? "Editar enlace" : "Nuevo enlace"}</h2>

      <div className={styles.fields}>
        <Input
          label="Nombre"
          value={nombre}
          maxLength={NOMBRE_MAX}
          error={errorDe("nombre")}
          onChange={(event) => setNombre(event.target.value)}
        />

        <Input
          label="Dirección web"
          type="text"
          inputMode="url"
          placeholder="https://"
          value={url}
          maxLength={URL_MAX}
          error={errorDe("url")}
          onChange={(event) => setUrl(event.target.value)}
        />

        <div className={styles.field}>
          <label className={styles.label} htmlFor={tipoId}>
            Tipo
          </label>
          <select
            id={tipoId}
            className={styles.select}
            value={tipo}
            onChange={(event) => setTipo(event.target.value)}
          >
            {TIPOS_ENLACE.map((valor) => (
              <option key={valor} value={valor}>
                {ETIQUETA_TIPO[valor]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Input
        label="Descripción (opcional)"
        value={descripcion}
        maxLength={DESCRIPCION_MAX}
        error={errorDe("descripcion")}
        onChange={(event) => setDescripcion(event.target.value)}
      />

      {errorGeneral ? (
        <p className={styles.alerta} role="alert">
          {errorGeneral}
        </p>
      ) : null}

      <div className={styles.acciones}>
        <Button type="submit" variant="primary" disabled={enviando}>
          {editando ? "Guardar cambios" : "Agregar enlace"}
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
