/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingIncludes: { "/api/**/*": ["./data/**/*"] },
  serverExternalPackages: ["postgres"],
};
export default nextConfig;
