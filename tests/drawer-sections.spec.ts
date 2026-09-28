import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ANALYSIS_FAILURE_COPY,
  WAIT_OR_ASK_VARIANTS,
  byClass,
} from "@/components/dashboard/matches/analysis-failure-copy";
import { addVideoHref } from "@/lib/matches/add-video-href";
import { createLoader, marker } from "./fixtures/vm-modules";

/**
 * The pure halves of the match drawer's shared body sections
 * (`drawer-sections.tsx`): the snapshot row mapping, the doubles-aware side
 * name, `AnalysisNotice`, which must read its failure copy from the shared
 * `analysis-failure-copy` module (`byClass`, by recovery class) rather than
 * hand-rolled strings, and the footer's `DrawerRecoveryAction`.
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
  AnalysisNotice: React.ComponentType<{
    status: string | null | undefined;
    recovery: string | null | undefined;
    note?: string | null;
    errorCode?: string | null;
    attemptsUsed?: number | null;
    canAct: boolean;
  }>;
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

/** The first `<p>` inside the `role="alert"` block — the alert's headline. */
function alertHeadline(html: string): string {
  const alert = html.slice(html.indexOf('role="alert"'));
  const match = alert.match(/<p\b[^>]*>([\s\S]*?)<\/p>/);
  if (!match) throw new Error("no <p> inside role=alert");
  return decode(match[1]);
}

const NOTE = "5 point(s) resolved no winner";

function notice(props: Record<string, unknown>): string {
  return renderToStaticMarkup(
    React.createElement(sections.AnalysisNotice, {
      status: "failed",
      recovery: null,
      canAct: true,
      ...props,
    } as never),
  );
}

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

// T9's derivation case, as a class. The reconciler's note is never drawn:
// `showsStoredNote()` keeps DERIVATION_* notes out of `note`, and the notice
// no longer reads the raw failNote.
test("AnalysisNotice: stats_unavailable reads the shared derivation title/body, no retry copy", () => {
  const html = notice({
    status: "derivation_failed",
    recovery: "stats_unavailable",
    note: null,
  });
  const out = decode(html);

  expect(html).toContain('role="alert"');
  expect(out).toContain(ANALYSIS_FAILURE_COPY.derivation_failed.title);
  expect(out).toContain(ANALYSIS_FAILURE_COPY.derivation_failed.body);
  expect(out).not.toContain("The match page has the details");
  expect(out).not.toContain("Retrying uses");
  expect(alertHeadline(html)).toBe(
    ANALYSIS_FAILURE_COPY.derivation_failed.title,
  );
  expect(out).not.toContain(NOTE);
});

test("AnalysisNotice: retry for a viewer who can act heads with the note and reads the drawer's retry body", () => {
  const html = notice({ recovery: "retry", note: NOTE });
  const out = decode(html);

  expect(alertHeadline(html)).toBe(NOTE);
  expect(out).toContain(
    "Retrying uses the video you already uploaded. Nothing needs uploading again.",
  );
  expect(out).not.toContain("The match page has the details.");
});

test("AnalysisNotice: retry without a note falls back to the class title", () => {
  const html = notice({ recovery: "retry", note: null });
  expect(alertHeadline(html)).toBe(byClass.retry.title);
  expect(decode(html)).toContain(byClass.retry.drawerBody);
});

// T9's "failed without canRetry": a viewer who cannot act reads the class
// title and the details line — never the note, never the retry promise.
test("AnalysisNotice: a viewer who cannot act reads the class title and the details line only", () => {
  for (const recovery of [
    "retry",
    "fix_recording",
    "upload_again",
    "rederive",
    "stats_unavailable",
  ]) {
    const html = notice({
      status: recovery === "stats_unavailable" ? "derivation_failed" : "failed",
      recovery,
      note: NOTE,
      canAct: false,
    });
    const out = decode(html);
    expect(alertHeadline(html), recovery).toBe(
      byClass[recovery as keyof typeof byClass].title,
    );
    expect(out, recovery).toContain("The match page has the details.");
    expect(out, recovery).not.toContain(NOTE);
    expect(out, recovery).not.toContain("Retrying");
  }
});

// T12's input-rejected case, as the fix_recording class.
test("AnalysisNotice: fix_recording keeps the vendor's note as headline and never offers a retry", () => {
  const note = "The video must be at least 29.9 fps.";
  const html = notice({ recovery: "fix_recording", note });
  const out = decode(html);

  expect(alertHeadline(html)).toContain(note);
  expect(out).toContain(ANALYSIS_FAILURE_COPY.failed.inputRejected.drawer);
  expect(out).not.toContain("Retrying uses");
  expect(out).not.toContain("The match page has the details.");
  expect(action({ recovery: "fix_recording" })).not.toContain("Retry");
});

test("AnalysisNotice: wait_or_ask picks its variant from the error code", () => {
  const html = notice({
    recovery: "wait_or_ask",
    note: null,
    errorCode: "NOT_ELIGIBLE",
    attemptsUsed: 1,
  });
  const out = decode(html);

  expect(alertHeadline(html)).toBe(WAIT_OR_ASK_VARIANTS.permission.title);
  expect(out).toContain(WAIT_OR_ASK_VARIANTS.permission.drawerBody);
  expect(out).not.toContain(WAIT_OR_ASK_VARIANTS.allowance.title);
});

test("upload_again with a manager: the notice says upload again, the footer links to the wizard, nothing says Retrying", () => {
  const matchId = "match-123";
  const body = decode(notice({ recovery: "upload_again", note: null }));
  const footer = action({ recovery: "upload_again", matchId });

  expect(body).toContain(byClass.upload_again.title);
  expect(body).toContain(byClass.upload_again.drawerBody);
  expect(footer).toContain(`href="${addVideoHref(matchId)}"`);
  expect(footer).toContain("Upload the video again");
  expect(body + footer).not.toContain("Retrying");
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

test("AnalysisNotice: an in-flight status still shows the placeholder line and no alert", () => {
  const html = notice({ status: "processing", recovery: null, note: null });
  const out = decode(html);

  expect(out).toContain(
    "Serve and pressure numbers appear here once analysis finishes.",
  );
  expect(html).not.toContain('role="alert"');
});
