import { describe, expect, it, vi } from "vitest";

import { type SignInDependencies, authorizeAndSyncUsuario } from "@/lib/auth/sign-in";

/**
 * The order of the sign-in steps is the security contract of this item, and it
 * is asserted here rather than merely intended: a rejected domain must leave no
 * row behind, and it must not even reach Microsoft Graph.
 */

function deps(overrides: Partial<SignInDependencies> = {}): SignInDependencies & {
  fetchDepartment: ReturnType<typeof vi.fn>;
  upsertUsuario: ReturnType<typeof vi.fn>;
} {
  return {
    env: { allowedEmailDomain: "corp.com", adminEmail: "jefe@corp.com" },
    fetchDepartment: vi.fn(async () => "Innovación"),
    upsertUsuario: vi.fn(async () => {}),
    ...overrides,
  } as never;
}

describe("authorizeAndSyncUsuario — rejection", () => {
  it("rejects an address outside the corporate domain", async () => {
    const dependencies = deps();

    await expect(
      authorizeAndSyncUsuario({ email: "ajeno@otra.com" }, "token", dependencies),
    ).resolves.toBe(false);
  });

  it("writes nothing to the database when it rejects", async () => {
    const dependencies = deps();

    await authorizeAndSyncUsuario({ email: "ajeno@otra.com" }, "token", dependencies);

    expect(dependencies.upsertUsuario).not.toHaveBeenCalled();
  });

  it("does not even call Graph when it rejects", async () => {
    const dependencies = deps();

    await authorizeAndSyncUsuario({ email: "ajeno@otra.com" }, "token", dependencies);

    expect(dependencies.fetchDepartment).not.toHaveBeenCalled();
  });

  it("rejects claims carrying no address at all, writing nothing", async () => {
    const dependencies = deps();

    await expect(authorizeAndSyncUsuario({}, "token", dependencies)).resolves.toBe(false);
    expect(dependencies.upsertUsuario).not.toHaveBeenCalled();
  });
});

describe("authorizeAndSyncUsuario — acceptance", () => {
  it("upserts the mapped row and admits a corporate address", async () => {
    const dependencies = deps();

    await expect(
      authorizeAndSyncUsuario(
        { preferred_username: "Jose@Corp.com", name: "José Álvarez" },
        "token-abc",
        dependencies,
      ),
    ).resolves.toBe(true);

    expect(dependencies.fetchDepartment).toHaveBeenCalledWith("token-abc");
    expect(dependencies.upsertUsuario).toHaveBeenCalledWith({
      correo: "jose@corp.com",
      nombre: "José Álvarez",
      area: "Innovación",
      esAdmin: false,
    });
  });

  it("promotes the ADMIN_EMAIL account on this very login", async () => {
    const dependencies = deps();

    await authorizeAndSyncUsuario({ email: "Jefe@corp.com" }, "token", dependencies);

    expect(dependencies.upsertUsuario).toHaveBeenCalledWith(
      expect.objectContaining({ correo: "jefe@corp.com", esAdmin: true }),
    );
  });

  it("signs the user in with an empty area when Graph gives nothing back", async () => {
    const dependencies = deps({ fetchDepartment: vi.fn(async () => "") });

    await expect(
      authorizeAndSyncUsuario({ email: "jose@corp.com" }, "token", dependencies),
    ).resolves.toBe(true);
    expect(dependencies.upsertUsuario).toHaveBeenCalledWith(
      expect.objectContaining({ area: "" }),
    );
  });

  it("denies the login when the upsert fails, since no row means no portal", async () => {
    const dependencies = deps({
      upsertUsuario: vi.fn(async () => {
        throw new Error("SQL Server unreachable");
      }),
    });

    await expect(
      authorizeAndSyncUsuario({ email: "jose@corp.com" }, "token", dependencies),
    ).rejects.toThrow(/SQL Server unreachable/);
  });
});
