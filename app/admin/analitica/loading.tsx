import { Skeleton } from "@/components/states/skeleton";

import styles from "./analitica.module.css";

/**
 * Carga — DESIGN.md: "skeleton shimmer con la geometría del contenido real;
 * nunca pantalla en blanco".
 *
 * The blocks mirror what actually arrives: the topbar, the title, the period
 * controls, the strip of five figures, and then the first table. The page is
 * `force-dynamic` and runs three aggregations over `evento_uso` on every
 * request, so this is the longest wait in the panel and the one that most needs
 * to look like the thing it is becoming.
 *
 * Only the FIRST table is drawn. There are four below it, and stacking four
 * grey rectangles would promise a page of tables to a reader whose period may
 * well come back with three empty panels.
 */
export default function CargandoAnalitica() {
  return (
    <main className={styles.main}>
      <Skeleton
        label="Cargando la analítica"
        blocks={[
          /* La topbar compartida, que encabeza todas las pantallas del panel. */
          { width: "100%", height: "44px" },
          { width: "260px", height: "28px" },
          { width: "100%", height: "120px", radius: "var(--radius-card)" },
          { width: "100%", height: "96px", radius: "var(--radius-card)" },
          { width: "100%", height: "240px", radius: "var(--radius-card)" },
        ]}
      />
    </main>
  );
}
