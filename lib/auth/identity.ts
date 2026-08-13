/**
 * Pure identity rules for the Entra ID login (ADR 0009).
 *
 * Every function here is total and side-effect free: it receives the allowed
 * domain and the administrator address as arguments instead of reading
 * `process.env`, so the rules that decide who gets into the portal can be
 * tested without an identity provider, a network or a database.
 *
 * Nothing in this module knows about `es_admin` as an authorization answer.
 * ADR 0007 keeps the role in the database and re-reads it on every request;
 * `esAdmin` here is only the value written by the upsert at login time.
 */

/** Physical widths of the `usuario` columns (prisma/schema.prisma). */
const MAX_CORREO_LENGTH = 320;
const MAX_NOMBRE_LENGTH = 200;
const MAX_AREA_LENGTH = 120;

/** Claims of the Entra ID id_token this module reads. */
export interface IdentityClaims {
  email?: unknown;
  preferred_username?: unknown;
  name?: unknown;
}

/** One `usuario` row as the login writes it. */
export interface UsuarioUpsertInput {
  correo: string;
  nombre: string;
  area: string;
  esAdmin: boolean;
}

/** Trimmed, lowercased text, or `""` for anything that is not usable text. */
function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * The single normalization every comparison in this module goes through.
 * E-mail domains are case-insensitive and Entra ID is inconsistent about the
 * case it emits, so comparing raw claim values would reject legitimate users
 * and — worse — could let a mixed-case address past a lowercase allowlist.
 */
export function normalizeEmail(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

/**
 * The address that identifies the user.
 *
 * The Entra ID provider maps `email` and nothing else, but that claim only
 * exists when the account has a `mail` attribute in the directory. The UPN in
 * `preferred_username` is always present, so it is the fallback — without it a
 * perfectly valid corporate account would be rejected for having no address.
 */
export function selectIdentityEmail(claims: IdentityClaims): string {
  return normalizeEmail(claims.email) || normalizeEmail(claims.preferred_username);
}

/** Splits a normalized address, or returns `null` if it is not one address. */
function splitAddress(email: string): { local: string; domain: string } | null {
  if (email === "" || email.length > MAX_CORREO_LENGTH) return null;
  if (/\s/.test(email)) return null;

  const parts = email.split("@");
  if (parts.length !== 2) return null;

  const [local, domain] = parts;
  if (local === "" || domain === "") return null;

  return { local, domain };
}

/**
 * Whether the authenticating address belongs to the corporate domain
 * (PRD.md: "el correo corporativo no está en el dominio esperado ... el login
 * debe rechazarlo").
 *
 * Fails closed in every ambiguous case: a missing, malformed or oversized
 * address, and a missing or blank allowed domain, all return `false`. A blank
 * `ALLOWED_EMAIL_DOMAIN` letting every domain through would be a security
 * hole, so the absence of a rule is never read as permission.
 *
 * Subdomains are rejected. `usuario@mail.corp.com` is a different DNS
 * namespace from `usuario@corp.com` and Entra ID can federate it to a
 * different tenant; only an exact domain match is the corporate domain.
 */
export function isEmailFromAllowedDomain(email: unknown, allowedDomain: unknown): boolean {
  const address = splitAddress(normalizeEmail(email));
  if (address === null) return false;

  // Tolerate `@corp.com`, which is how people naturally write a domain.
  const expected = normalizeEmail(allowedDomain).replace(/^@/, "");
  if (expected === "") return false;

  return address.domain === expected;
}

/**
 * Whether this login is the break-glass administrator declared in
 * `ADMIN_EMAIL`.
 *
 * An unset or blank `ADMIN_EMAIL` promotes nobody, which is the safe
 * direction: the failure mode is "no administrator was bootstrapped", never
 * "everybody is an administrator".
 */
export function isAdminEmail(email: unknown, adminEmail: unknown): boolean {
  const candidate = normalizeEmail(email);
  const configured = normalizeEmail(adminEmail);

  return candidate !== "" && candidate === configured;
}

/**
 * Builds the `usuario` row from the identity claims plus the `department`
 * read from Microsoft Graph.
 *
 * `area` is never null: the column is NOT NULL with an empty default, and the
 * empty string is the documented "Entra ID reported no department" bucket that
 * the analytics of item #18 group on without branching on NULL
 * (prisma/schema.prisma). `nombre` is NOT NULL with no default, so an account
 * without a `name` claim falls back to its own address rather than to `""`.
 */
export function mapToUsuarioUpsert(input: {
  email: unknown;
  name?: unknown;
  department?: unknown;
  esAdmin: boolean;
}): UsuarioUpsertInput {
  const correo = normalizeEmail(input.email);
  if (correo === "") {
    throw new Error("mapToUsuarioUpsert requires a non-empty e-mail to key the usuario row");
  }

  const nombre = normalizeText(input.name) || correo;

  return {
    correo,
    nombre: nombre.slice(0, MAX_NOMBRE_LENGTH),
    area: normalizeText(input.department).slice(0, MAX_AREA_LENGTH),
    esAdmin: input.esAdmin,
  };
}
