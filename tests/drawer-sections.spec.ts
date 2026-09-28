import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

import {
  DRAWER_NO_ACTION_BODY,
  WAIT_OR_ASK_VARIANTS,
  byClass,
} from "@/components/dashboard/matches/analysis-failure-copy";
import { addVideoHref } from "@/lib/matches/add-video-href";
import { createLoader, marker } from "./fixtures/vm-modules";

/**
 * The pure halves of the match drawer's shared body sections
 * (`drawer-sections.tsx`): the snapshot row mapping, the doubles-aware side
 * name, the compact `DrawerAnalysisSteps`, which must read its failure copy
 * from the shared `analysis-failure-copy` module (`byClass`, by recovery
 * class) rather than hand-rolled strings, and the footer's
 * `DrawerRecoveryAction`.
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
    // A real `<a>`, so the footer's upload link can be asserted by href.
    "next/link": ({
      href,
      children,
      className,
    }: {
      href: string;
      children: React.ReactNode;
      className?: string;
    }) => React.createElement("a", { href, className }, children),
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
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
  drawerRecovery: (
    status: string | null | undefined,
    recovery: string | null | undefined,
  ) => string | null;
  DrawerRecoveryAction: React.ComponentType<{
    recovery: string | null | undefined;
    jobId: string | null | undefined;
    matchId: string;
    variant: "primary" | "outline";
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

const NOTE = "5 point(s) resolved no winner";

function action(props: Record<string, unknown>): string {
  return decode(
    renderToStaticMarkup(
      React.createElement(sections.DrawerRecoveryAction, {
        jobId: "job-1",
        matchId: "match-1",
        variant: "primary",
        ...props,
      } as never),
    ),
  );
}

test("drawerRecovery: a failed row's class, the pre-class fallback, null otherwise", () => {
  expect(sections.drawerRecovery("failed", "fix_recording")).toBe(
    "fix_recording",
  );
  expect(sections.drawerRecovery("failed", undefined)).toBe("retry");
  expect(sections.drawerRecovery("derivation_failed", null)).toBe(
    "stats_unavailable",
  );
  // A stalled `uploaded` row is in flight to the drawers: the in-flight line,
  // no failure block — whatever class the loader gave it.
  expect(sections.drawerRecovery("uploaded", "retry")).toBeNull();
  expect(sections.drawerRecovery("completed", undefined)).toBeNull();
  expect(sections.drawerRecovery(null, undefined)).toBeNull();
});

test("DrawerRecoveryAction: Retry and Rebuild statistics are buttons in the caller's variant; wait_or_ask and stats_unavailable draw nothing", () => {
  const retry = action({ recovery: "retry" });
  expect(retry).toMatch(/<button[^>]*>Retry<\/button>/);
  expect(retry).toContain("bg-[var(--blue)]");
  expect(action({ recovery: "retry", variant: "outline" })).not.toContain(
    "bg-[var(--blue)]",
  );
  expect(action({ recovery: "rederive" })).toMatch(
    /<button[^>]*>Rebuild statistics<\/button>/,
  );
  // No job, nothing to act on.
  expect(action({ recovery: "retry", jobId: null })).toBe("");
  expect(action({ recovery: "wait_or_ask" })).toBe("");
  expect(action({ recovery: "stats_unavailable" })).toBe("");
  expect(action({ recovery: null })).toBe("");
});

// ── DrawerAnalysisSteps: the drawers' compact stepper ───────────────────────
// Every failure class as the drawer's four steps — plus the two states the
// retired failure notice never drew: a live upload and a stalled hand-off.

const drawerParts = sections as unknown as {
  DrawerAnalysisSteps: React.ComponentType<{
    analysis: Record<string, unknown> | null | undefined;
    now: number | null;
    canAct: boolean;
  }>;
  DrawerRecoveryAction: (props: {
    recovery: string | null | undefined;
    jobId: string | null | undefined;
    matchId: string;
    variant: "primary" | "outline";
    stalled?: boolean;
  }) => React.ReactElement<{
    label: string;
    pendingLabel: string;
    url: string;
    init?: RequestInit;
  }> | null;
};

const STEPS_NOW = Date.parse("2026-09-28T16:00:00Z");
const stepsMinutesAgo = (m: number) =>
  new Date(STEPS_NOW - m * 60_000).toISOString();

function steps(
  analysis: Record<string, unknown>,
  canAct = true,
  now: number | null = STEPS_NOW,
): string {
  return renderToStaticMarkup(
    React.createElement(drawerParts.DrawerAnalysisSteps, {
      analysis: { providerId: "splitstep", jobId: "job-1", ...analysis },
      now,
      canAct,
    }),
  );
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

/** The text of the one `role=` element — the stopped step's headline + body. */
function stoppedLines(html: string, role: "alert" | "status"): string[] {
  expect(count(html, `role="${role}"`)).toBe(1);
  const from = html.indexOf(`role="${role}"`);
  const block = html.slice(from, html.indexOf("</div>", from));
  return [...block.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map((m) =>
    decode(m[1]),
  );
}

function expectFrame(html: string) {
  expect(html).toContain(">Analysis</span>");
  expect(html).toContain('<ol class="flex flex-col" aria-label="Progress">');
  expect(count(html, "<li")).toBe(4);
  expect(html).toContain("text-[12px]");
  expect(html).not.toContain("text-[13px]");
  expect(html).not.toContain('role="progressbar"');
}

test("DrawerAnalysisSteps: stats_unavailable reads the shared derivation title/body in one alert", () => {
  const html = steps({
    status: "derivation_failed",
    recovery: "stats_unavailable",
    note: null,
  });
  expectFrame(html);
  expect(stoppedLines(html, "alert")).toEqual([
    byClass.stats_unavailable.title,
    byClass.stats_unavailable.drawerBody,
  ]);
  expect(decode(html)).not.toContain("Retrying uses");
  expect(decode(html)).not.toContain(DRAWER_NO_ACTION_BODY);
});

test("DrawerAnalysisSteps: retry for a viewer who can act heads with the note", () => {
  const html = steps({ status: "failed", recovery: "retry", note: NOTE });
  expectFrame(html);
  expect(stoppedLines(html, "alert")).toEqual([NOTE, byClass.retry.drawerBody]);
});

test("DrawerAnalysisSteps: retry without a note falls back to the class title", () => {
  const html = steps({ status: "failed", recovery: "retry", note: null });
  expect(stoppedLines(html, "alert")).toEqual([
    byClass.retry.title,
    byClass.retry.drawerBody,
  ]);
});

test("DrawerAnalysisSteps: a viewer who cannot act reads 'Analysis stopped' and the details line only", () => {
  for (const recovery of [
    "retry",
    "fix_recording",
    "upload_again",
    "rederive",
    "stats_unavailable",
  ]) {
    const html = steps(
      {
        status:
          recovery === "stats_unavailable" || recovery === "rederive"
            ? "derivation_failed"
            : "failed",
        recovery,
        note: NOTE,
      },
      false,
    );
    const out = decode(html);
    expect(stoppedLines(html, "alert"), recovery).toEqual([
      "Analysis stopped",
      DRAWER_NO_ACTION_BODY,
    ]);
    expect(out, recovery).not.toContain(NOTE);
    expect(out, recovery).not.toContain("Retrying");
  }
});

test("DrawerAnalysisSteps: fix_recording keeps the vendor's note as headline and never offers a retry", () => {
  const note = "The video must be at least 29.9 fps.";
  const html = steps({ status: "failed", recovery: "fix_recording", note });
  expect(stoppedLines(html, "alert")).toEqual([
    note,
    byClass.fix_recording.drawerBody,
  ]);
  expect(decode(html)).not.toContain("Retrying uses");
  expect(action({ recovery: "fix_recording" })).not.toContain("Retry");
});

test("DrawerAnalysisSteps: wait_or_ask picks its variant from the error code", () => {
  const html = steps({
    status: "failed",
    recovery: "wait_or_ask",
    note: null,
    errorCode: "NOT_ELIGIBLE",
    attemptsUsed: 1,
  });
  expect(stoppedLines(html, "alert")).toEqual([
    WAIT_OR_ASK_VARIANTS.permission.title,
    WAIT_OR_ASK_VARIANTS.permission.drawerBody,
  ]);
  expect(decode(html)).not.toContain(WAIT_OR_ASK_VARIANTS.allowance.title);
});

test("DrawerAnalysisSteps: upload_again with a manager — the video step stops, the footer links to the wizard, nothing says Retrying", () => {
  const matchId = "match-123";
  const html = steps({
    status: "failed",
    recovery: "upload_again",
    note: null,
  });
  const footer = action({ recovery: "upload_again", matchId });

  expect(stoppedLines(html, "alert")).toEqual([
    byClass.upload_again.title,
    byClass.upload_again.drawerBody,
  ]);
  expect(footer).toContain(`href="${addVideoHref(matchId)}"`);
  expect(footer).toContain("Upload the video again");
  expect(decode(html) + footer).not.toContain("Retrying");
});

test("DrawerAnalysisSteps: an in-flight status draws its note and no alert", () => {
  const html = steps({ status: "processing", recovery: null, note: null });
  expectFrame(html);
  expect(html).not.toContain('role="alert"');
  expect(decode(html)).toContain(
    "This fills in as soon as the analysis lands.",
  );
  // The retired notice's placeholder line is deliberately not carried over.
  expect(decode(html)).not.toContain("Serve and pressure numbers");
});

test("DrawerAnalysisSteps: uploading at 62% shows the value only — no bar, no notes", () => {
  const html = steps({
    status: "uploading",
    uploadPercent: 62.7,
    startedAt: stepsMinutesAgo(4),
  });
  expectFrame(html);
  expect(html).toContain(">62%</span>");
  expect(html).not.toMatch(/<p[ >]/);
  expect(html).not.toContain('role="alert"');
});

test("DrawerAnalysisSteps: a stalled retry hands off in a status, not an alert", () => {
  const html = steps({
    status: "uploaded",
    updatedAt: stepsMinutesAgo(20),
    recovery: "retry",
  });
  expectFrame(html);
  expect(html).not.toContain('role="alert"');
  expect(stoppedLines(html, "status")).toEqual([
    "This hasn't been sent for analysis yet",
    "Trying again costs nothing; nothing needs uploading again.",
  ]);
});

test("DrawerAnalysisSteps: a settled match draws nothing", () => {
  expect(steps({ status: "completed" })).toBe("");
  expect(
    renderToStaticMarkup(
      React.createElement(drawerParts.DrawerAnalysisSteps, {
        analysis: null,
        now: STEPS_NOW,
        canAct: true,
      }),
    ),
  ).toBe("");
});

test("DrawerAnalysisSteps: built on StepMark, never the progress track, no new rounded-full", () => {
  const source = readFileSync(
    "src/components/dashboard/matches/drawer-sections.tsx",
    "utf8",
  );
  expect(source).toMatch(
    /import \{[^}]*\bStepMark\b[^}]*\} from "@\/components\/dashboard\/shared\/vertical-steps"/,
  );
  expect(source).not.toContain("AnalysisProgressTrack");
  expect(source).not.toContain("rounded-full");
});

test("DrawerRecoveryAction: a stalled retry is 'Try again', POSTing { jobId } to /api/splitstep/jobs", () => {
  const html = action({ recovery: "retry", stalled: true });
  expect(html).toMatch(/<button[^>]*>Try again<\/button>/);
  expect(html).not.toContain(">Retry<");

  const element = drawerParts.DrawerRecoveryAction({
    recovery: "retry",
    jobId: "job-1",
    matchId: "match-1",
    variant: "primary",
    stalled: true,
  });
  expect(element?.props.pendingLabel).toBe("Sending…");
  expect(element?.props.url).toBe("/api/splitstep/jobs");
  expect(element?.props.init?.method).toBe("POST");
  expect(element?.props.init?.headers).toEqual({
    "Content-Type": "application/json",
  });
  expect(JSON.parse(String(element?.props.init?.body))).toEqual({
    jobId: "job-1",
  });

  // Not stalled: the resubmit route, as before.
  const retry = drawerParts.DrawerRecoveryAction({
    recovery: "retry",
    jobId: "job-1",
    matchId: "match-1",
    variant: "primary",
  });
  expect(retry?.props.label).toBe("Retry");
  expect(retry?.props.url).toBe("/api/splitstep/jobs/job-1/resubmit");
  // Stalled changes nothing for a class without a retry.
  expect(action({ recovery: "wait_or_ask", stalled: true })).toBe("");
  expect(action({ recovery: "retry", jobId: null, stalled: true })).toBe("");
});
