import type { NextConfig } from "next";
import { REQUEST_ACCESS_URL } from "./src/lib/constants";

const nextConfig: NextConfig = {
  // Mark exceljs as an external package for server components
  // This prevents it from being bundled in server-side code.
  //
  // @azure/storage-blob is here for the same reason and one more: it signs the
  // vendor's video SAS, so it must never be reachable from a client bundle.
  // The browser upload path deliberately does not use it — see
  // src/lib/services/upload/azure-block-upload.ts.
  serverExternalPackages: [
    'exceljs',
    '@anthropic-ai/sdk',
    'openai',
    '@azure/storage-blob',
  ],
  // `react-aria-components` is a 60-component barrel: importing `DatePicker`
  // from it pulls the whole export graph — 106 modules against the 25 the
  // date field actually reaches. Next optimises a built-in list of packages
  // this way (lucide-react, recharts) but not this one, and dev never
  // tree-shakes at all, so every route holding a `DateField` paid for the
  // barrel. The package publishes per-component subpaths, which is what makes
  // the rewrite resolve.
  experimental: {
    optimizePackageImports: ['react-aria-components'],
  },
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
      {
        // A one-off team match is the ordinary wizard's job. This route wrapped
        // the same wizard in a preset that answered every question on step one,
        // including the one it had no business answering — the source — which
        // left a coach unable to hand in a SwingVision export. Its staff-only
        // guard also disagreed with the `canUploadForProgram` link that pointed
        // at it, so a player with an upload grant was bounced back silently.
        source: "/dashboard/team/schedule/new/single",
        destination: "/dashboard/matches/new",
        // 307, not 308. This path never shipped past `splitstep-integration`,
        // so no browser out there holds it, and a permanent redirect is cached
        // indefinitely — which would quietly poison the path if a one-off rail
        // that asks for its source is ever built here.
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
