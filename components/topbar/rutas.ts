/**
 * Dónde empieza el portal para cada audiencia, y qué entrada de la barra está
 * activa.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  EL PORTAL SE PARTIÓ EN DOS PRODUCTOS
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `/` fue la casa de todo el mundo mientras la administración era una capa
 * encima del portal del colaborador: quien administra también tenía sus
 * recursos, su buzón, y el panel además. Ya no. Quien administra ADMINISTRA —
 * arma el catálogo, lo reparte, lee lo que vuelve y lo mide — y no usa las
 * herramientas que reparte, así que «Mis recursos» y el buzón no son pantallas
 * suyas: son las del otro producto.
 *
 * Las dos pantallas del colaborador REDIRIGEN a su equivalente del panel en vez
 * de negarse. No es una denegación y no debe parecerlo: `lib/authz/index.ts`
 * exige que un recurso prohibido se explique en pantalla y nunca se esconda
 * detrás de un redirect, y tiene razón — pero eso habla de permisos. Acá no
 * falta ningún permiso; la pantalla simplemente no existe para quien mira, y
 * llevarlo a la suya es lo que corresponde.
 */

/**
 * A dónde llega quien administra. El proxy devuelve a todo el mundo a `/`
 * después de iniciar sesión, así que esta es la ruta a la que `/` lo manda.
 *
 * Catálogo y no otra: es la primera entrada de la barra por la misma razón que
 * es la primera del trabajo — armar el catálogo viene antes que repartirlo.
 */
export const RUTA_INICIO_ADMIN = "/admin/catalogo";

/** El buzón del colaborador tiene su equivalente en el panel: todas las de todos. */
export const RUTA_SUGERENCIAS_ADMIN = "/admin/sugerencias";

/**
 * Whether a topbar entry is the screen being read.
 *
 * Its own module because BOTH navs need it — the panel's and the
 * collaborator's — and neither is the natural home of a rule the other
 * depends on. Importing it from `admin-nav.tsx` into `portal-nav.tsx` would
 * say that the collaborator's bar is a detail of the administrator's, which
 * is backwards: they are two audiences, and this is the one thing they share.
 *
 * BY PREFIX, so `/admin/asignaciones/7` — a screen of its own — still marks
 * Asignaciones as current. The prefixes within each nav are disjoint, so no
 * path can match two entries of the same bar.
 *
 * The root is safe under the same rule and needs no special case: `${"/"}/`
 * is `"//"`, which no real path starts with, so `/` matches only itself and
 * never every screen in the portal.
 */
export function esRutaActual(href: string, pathname: string | null): boolean {
  if (pathname === null) return false;

  return pathname === href || pathname.startsWith(`${href}/`);
}
