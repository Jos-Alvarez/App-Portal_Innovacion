import { Skeleton } from "@/components/states/skeleton";

import styles from "./sugerencias.module.css";

/**
 * Carga — DESIGN.md: "skeleton shimmer con la geometría del contenido real;
 * nunca pantalla en blanco".
 *
 * The blocks mirror what actually arrives: the screen title, the row of filter
 * chips, then four suggestion cards. The page is `force-dynamic` and reads SQL
 * Server on every request, so this is what the reader sees while that read
 * happens.
 */
export default function CargandoSugerenciasAdmin() {
  return (
    <main className={styles.main}>
      <Skeleton
        label="Cargando las sugerencias"
        blocks={[
          { width: "280px", height: "28px" },
          { width: "100%", height: "32px" },
          ...Array.from({ length: 4 }, () => ({
            width: "100%",
            height: "200px",
            radius: "var(--radius-card)",
          })),
        ]}
      />
    </main>
  );
}
