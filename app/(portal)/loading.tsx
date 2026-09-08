import { Skeleton } from "@/components/states/skeleton";

/**
 * Carga — DESIGN.md: "skeleton shimmer con la geometría del contenido real;
 * nunca pantalla en blanco".
 *
 * WHAT THIS COVERS, AND WHAT IT DOES NOT. It is the server read, not the SWR
 * revalidation. The page is `force-dynamic` and queries SQL Server on every
 * request, so this is what fills the moment between the request and the first
 * paint. Once that paint happens the reader never sees a loading state again:
 * SWR revalidates behind a list that is already on screen, which is the entire
 * point of handing it `fallbackData`.
 *
 * The blocks mirror what arrives — the topbar, the screen title, then four
 * resource rows — because a skeleton whose geometry does not match the content
 * makes the content appear to jump when it lands.
 */
export default function CargandoPortal() {
  return (
    <main className="lx-main">
      <Skeleton
        label="Cargando tus recursos asignados"
        blocks={[
          { width: "100%", height: "44px" },
          { width: "220px", height: "28px" },
          ...Array.from({ length: 4 }, () => ({ width: "100%", height: "52px" })),
        ]}
      />
    </main>
  );
}
