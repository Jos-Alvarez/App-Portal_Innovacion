import { Skeleton } from "@/components/states/skeleton";

import styles from "./enlaces.module.css";

/**
 * Carga — DESIGN.md: "skeleton shimmer con la geometría del contenido real;
 * nunca pantalla en blanco".
 *
 * The blocks mirror what actually arrives: the screen title, the form panel,
 * then five catalogue rows. The page is `force-dynamic` and reads SQL Server on
 * every request, so this is what the reader sees while that read happens.
 */
export default function CargandoEnlaces() {
  return (
    <main className={styles.main}>
      <Skeleton
        label="Cargando el catálogo de enlaces"
        blocks={[
          { width: "260px", height: "28px" },
          { width: "100%", height: "180px", radius: "var(--radius-card)" },
          ...Array.from({ length: 5 }, () => ({ width: "100%", height: "44px" })),
        ]}
      />
    </main>
  );
}
