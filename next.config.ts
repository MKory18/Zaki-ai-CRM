import type { NextConfig } from 'next';
import { SELLING_PAGE_HEADERS } from './src/lib/csp';

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

// Selling pages — a landing page and a storefront — have their own policy,
// defined once in src/lib/csp.ts because the proxy sends the same one for a
// seller's own domain. It adds exactly what such a page needs over the
// catch-all: the Google Fonts the theme offers, the four pixel networks the
// tracking engine loads, and `frame-ancestors 'self'` so the dashboard can
// preview the page in an iframe ('none' made the preview a blank box with
// nothing in any log to explain it). The dashboard keeps the shut CSP above.

// The block designer renders the landing page INSIDE the dashboard, so it
// needs the same font stylesheet the public page is allowed to load. Without
// it the seller picks a font, the browser refuses the stylesheet, and the
// preview silently keeps the old face — the choice appears to do nothing
// while the published page changes. One screen, one added source: the rest
// of the dashboard keeps the shut CSP above.
const lpEditorHeaders = [
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://openrouter.ai",
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
      { source: '/lp/:slug', headers: SELLING_PAGE_HEADERS },
      { source: '/s/:path*', headers: SELLING_PAGE_HEADERS },
      { source: '/lp/:slug/raw', headers: lpRawOverrideHeaders },
      { source: '/growth/landing-pages/:id/editor', headers: lpEditorHeaders },
    ];
  },
  async redirects() {
    return [
      // The tracking screen's old address, kept alive for bookmarks and for
      // links already pasted into notes and chats.
      { source: '/settings/pixels', destination: '/settings/tracking', permanent: true },
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
