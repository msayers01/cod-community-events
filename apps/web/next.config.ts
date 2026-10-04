import type { NextConfig } from "next";
import { loadRootEnv } from "@cod/db";

loadRootEnv();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  transpilePackages: ["@cod/shared", "@cod/db", "@cod/realtime"],
};

export default nextConfig;
