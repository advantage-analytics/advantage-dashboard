import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ANALYSIS_FAILURE_COPY } from "@/components/dashboard/matches/analysis-failure-copy";
import { createLoader, marker } from "./fixtures/vm-modules";

/**
 * The pure halves of the match drawer's shared body sections
 * (`drawer-sections.tsx`): the snapshot row mapping, the doubles-aware side
 * name, and `AnalysisNotice`, which must read its failure copy from the
 * shared `analysis-failure-copy` module rather than hand-rolled strings.
 * Loaded through `fixtures/vm-modules` so the `.tsx` module is transpiled
 * offline, with the browser client and link stubbed.
 */

type Snapshot = {
  firstServeIn: string | null;
  firstServeWon: string | null;
  breakPoints: string | null;
  doubleFaults: string | null;
};

const loader = createLoader({
  stubs: {
    "next/link": marker("Link"),
    // `ProviderFact`'s marks; the real `next/image` reads `process.env`.
    "next/image": marker("Image"),
    "@/lib/supabase/client": { createClient: () => null },
    "@/components/dashboard/result-mark": { ResultMark: marker("ResultMark") },
    "@/components/dashboard/score-line": { ScoreLine: marker("ScoreLine") },
  },
});

const sections = loader.load(
  "src/components/dashboard/matches/drawer-sections.tsx",
) as {
  toSnapshot: (row: unknown) => Snapshot | null;
  drawerSideName: (name: string) => string;
  ProviderFact: (props: { providerId: string | null | undefined }) => {
    props: { label: string; children: unknown };
  } | null;
  AnalysisNotice: React.ComponentType<{
    status: string | null | undefined;
    failNote?: string | null;
    canRetry: boolean;
  }>;
};

test("toSnapshot rounds the percentages and joins break points", () => {
  expect(
    sections.toSnapshot({
      first_serve_pct: 61.4,
      first_serve_won_pct: 74.2,
      break_points_converted: 3,
      break_point_opportunities: 5,
      double_faults: 2,
    }),
  ).toEqual({
    firstServeIn: "61%",
    firstServeWon: "74%",
    breakPoints: "3/5",
    doubleFaults: "2",
  });
});

test("toSnapshot is null for an all-null row and for no row", () => {
  expect(
    sections.toSnapshot({
      first_serve_pct: null,
      first_serve_won_pct: null,
      break_points_converted: null,
      break_point_opportunities: null,
      double_faults: null,
    }),
  ).toBeNull();
  expect(sections.toSnapshot(null)).toBeNull();
});

test("drawerSideName keeps both doubles partners", () => {
  expect(sections.drawerSideName("Maya Reid / Jess Park")).toContain(" & ");
});

test("ProviderFact names a known provider and draws nothing otherwise", () => {
  const fact = sections.ProviderFact({ providerId: "swing-vision" });
  expect(fact?.props.label).toBe("Provider");
  expect(fact?.props.children).toBe("SwingVision");
  expect(sections.ProviderFact({ providerId: "not-a-provider" })).toBeNull();
  expect(sections.ProviderFact({ providerId: null })).toBeNull();
});

function decode(html: string): string {
  return html
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

/** The first `<p>` inside the `role="alert"` block — the alert's headline. */
function alertHeadline(html: string): string {
  const alert = html.slice(html.indexOf('role="alert"'));
  const match = alert.match(/<p\b[^>]*>([\s\S]*?)<\/p>/);
  if (!match) throw new Error("no <p> inside role=alert");
  return decode(match[1]);
}

const NOTE = "5 point(s) resolved no winner";

test("AnalysisNotice: derivation_failed reads the shared title/body, failNote as a muted third line, canRetry ignored", () => {
  const html = renderToStaticMarkup(
    React.createElement(sections.AnalysisNotice, {
      status: "derivation_failed",
      failNote: NOTE,
      canRetry: false,
    }),
  );
  const out = decode(html);

  expect(html).toContain('role="alert"');
  expect(out).toContain(ANALYSIS_FAILURE_COPY.derivation_failed.title);
  expect(out).toContain(ANALYSIS_FAILURE_COPY.derivation_failed.body);
  expect(out).not.toContain("The match page has the details");
  expect(out).not.toContain("Retrying uses");

  const headline = alertHeadline(html);
  expect(headline).toBe(ANALYSIS_FAILURE_COPY.derivation_failed.title);
  expect(headline).not.toContain(NOTE);

  expect(out.indexOf(NOTE)).toBeGreaterThan(
    out.indexOf(ANALYSIS_FAILURE_COPY.derivation_failed.body),
  );
});

test("AnalysisNotice: failed with canRetry reads the drawer's retry body", () => {
  const html = renderToStaticMarkup(
    React.createElement(sections.AnalysisNotice, {
      status: "failed",
      failNote: NOTE,
      canRetry: true,
    }),
  );
  const out = decode(html);

  expect(alertHeadline(html)).toBe(NOTE);
  expect(out).toContain(
    "Retrying uses the video you already uploaded. Nothing needs uploading again.",
  );
});

test("AnalysisNotice: failed without canRetry or failNote falls back to the shared title and details line", () => {
  const html = renderToStaticMarkup(
    React.createElement(sections.AnalysisNotice, {
      status: "failed",
      failNote: null,
      canRetry: false,
    }),
  );
  const out = decode(html);

  expect(out).toContain("Analysis stopped");
  expect(out).toContain("The match page has the details.");
});

test("AnalysisNotice: an in-flight status still shows the placeholder line and no alert", () => {
  const html = renderToStaticMarkup(
    React.createElement(sections.AnalysisNotice, {
      status: "processing",
      failNote: null,
      canRetry: false,
    }),
  );
  const out = decode(html);

  expect(out).toContain(
    "Serve and pressure numbers appear here once analysis finishes.",
  );
  expect(html).not.toContain('role="alert"');
});
