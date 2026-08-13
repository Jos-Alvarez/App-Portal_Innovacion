import { ThemeToggle } from "@/components/theme-toggle/theme-toggle";

import styles from "./page.module.css";

/** Minimal proof that the scaffold runs and both palettes resolve. */
export default function HomePage() {
  return (
    <main className={styles.main}>
      <div className={styles.card}>
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
