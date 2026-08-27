import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_ACTIONS === "true";
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: isGitHubPages ? "/termometro" : "",
  images: { unoptimized: true },
  allowedDevOrigins: ["192.168.1.4"],
};

export default nextConfig;