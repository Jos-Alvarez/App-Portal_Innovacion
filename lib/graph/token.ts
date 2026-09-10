import type { DirectorioEnv } from "@/lib/admins/directorio-env";

/**
 * El token de aplicación con el que el portal le habla a Microsoft Graph.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  POR QUÉ ESTO SALIÓ DE `lib/admins/directorio.ts`
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Vivía ahí porque la búsqueda en el directorio fue lo primero que necesitó
 * hablar con Graph como aplicación. No era suyo: pedir un token de client
 * credentials no tiene nada que ver con buscar personas — es la puerta por la
 * que entra CUALQUIER llamada de este portal a Graph, y la foto de perfil es la
 * segunda que la cruza. Dejarlo allá habría obligado a que la barra superior
 * importara del módulo de administradores para dibujar un avatar.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  COMO APLICACIÓN Y NO COMO LA PERSONA QUE MIRA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `directorio.ts` ya lo argumenta y vale igual acá: el portal no guarda el
 * token de Graph de nadie. `auth.ts` no pone en la sesión más que la identidad
 * —ADR 0007 es el motivo— así que en el momento de una petición no hay un token
 * delegado que usar. El flujo de aplicación se paga con las credenciales que el
 * login ya tiene configuradas.
 *
 * NADA SE CACHEA. Un token guardado en el ámbito del módulo sobrevive a una
 * rotación del secreto y empieza a fallar mucho después de que el despliegue
 * creyó haberlo rotado. El pedido es un viaje contra el mismo host con el que
 * después se habla.
 */

/** El endpoint del token, para un issuer con tenant propio. */
export function tokenUrl(tenantId: string): string {
  return `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`;
}

/**
 * El scope de aplicación: todos los permisos ya consentidos para la app.
 *
 * `.default` es la forma del flujo de client credentials — no puede pedir un
 * subconjunto, y el conjunto que recibe es el que TI haya otorgado.
 */
export const GRAPH_SCOPE = "https://graph.microsoft.com/.default";

/**
 * El plazo del portal para un viaje contra Graph.
 *
 * Ocho segundos, y del lado del lector: alguien está mirando una pantalla. Un
 * `fetch` sin límite contra un endpoint colgado lo dejaría esperando sin
 * llegar nunca a la respuesta degradada que sí tenía.
 */
export const TIMEOUT_MS = 8_000;

/** Inyectable para las pruebas; por defecto, el `fetch` de la plataforma. */
export type FetchLike = typeof fetch;

/**
 * Pide el token de aplicación.
 *
 * @throws Error cuando el endpoint lo rechaza o no se lo puede alcanzar. El
 *         cuerpo del rechazo NO se incluye: repite el client id y, en algunas
 *         formas de error, parte del pedido — y este mensaje termina en un log
 *         del servidor.
 */
export async function pedirTokenDeAplicacion(
  env: DirectorioEnv,
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const respuesta = await fetchImpl(tokenUrl(env.tenantId), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.clientId,
      client_secret: env.clientSecret,
      scope: GRAPH_SCOPE,
      grant_type: "client_credentials",
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!respuesta.ok) {
    throw new Error(`Entra ID refused the application token with ${respuesta.status}.`);
  }

  const cuerpo: unknown = await respuesta.json();
  const token = (cuerpo as { access_token?: unknown } | null)?.access_token;

  if (typeof token !== "string" || token === "") {
    throw new Error("Entra ID answered the token request without an access_token.");
  }

  return token;
}
