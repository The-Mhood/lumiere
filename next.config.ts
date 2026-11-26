import type { NextConfig } from "next";

const nextConfig: NextConfig = {};

export default nextConfig;
export default {
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8000/api/:path*',
      },
    ];
  },
};
