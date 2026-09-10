import type { DirectorioEnv } from "@/lib/admins/directorio-env";
import { TIMEOUT_MS, type FetchLike, pedirTokenDeAplicacion } from "@/lib/graph/token";

/**
 * La foto de perfil que la persona ya tiene en Entra ID.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  POR QUÉ NO VIAJA EN LA SESIÓN, QUE ES DE DONDE SE LA SACÓ
 * ══════════════════════════════════════════════════════════════════════════
 *
 * El proveedor de Auth.js la traía solo: su `profile()` por defecto pedía la
 * foto a Graph en CADA login y la metía en el token como base64.
 * `lib/auth/identity.ts` la sacó al escribir `mapToSessionUser`, y el motivo
 * que anotó —«nada en este portal dibuja una»— acaba de dejar de valer. El otro
 * motivo, que no anotó pero pesa más, sigue igual de vigente: una foto en
 * base64 son varios kilobytes, el token de sesión es una COOKIE, y una cookie
 * viaja en cada petición del navegador — incluidas todas las de `/api`. ADR
 * 0007 deja la sesión con la identidad y nada más.
 *
 * Tampoco se guarda en `usuario`: sería una columna que crece, una migración, y
 * una foto que envejece hasta el próximo login. Servirla desde acá la mantiene
 * fresca y le deja el trabajo de recordarla al navegador, que es quien mejor lo
 * hace — la ruta manda su propio `Cache-Control`.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  QUE NO HAYA FOTO NO ES UN ERROR
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Esta función es TOTAL: devuelve `null` para todo — una cuenta sin foto (Graph
 * contesta 404), el permiso `User.Read.All` sin consentir (403), Graph caído,
 * un cuerpo ilegible, el token rechazado. Y tiene que serlo, porque del otro
 * lado las cinco cosas terminan igual: el disco dibuja las iniciales, que es lo
 * que dibujaba antes de que esto existiera. Distinguirlas le daría al llamador
 * una decisión que no puede tomar.
 */

/** El tamaño estándar que Entra ID genera; alcanza y sobra para un disco de 32px. */
export const GRAPH_FOTO_URL = (correo: string): string =>
  `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(correo)}/photos/96x96/$value`;

/**
 * El original, sin recortar.
 *
 * No todos los inquilinos generan las miniaturas: cuando `96x96` no existe,
 * Graph contesta 404 aunque la persona SÍ tenga foto. Pedir el original después
 * es la diferencia entre «este inquilino no hace miniaturas» y «esta persona no
 * tiene foto», que desde afuera se ven igual.
 */
export const GRAPH_FOTO_ORIGINAL_URL = (correo: string): string =>
  `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(correo)}/photo/$value`;

/** Los bytes tal como llegaron, con el tipo que Graph declaró. */
export interface FotoDePerfil {
  contenido: ArrayBuffer;
  /** `image/jpeg` en la práctica; se reenvía lo que Graph diga. */
  tipo: string;
}

async function pedirFoto(
  url: string,
  token: string,
  fetchImpl: FetchLike,
): Promise<FotoDePerfil | null> {
  const respuesta = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!respuesta.ok) {
    return null;
  }

  return {
    contenido: await respuesta.arrayBuffer(),
    /* Lo que Graph declaró, y un respaldo razonable si no declaró nada: la
       respuesta es binaria y el navegador necesita saber qué es. */
    tipo: respuesta.headers.get("content-type") ?? "image/jpeg",
  };
}

/**
 * La foto de esa dirección, o `null` cuando no hay ninguna que servir.
 *
 * @see El comentario del módulo: ninguna falla se propaga.
 */
export async function leerFotoDePerfil(
  correo: string,
  opciones: { env: DirectorioEnv; fetchImpl?: FetchLike },
): Promise<FotoDePerfil | null> {
  const { env, fetchImpl = fetch } = opciones;

  try {
    const token = await pedirTokenDeAplicacion(env, fetchImpl);

    return (
      (await pedirFoto(GRAPH_FOTO_URL(correo), token, fetchImpl)) ??
      (await pedirFoto(GRAPH_FOTO_ORIGINAL_URL(correo), token, fetchImpl))
    );
  } catch (error) {
    console.warn(
      "[graph] No se pudo leer la foto de perfil; el avatar dibuja las iniciales.",
      error,
    );
    return null;
  }
}
