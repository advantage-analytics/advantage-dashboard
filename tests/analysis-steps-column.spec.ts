import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { MatchAnalysis, RecoveryClass } from "@/lib/data/match-analysis";
import type { MatchLineProps } from "@/components/dashboard/matches/match-line";
import { analysisStepsView } from "@/components/dashboard/matches/match-detail/analysis-steps";
import { createLoader } from "./fixtures/vm-modules";

/**
 * `AnalysisSteps`: the match page's analysis state drawn as the upload
 * wizard's final screen — card-free column, one `<h1>`, the match line, the
 * four-step stepper. Offline: real components rendered to static markup.
 *
 * `analysis-steps-view.spec.ts` pins which steps are in which state; this
 * pins the markup those steps become, and that a failing step carries the
 * one action `RecoveryAction` would draw on its own.
 */

const COLUMN =
  "src/components/dashboard/matches/match-detail/analysis-steps-column.tsx";

const passthrough = (tag: string) =>
  function Stub(props: Record<string, unknown>) {
    const { children, ...rest } = props;
    const attrs: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rest))
      if (typeof value !== "function" && typeof value !== "object")
        attrs[key] = value;
    return React.createElement(tag, attrs, children as React.ReactNode);
  };

const loader = createLoader({
  stubs: {
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "next/link": { __esModule: true, default: passthrough("a") },
    // Effects never run in a static render; this only keeps the browser
    // client (and its env reads) out of the module graph.
    "@/lib/supabase/client": {
      createClient: () => {
        throw new Error("no Supabase client offline");
      },
    },
  },
});

type ColumnProps = {
  analysis: MatchAnalysis;
  matchId: string;
  match: MatchLineProps;
  snapshotAt?: number;
  onCancel?: () => void;
  onResend?: () => void;
};
const { AnalysisSteps } = loader.load(COLUMN) as {
  AnalysisSteps: React.ComponentType<ColumnProps>;
};
const { RecoveryAction } = loader.load(
  "src/components/dashboard/matches/match-detail/recovery-action.tsx",
) as {
  RecoveryAction: React.ComponentType<{
    recovery: RecoveryClass;
    jobId: string | undefined;
    matchId: string;
    variant: "card" | "drawer";
    stalled: boolean;
  }>;
};
const { AnalysisStepsPreview } = loader.load(
  "src/app/design/analysis-steps-preview.tsx",
) as { AnalysisStepsPreview: React.ComponentType };

const NOW = Date.parse("2026-09-28T16:00:00Z");
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();
const MATCH_ID = "00000000-0000-4000-8000-000000000000";

const MATCH: MatchLineProps = {
  player: "Maya Chen",
  opponent: "Sofia Alvarez",
  won: false,
  sets: [
    { player1: 4, player2: 6 },
    { player1: 3, player2: 6 },
  ],
};

const BASE: MatchAnalysis = {
  status: "uploading",
  providerId: "splitstep",
  fileName: "IMG_4821.MOV",
  window: "1h 12m",
  jobReference: undefined,
  jobId: "00000000-0000-4000-8000-000000000001",
};

const CASES: { id: string; analysis: MatchAnalysis }[] = [
  {
    id: "uploading",
    analysis: {
      ...BASE,
      status: "uploading",
      uploadPercent: 42.6,
      startedAt: minutesAgo(12),
    },
  },
  {
    id: "processing",
    analysis: {
      ...BASE,
      status: "processing",
      progressPercent: 40,
      jobReference: "ss_7f3a92c1",
    },
  },
  {
    id: "failed retry",
    analysis: {
      ...BASE,
      status: "failed",
      recovery: "retry",
      errorCode: "INTERNAL_ERROR",
      note: "The video could not be downloaded.",
      attemptsUsed: 1,
      jobReference: "ss_7f3a92c1",
    },
  },
  {
    id: "failed upload_again",
    analysis: {
      ...BASE,
      status: "failed",
      recovery: "upload_again",
      failNote: "Failed to fetch",
      jobId: undefined,
    },
  },
  {
    id: "stalled retry",
    analysis: {
      ...BASE,
      status: "uploaded",
      updatedAt: minutesAgo(20),
      recovery: "retry",
    },
  },
];

/** `null` = no snapshot: the component's own clock, which starts unset. */
function render(analysis: MatchAnalysis, at: number | null = NOW) {
  const snapshotAt = at ?? undefined;
  return renderToStaticMarkup(
    React.createElement(AnalysisSteps, {
      analysis,
      matchId: MATCH_ID,
      match: MATCH,
      snapshotAt,
    }),
  );
}

const escape = (s: string) =>
  renderToStaticMarkup(React.createElement(React.Fragment, null, s));

const count = (html: string, needle: string) => html.split(needle).length - 1;

/** Each `<li …>…</li>` of the stepper, in order. */
function items(html: string): string[] {
  return html.match(/<li[\s>][\s\S]*?<\/li>/g) ?? [];
}

for (const { id, analysis } of CASES) {
  test(`${id}: one <h1>, four steps, the wizard's column and no card`, () => {
    const html = render(analysis);
    const view = analysisStepsView(analysis, NOW);

    expect(count(html, "<h1")).toBe(1);
    expect(html).toMatch(new RegExp(`<h1[^>]*>${escape(view.title)}</h1>`));
    expect(count(html, "<li")).toBe(4);

    // The wizard's column and title, class for class.
    for (const cls of [
      "max-w-[488px]",
      "px-6",
      "pt-[clamp(64px,18vh,176px)]",
      "text-[24px]",
      "font-light",
      "tracking-[-0.3px]",
    ])
      expect(html).toContain(cls);

    // The match line, 13px ink-600: "{player} vs {opponent} · Lost 4-6, 3-6".
    expect(html).toContain(
      '<p class="text-[13px] text-[var(--ink-600)]">Maya Chen vs Sofia Alvarez · Lost ',
    );

    // Nothing of the old card: no chrome, no eyebrow, no job record.
    for (const gone of [
      "--radius-card",
      "--shadow-card",
      "--border-card",
      "<h2",
      "<dl",
      "Window",
      "Job",
      "IMG_4821.MOV",
    ])
      expect(html).not.toContain(gone);
  });
}

for (const { id, analysis } of CASES.filter((c) =>
  ["failed retry", "failed upload_again", "stalled retry"].includes(c.id),
)) {
  test(`${id}: the failing step carries the headline and RecoveryAction`, () => {
    const html = render(analysis);
    const view = analysisStepsView(analysis, NOW);
    const failing = view.steps.findIndex((s) => s.state === "fail");
    const step = view.steps[failing];
    if (step?.body?.kind !== "failure") throw new Error("no failing step");

    const action = renderToStaticMarkup(
      React.createElement(RecoveryAction, {
        recovery: step.body.recovery,
        jobId: analysis.jobId,
        matchId: MATCH_ID,
        variant: "card",
        stalled: step.body.stalled,
      }),
    );
    // Every one of these classes offers something to press.
    expect(action).not.toBe("");

    const li = items(html)[failing];
    expect(li).toContain(escape(step.body.headline));
    expect(li).toContain(action);
    // …and only there.
    expect(count(html, action)).toBe(1);
    // The raw writer string is never shown.
    expect(html).not.toContain("Failed to fetch");
  });
}

test("stalled retry: before the clock's first tick, only the server's classification makes it stalled", () => {
  const stalled = CASES.find((c) => c.id === "stalled retry")!.analysis;
  // Server-classified (`recovery` set): stopped from the first render, never
  // "Sending" for ten seconds and then flipped.
  const classified = analysisStepsView(stalled, null);
  expect(classified.failure?.recovery).toBe(stalled.recovery);
  expect(render(stalled, null)).toMatch(
    new RegExp(`<h1[^>]*>${escape(classified.title)}</h1>`),
  );
  // Not yet classified: a clock that has not started claims nothing.
  const unclassified = { ...stalled, recovery: undefined };
  const html = render(unclassified, null);
  const view = analysisStepsView(unclassified, null);
  expect(view.steps.some((s) => s.state === "fail")).toBe(false);
  expect(html).toMatch(new RegExp(`<h1[^>]*>${escape(view.title)}</h1>`));
  expect(html).not.toContain("<button");
});

test("the clock is only ever set from an interval", () => {
  const source = readFileSync(COLUMN, "utf8");
  expect(source).toContain("useState<number | null>(null)");
  // One read of the wall clock, and it is the interval's.
  expect(count(source, "Date.now()")).toBe(1);
  expect(source).toMatch(/setInterval\(\(\) => setClock\(Date\.now\(\)\)/);
  // The live row, merged over the server's, gated on the server status.
  expect(source).toMatch(/isLiveUpdating\(serverAnalysis\.status\)/);
  expect(source).toMatch(/withLiveAnalysis\(serverAnalysis,/);
});

test("/design renders every variant through the column, with no card", () => {
  const html = renderToStaticMarkup(React.createElement(AnalysisStepsPreview));
  const variants = count(html, 'id="analysis-stepper-');
  expect(variants).toBeGreaterThanOrEqual(15);
  // One column — one <h1>, one match line — per variant.
  expect(count(html, 'aria-label="Analysis progress"')).toBe(variants);
  expect(count(html, "<h1")).toBe(variants);
  expect(count(html, "Maya Chen vs Sofia Alvarez · Won ")).toBe(variants);
  for (const gone of ["--radius-card", "--shadow-card", "--border-card", "<dl"])
    expect(html).not.toContain(gone);
});

// ── The timing line and the quiet actions (T6) ──────────────────────────────

const QUEUED: MatchAnalysis = {
  ...BASE,
  status: "queued",
  queuedAt: minutesAgo(12),
  reservedSeconds: 5340,
};
const PROCESSING: MatchAnalysis = {
  ...BASE,
  status: "processing",
  queuedAt: minutesAgo(40),
  vendorStartedAt: minutesAgo(18),
  reservedSeconds: 5340,
};
const CANCELLED: MatchAnalysis = {
  ...BASE,
  status: "cancelled",
  updatedAt: minutesAgo(4),
  reservedSeconds: 5340,
};

function renderWith(analysis: MatchAnalysis) {
  return renderToStaticMarkup(
    React.createElement(AnalysisSteps, {
      analysis,
      matchId: MATCH_ID,
      match: MATCH,
      snapshotAt: NOW,
      onCancel: () => {},
      onResend: () => {},
    }),
  );
}

const META =
  '<p class="text-[11px] leading-4 text-[var(--ink-400)] tabular-nums">';

/** The quiet action's button and the line its `aria-describedby` names. */
function quietAction(li: string, label: string) {
  const button = li.match(
    new RegExp(`<button[^>]*>${escape(label)}</button>`),
  )?.[0];
  if (!button) throw new Error(`no "${label}" action`);
  const describedBy = button.match(/aria-describedby="([^"]+)"/)?.[1];
  if (!describedBy) throw new Error("action is not described");
  const line = li.match(
    new RegExp(`<p id="${describedBy}"[^>]*>([^<]*)</p>`),
  )?.[1];
  return { button, line };
}

test("queued: the timing line 8px under the note, then the Cancel group 20px below", () => {
  const li = items(renderWith(QUEUED))[2];
  // The note and its meta, grouped at gap-2 (8px).
  expect(li).toContain(
    `<div class="flex flex-col gap-2"><p class="${"text-[12px] leading-[1.55] text-[var(--ink-600)]"}">`,
  );
  expect(li).toContain(
    `${META}Waiting 12 min · Takes about an hour once it starts</p>`,
  );

  const { button, line } = quietAction(li, "Cancel analysis");
  expect(line).toBe("1h 29m goes back to this month&#x27;s analysis time");
  // 20px below, the pair 8px apart.
  expect(li).toContain('<div class="mt-5 flex flex-col items-start gap-2">');
  // 12/500 ink-700, red on hover — a text action, no chrome.
  for (const cls of [
    'type="button"',
    "cursor-pointer",
    "text-[12px]",
    "font-medium",
    "text-[var(--ink-700)]",
    "hover:text-[var(--danger)]",
  ])
    expect(button).toContain(cls);
  for (const chrome of ["bg-", "border", "shadow", "px-", "py-", "h-8", "h-9"])
    expect(button).not.toContain(chrome);
  // The consequence line: 11px ink-400.
  expect(li).toMatch(
    /<p id="[^"]+" class="text-\[11px\] leading-4 text-\[var\(--ink-400\)\] tabular-nums">/,
  );
  expect(li).not.toContain("Send for analysis again");
});

test("processing: the started line, and no Cancel group", () => {
  const html = renderWith(PROCESSING);
  expect(html).toContain(
    `${META}Started 18 min ago · Usually done in about an hour</p>`,
  );
  expect(html).not.toContain("Cancel analysis");
  expect(html).not.toContain("<button");
});

test("cancelled: a stopped step, its timing, and the resend action in blue", () => {
  const html = renderWith(CANCELLED);
  expect(html).toMatch(/<h1[^>]*>Analysis cancelled<\/h1>/);
  const li = items(html)[2];
  // The grey stopped mark, never the Failed chip's red.
  expect(li).toContain('<span class="sr-only">Cancelled:</span>');
  expect(li).not.toContain("--danger");
  expect(li).toContain("Your video is still stored. Nothing was charged.");
  expect(li).toContain(`${META}Cancelled 4 min ago · 1h 29m returned</p>`);

  const { button, line } = quietAction(li, "Send for analysis again");
  expect(line).toBe("Uses about 1h 29m of this month&#x27;s analysis time");
  expect(button).toContain("hover:text-[var(--blue-hover)]");
  expect(html).not.toContain("Cancel analysis");
});

test("before the clock ticks, the timing line keeps only its clock-free segment", () => {
  const html = render(QUEUED, null);
  expect(html).toContain(`${META}Takes about an hour once it starts</p>`);
  expect(html).not.toContain("Waiting 12 min");
  // The Cancel group needs no clock.
  expect(html).toContain("Cancel analysis");
});
