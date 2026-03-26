/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    typedRoutes: false
  },
  webpack: (config, { isServer }) => {
    // react-konva / konva tries to require 'canvas' for SSR — exclude it
    if (isServer) {
      config.externals = [...(config.externals || []), { canvas: 'canvas' }];
    } else {
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        canvas: false
      };
    }
    return config;
  }
};

module.exports = nextConfig;
