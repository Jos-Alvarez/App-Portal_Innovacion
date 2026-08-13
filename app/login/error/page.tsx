import type { Metadata } from "next";

import styles from "../login.module.css";
import { AuthErrorMessage } from "./auth-error";

export const metadata: Metadata = {
  title: "No se pudo ingresar — Portal de Innovación",
};

/**
 * The authentication error screen — Auth.js `pages.error`.
 *
 * It sits under `/login` so that one public prefix keeps both screens reachable
 * without a session; a rejected sign-in has none by construction.
 *
 * `error` is read here, on the server, instead of with `useSearchParams` in the
 * client component: reading it in the client would force the page into a
 * client-side bailout and require a Suspense boundary around it for no gain.
 */
export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const reported = (await searchParams).error;

  return (
    <main className={styles.screen}>
      <div className={`${styles.panel} ${styles.panelMessage}`}>
        <AuthErrorMessage error={typeof reported === "string" ? reported : undefined} />
      </div>
    </main>
  );
}
