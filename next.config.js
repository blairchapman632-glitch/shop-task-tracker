/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), "jspdf", "canvg"];
    }
    return config;
  },
};

module.exports = nextConfig;
