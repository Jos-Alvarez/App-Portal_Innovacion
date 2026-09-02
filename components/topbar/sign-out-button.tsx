"use client";

import { signOut } from "next-auth/react";

/**
 * The portal's single sign-out action — backlog item #17.
 *
 * It is the anchor of this whole item: the PRD places the administrator door
 * "junto al de cerrar sesión", and until now the portal had no such button at
 * all. Item #8 wrote down why it never appeared — the topbar lockup was copied
 * into each screen rather than extracted — and predicted this file's neighbour:
 * "item #17 adds a second button beside the theme toggle and will need it".
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
 *  WHY IT IS AN ICON, AND WHY IT NO LONGER USES <Button />
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The way out moved up beside the reader's name, where the six-entry nav below
 * it already spends the bar's whole word budget. As a text button it read as a
 * seventh destination in that set; as a mark beside the name it reads as what it
 * is — something you do to your own session.
 *
 * `<Button />` chooses between the three fills DESIGN.md defines, all of which
 * size themselves by their label. There is no label to size by here, so this
 * wears the shared `.lx-icon-btn` treatment directly rather than fighting a
 * variant's padding with an override.
 *
 * The accessible name is unchanged and is now the ONLY name: `aria-label`
 * carries the two words the button used to paint, and the glyph is hidden from
 * assistive technology so it is not announced twice.
 */
export function SignOutButton() {
  return (
    <button
      type="button"
      className="lx-icon-btn"
      onClick={() => void signOut({ redirectTo: "/login" })}
      aria-label="Cerrar sesión"
    >
      {/*
       * A door with an arrow leaving it — drawn inline rather than pulled from an
       * icon font, because `currentColor` is what lets it inherit the hover and
       * dark-mode colours the button already resolves, and because the portal
       * ships no icon dependency to add one to.
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
    </button>
  );
}
