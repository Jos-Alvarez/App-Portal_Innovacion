import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/*
 * Guarded because not every suite renders: the authentication gate runs in the
 * Node environment (`// @vitest-environment node`), where there is no DOM to
 * clean up and touching `window` would fail the run outright.
 */
afterEach(() => {
  if (typeof window === "undefined") {
    return;
  }

  cleanup();
  window.localStorage.clear();
  document.body.removeAttribute("data-lx-dark");
});
