import type { NextConfig } from "next";
import { REQUEST_ACCESS_URL } from "./src/lib/constants";

const nextConfig: NextConfig = {
  // Mark exceljs as an external package for server components
  // This prevents it from being bundled in server-side code
  serverExternalPackages: ['exceljs', '@anthropic-ai/sdk', 'openai'],
  // Turbopack configuration (Next.js 16+ uses Turbopack by default)
  turbopack: {
    // Turbopack will handle the dynamic imports correctly
  },
  async redirects() {
    return [
      {
        // Access requests are captured by the landing page's form, which
        // writes to Airtable. The old in-app application form never submitted
        // anywhere, so this route hands off to the single real intake.
        source: "/request-access",
        destination: REQUEST_ACCESS_URL,
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
