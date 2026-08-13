import { Logo } from "@/components/logo/logo";
import { ThemeToggle } from "@/components/theme-toggle/theme-toggle";

import styles from "./page.module.css";

/** Minimal proof that the scaffold runs and both palettes resolve. */
export default function HomePage() {
  return (
    <main className={styles.main}>
      <div className={styles.card}>
        {/* The logo is here so the single-asset dark derivation is exercised by
            a real route; its own placements are the login and the topbar. */}
        <Logo preload />
        <p className="lx-label" style={{ color: "var(--navy-fg)" }}>
          Fundación UI
        </p>
        <h1>Portal de Innovación</h1>
        <p className="lx-meta">
          Scaffold, tokens de diseño, tipografía Archivo y cambio de tema sin parpadeo.
        </p>
        <ThemeToggle />
      </div>
    </main>
  );
}
