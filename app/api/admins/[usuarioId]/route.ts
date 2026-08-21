import { NextResponse } from "next/server";

import { errorDeRol, identificadorInvalido } from "@/lib/admins/errors";
import { revocarAdministrador } from "@/lib/admins/repository";
import { idUsuarioSchema } from "@/lib/admins/schema";
import { failureResponse } from "@/lib/api/errors";
import { normalizeEmail } from "@/lib/auth/identity";
import { guardRouteAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

/**
 * La revocación — ADR 0003's `/api/admins` family, and the rule the PRD states
 * as hard.
 *
 *   DELETE /api/admins/{usuarioId} → 200 { administrador: AdministradorDTO }
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  DELETE OVER THE ROLE, NOT OVER THE PERSON
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The path addresses a `usuario` id and the verb is DELETE, so the shape has to
 * be read carefully: what is deleted is the ADMINISTRATOR — the membership of
 * that person in the set this route family is about — and never the account. The
 * row survives with `es_admin = 0`, keeps its assignments and its suggestions,
 * and its owner goes on using the portal as a collaborator. `/api/admins` is the
 * collection of administrators; `{usuarioId}` is which one; DELETE removes it
 * from that collection. This is the same reading `DELETE /api/sugerencias/{id}/grupo`
 * uses for leaving a group.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  NOTHING HERE ASKS WHO IS CALLING, AND THAT IS THE POINT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Self-revocation is an ordinary revocation. The PRD asks for the minimum-one
 * rule to hold "incluida la auto-revocación", and it does — not through a
 * special case, but because the count that protects it does not care who asked.
 * An administrator alone in the list is refused whether they are revoking
 * themselves or somebody else; an administrator with a colleague may step down.
 *
 * The two refusals that ARE special live where they can be decided honestly: the
 * `ADMIN_EMAIL` pin inside the transaction, where the row's address is known,
 * and the minimum-one count after the update, where the number finally means
 * what the rule is about (`repository.ts`).
 */

export const dynamic = "force-dynamic";

/** Next 16 hands dynamic route params to the handler as a promise. */
interface Contexto {
  params: Promise<{ usuarioId: string }>;
}

export async function DELETE(_request: Request, { params }: Contexto): Promise<NextResponse> {
  const acceso = await guardRouteAdmin();
  if (!acceso.allowed) {
    return acceso.response;
  }

  const usuarioId = idUsuarioSchema.safeParse((await params).usuarioId);
  if (!usuarioId.success) {
    return failureResponse(identificadorInvalido());
  }

  try {
    /*
     * Read per request, not at module load: this module is evaluated during
     * `next build`, where the runtime configuration legitimately does not exist,
     * and an operator who changes `ADMIN_EMAIL` should not have to reason about
     * when a module was first imported. An unset value normalizes to `""`, which
     * pins nobody — the same safe direction `isAdminEmail` takes.
     */
    const administrador = await revocarAdministrador(
      prisma,
      usuarioId.data,
      normalizeEmail(process.env.ADMIN_EMAIL),
    );

    return NextResponse.json({ administrador });
  } catch (error) {
    /* The detail stays in the server log; the browser gets a code and a sentence. */
    console.error("DELETE /api/admins/[usuarioId]", error);
    return failureResponse(errorDeRol(error));
  }
}
