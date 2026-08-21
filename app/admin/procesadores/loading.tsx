import { Skeleton } from "@/components/states/skeleton";

import styles from "./procesadores.module.css";

/**
 * Carga — DESIGN.md: "skeleton shimmer con la geometría del contenido real;
 * nunca pantalla en blanco".
 *
 * The blocks mirror what actually arrives: the screen title, the form panel —
 * taller than the enlaces one, because this resource collects nine fields and
 * two caps — then five catalogue rows. The page is `force-dynamic` and reads
 * SQL Server on every request, so this is what the reader sees while that
 * read happens.
 */
export default function CargandoProcesadores() {
  return (
    <main className={styles.main}>
      <Skeleton
        label="Cargando el catálogo de procesadores"
        blocks={[
          /* La topbar compartida, que ahora también encabeza esta pantalla. */
          { width: "100%", height: "44px" },
          { width: "300px", height: "28px" },
          { width: "100%", height: "320px", radius: "var(--radius-card)" },
          ...Array.from({ length: 5 }, () => ({ width: "100%", height: "44px" })),
        ]}
      />
    </main>
  );
}
