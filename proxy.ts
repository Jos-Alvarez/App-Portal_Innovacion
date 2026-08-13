import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { CALLBACK_URL_PARAM, SIGN_IN_PATH, isPublicPath } from "@/lib/auth-gate";

/**
 * The authentication gate.
 *
 * `proxy.ts` is the Next 16 name for what used to be `middleware.ts`; the named
 * export must be `proxy`, and the runtime is Node.js and cannot be configured
 * (the `edge` runtime is not supported here), which is why importing the full
 * `auth` configuration is safe even though it reaches Prisma.
 *
 * Wrapping the handler in `auth()` means the session is verified, not merely
 * observed: Auth.js decrypts and validates the JWT cookie and exposes the
 * result as `request.auth`. A forged cookie is `null` here, so it cannot walk
 * past the gate the way a bare `cookies.has(...)` check would let it.
 *
 * SCOPE — authentication only. This gate asks one question: is there a valid
 * session, yes or no. It deliberately performs NO authorization: no `es_admin`
 * check, no assignment lookup, no database read of any kind. That belongs to
 * the per-request server-side guard of backlog item #4, which re-reads the role
 * and the assignments from SQL Server on every request so a revocation applies
 * immediately (ADR 0007). Adding a permission check here would both duplicate
 * that guard and quietly move a security decision into a layer that runs on
 * prefetches. It also would not match the product rule: PRD.md grants every
 * validly authenticated user the portal and the suggestions box without any
 * assignment at all, so "has a session" is the whole of the entry condition.
 */
export const proxy = auth((request) => {
  const { pathname, search } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (request.auth) {
    return NextResponse.next();
  }

  /*
   * Built from `request.nextUrl`, so the redirect always stays on the origin
   * the request arrived at. The destination travels as a same-site path and is
   * re-validated by `toSafeCallbackUrl` before the sign-in screen uses it.
   */
  const signInUrl = new URL(SIGN_IN_PATH, request.nextUrl);
  signInUrl.searchParams.set(CALLBACK_URL_PARAM, `${pathname}${search}`);

  return NextResponse.redirect(signInUrl);
});

export const config = {
  /*
   * Everything except Next's build output and static files. `/api` is NOT
   * excluded wholesale — only the Auth.js endpoints under it are public, and
   * they are allowed by `isPublicPath`, so any future endpoint is gated by
   * default rather than by remembering to add it here.
   *
   * The asset exclusion matters for the sign-in screen specifically: it renders
   * `public/logo.png` while the reader has no session, both directly and
   * through `/_next/image`.
   */
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)"],
};
