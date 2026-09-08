import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProcesadorForm } from "./procesador-form";

/**
 * What the form hands upwards.
 *
 * The validation RULES are not re-tested here — `lib/procesadores/schema.test.ts`
 * owns the lengths, the key format, the format list and ADR 0002's cross-field
 * rules, and this form runs those very schemas. What is tested instead is this
 * layer's own work: the megabyte affordance over a contract stored in bytes,
 * the explicit "sin tope", the edit that carries only what moved, and the fact
 * that a violation lands on the field that has to change.
 */

const PROCESADOR = {
  id: 4,
  nombre: "Maestro de Excel",
  descripcion: "Consolida los maestros mensuales",
  claveProcesador: "maestro-excel",
  formatosAceptados: "xlsx,csv",
  /* 25 MB and 80 MB, as the column holds them. */
  tamanoMax: 26_214_400,
  entradasMin: 1,
  entradasMax: 5,
  tamanoMaxTotal: 83_886_080,
  salidaEsperada: "zip",
  activo: true,
} as const;

const onSubmit = vi.fn();
const onCancelar = vi.fn();

function renderForm(procesador: typeof PROCESADOR | null = null) {
  render(
    <ProcesadorForm
      procesador={procesador}
      enviando={false}
      onSubmit={onSubmit}
      onCancelar={onCancelar}
    />,
  );
  return userEvent.setup();
}

const campo = {
  nombre: () => screen.getByLabelText(/^nombre$/i),
  descripcion: () => screen.getByLabelText(/descripción/i),
  clave: () => screen.getByLabelText(/clave del procesador/i),
  formatos: () => screen.getByLabelText(/formatos aceptados/i),
  tamanoMax: () => screen.getByLabelText(/tamaño máximo por archivo/i),
  entradasMin: () => screen.getByLabelText(/mínimo de archivos/i),
  entradasMax: () => screen.getByLabelText(/^máximo de archivos$/i),
  tamanoMaxTotal: () => screen.getByLabelText(/tamaño máximo del conjunto/i),
  salida: () => screen.getByLabelText(/resultado que se le anuncia/i),
};

const tope = {
  entradas: () => screen.getByRole("switch", { name: /tope al número de archivos/i }),
  tamano: () => screen.getByRole("switch", { name: /tope al tamaño del conjunto/i }),
};

function guardar(user: ReturnType<typeof userEvent.setup>, alta = true) {
  return user.click(
    screen.getByRole("button", { name: alta ? /agregar procesador/i : /guardar cambios/i }),
  );
}

async function llenarAlta(user: ReturnType<typeof userEvent.setup>) {
  await user.type(campo.nombre(), "  Maestro de Excel  ");
  await user.type(campo.clave(), "  MAESTRO-EXCEL ");
  await user.type(campo.formatos(), "XLSX, .csv");
  await user.type(campo.tamanoMax(), "25");
  await user.selectOptions(campo.salida(), "zip");
}

describe("<ProcesadorForm />", () => {
  beforeEach(() => {
    onSubmit.mockReset();
    onCancelar.mockReset();
  });

  it("submits the whole contract as the schema produced it, with the sizes in bytes", async () => {
    const user = renderForm();

    await llenarAlta(user);
    await guardar(user);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      nombre: "Maestro de Excel",
      /* Blank collapses to null, so no screen has to treat "" and NULL alike. */
      descripcion: null,
      claveProcesador: "maestro-excel",
      formatosAceptados: "xlsx,csv",
      /* 25 MB typed in the box, 26 214 400 bytes on the wire. */
      tamanoMax: 26_214_400,
      entradasMin: 1,
      entradasMax: null,
      tamanoMaxTotal: null,
      salidaEsperada: "zip",
    });
  });

  it("says out loud that there is no cap, instead of leaving a box empty", async () => {
    renderForm();

    /* An empty input communicates nothing; ADR 0002's NULL means "sin tope". */
    expect(screen.getByText(/sin tope: admite todos los archivos/i)).toBeInTheDocument();
    expect(screen.getByText(/sin tope: solo se aplica el límite de cada archivo/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^máximo de archivos$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/tamaño máximo del conjunto/i)).not.toBeInTheDocument();
  });

  it("asks for a cap only once one has been requested", async () => {
    const user = renderForm();

    await llenarAlta(user);
    await user.click(tope.entradas());
    await user.type(campo.entradasMax(), "3");
    await user.click(tope.tamano());
    await user.type(campo.tamanoMaxTotal(), "80");
    await guardar(user);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ entradasMax: 3, tamanoMaxTotal: 83_886_080 }),
    );
  });

  it("opens an edit with the stored sizes written in megabytes", () => {
    renderForm(PROCESADOR);

    expect(campo.nombre()).toHaveValue("Maestro de Excel");
    expect(campo.clave()).toHaveValue("maestro-excel");
    expect(campo.formatos()).toHaveValue("xlsx,csv");
    expect(campo.tamanoMax()).toHaveValue("25");
    expect(campo.tamanoMaxTotal()).toHaveValue("80");
    expect(campo.entradasMax()).toHaveValue("5");
    expect(campo.salida()).toHaveValue("zip");
    expect(tope.entradas()).toHaveAttribute("aria-checked", "true");
  });

  it("sends only the field that moved, leaving the untouched sizes out of the body", async () => {
    const user = renderForm(PROCESADOR);

    await user.clear(campo.nombre());
    await user.type(campo.nombre(), "Maestro de Excel v2");
    await guardar(user, false);

    /* The sizes were rendered from a rounded megabyte; not resending them is
       what keeps that rounding from ever reaching the column. */
    expect(onSubmit).toHaveBeenCalledWith({ nombre: "Maestro de Excel v2" });
  });

  it("sends a cap that was switched off as an explicit null", async () => {
    const user = renderForm(PROCESADOR);

    await user.click(tope.entradas());
    await guardar(user, false);

    expect(onSubmit).toHaveBeenCalledWith({ entradasMax: null });
  });

  it("stops a maximum below the minimum and says so on the maximum", async () => {
    const user = renderForm();

    await llenarAlta(user);
    await user.clear(campo.entradasMin());
    await user.type(campo.entradasMin(), "5");
    await user.click(tope.entradas());
    await user.type(campo.entradasMax(), "3");
    await guardar(user);

    expect(onSubmit).not.toHaveBeenCalled();
    /* The API's own sentence for this rule, from the same mapper. */
    expect(
      screen.getByText(
        "El máximo de archivos no puede ser menor que el mínimo. Sube el máximo o baja el mínimo.",
      ),
    ).toBeInTheDocument();
    expect(campo.entradasMax()).toHaveAttribute("aria-invalid", "true");
  });

  it("judges an edit against the row it is being applied to, before the round trip", async () => {
    const user = renderForm(PROCESADOR);

    /* Only the minimum is edited. The fragment is legal on its own; merged into
       the stored maximum of 5 it describes an execution nobody could perform. */
    await user.clear(campo.entradasMin());
    await user.type(campo.entradasMin(), "9");
    await guardar(user, false);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(campo.entradasMax()).toHaveAttribute("aria-invalid", "true");
  });

  it("says nothing changed instead of sending an empty edit", async () => {
    const user = renderForm(PROCESADOR);

    await guardar(user, false);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(
      screen.getByText("No recibimos ningún cambio para guardar en este procesador."),
    ).toBeInTheDocument();
  });

  it("shows the formats as they will be stored, using the schema's own normaliser", async () => {
    const user = renderForm();

    await user.type(campo.formatos(), "XLSX, .csv , xlsx");

    expect(screen.getByText(/se guardarán como: xlsx, csv, xlsx/i)).toBeInTheDocument();
  });

  it("is honest about the two fields the portal does not control", () => {
    renderForm();

    /* ADR 0002: the pipeline packages by the real output count, so a mismatch
       does not break the execution. The label must not promise otherwise. */
    expect(screen.getByText(/no decide nada/i)).toBeInTheDocument();
    /* ADR 0006: the key is never checked against the registry by the portal. */
    expect(screen.getByText(/el portal no comprueba que ese código exista/i)).toBeInTheDocument();
  });

  it("lets an edit started by mistake be abandoned", async () => {
    const user = renderForm(PROCESADOR);

    await user.click(screen.getByRole("button", { name: /^cancelar$/i }));

    expect(onCancelar).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
