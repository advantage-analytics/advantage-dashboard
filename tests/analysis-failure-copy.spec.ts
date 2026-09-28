import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { MatchAnalysis } from "@/lib/data/match-analysis";
import { ANALYSIS_FAILURE_COPY } from "@/components/dashboard/matches/analysis-failure-copy";
import { createLoader, marker } from "./fixtures/vm-modules";

/**
 * The match page's failure alert says different things for the two failure
 * statuses. `failed` is a video-provider failure: retry the same upload, or
 * upload a new recording. `derivation_failed` means the video was analyzed
 * but its rallies could not be reconciled with the entered score — neither a
 * retry nor a new recording helps, so neither is offered, and the
 * reconciler's reason is a muted detail line rather than the headline.
 *
 * `MatchAnalysisProgress` is rendered offline through `fixtures/vm-modules`
 * with the Realtime hook, `next/link` and the add-video route stubbed; every
 * other unknown import (the retry buttons among them) becomes a marker.
 */

const PANEL =
  "src/components/dashboard/matches/match-detail/match-analysis-progress.tsx";
const COPY = "src/components/dashboard/matches/analysis-failure-copy.ts";

type Props = { analysis: MatchAnalysis; matchId: string };

function render(
  status: MatchAnalysis["status"],
  overrides: Partial<MatchAnalysis> = {},
): string {
  const loader = createLoader({
    markUnknown: true,
    stubs: {
      "@/hooks/use-live-match-analysis": {
        useLiveMatchAnalysis: () => new Map(),
        withLiveAnalysis: (a: MatchAnalysis) => a,
      },
      "next/link": ({ children }: { children: React.ReactNode }) =>
        React.createElement("a", { "data-component": "Link" }, children),
      "@/lib/matches/add-video-href": { addVideoHref: (id: string) => id },
      "./retry-analysis": { RetryAnalysis: marker("RetryAnalysis") },
      "./retry-submission": { RetrySubmission: marker("RetrySubmission") },
    },
  });
  const { MatchAnalysisProgress } = loader.load(PANEL) as {
    MatchAnalysisProgress: React.ComponentType<Props>;
  };
  const analysis = {
    status,
    failNote: "5 point(s) resolved no winner",
    jobId: "job-1",
    ...overrides,
  } as MatchAnalysis;
  return renderToStaticMarkup(
    React.createElement(MatchAnalysisProgress, { analysis, matchId: "m1" }),
  );
}

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

test("derivation_failed: its own title and body, failNote as a muted detail, no retry or new-video link", () => {
  const html = render("derivation_failed");
  const out = decode(html);

  expect(html).toContain('role="alert"');
  expect(out).toContain(ANALYSIS_FAILURE_COPY.derivation_failed.title);
  expect(out).toContain(ANALYSIS_FAILURE_COPY.derivation_failed.body);
  expect(ANALYSIS_FAILURE_COPY.derivation_failed.title).toBe(
    "Analyzed, but the score couldn't be read cleanly",
  );

  expect(html).not.toContain('data-component="RetryAnalysis"');
  expect(out).not.toContain("Upload a new recording");
  expect(out).not.toContain("Retrying uses");

  const headline = alertHeadline(html);
  expect(headline).toBe(ANALYSIS_FAILURE_COPY.derivation_failed.title);
  expect(headline).not.toContain(NOTE);

  // Present, but only after the body, on its own muted line.
  expect(out.indexOf(NOTE)).toBeGreaterThan(
    out.indexOf(ANALYSIS_FAILURE_COPY.derivation_failed.body),
  );
  expect(html).toMatch(
    /<p class="[^"]*text-\[11px\][^"]*text-\[#888888\][^"]*">5 point\(s\) resolved no winner<\/p>/,
  );

  expect(html).not.toMatch(/splitstep|swingvision/i);
});

test("failed: unchanged — failNote headline, retry body, RetryAnalysis and the new-recording link", () => {
  const html = render("failed");
  const out = decode(html);

  expect(alertHeadline(html)).toBe(NOTE);
  expect(out).toContain("Retrying uses");
  expect(out).toContain(ANALYSIS_FAILURE_COPY.failed.body);
  expect(html).toContain('data-component="RetryAnalysis"');
  expect(out).toContain("Upload a new recording");
  expect(out).not.toContain(ANALYSIS_FAILURE_COPY.derivation_failed.title);

  expect(html).not.toMatch(/splitstep|swingvision/i);
});

test("failed + inputRejected: failNote headline, input-rejected body, no retry, still the new-recording link", () => {
  const failNote = "The video must be at least 29.9 fps.";
  const html = render("failed", {
    inputRejected: true,
    jobId: "job-1",
    failNote,
  } as Partial<MatchAnalysis>);
  const out = decode(html);

  expect(alertHeadline(html)).toBe(failNote);
  expect(out).toContain(ANALYSIS_FAILURE_COPY.failed.inputRejected.body);
  expect(out).toContain("Upload a new recording");

  expect(html).not.toContain('data-component="RetryAnalysis"');
  expect(out).not.toContain("Retrying uses");

  expect(html).not.toMatch(/splitstep|swingvision/i);
});

test("the copy module carries the failed strings verbatim and never names the vendor", () => {
  expect(ANALYSIS_FAILURE_COPY.failed.title).toBe("Analysis stopped");
  expect(
    ANALYSIS_FAILURE_COPY.failed.body.startsWith(
      "Retrying uses the video you already uploaded — nothing needs uploading again.",
    ),
  ).toBe(true);
  expect(ANALYSIS_FAILURE_COPY.failed.uploadLink).toBe(
    "Upload a new recording",
  );
  expect(ANALYSIS_FAILURE_COPY.failed.drawer).toEqual({
    retry:
      "Retrying uses the video you already uploaded. Nothing needs uploading again.",
    details: "The match page has the details.",
  });

  expect(ANALYSIS_FAILURE_COPY.failed.inputRejected.body).not.toMatch(
    /Retrying/,
  );
  expect(ANALYSIS_FAILURE_COPY.failed.inputRejected.drawer).not.toMatch(
    /Retrying/,
  );
  expect(ANALYSIS_FAILURE_COPY.failed.inputRejected.body).toMatch(
    /recording requirement/,
  );
  expect(ANALYSIS_FAILURE_COPY.failed.inputRejected.drawer).toMatch(
    /new recording/,
  );

  const source = readFileSync(resolve(process.cwd(), COPY), "utf8");
  expect(source).not.toMatch(/splitstep|swingvision/i);
});
