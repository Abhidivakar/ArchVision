/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // We removed rewrites to use a custom Route Handler in src/app/api/[...path]/route.ts
  // for better control over timeouts and error handling.
};

export default nextConfig;
