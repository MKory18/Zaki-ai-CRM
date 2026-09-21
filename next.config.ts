import type { NextConfig } from 'next';

// HSTS is only sent in production so local dev over http stays clean.
const isProduction = process.env.NODE_ENV === 'production';

const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  // CSP: 'unsafe-inline' styles required by Tailwind; img allows data/blob thumbnails
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://openrouter.ai",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
  ...(isProduction
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
    : []),
];

// The public landing-page HTML (/lp/:slug/raw) is rendered ONLY inside a
// sandboxed opaque-origin iframe (same-origin parent, no credentials/cookies
// are sent into the sandbox). Framing same-origin is safe here, so the
// catch-all X-Frame-Options DENY / frame-ancestors 'none' are overridden
// with SAMEORIGIN / 'self'. The route handler additionally sends its own
// stricter per-response CSP.
const lpRawOverrideHeaders = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data: https:",
      "connect-src 'self'",
      "frame-ancestors 'self'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

// The public landing page, and only it, may load its Arabic display font
// from Google Fonts.
//
// The dashboard's CSP stays shut: a seller choosing a heading font is no
// reason to open a third-party style source across the whole admin. Scoping
// it here keeps the page's own stylesheet and script rules exactly as strict
// as the catch-all — the two lines added are a font stylesheet and the font
// files it points at, nothing else.
const lpPageHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['sharp'],
  // Do not advertise the framework version
  poweredByHeader: false,
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // After the catch-all so each overrides the CSP for its own route.
      { source: '/lp/:slug', headers: lpPageHeaders },
      { source: '/lp/:slug/raw', headers: lpRawOverrideHeaders },
    ];
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    // forbidden() -> app/forbidden.tsx with a real 403 for pages the role may not open
    authInterrupts: true,
  },
};

export default nextConfig;
