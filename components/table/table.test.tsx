import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Table, type TableColumn } from "./table";

interface Enlace {
  id: string;
  nombre: string;
  tipo: string;
}

const COLUMNS: readonly TableColumn<Enlace>[] = [
  { key: "nombre", header: "Nombre", cell: (row) => row.nombre },
  { key: "tipo", header: "Tipo", cell: (row) => row.tipo.toUpperCase() },
];

const ROWS: readonly Enlace[] = [
  { id: "1", nombre: "Analítica de peaje", tipo: "app" },
  { id: "2", nombre: "Asistente de contratos", tipo: "agente" },
];

function renderTable(rows: readonly Enlace[] = ROWS) {
  return render(
    <Table caption="Enlaces asignados" columns={COLUMNS} rows={rows} rowKey={(row) => row.id} />,
  );
}

describe("<Table />", () => {
  it("carries an accessible name so screen readers can tell tables apart", () => {
    renderTable();

    expect(screen.getByRole("table", { name: "Enlaces asignados" })).toBeInTheDocument();
  });

  it("draws one header per column, in the order it was given", () => {
    renderTable();

    const headers = screen.getAllByRole("columnheader").map((header) => header.textContent);

    expect(headers).toEqual(["Nombre", "Tipo"]);
  });

  it("draws one body row per datum", () => {
    renderTable();

    const body = screen.getAllByRole("rowgroup")[1];

    expect(within(body).getAllByRole("row")).toHaveLength(2);
  });

  it("renders each cell through its own column, not from the raw value", () => {
    renderTable();

    const rows = within(screen.getAllByRole("rowgroup")[1]).getAllByRole("row");
    const firstRow = within(rows[0]).getAllByRole("cell").map((cell) => cell.textContent);

    expect(firstRow).toEqual(["Analítica de peaje", "APP"]);
  });

  it("keeps the row order the caller supplied", () => {
    renderTable();

    const rows = within(screen.getAllByRole("rowgroup")[1]).getAllByRole("row");

    expect(rows[0]).toHaveTextContent("Analítica de peaje");
    expect(rows[1]).toHaveTextContent("Asistente de contratos");
  });

  it("keeps the headers standing when there is nothing to list", () => {
    renderTable([]);

    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
    expect(within(screen.getAllByRole("rowgroup")[1]).queryAllByRole("row")).toHaveLength(0);
  });

  it("marks the alignment a column asks for so numbers can sit to the right", () => {
    render(
      <Table
        caption="Uso"
        columns={[
          { key: "nombre", header: "Nombre", cell: (row) => row.nombre },
          { key: "usos", header: "Usos", align: "end", cell: () => "12" },
        ]}
        rows={[ROWS[0]]}
        rowKey={(row) => row.id}
      />,
    );

    expect(screen.getByRole("columnheader", { name: "Usos" })).toHaveAttribute("data-align", "end");
    expect(screen.getByRole("cell", { name: "12" })).toHaveAttribute("data-align", "end");
  });
});
