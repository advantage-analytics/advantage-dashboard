import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mark exceljs as an external package for server components
  // This prevents it from being bundled in server-side code
  serverExternalPackages: ['exceljs', '@anthropic-ai/sdk', 'openai'],
  // Turbopack configuration (Next.js 16+ uses Turbopack by default)
  turbopack: {
    // Turbopack will handle the dynamic imports correctly
  },
};

export default nextConfig;
