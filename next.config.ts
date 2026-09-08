import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // Next 16 otherwise writes its own AGENTS.md/CLAUDE.md into the repo root.
  agentRules: false,

  /*
   * `/admin/enlaces` and `/admin/procesadores` were two screens until they
   * became one, `/admin/catalogo`. They are kept as redirects and not deleted
   * because an administrator's bookmark, or a link in an old email, is the one
   * reader who cannot be told about the merge — and a 404 tells them nothing.
   *
   * PERMANENT (308), because the merge is not provisional: the browser and any
   * crawler may cache it, which is exactly what should happen. The API routes
   * `/api/enlaces` and `/api/procesadores` are NOT affected — the two resources
   * stayed two, and only the screen was unified.
   */
  async redirects() {
    return [
      { source: "/admin/enlaces", destination: "/admin/catalogo", permanent: true },
      { source: "/admin/procesadores", destination: "/admin/catalogo", permanent: true },
    ];
  },
};

export default nextConfig;
