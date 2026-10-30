/** @type {import('next').NextConfig} */
const backend = process.env.BACKEND_URL ?? "http://localhost:8000";

const nextConfig = {
  reactStrictMode: true,
  // Proxy API calls so the browser talks to one origin (uploads, SSE, media)
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
