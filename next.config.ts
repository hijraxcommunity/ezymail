import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: '.',
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Required for Prisma + pg adapter in Vercel serverless
  serverExternalPackages: ['pg', '@prisma/adapter-pg', 'sharp'],
  // Allow sharp image processing
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
