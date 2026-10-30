/** @type {import('next').NextConfig} */
const backend = process.env.BACKEND_URL ?? "http://localhost:8000";
const isBuild = process.env.NODE_ENV === "production";

// `next build` produces a static site in ./out that the FastAPI server serves
// on the same port as the API. `next dev` proxies /api to the backend instead.
const nextConfig = {
  reactStrictMode: true,
  trailingSlash: true,
  images: { unoptimized: true },
  ...(isBuild
    ? { output: "export" }
    : {
        async rewrites() {
          return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
        },
      }),
};

export default nextConfig;
