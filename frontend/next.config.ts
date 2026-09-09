import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use static export for Databricks Apps compatibility
  output: 'export',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
