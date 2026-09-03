import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['sharp'],
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
