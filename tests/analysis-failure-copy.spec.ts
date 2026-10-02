import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  jobRecoveryFacts,
  recoveryFields,
  type MatchAnalysis,
  type RecoveryClass,
  type RecoveryRow,
} from "@/lib/data/match-analysis";
import {
  DRAWER_NO_ACTION_BODY,
  byClass,
  WAIT_OR_ASK_VARIANTS,
  waitOrAskVariant,
} from "@/components/dashboard/matches/analysis-failure-copy";
import type { MatchLineProps } from "@/components/dashboard/matches/match-line";
import { createLoader, marker } from "./fixtures/vm-modules";

/**
 * The match page's failure alert and stalled notice render the row's
 * recovery class (`byClass`, T4): headline `note ?? title`, the class's card
 * body, and `RecoveryAction` (T5) for whatever there is to press. The raw
 * `failNote` (unfiltered `error_message`) is never rendered here — a stored
 * note reaches the card only through `showsStoredNote()`.
 *
 * `AnalysisSteps` (the page's stepper column) is rendered offline through
 * `fixtures/vm-modules` with the Realtime hook, `next/link` and the add-video
 * route stubbed, and a fixed `snapshotAt` clock — a live clock starts null,
 * so a stalled submit would otherwise never render in a static pass. The
 * real `RecoveryAction` runs; its three buttons (`RetryAnalysis`,
 * `RetrySubmission`, `RetryActionButton`) are markers, so a marker in the
 * markup means that action rendered.
 */

const PANEL =
  "src/components/dashboard/matches/match-detail/analysis-steps-column.tsx";
const COPY = "src/components/dashboard/matches/analysis-failure-copy.ts";

type Props = {
  analysis: MatchAnalysis;
  matchId: string;
  match: MatchLineProps;
  snapshotAt?: number;
};

const MATCH: MatchLineProps = {
  player: "Maya Chen",
  opponent: "Sofia Alvarez",
  won: true,
  sets: [
    { player1: 6, player2: 4 },
    { player1: 6, player2: 3 },
  ],
};

const RETRY_MARKERS = [
  'data-component="RetryAnalysis"',
  'data-component="RetrySubmission"',
  'data-component="RetryActionButton"',
];

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
      "next/link": ({
        children,
        href,
      }: {
        children: React.ReactNode;
        href: string;
      }) =>
        React.createElement("a", { "data-component": "Link", href }, children),
      "@/lib/matches/add-video-href": {
        addVideoHref: (id: string) => `/add-video/${id}`,
      },
      "./retry-analysis": { RetryAnalysis: marker("RetryAnalysis") },
      "./retry-submission": { RetrySubmission: marker("RetrySubmission") },
      "./retry-action-button": {
        RetryActionButton: marker("RetryActionButton"),
      },
    },
  });
  const { AnalysisSteps } = loader.load(PANEL) as {
    AnalysisSteps: React.ComponentType<Props>;
  };
  const analysis = {
    status,
    failNote: "5 point(s) resolved no winner",
    jobId: "job-1",
    ...overrides,
  } as MatchAnalysis;
  return renderToStaticMarkup(
    React.createElement(AnalysisSteps, {
      analysis,
      matchId: "m1",
      match: MATCH,
      snapshotAt: Date.now(),
    }),
  );
}

/**
 * A card-level `MatchAnalysis` built from a live `processing_jobs` row the
 * way the loader builds it: `jobRecoveryFacts` → `recoveryFields`, with the
 * unfiltered `error_message` as `failNote`.
 */
function fromRow(
  row: Omit<RecoveryRow, "hasVideo" | "hasResults"> & {
    hasVideo?: boolean;
    hasResults?: boolean;
  },
  attemptsUsed = 1,
): Partial<MatchAnalysis> {
  const facts = jobRecoveryFacts({
    hasVideo: true,
    hasResults: false,
    ...row,
  });
  return {
    jobId: "job-1",
    updatedAt: row.updated_at ?? undefined,
    failNote: row.error_message ?? undefined,
    attemptsUsed,
    ...recoveryFields(facts, attemptsUsed, row.error_message),
  };
}

function decode(html: string): string {
  return html
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** The first `<p>` inside a `role=…` block — that block's headline. */
function headlineOf(html: string, role: "alert" | "status"): string {
  const block = html.slice(html.indexOf(`role="${role}"`));
  const match = block.match(/<p\b[^>]*>([\s\S]*?)<\/p>/);
  if (!match) throw new Error(`no <p> inside role=${role}`);
  return decode(match[1]);
}

const alertHeadline = (html: string) => headlineOf(html, "alert");

function expectNoRetry(html: string): void {
  for (const m of RETRY_MARKERS) expect(html).not.toContain(m);
}

const NOTE = "5 point(s) resolved no winner";

test("stats_unavailable (derivation_failed): its own title and body, no raw reconciler note, no retry or new-video link", () => {
  // DERIVATION_* codes never pass showsStoredNote(), so `note` is undefined.
  const html = render("derivation_failed", {
    recovery: "stats_unavailable",
    note: undefined,
    failNote: NOTE,
  });
  const out = decode(html);

  expect(html).toContain('role="alert"');
  expect(out).toContain(byClass.stats_unavailable.title);
  expect(out).toContain(byClass.stats_unavailable.cardBody);
  expect(byClass.stats_unavailable.title).toBe(
    "Analyzed, but the score couldn't be read cleanly",
  );

  expect(html).not.toContain('data-component="RetryAnalysis"');
  expectNoRetry(html);
  expect(out).not.toContain("Upload a new recording");
  expect(out).not.toContain("Retrying uses");

  const headline = alertHeadline(html);
  expect(headline).toBe(byClass.stats_unavailable.title);
  expect(headline).not.toContain(NOTE);

  // The reconciler talking to itself is no longer a detail line on the card:
  // failNote is never rendered, and showsStoredNote() keeps it out of `note`.
  expect(out).not.toContain(NOTE);

  expect(html).not.toMatch(/splitstep|swingvision/i);
});

test("retry (failed): note headline, retry body, RetryAnalysis, no upload link", () => {
  const html = render("failed", {
    recovery: "retry",
    note: NOTE,
    failNote: NOTE,
  });
  const out = decode(html);

  expect(alertHeadline(html)).toBe(NOTE);
  expect(out).toContain("Retrying uses");
  expect(out).toContain(byClass.retry.cardBody);
  expect(html).toContain('data-component="RetryAnalysis"');
  // RecoveryAction offers one action per class; for retry that is the retry
  // button, not the new-recording link (the body still names that way out).
  expect(out).not.toContain("Upload a new recording");
  expect(html).not.toContain('data-component="Link"');
  expect(out).not.toContain(byClass.stats_unavailable.title);

  expect(html).not.toMatch(/splitstep|swingvision/i);
});

test("fix_recording (failed, input rejected): note headline, input-rejected body, no retry, still the new-recording link", () => {
  const note = "The video must be at least 29.9 fps.";
  const html = render("failed", {
    recovery: "fix_recording",
    jobId: "job-1",
    note,
    failNote: note,
  });
  const out = decode(html);

  expect(alertHeadline(html)).toBe(note);
  expect(out).toContain(byClass.fix_recording.cardBody);
  expect(out).toContain("Upload a new recording");

  expect(html).not.toContain('data-component="RetryAnalysis"');
  expectNoRetry(html);
  expect(out).not.toContain("Retrying uses");

  expect(html).not.toMatch(/splitstep|swingvision/i);
});

const AZURE_XML =
  '<?xml version="1.0" encoding="utf-8"?><Error><Code>AuthorizationFailure</Code><Message>This request is not authorized to perform this operation.</Message></Error>';

test("upload_again: an uncoded failed row with Azure XML and no video shows the class title and the upload link, never the XML", () => {
  const fields = fromRow({
    status: "failed",
    error_code: null,
    error_message: AZURE_XML,
    hasVideo: false,
  });
  expect(fields.recovery).toBe("upload_again");
  expect(fields.note).toBeUndefined();

  const html = render("failed", fields);
  const out = decode(html);

  expect(alertHeadline(html)).toBe(byClass.upload_again.title);
  expect(out).toContain(byClass.upload_again.cardBody);
  expect(html).toMatch(
    /<a data-component="Link" href="\/add-video\/m1"[^>]*>Upload the video again<\/a>/,
  );
  expect(byClass.upload_again.action).toBe("Upload the video again");

  expect(out).not.toContain("<?xml");
  expect(out).not.toContain("AuthorizationFailure");
  expect(html).not.toContain('data-component="RetryActionButton"');
  expectNoRetry(html);
});

test("45ff4bd7 (frame rate rejected): the vendor note stays the headline, no retry", () => {
  const note = "The video must be at least 29.9 fps.";
  const fields = fromRow({
    status: "failed",
    error_code: "VIDEO_FRAME_RATE_TOO_LOW",
    error_category: "invalid_input",
    error_step: "trimming_video",
    error_message: note,
  });
  expect(fields.recovery).toBe("fix_recording");

  const html = render("failed", fields);
  const out = decode(html);

  expect(alertHeadline(html)).toBe(note);
  expect(out).toContain(byClass.fix_recording.cardBody);
  expect(out).toContain("Upload a new recording");
  expectNoRetry(html);
});

test("e6e8dea4 (internal error while downloading): renders the retry action", () => {
  const note = "An unexpected error occurred while processing the job.";
  const fields = fromRow({
    status: "failed",
    error_code: "INTERNAL_ERROR",
    error_category: "internal",
    error_step: "downloading_video",
    error_message: note,
  });
  expect(fields.recovery).toBe("retry");

  const html = render("failed", fields);
  const out = decode(html);

  expect(alertHeadline(html)).toBe(note);
  expect(out).toContain(byClass.retry.cardBody);
  expect(html).toContain('data-component="RetryAnalysis"');
});

test("stalled quota row: the stored note, the allowance body, no retry", () => {
  const note =
    "This match needs 2 hr 3 min of analysis but only 2 hr is left this month.";
  const updatedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const fields = fromRow({
    status: "uploaded",
    error_code: "QUOTA_EXCEEDED",
    error_message: note,
    updated_at: updatedAt,
  });
  expect(fields.recovery).toBe("wait_or_ask");
  expect(fields.errorCode).toBe("QUOTA_EXCEEDED");

  const html = render("uploaded", fields);
  const out = decode(html);

  expect(html).not.toContain('role="alert"');
  expect(headlineOf(html, "status")).toBe(note);
  expect(out).toContain(WAIT_OR_ASK_VARIANTS.allowance.cardBody);
  expect(out).not.toContain("This hasn't been sent for analysis yet");
  expectNoRetry(html);
});

test("stalled permission row picks the permission variant from its error code", () => {
  const updatedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const html = render("uploaded", {
    ...fromRow({
      status: "uploaded",
      error_code: "NOT_ELIGIBLE",
      updated_at: updatedAt,
    }),
  });
  const out = decode(html);

  expect(headlineOf(html, "status")).toBe(
    WAIT_OR_ASK_VARIANTS.permission.title,
  );
  expect(out).toContain(WAIT_OR_ASK_VARIANTS.permission.cardBody);
  expectNoRetry(html);
});

test("stalled uncoded row keeps the not-sent framing and the free resubmit", () => {
  const updatedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const fields = fromRow({ status: "uploaded", updated_at: updatedAt });
  expect(fields.recovery).toBe("retry");

  const html = render("uploaded", fields);

  expect(headlineOf(html, "status")).toBe(
    "This hasn't been sent for analysis yet",
  );
  expect(html).toContain('data-component="RetrySubmission"');
  expect(html).not.toContain('data-component="RetryAnalysis"');
});

test("the copy module carries the failed strings verbatim and never names the vendor", () => {
  expect(byClass.retry.title).toBe("Analysis stopped");
  expect(
    byClass.retry.cardBody.startsWith(
      "Retrying uses the video you already uploaded — nothing needs uploading again.",
    ),
  ).toBe(true);
  expect(byClass.fix_recording.action).toBe("Upload a new recording");
  expect(byClass.retry.drawerBody).toBe(
    "Retrying uses the video you already uploaded. Nothing needs uploading again.",
  );
  expect(DRAWER_NO_ACTION_BODY).toBe("The match page has the details.");

  expect(byClass.fix_recording.cardBody).not.toMatch(/Retrying/);
  expect(byClass.fix_recording.drawerBody).not.toMatch(/Retrying/);
  expect(byClass.fix_recording.cardBody).toMatch(/recording requirement/);
  expect(byClass.fix_recording.drawerBody).toMatch(/new recording/);

  const source = readFileSync(resolve(process.cwd(), COPY), "utf8");
  expect(source).not.toMatch(/splitstep|swingvision/i);
});

/**
 * `byClass` keys every `RecoveryClass` (T4). These tests walk the exported
 * copy objects recursively rather than asserting exact string literals for
 * every field, so a later wording tweak doesn't need a matching test edit —
 * only the banned-term and "Retrying" checks pin exact behavior.
 */

const RECOVERY_CLASSES: RecoveryClass[] = [
  "retry",
  "upload_again",
  "fix_recording",
  "wait_or_ask",
  "rederive",
  "stats_unavailable",
];

const BANNED_TERMS =
  /splitstep|swingvision|edge function|failed to fetch|<\?xml/i;

/** Collect every string value found anywhere inside `value`. */
function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, out);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, out);
  }
  return out;
}

test("byClass has an entry for every RecoveryClass", () => {
  for (const cls of RECOVERY_CLASSES) {
    const entry = byClass[cls];
    expect(entry, `byClass.${cls}`).toBeTruthy();
    expect(typeof entry.title).toBe("string");
    expect(typeof entry.cardBody).toBe("string");
    expect(typeof entry.drawerBody).toBe("string");
    expect(entry.action === null || typeof entry.action === "string").toBe(
      true,
    );
  }
  expect(Object.keys(byClass).sort()).toEqual([...RECOVERY_CLASSES].sort());
});

test("byClass and WAIT_OR_ASK_VARIANTS never name the vendor or leak internal error text", () => {
  const strings = [
    ...collectStrings(byClass),
    ...collectStrings(WAIT_OR_ASK_VARIANTS),
  ];
  for (const s of strings) {
    expect(s, s).not.toMatch(BANNED_TERMS);
  }
});

test("upload_again and fix_recording never say Retrying", () => {
  expect(byClass.upload_again.cardBody).not.toMatch(/Retrying/);
  expect(byClass.upload_again.drawerBody).not.toMatch(/Retrying/);
  expect(byClass.fix_recording.cardBody).not.toMatch(/Retrying/);
  expect(byClass.fix_recording.drawerBody).not.toMatch(/Retrying/);
});

test("byClass new-class copy matches the plan", () => {
  expect(byClass.upload_again.title).toBe("The video didn't finish uploading");
  expect(byClass.upload_again.action).toBe("Upload the video again");

  expect(byClass.rederive.title).toBe("Statistics didn't finish building");
  expect(byClass.rederive.action).toBe("Rebuild statistics");

  expect(byClass.retry.action).toBe("Retry analysis");
  expect(byClass.retry.cardBody).toBe(
    "Retrying uses the video you already uploaded — nothing needs uploading again. If it keeps failing, trim to a window where the camera stays fixed, or upload a new recording.",
  );
  expect(byClass.retry.drawerBody).toBe(
    "Retrying uses the video you already uploaded. Nothing needs uploading again.",
  );

  expect(byClass.fix_recording.cardBody).toBe(
    "This video didn't meet one of the recording requirements, so analyzing it again would stop the same way. Upload a new recording that meets them.",
  );
  expect(byClass.fix_recording.action).toBe("Upload a new recording");

  expect(byClass.stats_unavailable.cardBody).toBe(
    "The rallies found in your video couldn't be matched point by point to the final score you entered, so no statistics were saved for this match.",
  );
  expect(byClass.stats_unavailable.drawerBody).toBe(
    byClass.stats_unavailable.cardBody,
  );
  expect(byClass.stats_unavailable.action).toBeNull();
});

test("WAIT_OR_ASK_VARIANTS has the three variants, and permission tells the player to ask their team's owner", () => {
  expect(Object.keys(WAIT_OR_ASK_VARIANTS).sort()).toEqual([
    "allowance",
    "ceiling",
    "permission",
  ]);
  expect(WAIT_OR_ASK_VARIANTS.permission.cardBody).toMatch(/team's owner/);
  expect(WAIT_OR_ASK_VARIANTS.allowance.action).toBeNull();
  expect(WAIT_OR_ASK_VARIANTS.permission.action).toBeNull();
  expect(WAIT_OR_ASK_VARIANTS.ceiling.action).toBeNull();
});

test("waitOrAskVariant maps error codes to the three variants", () => {
  expect(waitOrAskVariant("QUOTA_EXCEEDED")).toBe("allowance");
  expect(waitOrAskVariant("NOT_ELIGIBLE")).toBe("permission");
  expect(waitOrAskVariant("NO_BILLING_WORKSPACE")).toBe("permission");
  expect(waitOrAskVariant("SOME_OTHER_CODE")).toBe("ceiling");
  expect(waitOrAskVariant(null)).toBe("ceiling");
  expect(waitOrAskVariant(undefined)).toBe("ceiling");
});
