"use client";

import { signOut } from "next-auth/react";

import styles from "./topbar.module.css";

/**
 * The portal's single sign-out action — backlog item #17, now an entry in the
 * topbar's session menu.
 *
 * It is the anchor of that whole item: the PRD places the administrator door
 * "junto al de cerrar sesión", and until item #17 the portal had no such control
 * at all. Item #8 wrote down why it never appeared — the topbar lockup was
 * copied into each screen rather than extracted — and predicted this file's
 * neighbour: "item #17 adds a second button beside the theme toggle and will
 * need it".
 *
 * `signOut` from `next-auth/react` and not a link to `/api/auth/signout`, for
 * the same reason `SignInButton` uses `signIn`: the endpoint is a POST protected
 * by a CSRF token, which this helper fetches and submits. A bare anchor would
 * reach the provider's own interstitial page — a screen this portal replaced —
 * and a hand-written form would have to reimplement the token.
 *
 * `redirectTo` is `/login` and not `/`. Landing on `/` after signing out sends
 * the reader straight into `proxy.ts`, which has no session to accept and
 * redirects them to `/login` anyway — one extra round trip to arrive at the same
 * screen, with a flash of the gate in between.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  IT GOT ITS LABEL BACK, AND IT IS NO LONGER A BUTTON TO ARIA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * For one release this was a bare door glyph carrying an `aria-label`, because
 * loose in the topbar the words read as a seventh entry in the panel nav beside
 * it. Behind a trigger there is room for them, so they came back, and the
 * `aria-label` came off: two names for one control is one more than it needs,
 * and the visible words are now the accessible ones.
 *
 * `role="menuitem"` rather than the implicit button role, because a menu that
 * announces "button" for its entries is a menu whose shape does not match what
 * it says it is. It stays a real `<button>` underneath — that is what makes
 * Enter, Space and the pointer work without reimplementing any of them.
 *
 * NOTHING CLOSES THE MENU HERE. `signOut` navigates away, so a close would be a
 * frame of housekeeping nobody sees; and were it to fail, leaving the menu open
 * is the honest outcome — the reader is still signed in and still looking at the
 * control that says so.
 */
export function SignOutButton() {
  return (
    <button
      type="button"
      role="menuitem"
      /*
       * Menu entries are reached with the arrow keys, never with Tab: the
       * trigger is the menu's single tab stop. `SessionMenu` moves focus here.
       */
      tabIndex={-1}
      className={`lx-menu-item ${styles.salir}`}
      onClick={() => void signOut({ redirectTo: "/login" })}
    >
      {/*
       * A door with an arrow leaving it — drawn inline rather than pulled from an
       * icon font, because `currentColor` is what lets it inherit the hover and
       * dark-mode colours the row already resolves, and because the portal ships
       * no icon dependency to add one to.
       */}
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <path d="m16 17 5-5-5-5" />
        <path d="M21 12H9" />
      </svg>
      Cerrar sesión
    </button>
  );
}
