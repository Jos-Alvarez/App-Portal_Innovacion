import { Skeleton } from "@/components/states/skeleton";

/**
 * Carga — DESIGN.md: "skeleton shimmer con la geometría del contenido real;
 * nunca pantalla en blanco".
 *
 * WHY THIS FILE EXISTS AT ALL. `app/(portal)/loading.tsx` already covers this
 * route by inheritance, and that is exactly the problem: it is shaped like the
 * dashboard — four table rows — and it announces itself as "Cargando tus
 * recursos asignados". Inheriting it would promise a list of resources and then
 * paint a form.
 *
 * WHAT THIS COVERS. The two server reads of `page.tsx`, and nothing else. Once
 * the screen is painted the reader never sees a loading state again: SWR
 * revalidates behind a list that is already there, and a send says so on the
 * button rather than by replacing the form with a skeleton.
 *
 * The geometry mirrors what arrives — topbar, back link, title, the form card,
 * then two suggestion cards — because a skeleton whose shape does not match the
 * content makes the content appear to jump when it lands.
 */
export default function CargandoSugerencias() {
  return (
    <main className="lx-main">
      <Skeleton
        label="Cargando tus sugerencias"
        blocks={[
          { width: "100%", height: "44px" },
          { width: "160px", height: "20px" },
          { width: "280px", height: "28px" },
          /* El formulario: dos campos en línea, el área de texto y la acción. */
          { width: "100%", height: "320px" },
          ...Array.from({ length: 2 }, () => ({ width: "100%", height: "168px" })),
        ]}
      />
    </main>
  );
}
