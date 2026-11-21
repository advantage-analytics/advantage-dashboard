import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { createLoader } from "./fixtures/vm-modules";

/**
 * A new account's first session never reaches `DashboardShell`: the dashboard
 * layout redirects an un-onboarded account to `/onboarding`, and a coach goes
 * on from there into `/claim/*`. Before `IdentifySignedIn`, a sign-up that
 * confirmed its address on another device ran that whole flow as an anonymous
 * PostHog person that nothing merged into the account.
 *
 * The component is run through the vm loader with React's `useEffect` made
 * synchronous and `posthog-js` stubbed. It sends the id only (no person
 * properties, so no email or name), and skips a browser already identified.
 */

function run(currentDistinctId: string, userId: string, configured = true) {
  const calls: unknown[][] = [];
  const loader = createLoader({
    stubs: {
      react: { useEffect: (effect: () => void) => effect() },
      "posthog-js": {
        __esModule: true,
        default: {
          get_distinct_id: () => currentDistinctId,
          identify: (...args: unknown[]) => calls.push(args),
        },
      },
      "@/lib/posthog-client": { isPostHogConfigured: configured },
    },
  });
  const { IdentifySignedIn } = loader.load(
    "src/components/analytics/identify-signed-in.tsx",
  ) as { IdentifySignedIn: (props: { userId: string }) => unknown };
  IdentifySignedIn({ userId });
  return calls;
}

test("identifies an anonymous browser with the account id alone", () => {
  expect(run("anon-73e233b4", "user-1")).toEqual([["user-1"]]);
});

test("leaves an already-identified browser alone", () => {
  expect(run("user-1", "user-1")).toEqual([]);
});

test("does nothing when PostHog is not configured", () => {
  expect(run("anon", "user-1", false)).toEqual([]);
});

test("every screen /onboarding renders identifies the account", () => {
  const source = readFileSync(
    resolve(__dirname, "../src/app/onboarding/page.tsx"),
    "utf8",
  );
  // Three rendered branches: the join flow, the claim offer, the plain flow.
  expect(
    source.match(/<IdentifySignedIn userId=\{user\.id\} \/>/g),
  ).toHaveLength(3);
});

test("every /claim screen identifies a signed-in coach", () => {
  const source = readFileSync(
    resolve(__dirname, "../src/app/claim/layout.tsx"),
    "utf8",
  );
  expect(source).toMatch(/<IdentifySignedIn userId=\{user\.id\} \/>/);
});
