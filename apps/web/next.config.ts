import path from 'node:path';
import type { NextConfig } from 'next';

const packages = ['core', 'gitlab', 'ingest', 'graph', 'impact', 'pack', 'ai', 'storage', 'services', 'queue'].map((p) => `@lens/${p}`);

const config: NextConfig = {
  transpilePackages: packages,
  // native/Node-only modules stay external to the bundle
  serverExternalPackages: ['@prisma/client', 'prisma', 'pg-boss', 'pg', 'adm-zip', 'mammoth'],
  poweredByHeader: false,
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    serverActions: {
      bodySizeLimit: '32mb', // several requirement documents of up to 10 MB each
      allowedOrigins: process.env.LENS_ALLOWED_ORIGINS?.split(',').map((s) => s.trim()).filter(Boolean),
    },
  },
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'same-origin' },
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      ],
    }];
  },
};
export default config;
