/**
 * The wire contract with the FastAPI processing service — the portal's half of
 * backlog item #9, written against the service that item actually shipped.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  READ THIS BEFORE CHANGING ANYTHING HERE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Every constant below was verified against the service's source, not inferred
 * from an ADR. Where the two disagree, the code is what runs:
 *
 * - ADR 0006 and TECH-DESIGN both write the internal path as
 *   `POST /interno/procesadores/{clave}/ejecutar`. The service mounts
 *   `POST /interno/procesadores/{clave}` — no `/ejecutar` segment. The service's
 *   own module says why: `app/recepcion.py` is a single parameterised reception
 *   route standing in for the per-processor shells until they exist.
 * - The multipart field is `archivos`, repeated once per file
 *   (`archivos: Annotated[list[UploadFile], File()]`).
 * - Authentication is `Authorization: Bearer <token>`, checked by an ASGI
 *   middleware on the `/interno` mount BEFORE a single byte of body is read.
 *
 * This module is the ONLY place in the portal that knows any of that. The route
 * handler builds no URL and sets no header of its own; the browser knows none
 * of it at all.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHY THE BODY IS STREAMED THROUGH INSTEAD OF PARSED AND REBUILT
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The obvious shape is `await request.formData()`, then build a fresh
 * `FormData` for the outgoing call. It was rejected on memory. A processor may
 * declare `entradas_max = 10` at 25 MB each, so parsing means holding up to
 * 250 MB of file in the portal's heap while a second copy is serialised for the
 * upstream request — on a Node process that also serves every other screen.
 *
 * So the proxy forwards `request.body` untouched, with the browser's own
 * `Content-Type` (boundary included). Memory stays flat regardless of payload,
 * and the portal never materialises a file it has no business reading.
 *
 * THE PRICE, STATED PLAINLY: because nothing re-encodes the body, the field
 * name the browser writes is the field name the service receives. That is why
 * `CAMPO_ARCHIVOS` is exported and why the upload form imports it instead of
 * writing `"archivos"` inline. The browser still knows nothing about the
 * service — it knows one constant belonging to the portal's own upload contract
 * — but the two are now pinned together, and this comment is the pin. Change
 * this constant and the form follows automatically; change the service's field
 * name and this constant is the single line that has to follow.
 */

/** The environment variables this module cannot work without. */
const REQUIRED = ["PROCESADORES_BASE_URL", "PROCESADORES_SERVICE_TOKEN"] as const;

export interface ServicioEnv {
  /** Origin of the internal service, without a trailing slash. */
  baseUrl: string;
  /** The service token, sent as a bearer credential. Never logged. */
  token: string;
}

export type EnvSource = Record<string, string | undefined>;

/**
 * Reads and validates the service configuration.
 *
 * FAILS LOUDLY AND AT THE FIRST EXECUTION, not silently at the first upload.
 * The same shape as `lib/auth/env.ts`: a missing variable throws an Error
 * naming every variable that is missing, so a misconfigured deployment is one
 * log line rather than a chain of 502s nobody can attribute.
 *
 * The token is returned as a plain string because that is what an
 * `Authorization` header needs, and it is read exactly once per request from
 * `process.env`. It is never interpolated into a message, a URL or a log line
 * anywhere in this codebase — `ejecutarEnServicio` below is its only consumer.
 */
export function readServicioEnv(source: EnvSource = process.env): ServicioEnv {
  const missing = REQUIRED.filter((name) => (source[name] ?? "").trim() === "");

  if (missing.length > 0) {
    throw new Error(
      `Missing required processing service environment variable(s): ${missing.join(", ")}. ` +
        "Set them in .env.local before executing a procesador.",
    );
  }

  return {
    /* A trailing slash would produce `//interno/...`, which some proxies
       normalise and others answer 404 to. Removing it here means the variable
       can be written either way. */
    baseUrl: (source.PROCESADORES_BASE_URL as string).trim().replace(/\/+$/, ""),
    token: (source.PROCESADORES_SERVICE_TOKEN as string).trim(),
  };
}

/**
 * The multipart field name, shared by the upload form and the service.
 *
 * See the header comment: this is the pin between the browser's form and
 * `app/recepcion.py`'s `archivos` parameter, and it exists as a constant
 * precisely so the coupling is one named thing instead of two string literals
 * that happen to match.
 */
export const CAMPO_ARCHIVOS = "archivos";

/**
 * The portal's own deadline for one execution — PRD and TECH-DESIGN:259, "un
 * procesamiento que supera 2 minutos se corta con error de timeout informado al
 * usuario".
 *
 * IT IS THE OUTER BOUND, AND THE SERVICE KNOWS IT. `app/core/configuracion.py`
 * defines `CORTE_DEL_PORTAL = 2 minutes` and refuses to start if its own
 * `TIMEOUT_EJECUCION` is not strictly below it (60 s by default). So in a
 * healthy system the service always gives up first and answers 504, and this
 * timer only fires when the service itself stopped answering — a hung worker, a
 * dead connection, a network that swallowed the response. Both outcomes reach
 * the reader as the same sentence, because from where they sit they are the
 * same event.
 */
export const TIMEOUT_MS = 120_000;

/** `POST /interno/procesadores/{clave}` — see the header comment on the missing `/ejecutar`. */
export function rutaDeEjecucion(clave: string): string {
  return `/interno/procesadores/${encodeURIComponent(clave)}`;
}

export interface PeticionDeEjecucion {
  /** `procesador.clave_procesador`, read from SQL Server on this request. */
  clave: string;
  /** The browser's multipart body, forwarded byte for byte. */
  cuerpo: ReadableStream<Uint8Array>;
  /** The browser's `Content-Type`, boundary included. */
  contentType: string;
  /** Aborts the upstream call; the caller owns the clock. */
  signal: AbortSignal;
  /** Injected by the suite; production reads `process.env`. */
  env?: ServicioEnv;
}

/**
 * Sends the execution to the service and returns its raw answer.
 *
 * NOTHING IS INTERPRETED HERE. The status code, the body and the headers come
 * back exactly as the service produced them, and `resultado.ts` decides what
 * they mean. Keeping transport and interpretation apart is what lets the whole
 * error vocabulary be tested as a pure function over a `Response`, with no
 * network and no mocked `fetch`.
 *
 * A rejection propagates untouched — a refused connection, a DNS failure, an
 * abort. The caller distinguishes them; wrapping them here would destroy the
 * `name` the caller needs to tell a timeout from an unreachable host.
 */
export async function ejecutarEnServicio({
  clave,
  cuerpo,
  contentType,
  signal,
  env = readServicioEnv(),
}: PeticionDeEjecucion): Promise<Response> {
  return fetch(`${env.baseUrl}${rutaDeEjecucion(clave)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.token}`,
      "Content-Type": contentType,
    },
    body: cuerpo,
    signal,
    /*
     * Required by undici whenever the body is a stream: it declares that the
     * request finishes sending before the response is read. Without it, Node
     * throws `RequestInit: duplex option is required when sending a body`.
     *
     * It is not in the DOM `RequestInit` type, hence the cast — and the cast is
     * confined to this one call rather than applied to the whole options
     * object, so every other field above is still type-checked.
     */
    ...({ duplex: "half" } as { duplex: "half" }),
  });
}
