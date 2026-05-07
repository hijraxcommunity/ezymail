import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Required for Prisma + pg adapter in Vercel serverless
  serverExternalPackages: ['pg', '@prisma/adapter-pg'],
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
