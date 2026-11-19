import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  devIndicators: false,
  experimental: { proxyClientMaxBodySize: '64mb' },
  async headers() {
    return [{ source: '/((?!api/|_next/).*)', headers: [
      {key:'X-Content-Type-Options',value:'nosniff'},
      {key:'X-Frame-Options',value:'DENY'},
      {key:'Referrer-Policy',value:'strict-origin-when-cross-origin'},
      {key:'Permissions-Policy',value:'camera=(), microphone=(self), geolocation=(), payment=()'},
      {key:'Content-Security-Policy',value:"frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'"},
    ]}, ...['/', '/shop', '/brands', '/products/:slug'].map(source => ({
      source, headers: [{ key: 'X-Poostikal-Public', value: '1' }],
    })), ...['/admin/:path*', '/account', '/myaccount/:path*', '/cart', '/checkout/:path*', '/login'].map(source => ({
      source, headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
    }))];
  },
  async rewrites() { return [{ source: "/api/:path*", destination: `${process.env.API_INTERNAL_URL || "http://127.0.0.1:4000"}/api/:path*` }]; },
  images: { qualities: [75, 95] },
};

export default nextConfig;
