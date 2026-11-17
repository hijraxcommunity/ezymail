import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // F-68: type-checking is enforced again (all pre-existing errors fixed);
  // the build fails loudly on any future type error instead of shipping it.
  reactStrictMode: false,
  // Required for Prisma + pg adapter in Vercel serverless
  serverExternalPackages: ['pg', '@prisma/adapter-pg', 'sharp'],
  // F-50a: the wildcard `remotePatterns: [{ hostname: '**' }]` turned
  // next/image into an open image proxy for any HTTPS host. Nothing in the
  // codebase imports next/image at all (avatars are same-origin
  // /api/user/avatar/[id] responses rendered by the shadcn Avatar), so the
  // block is removed outright — remote image optimization now allows
  // nothing instead of everything.
  //
  // F-50b: baseline security headers. A strict Content-Security-Policy
  // needs nonce plumbing through Next's inline bootstrap and is deferred —
  // these are the low-risk headers that cost nothing today.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
    ];
  },
};

export default nextConfig;
