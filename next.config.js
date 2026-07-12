/** @type {import('next').NextConfig} */

const securityHeaders = [
  // Prevent clickjacking
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  // Prevent MIME-type sniffing
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Control referrer information
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Disable browser features not needed
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  // DNS prefetch control
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // Content Security Policy
  // NOTE: 'unsafe-inline' is required for Next.js styled-jsx and inline styles.
  // Tighten script-src once a nonce-based approach is adopted.
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.sheetjs.com https://cdnjs.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self'",
      "connect-src 'self' https://*.supabase.co",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
]

const nextConfig = {
  async headers() {
    return [
      {
        // Apply to all routes
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
  images: {
    // Product images are imported from arbitrary supplier CDNs
    // (Squarespace, Expormim, Google Drive, Pexels, Supabase...).
    // Allow any https host; the long-term plan is mirroring imported
    // images into Supabase Storage so this can be tightened again.
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
  // Next 15 renamed experimental.serverComponentsExternalPackages to the
  // stable top-level serverExternalPackages.
  serverExternalPackages: ['bcryptjs'],
  // Pin the file-tracing root to this project. Next 15 otherwise walks up and
  // can pick a stray lockfile (e.g. C:\Users\darli\package-lock.json) as the
  // workspace root, mis-tracing standalone output.
  outputFileTracingRoot: __dirname,
}

module.exports = nextConfig
