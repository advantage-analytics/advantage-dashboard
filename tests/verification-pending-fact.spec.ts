import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  VERIFICATION_PENDING,
  VERIFICATION_PENDING_SCOPE,
  VERIFICATION_PENDING_UNTIL,
  VERIFIED_BY_ADVANTAGE,
  VERIFIED_SCOPE,
} from "@/lib/data/match-verification";
import { createLoader, marker } from "./fixtures/vm-modules";

/**
 * T42 — the report's facts line says "Verification pending" (artboard
 * `docs/superpowers/specs/2026-11-12-admin-strip/CustSoft.dc.html`), offline.
 *
 * The real `MatchReportFacts`, `PendingFact`, `VerifiedFact`, `VerifiedMark`
 * and `match-verification.ts` render through `fixtures/vm-modules`. The
 * popover is stubbed open — Radix mounts its content only on click — so the
 * markup carries the trigger and the popover together.
 */

const ROOT = process.cwd();
const DETAIL = "src/components/dashboard/matches/match-detail/";

/** Popover pieces that always render, the content as a labelled dialog. */
const openPopover = {
  Popover: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  PopoverTrigger: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  PopoverContent: ({
    children,
    "aria-label": label,
  }: {
    children: React.ReactNode;
    "aria-label"?: string;
  }) =>
    React.createElement(
      "div",
      { role: "dialog", "aria-label": label },
      children,
    ),
};

/** `next/image` as a plain <img>, so the mark's classes reach the markup. */
function Img(props: Record<string, unknown>) {
  const { src, alt, className, width, height } = props;
  return React.createElement("img", {
    src: src as string,
    alt: alt as string,
    className: className as string,
    width: width as number,
    height: height as number,
  });
}

function loaderFor(match: Record<string, unknown>) {
  return createLoader({
    stubs: {
      "next/image": Img,
      "@/components/ui/popover": openPopover,
      "@/components/dashboard/matches/match-data-provider": {
        useMatchData: () => ({ match, points: [{ id: "a" }, { id: "b" }] }),
      },
      "@/components/dashboard/matches/match-detail/match-report-context": {
        useMatchReport: () => ({
          meta: { savedViews: [], readOnly: false },
        }),
      },
      "@/components/dashboard/matches/match-detail/format-clock": {
        shortMonthDate: () => "Nov 12",
      },
      "@/components/dashboard/matches/match-detail/set-scope": {
        totalGames: () => 19,
      },
      "@/lib/data/saved-views-logic": { savedViewsCountFact: () => "" },
      "@/components/dashboard/workspace-provider": {
        useOptionalWorkspace: () => null,
      },
      "@/components/dashboard/matches/match-detail/tell-us-dialog": {
        TellUsDialog: marker("TellUsDialog"),
      },
      "@/lib/services/labels/queue": {
        LABEL_QUEUE_FROM: "2026-11-01T00:00:00Z",
      },
      "@/lib/data/match-analysis": {
        isInFlight: () => false,
        isStatsUnavailable: () => false,
      },
    },
  });
}

function renderFacts(match: Record<string, unknown>): string {
  const exports = loaderFor(match).load(DETAIL + "report-facts.tsx") as {
    MatchReportFacts: React.ComponentType;
  };
  return renderToStaticMarkup(React.createElement(exports.MatchReportFacts));
}

function renderMark(props: Record<string, unknown>): string {
  const exports = loaderFor({}).load(
    "src/components/dashboard/matches/verified-mark.tsx",
  ) as { VerifiedMark: React.ComponentType<Record<string, unknown>> };
  // React 19 adds a <link rel="preload"> ahead of an <img>; the mark is the <img>.
  const html = renderToStaticMarkup(
    React.createElement(exports.VerifiedMark, props),
  );
  return html.match(/<img[^>]*\/>/)?.[0] ?? html;
}

/** The markup's visible text, tags dropped. */
const text = (html: string) => html.replace(/<[^>]+>/g, " ");

const BASE = {
  id: "m-1",
  score: { sets: [] },
  date: "2026-11-12T00:00:00+00:00",
  isPractice: false,
  tournamentName: "Fall Invitational",
  courtType: "Hard",
  verification: null,
  verificationPending: false,
};

test.describe("the facts line's verification fact", () => {
  test("pending: the last fact is Verification pending, with its popover", () => {
    const html = renderFacts({ ...BASE, verificationPending: true });
    const body = text(html);

    expect(body).toContain(VERIFICATION_PENDING);
    expect(body).not.toContain(VERIFIED_BY_ADVANTAGE);
    expect(VERIFICATION_PENDING_SCOPE).toBe(
      "We are checking every point against the video: who won and how it ended.",
    );
    expect(VERIFICATION_PENDING_UNTIL).toBe(
      "Until then, your statistics come from the automatic analysis and may change.",
    );
    expect(body).toContain(VERIFICATION_PENDING_SCOPE);
    expect(body).toContain(VERIFICATION_PENDING_UNTIL);

    // A button, and the line's last fact: nothing follows its popover.
    expect(html).toMatch(
      /<button type="button"[^>]*>.*Verification pending<\/button>/,
    );
    expect(html).toMatch(
      /<div role="dialog" aria-label="Verification pending">.*<\/div><\/div>$/,
    );
    expect(html.indexOf(VERIFICATION_PENDING)).toBeGreaterThan(
      html.indexOf("Hard"),
    );

    // No "Tell us", no date, no time.
    expect(body).not.toMatch(/Tell us/);
    expect(html).not.toContain("TellUsDialog");
    expect(body).not.toMatch(
      /\bVerified (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/,
    );
    expect(body).not.toMatch(/hour|minute|\d{1,2}:\d{2}|within/i);

    // Both marks greyed.
    expect(html.match(/opacity-55 grayscale/g)).toHaveLength(2);
  });

  test("verified: VerifiedFact as before, never the pending fact", () => {
    const html = renderFacts({
      ...BASE,
      verification: { verifiedAt: "2026-11-10T18:00:00Z" },
      // A stale flag never wins over a verified match.
      verificationPending: true,
    });
    const body = text(html);

    expect(body).toContain(VERIFIED_BY_ADVANTAGE);
    expect(body).toContain(VERIFIED_SCOPE);
    expect(body).toMatch(/Verified Nov \d+\./);
    expect(body).toContain("Something still wrong? Tell us");
    expect(body).not.toContain(VERIFICATION_PENDING);
    expect(html).not.toContain("grayscale");
  });

  test("neither: no verification fact at all", () => {
    const body = text(renderFacts(BASE));

    expect(body).toContain("2 points · 19 games");
    expect(body).toContain("Fall Invitational");
    expect(body).toContain("Hard");
    expect(body).not.toContain(VERIFICATION_PENDING);
    expect(body).not.toContain(VERIFIED_BY_ADVANTAGE);
  });
});

test.describe("VerifiedMark", () => {
  test("without pending the output is unchanged", () => {
    expect(renderMark({})).toBe(
      '<img src="/icons/verified-check-icon.svg" alt="" class="shrink-0" width="13" height="13"/>',
    );
  });

  test("pending greys and fades the same icon", () => {
    expect(renderMark({ pending: true })).toBe(
      '<img src="/icons/verified-check-icon.svg" alt="" class="shrink-0 opacity-55 grayscale" width="13" height="13"/>',
    );
  });
});

test("no component holds its own copy of the pending wording", () => {
  for (const file of [
    DETAIL + "pending-fact.tsx",
    DETAIL + "report-facts.tsx",
    "src/components/dashboard/matches/verified-mark.tsx",
  ]) {
    const source = readFileSync(resolve(ROOT, file), "utf8");
    expect(source, file).not.toContain('"Verification pending"');
    expect(source, file).not.toContain("We are checking every point");
    expect(source, file).not.toContain("Until then, your statistics");
  }
});
