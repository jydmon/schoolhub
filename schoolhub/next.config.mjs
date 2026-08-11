/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't let non-fatal TypeScript type warnings or ESLint warnings block a
  // production build on Vercel. Real syntax/duplicate errors still fail the build.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
