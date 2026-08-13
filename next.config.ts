import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  // Next 16 otherwise writes its own AGENTS.md/CLAUDE.md into the repo root.
  agentRules: false,
};

export default nextConfig;
