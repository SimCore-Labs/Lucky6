import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/',
        destination: '/tv',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
