/**
 * Static export so the app can be hosted on GitHub Pages.
 * NEXT_PUBLIC_BASE_PATH is set to "/<repo name>" by the deploy workflow; local dev runs at "/".
 */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "export",
  trailingSlash: true,
  basePath,
  images: { unoptimized: true },
};

export default nextConfig;
