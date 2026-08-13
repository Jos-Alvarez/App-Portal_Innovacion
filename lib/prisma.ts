import { PrismaClient } from "@prisma/client";

/**
 * Single Prisma Client instance for the whole portal.
 *
 * Next.js hot-reloads server modules in development, which would otherwise
 * build a new `PrismaClient` — and a new SQL Server connection pool — on every
 * reload until the shared corporate instance runs out of connections. Caching
 * the instance on `globalThis` keeps exactly one pool alive across reloads.
 * In production the module is evaluated once, so no cache is needed.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
