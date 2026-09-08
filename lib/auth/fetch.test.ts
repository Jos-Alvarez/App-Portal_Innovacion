import { describe, expect, it } from "vitest";

import { fetchSinCache } from "./fetch";

/**
 * The one decision this module makes: which `fetch` the OAuth flow gets.
 *
 * It is worth pinning because the failure it prevents is silent and remote —
 * a login that dies with `?error=Configuration` and a `bodyUsed` message from
 * a library three layers down. If this ever starts returning the wrapped fetch
 * again, nothing else in the suite would notice.
 */

/** Stands in for the platform fetch. It is never called here. */
const original = (async () => new Response()) as typeof fetch;
const parcheado = (async () => new Response()) as typeof fetch;

describe("fetchSinCache", () => {
  it("devuelve el fetch original cuando Next dejó el suyo puesto", () => {
    const conParche = Object.assign(parcheado, { _nextOriginalFetch: original });

    expect(fetchSinCache(conParche)).toBe(original);
  });

  it("devuelve el global tal cual cuando nadie lo parcheó", () => {
    /* Fuera de Next — la suite, un script — no hay nada que desenvolver, y el
       llamador no tiene que saberlo. */
    expect(fetchSinCache(original)).toBe(original);
  });

  it("ignora un `_nextOriginalFetch` que no sea una función", () => {
    /* Defensa contra una versión futura de Next que cambie la propiedad: es
       preferible el fetch envuelto, que funciona, a un valor que no se puede
       llamar y rompería todo login. */
    const raro = Object.assign(parcheado, { _nextOriginalFetch: "ya no" });

    expect(fetchSinCache(raro as unknown as typeof fetch)).toBe(raro);
  });
});
