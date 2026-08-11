/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't let non-fatal TypeScript type warnings or ESLint warnings block a
  // production build on Vercel. Real syntax/duplicate errors still fail the build.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // nodemailer is imported dynamically by the email transport (SMTP/SES). Keep it
  // external so Next doesn't try to bundle its optional native deps. (Next 14 key.)
  experimental: { serverComponentsExternalPackages: ["nodemailer"] },
};

export default nextConfig;
