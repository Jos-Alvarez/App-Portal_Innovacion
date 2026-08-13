import {
  type Authorization,
  type RecursoRef,
  type ResourceGrant,
  authorizeAdmin,
  authorizeGrant,
} from "@/lib/authz/decisions";

/**
 * The three questions the portal can ask about the current request, over an
 * injected source.
 *
 * Splitting the source out is what keeps this layer honest under test: the
 * production source reaches Auth.js and Prisma, so binding it here would make
 * every one of these branches unreachable without mocking half the framework.
 * With the source as a parameter, the interesting behaviour — which read runs,
 * with which arguments, and which read is skipped — is exercised for real.
 */

export interface AuthorizationSource {
  /** The signed-in collaborator, resolved from the session against the database. */
  account(): Promise<Authorization>;
  /** The grant this user holds over a resource, or `null` when there is none. */
  grant(recurso: RecursoRef, usuarioId: number): Promise<ResourceGrant | null>;
}

/**
 * "Is there an active collaborator behind this request."
 *
 * The portal itself and the suggestions box are open to every authenticated
 * collaborator (PRD), so this is the guard those pages need. It is not a
 * duplicate of the authentication gate in `proxy.ts`: the gate only proves a
 * session cookie is valid, while this one proves the account behind it still
 * exists and is still active, which is a database fact the cookie cannot know.
 */
export async function authorizeSessionRequest(source: AuthorizationSource): Promise<Authorization> {
  return source.account();
}

/** "Is the collaborator behind this request an administrator." */
export async function authorizeAdminRequest(source: AuthorizationSource): Promise<Authorization> {
  return authorizeAdmin(await source.account());
}

/**
 * "May the collaborator behind this request use this resource."
 *
 * The grant is only looked up once there is an account to look it up for: a
 * denied account has no id to key the query on, and querying anyway would mean
 * spending a database round trip to answer a question already settled.
 */
export async function authorizeResourceRequest(
  source: AuthorizationSource,
  recurso: RecursoRef,
): Promise<Authorization> {
  const account = await source.account();

  if (!account.allowed) {
    return account;
  }

  return authorizeGrant(account, await source.grant(recurso, account.usuario.id));
}
