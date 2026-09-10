import { NextResponse } from "next/server";

import { readDirectorioEnv } from "@/lib/admins/directorio-env";
import { guardRoute } from "@/lib/authz";
import { leerFotoDePerfil } from "@/lib/graph/foto";

/**
 * La foto de perfil de quien está mirando.
 *
 *   GET /api/usuarios/me/foto → 200 image/jpeg | 204
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  `me` Y NO UN `{usuarioId}`, QUE ES LO QUE LA HACE SEGURA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * La dirección de la que se pide la foto sale del guard, nunca de la URL. Una
 * ruta con el id en el camino habría que defenderla de que cualquiera pida la
 * de cualquiera; esta no tiene esa superficie porque no hay nada que pedir: la
 * única foto que sabe servir es la de quien preguntó.
 *
 * Eso importa más de lo que parece acá. Graph se consulta con el token de
 * APLICACIÓN (`lib/graph/token.ts` explica por qué no hay uno delegado que
 * usar), y ese token puede leer a toda la empresa. Lo que impide que esta ruta
 * se convierta en un directorio de fotos no es un permiso de Graph: es que el
 * correo con el que la llama es el que el guard acaba de releer de SQL Server.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  204 Y NO 404 CUANDO NO HAY FOTO
 * ══════════════════════════════════════════════════════════════════════════
 *
 * No falta un recurso: la persona simplemente no tiene foto, que es el estado
 * normal de mucha gente. Un 404 en la consola del navegador, en cada pantalla,
 * le diría a quien depure el portal que algo se rompió. «Sin contenido» es
 * exactamente lo que pasó.
 *
 * De cualquiera de las dos formas el disco dibuja las iniciales: la foto entra
 * como `background-image` del avatar, así que una respuesta sin imagen no pinta
 * nada y lo que ya estaba debajo se queda. Sin JavaScript, sin `onError`, sin
 * el ícono de imagen rota.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  EL NAVEGADOR ES QUIEN LA RECUERDA
 * ══════════════════════════════════════════════════════════════════════════
 *
 * `private, max-age=86400`: un día. `private` porque es de una persona y ningún
 * proxy compartido debe guardarla. Sin esto, la barra superior —que se dibuja
 * en cada pantalla— pediría un viaje a Graph por navegación. Con esto, se pide
 * una vez y el resto del día sale del disco del navegador. El costo es que una
 * foto recién cambiada tarda hasta un día en aparecer, que para un avatar de
 * 32px es un precio que nadie nota.
 */

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const acceso = await guardRoute();
  if (!acceso.allowed) {
    return acceso.response;
  }

  /*
   * Se lee por petición y no al cargar el módulo: este archivo se evalúa
   * durante `next build`, donde la configuración legítimamente no existe.
   * `readDirectorioEnv` lanza cuando las credenciales no sirven, y esa falla
   * tiene que aterrizar donde aterrizan todas las demás — en el avatar sin
   * foto — y no en un 500.
   */
  let foto = null;

  try {
    foto = await leerFotoDePerfil(acceso.usuario.correo, { env: readDirectorioEnv() });
  } catch (error) {
    console.warn("[api] Sin credenciales para leer la foto de perfil.", error);
  }

  if (foto === null) {
    return new NextResponse(null, {
      status: 204,
      /* También se cachea el «no hay»: sin esto, quien no tiene foto pagaría el
         viaje a Graph en cada pantalla para volver a no recibir nada. */
      headers: { "Cache-Control": "private, max-age=86400" },
    }) as NextResponse;
  }

  return new NextResponse(foto.contenido, {
    status: 200,
    headers: {
      "Content-Type": foto.tipo,
      "Cache-Control": "private, max-age=86400",
    },
  }) as NextResponse;
}
