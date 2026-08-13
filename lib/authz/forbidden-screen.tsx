"use client";

import { useRouter } from "next/navigation";

import { ForbiddenState } from "@/components/states/forbidden-state";
import { DEFAULT_AFTER_SIGN_IN_PATH, SIGN_IN_PATH } from "@/lib/auth-gate";
import type { DenialKind } from "@/lib/authz/decisions";

/**
 * The 403 screen as a guard can hand it back.
 *
 * `ForbiddenState` takes its exit as a callback so it pulls in no router
 * (components/states/forbidden-state.tsx). A Server Component cannot pass a
 * function across the boundary, so this thin client component is what supplies
 * one — it composes the existing state and adds nothing to it but navigation
 * and the copy each denial deserves.
 *
 * "Solicitar acceso" stays omitted. Its destination is still an open product
 * decision, and `ForbiddenState` was built so that omitting the handler renders
 * the screen cleanly with only the exit; inventing a mailto here would settle a
 * question the product has not.
 */

const COPY: Record<DenialKind, { title?: string; description?: string }> = {
  /*
   * The authentication gate redirects a request with no session before it can
   * reach a page, so this branch is a fallback and not the normal path. It
   * still needs honest copy: telling someone they lack a permission when their
   * session simply expired sends them to ask for something they already have.
   */
  session: {
    title: "Tu sesión ya no está activa",
    description:
      "Por seguridad las sesiones caducan. Vuelve a iniciar sesión con tu cuenta corporativa " +
      "para seguir donde estabas.",
  },
  account: {
    title: "Tu cuenta no está habilitada",
    description:
      "Tu cuenta existe pero no está habilitada en el portal. Escríbele al Área de Innovación " +
      "para que la revisen.",
  },
  /** DESIGN.md's own wording for the Sin permiso state; `ForbiddenState` already holds it. */
  resource: {},
};

export interface ForbiddenScreenProps {
  kind: DenialKind;
}

export function ForbiddenScreen({ kind }: ForbiddenScreenProps) {
  const router = useRouter();
  const copy = COPY[kind];

  /*
   * With no session the portal's entrance is the sign-in screen: sending the
   * reader to `/` would only bounce off the authentication gate and land them
   * there anyway, one redirect later.
   */
  const destination = kind === "session" ? SIGN_IN_PATH : DEFAULT_AFTER_SIGN_IN_PATH;

  return (
    <ForbiddenState
      title={copy.title}
      description={copy.description}
      onBackToPortal={() => router.push(destination)}
    />
  );
}
