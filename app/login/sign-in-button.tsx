"use client";

import { signIn } from "next-auth/react";

import { Button } from "@/components/button/button";

/**
 * The id `MicrosoftEntraID()` registers itself under. It is what
 * `signIn(provider)` targets, so it must match the provider configured in
 * `auth.ts` exactly.
 */
export const ENTRA_PROVIDER_ID = "microsoft-entra-id";

export interface SignInButtonProps {
  /**
   * Where to land after a successful sign-in. Already reduced to a same-site
   * path by `toSafeCallbackUrl` on the server.
   */
  redirectTo: string;
}

/**
 * The portal's single sign-in action.
 *
 * There is no form and no field to fill: the corporate identity provider owns
 * the credentials, so the whole screen is one action. `signIn` from
 * `next-auth/react` is what handles the CSRF token and the redirect to Entra
 * ID; a bare link to the endpoint would skip that.
 */
export function SignInButton({ redirectTo }: SignInButtonProps) {
  return (
    <Button variant="primary" onClick={() => void signIn(ENTRA_PROVIDER_ID, { redirectTo })}>
      Iniciar sesión con tu cuenta corporativa
    </Button>
  );
}
