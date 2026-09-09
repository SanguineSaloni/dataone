import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use static export for Databricks Apps compatibility
  output: 'export',
  trailingSlash: true,
  skipTrailingSlashRedirect: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
