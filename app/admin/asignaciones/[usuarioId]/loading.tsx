import { Skeleton } from "@/components/states/skeleton";

import styles from "../asignaciones.module.css";

/**
 * Carga — DESIGN.md: "skeleton shimmer con la geometría del contenido real".
 *
 * Its own file rather than inheriting the picker's: this screen reads three
 * things (the person, and both catalogues) and draws two tables, so the
 * geometry the reader waits in front of is a different one.
 */
export default function CargandoAsignacionesDeUsuario() {
  return (
    <main className={styles.main}>
      <Skeleton
        label="Cargando los accesos de esta persona"
        blocks={[
          /* La topbar compartida, que ahora también encabeza esta pantalla. */
          { width: "100%", height: "44px" },
          { width: "240px", height: "28px" },
          { width: "100%", height: "180px", radius: "var(--radius-card)" },
          { width: "100%", height: "180px", radius: "var(--radius-card)" },
        ]}
      />
    </main>
  );
}
