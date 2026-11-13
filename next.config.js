/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Staff memos live in Messages → Staff memos (?memo=<id> is passed through)
  async redirects() {
    return [{ source: "/memos", destination: "/messages?tab=memos", permanent: false }];
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = [...(config.externals || []), "jspdf", "canvg"];
    }
    return config;
  },
};

module.exports = nextConfig;
