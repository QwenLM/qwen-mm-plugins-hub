import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: false,
  // Native links handle the host prefix; internal prerender routes stay at root.
  assetPrefix: process.env.SITE_BASE_PATH || '',
};

export default nextConfig;
