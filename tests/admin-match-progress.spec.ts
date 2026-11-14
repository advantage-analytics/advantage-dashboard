import { expect, test } from "@playwright/test";

import {
  MATCH_PROGRESS_STEP_NAMES,
  matchProgressSteps,
  type MatchProgressFacts,
} from "@/lib/data/admin-match-progress";

/**
 * Admin › Matches progress steps (T6, T38) — pure, no I/O. Pins the order,
 * each fixture's step states, Published and Checked read off the match's
 * label session, and a verified match with no session falling back to
 * `matches.verified_at` for both.
 */

const UPLOADED = "2026-11-01T10:00:00.000Z";
const SENT = "2026-11-01T11:00:00.000Z";
const LANDED = "2026-11-01T15:00:00.000Z";
const VERIFIED = "2026-11-02T09:00:00.000Z";
const PUBLISHED = "2026-11-02T08:00:00.000Z";
const CHECKED = "2026-11-02T12:00:00.000Z";

function facts(overrides: Partial<MatchProgressFacts>): MatchProgressFacts {
  return {
    analysis: { status: "completed", jobId: "job-1" },
    uploadedAt: UPLOADED,
    sentForAnalysisAt: SENT,
    resultsLandedAt: LANDED,
    labelState: null,
    labelPublishedAt: null,
    labelCheckedAt: null,
    verifiedAt: null,
    ...overrides,
  };
}

function states(row: MatchProgressFacts) {
  return matchProgressSteps(row).map((step) => [step.name, step.state]);
}

test("steps come in the README order", () => {
  expect(matchProgressSteps(facts({})).map((step) => step.name)).toEqual([
    "Uploaded",
    "Sent for analysis",
    "Results landed",
    "Being labelled",
    "Published",
    "Checked",
  ]);
  expect([...MATCH_PROGRESS_STEP_NAMES]).toEqual(
    matchProgressSteps(facts({})).map((step) => step.name),
  );
});

test("an imported match with no processing job yields Uploaded alone", () => {
  expect(
    matchProgressSteps(
      facts({
        analysis: { status: "imported" },
        sentForAnalysisAt: null,
        resultsLandedAt: null,
      }),
    ),
  ).toEqual([{ name: "Uploaded", state: "done", at: UPLOADED }]);
});

test("uploading", () => {
  expect(
    states(
      facts({
        analysis: { status: "uploading", jobId: "job-1" },
        sentForAnalysisAt: null,
        resultsLandedAt: null,
      }),
    ),
  ).toEqual([
    ["Uploaded", "current"],
    ["Sent for analysis", "todo"],
    ["Results landed", "todo"],
    ["Being labelled", "todo"],
    ["Published", "todo"],
    ["Checked", "todo"],
  ]);
});

test("analysing", () => {
  const steps = matchProgressSteps(
    facts({
      analysis: { status: "processing", jobId: "job-1" },
      resultsLandedAt: null,
    }),
  );
  expect(steps.map((step) => [step.name, step.state])).toEqual([
    ["Uploaded", "done"],
    ["Sent for analysis", "done"],
    ["Results landed", "current"],
    ["Being labelled", "todo"],
    ["Published", "todo"],
    ["Checked", "todo"],
  ]);
  expect(steps[1].at).toBe(SENT);
});

test("failed after the vendor took it fails at Results landed", () => {
  expect(
    states(
      facts({
        analysis: { status: "failed", jobId: "job-1" },
        resultsLandedAt: null,
      }),
    ),
  ).toEqual([
    ["Uploaded", "done"],
    ["Sent for analysis", "done"],
    ["Results landed", "failed"],
    ["Being labelled", "todo"],
    ["Published", "todo"],
    ["Checked", "todo"],
  ]);
});

test("failed before it was sent fails at Sent for analysis", () => {
  expect(
    states(
      facts({
        analysis: { status: "failed", jobId: "job-1" },
        sentForAnalysisAt: null,
        resultsLandedAt: null,
      }),
    ).slice(0, 3),
  ).toEqual([
    ["Uploaded", "done"],
    ["Sent for analysis", "failed"],
    ["Results landed", "todo"],
  ]);
});

test("analysed and unlabelled", () => {
  const steps = matchProgressSteps(facts({}));
  expect(steps.map((step) => [step.name, step.state])).toEqual([
    ["Uploaded", "done"],
    ["Sent for analysis", "done"],
    ["Results landed", "done"],
    ["Being labelled", "todo"],
    ["Published", "todo"],
    ["Checked", "todo"],
  ]);
  expect(steps[2].at).toBe(LANDED);
});

test("being labelled", () => {
  expect(states(facts({ labelState: "labelling" }))).toEqual([
    ["Uploaded", "done"],
    ["Sent for analysis", "done"],
    ["Results landed", "done"],
    ["Being labelled", "current"],
    ["Published", "todo"],
    ["Checked", "todo"],
  ]);
});

test("verified with no label session: both steps done at verified_at", () => {
  const steps = matchProgressSteps(facts({ verifiedAt: VERIFIED }));
  expect(steps.map((step) => [step.name, step.state])).toEqual([
    ["Uploaded", "done"],
    ["Sent for analysis", "done"],
    ["Results landed", "done"],
    ["Being labelled", "done"],
    ["Published", "done"],
    ["Checked", "done"],
  ]);
  expect(steps[4].at).toBe(VERIFIED);
  expect(steps[5].at).toBe(VERIFIED);
});

test("published and unchecked", () => {
  const steps = matchProgressSteps(
    facts({
      labelState: "complete",
      labelPublishedAt: PUBLISHED,
      verifiedAt: VERIFIED,
    }),
  );
  expect(steps.slice(3).map((step) => [step.name, step.state])).toEqual([
    ["Being labelled", "done"],
    ["Published", "done"],
    ["Checked", "todo"],
  ]);
  expect(steps[4].at).toBe(PUBLISHED);
  expect(steps[5].at).toBeNull();
});

test("sent back: labelling again, still published, not checked", () => {
  for (const verifiedAt of [VERIFIED, null]) {
    const steps = matchProgressSteps(
      facts({
        labelState: "labelling",
        labelPublishedAt: PUBLISHED,
        verifiedAt,
      }),
    );
    expect(steps.slice(3).map((step) => [step.name, step.state])).toEqual([
      ["Being labelled", "current"],
      ["Published", "done"],
      ["Checked", "todo"],
    ]);
    expect(steps[4].at).toBe(PUBLISHED);
  }
});

test("checked: each step carries its own moment", () => {
  const steps = matchProgressSteps(
    facts({
      labelState: "complete",
      labelPublishedAt: PUBLISHED,
      labelCheckedAt: CHECKED,
      verifiedAt: VERIFIED,
    }),
  );
  expect(steps.slice(3).map((step) => [step.name, step.state])).toEqual([
    ["Being labelled", "done"],
    ["Published", "done"],
    ["Checked", "done"],
  ]);
  expect(steps[4].at).toBe(PUBLISHED);
  expect(steps[5].at).toBe(CHECKED);
});

test("a submitted label session without verification publishes nothing", () => {
  const steps = states(facts({ labelState: "submitted" }));
  expect(steps.slice(3)).toEqual([
    ["Being labelled", "done"],
    ["Published", "todo"],
    ["Checked", "todo"],
  ]);
});
