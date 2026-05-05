/** @type {import('next').NextConfig} */
const nextConfig = {
  output: process.env.SHOWCASE_STANDALONE === "true" ? "standalone" : undefined,
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
