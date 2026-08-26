import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent next dev from rewriting AGENTS.md / CLAUDE.md on every start.
  agentRules: false,
  serverExternalPackages: ["heic-convert", "heic-decode"],
};

export default nextConfig;
