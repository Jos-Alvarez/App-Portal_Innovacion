"use client";

import { useRouter } from "next/navigation";

import { ErrorState } from "@/components/states/error-state";
import { ForbiddenState } from "@/components/states/forbidden-state";
import { SIGN_IN_PATH } from "@/lib/auth-gate";

/**
 * The Auth.js error code for a sign-in the `signIn` callback turned away. For
 * this portal that means exactly one thing: `authorizeAndSyncUsuario` found an
 * address outside the corporate domain and returned `false`.
 */
export const ACCESS_DENIED_ERROR = "AccessDenied";

/*
 * DESIGN.md defines no visual treatment for a rejected sign-in. It defines the
 * four obligatory states and the 403 screen, so both branches below reuse those
 * rather than introducing a fifth treatment: the rejection is the "Sin permiso"
 * state, every other failure is the "Error" state with its Reintentar.
 *
 * What the rejection needs is honest copy. The reader is not missing a
 * permission inside the portal — item #4's 403 is that case. They are holding
 * an account that is not the company's, and that is what the text says.
 *
 * The configured domain and the identity provider's own error code are
 * deliberately absent: DESIGN.md asks for "lenguaje claro sin códigos", and the
 * domain is configuration that an unauthenticated screen has no business
 * disclosing.
 */
const REJECTED_TITLE = "Esta cuenta no pertenece a Lima Expresa";
const REJECTED_DESCRIPTION =
  "El portal solo admite las cuentas corporativas de Lima Expresa, y la que usaste no lo es. " +
  "Vuelve a intentarlo con tu cuenta de trabajo. Si crees que la tuya sí debería entrar, " +
  "escríbele al Área de Innovación.";

const FAILED_TITLE = "No pudimos completar el inicio de sesión";
const FAILED_DESCRIPTION =
  "Algo falló mientras validábamos tu cuenta. Intenta de nuevo; si vuelve a ocurrir, " +
  "avísale al Área de Innovación.";

export interface AuthErrorMessageProps {
  /** The `error` query parameter Auth.js appends when it redirects here. */
  error: string | undefined;
}

/**
 * Explains a failed sign-in.
 *
 * The two branches are kept apart on purpose. Telling someone their account is
 * foreign to the organization when the real cause was a misconfigured provider
 * would send them chasing a problem they do not have, so anything that is not
 * an explicit rejection is reported as a plain failure with a retry.
 */
export function AuthErrorMessage({ error }: AuthErrorMessageProps) {
  const router = useRouter();
  const backToSignIn = () => router.push(SIGN_IN_PATH);

  if (error === ACCESS_DENIED_ERROR) {
    return (
      <ForbiddenState
        title={REJECTED_TITLE}
        description={REJECTED_DESCRIPTION}
        /*
         * With no session, the portal's entrance is the sign-in screen, so
         * "Volver al portal" leads there. "Solicitar acceso" is omitted: this
         * is not a request the Área de Innovación can grant — the reader needs
         * a different account, not a permission.
         */
        onBackToPortal={backToSignIn}
      />
    );
  }

  return <ErrorState title={FAILED_TITLE} description={FAILED_DESCRIPTION} onRetry={backToSignIn} />;
}
