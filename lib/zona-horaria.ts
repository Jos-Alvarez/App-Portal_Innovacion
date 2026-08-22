/**
 * The one time zone this portal reasons in.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY IT LEFT `lib/sugerencias/fechas.ts`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * That module explained at length why the zone is pinned rather than ambient —
 * a suggestion sent at 21:00 in Lima is already the next day in UTC, so a server
 * render and a browser render would disagree and React would report a hydration
 * mismatch. Every word of that still holds, and it was the only consumer, so the
 * constant lived there.
 *
 * Item #18 is the second consumer, and it needs the zone for a different reason
 * that lands on the same value: the analytics engine has to decide where "hoy"
 * starts and ends before it can count anything, and the answer has to be the day
 * the reader means. Reaching from `lib/analitica/` into `lib/sugerencias/` for a
 * constant would couple two features that share a fact and nothing else — the
 * same argument item #15 used to move it down one level in the first place, so
 * it moves down one more.
 *
 * `lib/sugerencias/fechas.ts` re-exports it, so item #13's and item #15's call
 * sites and their suites are untouched by the move.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  IT IS WHERE THE COMPANY IS, NOT WHERE A SERVER HAPPENS TO BE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Lima Expresa operates in Peru. "El martes" means the Peruvian Tuesday to every
 * person who reads this portal, whether the Node process runs in UTC, the
 * database host is set to something else, or an administrator opens the
 * analytics screen from a hotel in Madrid. A fixed zone is what makes all three
 * agree; the ambient zone would make each of them right about a different day.
 */
export const ZONA_HORARIA = "America/Lima";
