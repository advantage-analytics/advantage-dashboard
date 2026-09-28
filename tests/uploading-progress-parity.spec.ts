import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { MatchAnalysis } from "@/lib/data/match-analysis";
import { UPLOADING_COPY } from "@/components/dashboard/matches/upload-progress-copy";
import { createLoader } from "./fixtures/vm-modules";

/**
 * While a match's job is `uploading`, the match page's progress panel reads as
 * the wizard's "Uploading your video" screen: same title, same three steps,
 * same two notes — from one copy module both surfaces import.
 *
 * `MatchAnalysisProgress` is rendered offline through `fixtures/vm-modules`
 * with the Realtime hook, the retry buttons and `next/link` stubbed; the copy,
 * the stepper and the progress track are the real modules.
 */

const PANEL =
  "src/components/dashboard/matches/match-detail/match-analysis-progress.tsx";
const WIZARD =
  "src/components/dashboard/matches/new-match-wizard/UploadMatchSuccess.tsx";

type Props = { analysis: MatchAnalysis; matchId: string };

function render(analysis: MatchAnalysis): string {
  const loader = createLoader({
    stubs: {
      "next/link": ({ children }: { children: React.ReactNode }) =>
        React.createElement("a", null, children),
      "@/hooks/use-live-match-analysis": {
        useLiveMatchAnalysis: () => new Map(),
        withLiveAnalysis: (a: MatchAnalysis) => a,
      },
      "./retry-submission": { RetrySubmission: () => null },
      "./retry-analysis": { RetryAnalysis: () => null },
    },
  });
  const { MatchAnalysisProgress } = loader.load(PANEL) as {
    MatchAnalysisProgress: React.ComponentType<Props>;
  };
  return renderToStaticMarkup(
    React.createElement(MatchAnalysisProgress, { analysis, matchId: "m1" }),
  );
}

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function analysis(overrides: Partial<MatchAnalysis>): MatchAnalysis {
  return { status: "uploading", ...overrides } as MatchAnalysis;
}

test("uploading: the wizard's title, three steps in order, the percentage and both notes", () => {
  const html = render(analysis({ status: "uploading", uploadPercent: 42.7 }));
  const out = text(html);

  expect(out).toContain(UPLOADING_COPY.title);
  expect(UPLOADING_COPY.title).toBe("Uploading your video");

  const labels = [
    UPLOADING_COPY.steps.saved,
    UPLOADING_COPY.steps.video,
    UPLOADING_COPY.steps.analysis,
  ];
  expect(labels).toEqual(["Match saved", "Uploading video", "Analysis"]);
  // lastIndexOf: the section's own "Analysis" eyebrow sits above the card.
  const at = labels.map((label) => out.lastIndexOf(label));
  for (const index of at) expect(index).toBeGreaterThan(-1);
  expect(at).toEqual([...at].sort((a, b) => a - b));

  // Exactly three steps; the four-milestone track is gone.
  const steps = html.match(/<li\b/g) ?? [];
  expect(steps).toHaveLength(3);
  expect(out).not.toContain("Analyzing");

  // Floored, like the wizard.
  expect(out).toContain("42%");
  expect(html).toContain(`aria-label="${UPLOADING_COPY.trackLabel}"`);
  expect(html).toContain('aria-current="step"');

  const keep = out.indexOf(UPLOADING_COPY.notes.keepTabOpen);
  const reassure = out.indexOf(UPLOADING_COPY.notes.keepUsing);
  expect(keep).toBeGreaterThan(out.indexOf(UPLOADING_COPY.steps.video));
  expect(reassure).toBeGreaterThan(keep);
  expect(reassure).toBeLessThan(out.lastIndexOf(UPLOADING_COPY.steps.analysis));
});

test("uploading with no percentage yet shows no value rather than 0%", () => {
  const out = text(render(analysis({ status: "uploading" })));
  expect(out).toContain(UPLOADING_COPY.steps.video);
  expect(out).not.toMatch(/\d+%/);
});

test("other statuses keep their own headline and never the uploading copy", () => {
  for (const status of ["uploaded", "processing", "processed"] as const) {
    const out = text(render(analysis({ status })));
    expect(out).not.toContain(UPLOADING_COPY.title);
    expect(out).not.toContain(UPLOADING_COPY.notes.keepTabOpen);
  }
});

test("both surfaces import the one copy module and hard-code none of it", () => {
  const copy = [
    UPLOADING_COPY.title,
    UPLOADING_COPY.steps.video,
    UPLOADING_COPY.notes.keepTabOpen,
    UPLOADING_COPY.notes.keepUsing,
  ];
  for (const file of [PANEL, WIZARD]) {
    // Comments may name the copy; only code may not.
    const src = readFileSync(resolve(process.cwd(), file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(src).toContain('from "../upload-progress-copy"');
    for (const line of copy) expect(src).not.toContain(`"${line}"`);
  }
});
