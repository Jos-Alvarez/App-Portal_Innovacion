import { Skeleton } from "@/components/states/skeleton";

import styles from "./administradores.module.css";

/**
 * Carga — DESIGN.md: "skeleton shimmer con la geometría del contenido real;
 * nunca pantalla en blanco".
 *
 * The blocks mirror what actually arrives: the screen title, the search panel,
 * then the table of current administrators. The page is `force-dynamic` and
 * reads SQL Server on every request, so this is what the reader sees while that
 * read happens. The search results are NOT part of the geometry — they do not
 * exist until somebody types.
 */
export default function CargandoAdministradores() {
  return (
    <main className={styles.main}>
      <Skeleton
        label="Cargando la gestión de administradores"
        blocks={[
          { width: "320px", height: "28px" },
          { width: "100%", height: "104px", radius: "var(--radius-card)" },
          { width: "100%", height: "220px", radius: "var(--radius-card)" },
        ]}
      />
    </main>
  );
}
