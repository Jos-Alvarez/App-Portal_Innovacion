import { Skeleton } from "@/components/states/skeleton";

import styles from "./procesador.module.css";

/**
 * Carga — DESIGN.md: "skeleton shimmer con la geometría del contenido real;
 * nunca pantalla en blanco".
 *
 * WHY THIS FILE EXISTS AT ALL. `app/(portal)/loading.tsx` already covers this
 * route by inheritance, and that is precisely the problem: it is shaped like
 * the dashboard — a topbar, a title and four table rows — and it announces
 * itself to a screen reader as "Cargando tus recursos asignados". Inheriting it
 * would promise a list and then paint a form.
 *
 * WHAT THIS COVERS. The server read of one `procesador` row, and nothing else.
 * The two minutes an execution takes are not a loading state of the route: the
 * page is already painted and the component says so in place, because a
 * skeleton that replaced a form the reader is standing in front of would look
 * like their work had been thrown away.
 */
export default function CargandoProcesador() {
  return (
    <main className={styles.main}>
      <Skeleton
        label="Cargando el procesador"
        blocks={[
          { width: "100%", height: "44px" },
          { width: "160px", height: "20px" },
          { width: "280px", height: "28px" },
          /* The card: its contract list, its file field and its action. */
          { width: "100%", height: "196px" },
        ]}
      />
    </main>
  );
}
