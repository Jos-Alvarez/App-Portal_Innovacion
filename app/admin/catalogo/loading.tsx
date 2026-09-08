import { Skeleton } from "@/components/states/skeleton";

/**
 * Carga — DESIGN.md: "skeleton shimmer con la geometría del contenido real;
 * nunca pantalla en blanco".
 *
 * The blocks mirror what actually arrives: the topbar, the screen title and
 * then the catalogue rows. NO FORM PANEL, because neither alta waits open on
 * the screen — each appears only when its own button asks for it. The page is
 * `force-dynamic` and reads SQL Server on every request, so this is what the
 * reader sees while those reads happen.
 */
export default function CargandoCatalogo() {
  return (
    <main className="lx-main">
      <Skeleton
        label="Cargando el catálogo de recursos"
        blocks={[
          /* La topbar compartida, que también encabeza esta pantalla. */
          { width: "100%", height: "44px" },
          { width: "260px", height: "28px" },
          ...Array.from({ length: 6 }, () => ({ width: "100%", height: "44px" })),
        ]}
      />
    </main>
  );
}
