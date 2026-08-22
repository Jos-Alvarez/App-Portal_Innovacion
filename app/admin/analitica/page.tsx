import { Topbar } from "@/components/topbar/topbar";
import { dependenciasDe } from "@/lib/analitica/dependencias";
import type { Consulta } from "@/lib/analitica/schema";
import { calcularAnalitica } from "@/lib/analitica/servicio";
import { guardPageAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

import { AnaliticaAdmin } from "./analitica-admin";
import { CONSULTA_INICIAL } from "./analitica-client";
import { hoyEnLima } from "./etiquetas";
import styles from "./analitica.module.css";

/**
 * `/admin/analitica` — la pantalla de analítica, backlog item #19.
 *
 * WHY `/admin/analitica`. The literal `admin` prefix every management screen
 * uses. The PRD puts this screen behind the administrator role like the rest of
 * the panel, and `guardPageAdmin` is what makes that true — not the absence of a
 * link to it.
 *
 * NO LAYOUT DOES THE GUARDING, for the reason `lib/authz/index.ts` gives in full:
 * Next's Router Cache reuses a layout across soft navigations, so a role revoked
 * between two admin screens would go unnoticed. Every admin page repeats the
 * guard itself.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE FIRST PERIOD IS READ HERE. EVERY PERIOD AFTER IT IS FETCHED
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A Server Component already holds the database and the request's identity, so
 * asking the portal's own endpoint for the default period would mean building an
 * absolute URL and forwarding the session cookie by hand to reach the same three
 * `GROUP BY`s through an extra round trip — and it would mean the reader watches
 * a skeleton for one round trip before seeing a screen the server could have
 * shipped complete. `app/api/analitica/route.ts` was written expecting this: it
 * says the endpoint exists because the PERIOD is a question the reader changes
 * several times a minute, not because the first paint needs one.
 *
 * Both callers bind the same reads through `lib/analitica/dependencias.ts`, so
 * the page and the endpoint cannot drift into answering the same question
 * differently — or into spending a different number of round trips on it.
 *
 * ITS OWN `loading.tsx` AND `error.tsx`, like every admin screen: the skeleton
 * has to have the geometry of THIS content, and the error has to name what could
 * not be loaded.
 */

/**
 * Required by `lib/authz/index.ts` on every protected page — and doubly true
 * here: the default period is "hoy", so a statically rendered version would
 * freeze the build date's numbers into the HTML.
 */
export const dynamic = "force-dynamic";

/**
 * The screen's opening question, as the engine's schema spells it.
 *
 * The two dates are `null` because the default is a PRESET, and
 * `lib/analitica/schema.ts` refuses a preset that carries dates rather than
 * ignoring them. If `CONSULTA_INICIAL` ever opens on `personalizado`, this
 * conversion has to grow the two days with it — the assertion in `periodoDe`
 * would otherwise be reached with nothing to read.
 */
function consultaInicial(): Consulta {
  return {
    rango: CONSULTA_INICIAL.rango,
    desde: null,
    hasta: null,
    comparar: CONSULTA_INICIAL.comparar,
  };
}

export default async function AnaliticaPage() {
  const acceso = await guardPageAdmin();

  /* Before the read, so a refused reader never causes an aggregation at all. */
  if (!acceso.allowed) {
    return acceso.screen;
  }

  /*
   * One instant for both answers. The report resolves "hoy" against it and the
   * date fields take their ceiling from it, so the period on screen and the
   * latest day the reader can ask for cannot disagree — not even on the request
   * that happens to straddle midnight.
   */
  const ahora = new Date();
  const reporteInicial = await calcularAnalitica(consultaInicial(), ahora, dependenciasDe(prisma));

  return (
    <main className={styles.main}>
      <Topbar usuario={acceso.usuario} />

      <header className={styles.header}>
        <p className="lx-label" style={{ color: "var(--navy-fg)" }}>
          Administración
        </p>
        <h1>Analítica</h1>
        <p className="lx-meta">
          Qué se usa, quién lo usa y qué falla. Elige un periodo y, si quieres, compáralo con el
          periodo anterior equivalente.
        </p>
      </header>

      <AnaliticaAdmin reporteInicial={reporteInicial} hoy={hoyEnLima(ahora)} />
    </main>
  );
}
