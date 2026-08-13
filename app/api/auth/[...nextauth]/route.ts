import { handlers } from "@/auth";

/**
 * The Auth.js catch-all endpoint (sign-in, callback, sign-out, session, CSRF).
 * ADR 0007 delegates CSRF protection to the tokens Auth.js serves from here.
 */
export const { GET, POST } = handlers;
