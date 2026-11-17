import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader, marker } from "./fixtures/vm-modules";

/**
 * The Statistics view's verification note, rendered: the cases eyes-on could
 * not reach because no test account holds a pending or verified video match.
 * `StatisticsView` is loaded for real with its providers stubbed (the
 * harness `match-report-practice.spec.ts` uses); the note's rule and copy
 * come from the real `match-verification.ts`.
 */

const ROOT = process.cwd();
const VIEW =
  "src/components/dashboard/matches/match-detail/statistics-view.tsx";
const UNVERIFIED =
  "These numbers come from automatic analysis and may change after Advantage reviews the match.";
const UPDATED =
  "Verified by Advantage. These numbers were updated after review.";

/** Modules loaded for real; every other `@/` import is a marker. */
const REAL = new Set([
  "@/lib/utils",
  "@/lib/data/match-utils",
  "@/lib/data/match-verification",
  "@/components/dashboard/matches/new-match-wizard/styles",
]);

function existsTsx(id: string) {
  return existsSync(resolve(ROOT, "src", `${id.slice(2)}.tsx`));
}

function render({
  verification,
  verificationPending,
  justVerified = false,
  sourceProvider = "splitstep",
}: {
  verification: { verifiedAt: string } | null;
  verificationPending: boolean;
  justVerified?: boolean;
  sourceProvider?: string;
}) {
  const real = createLoader({});
  const match = {
    id: "m-1",
    verification,
    verificationPending,
    sourceProvider,
    isPractice: false,
    player1: { name: "Ana Revelli" },
    player2: { name: "Jo Stepanov" },
  };
  const stubs: Record<string, unknown> = {
    "@/components/dashboard/matches/match-data-provider": {
      useMatchData: () => ({
        match,
        points: [{ id: "pt" }, { id: "pt2" }],
        statsResult: null,
      }),
    },
    "@/components/dashboard/matches/match-detail/match-report-context": {
      useMatchReport: () => ({
        state: { view: "statistics" },
        meta: {
          statsPublished: true,
          statsUnavailable: false,
          foldUnreconciled: false,
          isDerived: true,
          sample: false,
          savedViews: [],
          readOnly: false,
        },
      }),
    },
    "@/components/dashboard/matches/match-detail/verification-watch": {
      useJustVerified: () => justVerified,
    },
    "@/components/dashboard/matches/match-detail/match-report": {
      MatchReport: { Insight: marker("Insight") },
    },
    "@/components/dashboard/matches/match-detail/statistics-lob-keys": {
      StatisticsLobKeysProvider: ({
        children,
      }: {
        children: React.ReactNode;
      }) => children,
    },
    "next/image": marker("Image"),
  };
  const loader = createLoader({
    markUnknown: true,
    stubs: new Proxy(stubs, {
      has: (target, id) =>
        id in target ||
        String(id).startsWith("@/") ||
        String(id).startsWith("."),
      get: (target, id) => {
        if (id in target) return target[id as string];
        const name = String(id);
        if (REAL.has(name))
          return real.load(
            `src/${name.slice(2)}${existsTsx(name) ? ".tsx" : ".ts"}`,
          );
        return new Proxy({}, { get: (_, n) => marker(String(n)) });
      },
    }),
  });
  const exports = loader.load(VIEW) as Record<
    string,
    React.ComponentType<Record<string, unknown>>
  >;
  return renderToStaticMarkup(React.createElement(exports.StatisticsView));
}

const VERIFIED = { verifiedAt: "2026-11-10T12:00:00Z" };

test.describe("the Statistics view's verification note", () => {
  test("a pending match: the 'may change' note, above the insight card", () => {
    const html = render({ verification: null, verificationPending: true });
    expect(html).toContain('data-testid="unverified-stats-note"');
    expect(html).toContain(UNVERIFIED);
    expect(html.indexOf("unverified-stats-note")).toBeLessThan(
      html.indexOf('data-component="Insight"'),
    );
  });

  test("an unverified match nobody will review: no note", () => {
    const html = render({ verification: null, verificationPending: false });
    expect(html).not.toContain("unverified-stats-note");
    expect(html).not.toContain(UNVERIFIED);
  });

  test("a SwingVision import: no note", () => {
    const html = render({
      verification: null,
      verificationPending: false,
      sourceProvider: "swing-vision",
    });
    expect(html).not.toContain(UNVERIFIED);
  });

  test("a verified match on a fresh load: no note at all", () => {
    const html = render({ verification: VERIFIED, verificationPending: false });
    expect(html).not.toContain(UNVERIFIED);
    expect(html).not.toContain("verified-update-note");
  });

  test("a verified match this tab watched land: the 'updated' note", () => {
    const html = render({
      verification: VERIFIED,
      verificationPending: false,
      justVerified: true,
    });
    expect(html).toContain('data-testid="verified-update-note"');
    expect(html).toContain(UPDATED);
    expect(html).not.toContain(UNVERIFIED);
  });
});
