import Image from "next/image";

import styles from "./logo.module.css";

/**
 * The single asset DESIGN.md's logo treatment derives both palettes from.
 * Referenced by public path rather than statically imported: a static import of
 * a file that already lives in `public/` makes Next emit a second, hashed copy
 * of the same 146 KB under `_next/static/media`.
 */
const LOGO_SRC = "/logo.png";

/** DESIGN.md "Logo": "login (132px, centrado)". */
export const LOGO_SIZE_LOGIN = 132;
/** DESIGN.md "Logo": "topbar (58px + separador vertical + ...)". */
export const LOGO_SIZE_TOPBAR = 58;

/**
 * The shipped lockup is 1600×1200. DESIGN.md gives one number per placement and
 * not a pair, so `size` is read as the rendered WIDTH — the lockup is landscape,
 * and the horizontal room is what a centred login card and a topbar actually
 * ration. The height follows from the intrinsic ratio.
 */
const LOGO_ASPECT_RATIO = 1600 / 1200;

export interface LogoProps {
  /** Rendered width in px. Defaults to the login size. */
  size?: number;
  /**
   * Preload the asset — for the login screen, where the logo is the largest
   * thing above the fold. `preload` replaced the deprecated `priority` prop in
   * Next 16.
   */
  preload?: boolean;
}

/**
 * Logo — DESIGN.md "Logo".
 *
 * One PNG serves both palettes: the dark appearance is derived in CSS
 * (`mix-blend-mode` + `filter`) rather than shipped as a second asset. See
 * logo.module.css for the exact treatment DESIGN.md prescribes.
 *
 * next/image rather than a plain <img>: the source is 1600×1200 and it is drawn
 * at 132px or less, so the optimizer's resized variants save almost all of the
 * 146 KB, and the width/height pair reserves the box against layout shift.
 *
 * The topbar lockup — separator plus "Portal de Innovación" — is composition,
 * not the logo, so it belongs to the shell that arranges them.
 */
export function Logo({ size = LOGO_SIZE_LOGIN, preload = false }: LogoProps) {
  return (
    <Image
      className={styles.logo}
      src={LOGO_SRC}
      alt="Lima Expresa"
      width={size}
      height={Math.round(size / LOGO_ASPECT_RATIO)}
      preload={preload}
    />
  );
}
