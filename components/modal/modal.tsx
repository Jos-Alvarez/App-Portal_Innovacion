"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

import styles from "./modal.module.css";

/**
 * Modal — DESIGN.md "Superficies y elevación": overlay `rgba(8,16,32,.45)`,
 * tarjeta de 16px de radio, animación `lx-pop`.
 *
 * WHY NOT `<dialog>` + `showModal()`. The platform element would give the focus
 * trap, Escape and the inert background for free, and it is the right answer in
 * a browser. It is not the right answer HERE: jsdom 26 — the environment this
 * suite runs in — still does not implement `showModal`, so every screen with a
 * modal would need a shim that behaves like a dialog without being one, and the
 * tests would be verifying the shim. The keyboard contract is written out
 * instead, in the same shape `topbar/session-menu.tsx` already uses.
 *
 * ESCAPE AND «Cancelar» ARE THE ONLY EXITS. A press on the overlay deliberately
 * does NOT close it: what this modal holds is a form, and a stray click beside
 * the card would throw away everything typed into it with no way back. The
 * platform's own dialog makes the same choice.
 */

/** What Tab may reach. Matches the selector `session-menu.tsx` walks. */
const SELECTOR_ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  /** Encabeza la tarjeta y nombra el diálogo para quien no la ve. */
  title: string;
  /** Escape o el cierre propio del contenido. El dueño decide qué desmontar. */
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ title, onClose, children }: ModalProps) {
  const tituloId = useId();
  const tarjetaRef = useRef<HTMLDivElement>(null);

  /*
   * Held in a ref so the cleanup returns focus to whatever opened the modal —
   * reading `document.activeElement` at that point would find the button being
   * unmounted, or nothing at all.
   */
  const devolverA = useRef<HTMLElement | null>(null);

  useEffect(() => {
    devolverA.current = document.activeElement as HTMLElement | null;

    /* El foco entra a la tarjeta: si se quedara en el disparador, el teclado
       seguiría fuera de un diálogo que se pinta encima de todo. */
    const primero = tarjetaRef.current?.querySelector<HTMLElement>(SELECTOR_ENFOCABLES);
    (primero ?? tarjetaRef.current)?.focus();

    return () => devolverA.current?.focus();
  }, []);

  /* La página de atrás no se desplaza mientras el diálogo está encima. */
  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previo;
    };
  }, []);

  useEffect(() => {
    function alTeclear(evento: KeyboardEvent) {
      if (evento.key === "Escape") {
        evento.preventDefault();
        onClose();
        return;
      }

      if (evento.key !== "Tab") return;

      const tarjeta = tarjetaRef.current;
      if (tarjeta === null) return;

      const enfocables = Array.from(tarjeta.querySelectorAll<HTMLElement>(SELECTOR_ENFOCABLES));
      const primero = enfocables[0];
      const ultimo = enfocables.at(-1);

      /* Nada que enfocar dentro: dejar salir el foco sería abandonar el
         diálogo, así que el Tab simplemente no lleva a ninguna parte. */
      if (primero === undefined || ultimo === undefined) {
        evento.preventDefault();
        return;
      }

      const activo = document.activeElement;
      const fuera = !tarjeta.contains(activo);

      if (evento.shiftKey && (activo === primero || fuera)) {
        evento.preventDefault();
        ultimo.focus();
        return;
      }

      if (!evento.shiftKey && (activo === ultimo || fuera)) {
        evento.preventDefault();
        primero.focus();
      }
    }

    document.addEventListener("keydown", alTeclear);
    return () => document.removeEventListener("keydown", alTeclear);
  }, [onClose]);

  return (
    <div className={styles.overlay}>
      <div
        ref={tarjetaRef}
        className={styles.tarjeta}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        /* Destino del foco cuando el contenido todavía no ofrece ninguno. */
        tabIndex={-1}
      >
        <h2 id={tituloId} className={styles.titulo}>
          {title}
        </h2>

        {children}
      </div>
    </div>
  );
}
