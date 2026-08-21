"use client";

import { signOut } from "next-auth/react";

import { Button } from "@/components/button/button";

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
 */
export function SignOutButton() {
  return (
    <Button variant="text" onClick={() => void signOut({ redirectTo: "/login" })}>
      Cerrar sesión
    </Button>
  );
}
