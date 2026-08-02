import js from "@eslint/js";
import next from "eslint-config-next/core-web-vitals";

// eslint-config-next 16 ships native flat config, so there is no FlatCompat
// bridge here. Do not reintroduce one: running these configs through
// @eslint/eslintrc throws "Converting circular structure to JSON" when its
// validator walks the flat plugin objects.
//
// `eslint-config-next/core-web-vitals` already bundles next/typescript
// (typescript-eslint parser + recommended rules), React and hooks rules — a
// separate `eslint-config-next/typescript` import would only duplicate them.

const eslintConfig = [
  // Global ignores. Must be a config object containing *only* `ignores` —
  // adding any other key scopes it to that block instead of the whole repo.
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      // Deno edge functions: URL and jsr: specifiers Node resolution cannot
      // follow. Linting them here yields only import noise.
      "supabase/functions/**",
      // Cloudflare Worker: separate deployment with its own tsconfig, its own
      // dependencies, and Workers runtime globals (R2Bucket, ExportedHandler)
      // that the app's TypeScript project does not know. Typechecked on its own
      // with `npm run typecheck` in workers/video-access.
      "workers/**",
      // Python utilities.
      "scripts/**",
      // Playwright output.
      "playwright-report/**",
      "test-results/**",
      // Vendored agent-skill tooling: gitignored, untracked, and largely
      // bundled/minified browser scripts. ESLint 9 does not read .gitignore,
      // so this has to be named explicitly.
      ".agents/**",
    ],
  },

  // Base JS rules, scoped to plain JavaScript only.
  //
  // These must NOT apply to .ts/.tsx. The base `no-unused-vars` cannot parse
  // TypeScript declaration syntax and flags every interface method parameter,
  // and `no-undef` does not know TS lib globals (BlobPart, RequestInit, …).
  // typescript-eslint replaces both with type-aware equivalents, which
  // eslint-config-next already wires up for TS files below.
  {
    files: ["**/*.{js,mjs,cjs}"],
    ...js.configs.recommended,
  },

  // Ordered last so Next's overrides win over the base recommendations.
  ...next,

  // --- React Compiler rules: burn-down list ---
  //
  // eslint-plugin-react-hooks v6 (shipped with Next 16) adds rules that did not
  // exist when most of this code was written. They report 70 pre-existing
  // violations, so leaving them at `error` would make `npm run lint` red on day
  // one and train everyone to ignore it.
  //
  // They are downgraded to `warn` so lint is a usable gate NOW, with every
  // finding still visible. This is a burn-down list, not a suppression:
  // delete a line below to promote that rule back to `error` once its
  // violations are cleared. Counts are from the initial run.
  //
  // Priority order, highest value first:
  //   1. react-hooks/refs — CLEARED, promoted to error (see below).
  //   2. react-hooks/set-state-in-effect — mixed. Some are real cascading
  //      renders (src/hooks/use-mobile.ts wants useSyncExternalStore); others
  //      are harmless mount-time init. Triage case by case.
  //   3. The rest are one-offs.
  //
  // NOTE: fixing these changes component runtime behavior (animation timing,
  // when state settles, hydration output) and there is currently no test
  // suite. Work in small batches and verify in the browser.
  //
  // react-hooks/refs is NOT listed below — it is back at its default `error`.
  // Three sites carry targeted eslint-disable comments with rationale:
  // radar-chart-section.tsx (Recharts hands us geometry during its own render)
  // and recent-activity.tsx / recent-matches.tsx (need the previous commit's
  // value to survive into the committed render, which state cannot express).
  {
    name: "react-compiler-burn-down",
    rules: {
      "react-hooks/set-state-in-effect": "warn", // 32
      "react-hooks/immutability": "warn", // 2
      "react-hooks/purity": "warn", // 1
      "react-hooks/preserve-manual-memoization": "warn", // 1
    },
  },
];

export default eslintConfig;
