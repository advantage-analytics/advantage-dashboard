import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { byClass } from "@/components/dashboard/matches/analysis-failure-copy";
import { createLoader } from "./fixtures/vm-modules";

/**
 * `RecoveryAction` (T5): the one action a recovery row offers, picked purely
 * from its `RecoveryClass`. Loaded offline through `fixtures/vm-modules` —
 * same pattern as `drawer-sections.spec.ts` — with `next/link` and the
 * button components it wraps stubbed to markers, so each assertion only
 * needs to know which marker (or href, or nothing) came out, not what those
 * components render internally.
 */

const loader = createLoader({
  stubs: {
    "next/link": function Link({
      href,
      children,
      className,
    }: {
      href: string;
      children: React.ReactNode;
      className?: string;
    }) {
      return React.createElement(
        "a",
        { href, className, "data-component": "Link" },
        children,
      );
    },
    "./retry-action-button": {
      RetryActionButton: ({ label }: { label: string }) =>
        React.createElement("button", {
          "data-component": "RetryActionButton",
          "data-label": label,
        }),
    },
    "./retry-analysis": {
      RetryAnalysis: ({ jobId }: { jobId: string }) =>
        React.createElement("button", {
          "data-component": "RetryAnalysis",
          "data-job-id": jobId,
        }),
    },
    "./retry-submission": {
      RetrySubmission: ({ jobId }: { jobId: string }) =>
        React.createElement("button", {
          "data-component": "RetrySubmission",
          "data-job-id": jobId,
        }),
    },
  },
});

const { RecoveryAction } = loader.load(
  "src/components/dashboard/matches/match-detail/recovery-action.tsx",
) as {
  RecoveryAction: React.ComponentType<{
    recovery: string | null | undefined;
    jobId: string | null | undefined;
    matchId: string;
    variant: "card" | "drawer";
    stalled: boolean;
  }>;
};

function render(props: {
  recovery: string | null | undefined;
  jobId: string | null | undefined;
  matchId: string;
  variant: "card" | "drawer";
  stalled: boolean;
}): string {
  return renderToStaticMarkup(React.createElement(RecoveryAction, props));
}

test("retry on a failed (non-stalled) row renders RetryAnalysis, the resubmit path", () => {
  const html = render({
    recovery: "retry",
    jobId: "job-1",
    matchId: "match-1",
    variant: "card",
    stalled: false,
  });
  expect(html).toContain('data-component="RetryAnalysis"');
  expect(html).toContain('data-job-id="job-1"');
  expect(html).not.toContain("RetrySubmission");
});

test("retry on a stalled row renders RetrySubmission instead", () => {
  const html = render({
    recovery: "retry",
    jobId: "job-1",
    matchId: "match-1",
    variant: "card",
    stalled: true,
  });
  expect(html).toContain('data-component="RetrySubmission"');
  expect(html).toContain('data-job-id="job-1"');
  expect(html).not.toContain("RetryAnalysis");
});

test("retry with no jobId renders nothing", () => {
  expect(
    render({
      recovery: "retry",
      jobId: null,
      matchId: "match-1",
      variant: "card",
      stalled: false,
    }),
  ).toBe("");
});

test("rederive renders RetryActionButton against the rederive endpoint's label", () => {
  const html = render({
    recovery: "rederive",
    jobId: "job-2",
    matchId: "match-1",
    variant: "card",
    stalled: false,
  });
  expect(html).toContain('data-component="RetryActionButton"');
  expect(html).toContain(`data-label="${byClass.rederive.action}"`);
});

test("rederive with no jobId renders nothing", () => {
  expect(
    render({
      recovery: "rederive",
      jobId: null,
      matchId: "match-1",
      variant: "card",
      stalled: false,
    }),
  ).toBe("");
});

test("upload_again renders a Link to addVideoHref(matchId) labeled from byClass", () => {
  const html = render({
    recovery: "upload_again",
    jobId: null,
    matchId: "match-7",
    variant: "card",
    stalled: false,
  });
  expect(html).toContain('data-component="Link"');
  expect(html).toContain('href="/dashboard/matches/new?match=match-7"');
  expect(html).toContain(byClass.upload_again.action as string);
});

test("fix_recording renders a Link to addVideoHref(matchId) labeled from byClass", () => {
  const html = render({
    recovery: "fix_recording",
    jobId: "job-3",
    matchId: "match-8",
    variant: "drawer",
    stalled: false,
  });
  expect(html).toContain('data-component="Link"');
  expect(html).toContain('href="/dashboard/matches/new?match=match-8"');
  expect(html).toContain(byClass.fix_recording.action as string);
});

test("wait_or_ask, stats_unavailable and no class render nothing", () => {
  for (const recovery of [
    "wait_or_ask",
    "stats_unavailable",
    null,
    undefined,
  ]) {
    expect(
      render({
        recovery,
        jobId: "job-4",
        matchId: "match-1",
        variant: "card",
        stalled: false,
      }),
    ).toBe("");
  }
});
