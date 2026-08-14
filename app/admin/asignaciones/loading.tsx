import { Skeleton } from "@/components/states/skeleton";

import styles from "./asignaciones.module.css";

/**
 * Carga — DESIGN.md: "skeleton shimmer con la geometría del contenido real;
 * nunca pantalla en blanco".
 *
 * The blocks mirror what arrives: the screen title, then six person cards. The
 * page is `force-dynamic` and reads SQL Server on every request, so this is
 * what the reader sees while that read happens.
 */
export default function CargandoAsignaciones() {
  return (
    <main className={styles.main}>
      <Skeleton
        label="Cargando la lista de personas"
        blocks={[
          { width: "320px", height: "28px" },
          ...Array.from({ length: 6 }, () => ({
            width: "100%",
            height: "96px",
            radius: "var(--radius-card)",
          })),
        ]}
      />
    </main>
  );
}
