import type { ReactNode } from "react";

import styles from "./table.module.css";

export interface TableColumn<Row> {
  /** Stable identity of the column, used as the React key. */
  key: string;
  /** Header text. DESIGN.md renders it 11px uppercase in --muted. */
  header: string;
  /** Turns a row into the cell's content — the column owns its formatting. */
  cell: (row: Row) => ReactNode;
  /** "end" for figures; anything textual stays at "start". */
  align?: "start" | "end";
}

export interface TableProps<Row> {
  /** Accessible name of the table. Rendered for screen readers only. */
  caption: string;
  columns: readonly TableColumn<Row>[];
  rows: readonly Row[];
  /** Row identity — the data's own key, never the array index. */
  rowKey: (row: Row) => string;
}

/**
 * Tablas — DESIGN.md "Componentes": "encabezado 11px uppercase --muted, filas
 * con borde inferior, hover --surface2".
 *
 * A presentational primitive on purpose: no sorting, filtering or pagination.
 * Those are decisions about a particular dataset, so they belong to the views
 * that consume this table, not to the table itself.
 *
 * Rendering nothing when `rows` is empty is also deliberate — DESIGN.md gives
 * the Vacío state its own anatomy, so a view shows <EmptyState /> instead of
 * an empty table body dressed up as one.
 */
export function Table<Row>({ caption, columns, rows, rowKey }: TableProps<Row>) {
  return (
    <table className={styles.table}>
      <caption className="lx-sr-only">{caption}</caption>
      <thead>
        <tr>
          {columns.map((column) => (
            <th
              key={column.key}
              scope="col"
              className={`${styles.headerCell} lx-label`}
              data-align={column.align ?? "start"}
            >
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={rowKey(row)} className={styles.row}>
            {columns.map((column) => (
              <td key={column.key} className={styles.cell} data-align={column.align ?? "start"}>
                {column.cell(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
