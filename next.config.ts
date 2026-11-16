import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // F-68: type-checking is enforced again (all pre-existing errors fixed);
  // the build fails loudly on any future type error instead of shipping it.
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
