import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prevent next dev from rewriting AGENTS.md / CLAUDE.md on every start.
  agentRules: false,
};

export default nextConfig;
