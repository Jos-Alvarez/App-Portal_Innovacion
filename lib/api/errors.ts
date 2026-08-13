import { NextResponse } from "next/server";

/**
 * The error contract of the portal's internal API — ADR 0003, for every route
 * under `/api`.
 *
 * ONE ENVELOPE, NOT ONE PER STATUS CODE. `ApiError` was born inside
 * `lib/authz/decisions.ts`, where the guard needed a body for its 401 and 403.
 * It lives here now because it was never an authorization concept: a 400 from a
 * malformed URL, a 404 from a deleted row and a 409 from a duplicate name all
 * answer the same question the guard's denial answers — what went wrong, and
 * what does the reader see. `decisions.ts` re-exports the type so its own
 * callers are unaffected, but this module is where the shape is defined.
 *
 * The alternative — each route inventing its own body — was rejected on the
 * client's behalf: a `fetch` wrapper that has to branch on the status code to
 * know which shape it received is a wrapper that will eventually branch wrong,
 * and the first symptom is an empty error toast in front of a collaborator.
 *
 * `mensaje` is shown to the reader as it stands. DESIGN.md requires plain
 * Spanish with no technical codes, so nothing here may ever carry a SQL Server
 * error number, a Prisma message or the name of a validation library. `codigo`
 * is the stable handle the UI can branch on when it wants to; it is never
 * rendered.
 */

/** The JSON body every failing `/api` route answers with. */
export interface ApiError {
  codigo: string;
  mensaje: string;
}

/**
 * A failure before it becomes a `Response`: the status code and the body,
 * still as plain data.
 *
 * Keeping the two together — and keeping them inert — is what lets the error
 * mapping of each resource be a pure function that a unit test can read the
 * status off directly, instead of a function that builds a `Response` a test
 * then has to await and unwrap.
 */
export interface ApiFailure {
  readonly status: number;
  readonly error: ApiError;
}

export function apiFailure(status: number, codigo: string, mensaje: string): ApiFailure {
  return { status, error: { codigo, mensaje } };
}

/**
 * The failure as a Route Handler answers it.
 *
 * The body is the `ApiError` itself, unwrapped: no `{ error: ... }` envelope
 * around it, matching exactly what `toRouteAuthorization` already sends for a
 * denial. A client that reads `codigo` off the parsed body is right for every
 * failing status this API can produce.
 */
export function failureResponse(failure: ApiFailure): NextResponse {
  return NextResponse.json(failure.error, { status: failure.status });
}
