import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Configure for server mode in Databricks Apps
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
