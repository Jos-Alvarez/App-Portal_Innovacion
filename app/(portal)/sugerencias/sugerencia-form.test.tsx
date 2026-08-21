import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AREA_DESTINO_MAX, DESCRIPCION_MAX, TITULO_MAX } from "@/lib/sugerencias/schema";

import { SugerenciaForm } from "./sugerencia-form";

/**
 * El formulario de envío.
 *
 * What is asserted here is the form's OWN behaviour: that it refuses locally
 * what the API would refuse, that it refuses it with the API's own sentence, and
 * that it hands the parsed data up rather than the raw fields. The endpoint's
 * rules are not re-tested — `app/api/sugerencias/route.test.ts` owns those, and
 * asserting them through a rendered form would only assert the schema twice.
 */

const onSubmit = vi.fn();

function montar(props: Partial<React.ComponentProps<typeof SugerenciaForm>> = {}) {
  return render(
    <SugerenciaForm areaPropia="Operaciones" enviando={false} onSubmit={onSubmit} {...props} />,
  );
}

const campoTitulo = () => screen.getByLabelText("Título");
const campoArea = () => screen.getByLabelText("Área a la que va dirigida");
const campoIdea = () => screen.getByLabelText("Tu idea");
const botonEnviar = () => screen.getByRole("button", { name: /enviar sugerencia/i });

beforeEach(() => {
  onSubmit.mockReset();
});

describe("lo que el formulario ofrece", () => {
  it("pide título, área e idea, y nada más", () => {
    montar();

    expect(campoTitulo()).toBeInTheDocument();
    expect(campoArea()).toBeInTheDocument();
    expect(campoIdea()).toBeInTheDocument();
  });

  /**
   * El PRD deja mandar una sugerencia "para sí mismo, su área u otra área", y
   * los dos primeros casos son el área propia. Prellenar no arregla la deriva de
   * escritura — "Peajes", "peajes", "Área de Peajes" —, solo le quita la ocasión
   * más frecuente de aparecer.
   */
  it("abre con el área propia ya escrita", () => {
    montar();

    expect(campoArea()).toHaveValue("Operaciones");
  });

  it("abre vacío si Entra ID no reportó departamento", () => {
    montar({ areaPropia: "" });

    expect(campoArea()).toHaveValue("");
  });

  /** El área es libre: un área sin nadie registrado todavía es un destino legal. */
  it("deja escribir otra área encima de la propia", async () => {
    const usuario = userEvent.setup();
    montar();

    await usuario.clear(campoArea());
    await usuario.type(campoArea(), "Sistemas");

    expect(campoArea()).toHaveValue("Sistemas");
  });

  /**
   * Un <textarea> y no el Input compartido: una idea es un párrafo, y un campo
   * de una línea que se desplaza de costado esconde todo lo que la persona
   * escribió justo cuando está decidiendo si dice lo que quiere decir.
   */
  it("da un área de texto de varias líneas para la idea", () => {
    montar();

    expect(campoIdea().tagName).toBe("TEXTAREA");
  });

  it("acota cada campo en el navegador con el mismo tope que el esquema", () => {
    montar();

    expect(campoTitulo()).toHaveAttribute("maxlength", String(TITULO_MAX));
    expect(campoArea()).toHaveAttribute("maxlength", String(AREA_DESTINO_MAX));
    expect(campoIdea()).toHaveAttribute("maxlength", String(DESCRIPCION_MAX));
  });

  /**
   * DESIGN.md: "una acción primaria (navy) por vista". Esta pantalla gasta la
   * suya aquí; todo lo demás es un enlace de vuelta o una lista.
   */
  it("usa su única acción primaria en el botón de enviar", () => {
    montar();

    expect(botonEnviar()).toHaveClass("lx-btn-primary");
  });
});

describe("la validación local", () => {
  it("envía los datos ya parseados cuando el formulario está completo", async () => {
    const usuario = userEvent.setup();
    montar();

    await usuario.type(campoTitulo(), "  Tablero de peajes  ");
    await usuario.type(campoIdea(), "Ver el flujo por caseta.");
    await usuario.click(botonEnviar());

    /* Parseado, no crudo: los espacios ya vienen recortados por el esquema. */
    expect(onSubmit).toHaveBeenCalledWith({
      titulo: "Tablero de peajes",
      descripcion: "Ver el flujo por caseta.",
      areaDestino: "Operaciones",
    });
  });

  it.each([
    ["Título", "Tu idea"],
    ["Tu idea", "Título"],
  ])("no llama al servidor si «%s» está vacío", async (vacio, lleno) => {
    const usuario = userEvent.setup();
    montar();

    await usuario.type(screen.getByLabelText(lleno), "Algo");
    await usuario.click(botonEnviar());

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(vacio).toBeTruthy();
  });

  it("no llama al servidor si el área quedó vacía", async () => {
    const usuario = userEvent.setup();
    montar({ areaPropia: "" });

    await usuario.type(campoTitulo(), "Tablero");
    await usuario.type(campoIdea(), "Una idea");
    await usuario.click(botonEnviar());

    expect(onSubmit).not.toHaveBeenCalled();
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  EL MENSAJE LOCAL ES EL MISMO QUE EL DEL SERVIDOR
   * ══════════════════════════════════════════════════════════════════════════
   *
   * El formulario importa `crearSugerenciaSchema` y `errorDeValidacion`, los dos
   * módulos con los que `POST /api/sugerencias` parsea y contesta. Así no puede
   * aceptar algo que la API rechazaría ni — la dirección que de verdad molesta —
   * rechazar algo que la API habría tomado, y quien lee ve una sola frase para un
   * mismo problema, la detecte quien la detecte.
   */
  it("muestra la misma frase que contestaría la API", async () => {
    const usuario = userEvent.setup();
    montar();

    await usuario.type(campoIdea(), "Una idea sin título");
    await usuario.click(botonEnviar());

    expect(screen.getByRole("alert")).toHaveTextContent(
      `Escribe un título para tu sugerencia, de hasta ${TITULO_MAX} caracteres.`,
    );
  });

  /** El error va en el campo culpable — DESIGN.md: "error = borde rojo + mensaje". */
  it("marca el campo culpable, no el formulario entero", async () => {
    const usuario = userEvent.setup();
    montar();

    await usuario.type(campoTitulo(), "Tablero");
    await usuario.click(botonEnviar());

    expect(campoIdea()).toHaveAttribute("aria-invalid", "true");
    expect(campoTitulo()).not.toHaveAttribute("aria-invalid");
  });

  it("deja de marcar el campo cuando el siguiente intento sale bien", async () => {
    const usuario = userEvent.setup();
    montar();

    await usuario.type(campoTitulo(), "Tablero");
    await usuario.click(botonEnviar());
    await usuario.type(campoIdea(), "Ahora sí, la idea completa.");
    await usuario.click(botonEnviar());

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  /**
   * `noValidate` apaga las burbujas del navegador porque están en su idioma y su
   * redacción, y DESIGN.md pide "copys en español, directos". Por eso tampoco hay
   * `required`: un atributo cuyo único efecto es un mensaje que suprimimos sería
   * una mentira en el marcado.
   */
  it("no delega el aviso en el navegador", () => {
    montar();

    expect(campoTitulo()).not.toHaveAttribute("required");
    expect(campoIdea()).not.toHaveAttribute("required");
  });
});

describe("mientras el envío está en vuelo", () => {
  it("desactiva el botón y dice que está enviando", () => {
    montar({ enviando: true });

    const boton = screen.getByRole("button", { name: /enviando/i });

    expect(boton).toBeDisabled();
  });

  /** DESIGN.md: "Deshabilitado: opacity .5 + cursor not-allowed (nunca ocultarlo)". */
  it("no esconde el botón: lo deja visible y desactivado", () => {
    montar({ enviando: true });

    expect(screen.getByRole("button", { name: /enviando/i })).toBeVisible();
  });

  it("no acepta un segundo envío con el mismo clic doble", async () => {
    const usuario = userEvent.setup();
    montar({ enviando: true });

    await usuario.click(screen.getByRole("button", { name: /enviando/i }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
