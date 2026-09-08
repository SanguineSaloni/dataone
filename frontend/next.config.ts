import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Removed static export for Databricks Apps deployment
  // output: 'export',
  // distDir: 'out',
  
  // Configure for server mode in Databricks Apps
  images: {
    unoptimized: true,
  },
  
  // Ensure app works in containerized environment
  experimental: {
    outputFileTracingRoot: undefined,
  },
};

export default nextConfig;
