import type { Metadata } from "next";

import { Logo } from "@/components/logo/logo";
import { CALLBACK_URL_PARAM, toSafeCallbackUrl } from "@/lib/auth-gate";

import styles from "./login.module.css";
import { SignInButton } from "./sign-in-button";

export const metadata: Metadata = {
  title: "Ingresar — Portal de Innovación",
};

/**
 * The sign-in screen — Auth.js `pages.signIn`.
 *
 * One action and nothing else. There is no form because there is nothing for
 * the reader to type: Entra ID owns the credentials, so the whole screen is the
 * logo, a sentence saying which account to use, and the single primary action
 * DESIGN.md allows per view.
 *
 * The destination arrives as a query parameter written by the gate, which makes
 * it attacker-controlled, so it is reduced to a same-site path before it can
 * become a redirect.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const requested = (await searchParams)[CALLBACK_URL_PARAM];
  const redirectTo = toSafeCallbackUrl(typeof requested === "string" ? requested : undefined);

  return (
    <main className={styles.screen}>
      <div className={styles.panel}>
        {/* DESIGN.md "Logo": "login (132px, centrado)" — the component's default
            size. `preload` because it is the largest thing above the fold. */}
        <Logo preload />
        <h1>Portal de Innovación</h1>
        <p className={styles.intro}>
          Ingresa con la cuenta corporativa que usas todos los días en Lima Expresa.
        </p>
        <div className={styles.action}>
          <SignInButton redirectTo={redirectTo} />
        </div>
      </div>
    </main>
  );
}
