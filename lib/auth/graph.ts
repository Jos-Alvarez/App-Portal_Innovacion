/**
 * The portal's only Microsoft Graph call at login time.
 *
 * `department` is what feeds `usuario.area`, and it is NOT available as an
 * Entra ID token claim: it does not appear anywhere in Microsoft's optional
 * claims reference, so no app registration setting can put it in the id_token.
 * The only way to read it is Graph, and it must be asked for explicitly because
 * `GET /me` does not return it by default.
 *
 * The permission required is the delegated `User.Read`, which the Auth.js Entra
 * ID provider already requests in its default scope
 * (`openid profile email User.Read`). This is NOT the admin-consented
 * `User.Read.All` that ADR 0009 needs for the directory search of item #17.
 */

/** `GET /me` omits department unless it is selected explicitly. */
export const GRAPH_ME_DEPARTMENT_URL = "https://graph.microsoft.com/v1.0/me?$select=department";

/** Injectable for tests; defaults to the platform `fetch`. */
export type FetchLike = typeof fetch;

/**
 * Reads the signed-in user's department.
 *
 * Total by design: it resolves to `""` for every failure — no token, a Graph
 * outage, a 4xx/5xx, an unparseable body, or an account with no department.
 * This is the boundary where an optional profile attribute stops being able to
 * block a login: the caller cannot distinguish "no department" from "Graph was
 * down", because both must produce exactly the same outcome — the user signs in
 * with the empty-area bucket. Any throw here would abort the sign-in callback
 * and lock the user out of the portal over an attribute the portal only uses
 * for grouping in the analytics of item #18.
 */
export async function fetchDepartment(
  accessToken: string | null | undefined,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  if (typeof accessToken !== "string" || accessToken.trim() === "") return "";

  try {
    const response = await fetchImpl(GRAPH_ME_DEPARTMENT_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      console.warn(
        `[auth] Microsoft Graph returned ${response.status} for the department lookup; ` +
          "signing in with an empty area.",
      );
      return "";
    }

    const body: unknown = await response.json();
    const department = (body as { department?: unknown } | null)?.department;

    return typeof department === "string" ? department.trim() : "";
  } catch (error) {
    console.warn(
      "[auth] Microsoft Graph department lookup failed; signing in with an empty area.",
      error,
    );
    return "";
  }
}
