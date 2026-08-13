/**
 * Theme primitives shared by the anti-flash inline script and the React toggle.
 * DESIGN.md fixes both ends of this contract: the preference lives in
 * localStorage and the dark palette is selected by `body[data-lx-dark="1"]`.
 */

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "lx-theme";
export const DARK_ATTRIBUTE = "data-lx-dark";
export const DEFAULT_THEME: Theme = "light";

/** Reads the persisted preference, tolerating blocked or corrupt storage. */
export function readStoredTheme(): Theme {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/**
 * Persists the preference. If storage is blocked (private mode, quota) the
 * write is swallowed and the UI stays on the default theme rather than crashing.
 */
export function persistTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* Nothing to recover: DESIGN.md makes localStorage the source of truth. */
  }
}

/** Switches the palette by toggling the attribute DESIGN.md keys the tokens on. */
export function applyTheme(theme: Theme): void {
  if (theme === "dark") {
    document.body.setAttribute(DARK_ATTRIBUTE, "1");
  } else {
    document.body.removeAttribute(DARK_ATTRIBUTE);
  }
}

/**
 * Blocking script injected as the first child of `<body>`. The server cannot
 * read localStorage, so without this running before first paint the page would
 * paint the light palette and then visibly flip to dark.
 *
 * It must live inside `<body>` rather than `<head>`: DESIGN.md keys the dark
 * palette on `body[data-lx-dark="1"]`, and `document.body` does not exist yet
 * while the head is being parsed.
 */
export const THEME_INIT_SCRIPT = `(function(){try{if(localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)})==="dark"){document.body.setAttribute(${JSON.stringify(
  DARK_ATTRIBUTE,
)},"1")}else{document.body.removeAttribute(${JSON.stringify(
  DARK_ATTRIBUTE,
)})}}catch(e){}})()`;
