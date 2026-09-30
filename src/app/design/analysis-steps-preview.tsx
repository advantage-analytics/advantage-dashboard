"use client";

import type { MatchAnalysis } from "@/lib/data/match-analysis";
import { AnalysisSteps } from "@/components/dashboard/matches/match-detail/analysis-steps-column";
import type { MatchLineProps } from "@/components/dashboard/matches/match-line";

/** A fixed clock, so every variant renders the same on every load. */
const NOW = Date.parse("2026-09-28T16:00:00Z");
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

/** One fixed match line for every variant — the column's own, not a card's. */
const MATCH: MatchLineProps = {
  player: "Maya Chen",
  opponent: "Sofia Alvarez",
  won: true,
  sets: [
    { player1: 6, player2: 4 },
    { player1: 7, player2: 6, player1Tiebreak: 7, player2Tiebreak: 5 },
  ],
};

const BASE: MatchAnalysis = {
  status: "uploading",
  providerId: "splitstep",
  fileName: "IMG_4821.MOV",
  window: "1h 12m",
  jobId: "00000000-0000-4000-8000-000000000001",
};

/**
 * Every state the match page's analysis card can be in, as the stepper.
 * Values mirror the live cases (and `scripts/eyes-on/seed-failure-classes.ts`).
 * Actions are real components; on this page, rendering them is the point.
 */
const VARIANTS: readonly {
  id: string;
  label: string;
  analysis: MatchAnalysis;
}[] = [
  {
    id: "uploading",
    label: "Uploading",
    analysis: {
      ...BASE,
      status: "uploading",
      uploadPercent: 42.6,
      startedAt: minutesAgo(12),
      updatedAt: minutesAgo(0),
    },
  },
  {
    id: "uploaded",
    label: "Uploaded — hand-off pending",
    analysis: { ...BASE, status: "uploaded", updatedAt: minutesAgo(0.5) },
  },
  {
    id: "stalled-retry",
    label: "Stalled submit — retry (free resubmit)",
    analysis: {
      ...BASE,
      status: "uploaded",
      updatedAt: minutesAgo(20),
      recovery: "retry",
    },
  },
  {
    id: "stalled-allowance",
    label: "Stalled submit — wait_or_ask, allowance (QUOTA_EXCEEDED)",
    analysis: {
      ...BASE,
      status: "uploaded",
      updatedAt: minutesAgo(20),
      recovery: "wait_or_ask",
      errorCode: "QUOTA_EXCEEDED",
      note: "You have used this month's analysis allowance.",
    },
  },
  {
    id: "stalled-permission",
    label: "Stalled submit — wait_or_ask, permission (NOT_ELIGIBLE)",
    analysis: {
      ...BASE,
      status: "uploaded",
      updatedAt: minutesAgo(20),
      recovery: "wait_or_ask",
      errorCode: "NOT_ELIGIBLE",
    },
  },
  {
    id: "queued",
    label: "Queued — waiting, with Cancel",
    analysis: {
      ...BASE,
      status: "queued",
      jobReference: "ss_7f3a92c1",
      updatedAt: minutesAgo(2),
      queuedAt: minutesAgo(12),
      reservedSeconds: 5340,
    },
  },
  {
    id: "processing",
    label: "Processing — started, no Cancel",
    analysis: {
      ...BASE,
      status: "processing",
      progressPercent: 40,
      jobReference: "ss_7f3a92c1",
      queuedAt: minutesAgo(40),
      vendorStartedAt: minutesAgo(18),
      reservedSeconds: 5340,
    },
  },
  {
    id: "cancelled",
    label: "Cancelled — send for analysis again",
    analysis: {
      ...BASE,
      status: "cancelled",
      jobReference: "ss_7f3a92c1",
      updatedAt: minutesAgo(4),
      queuedAt: minutesAgo(30),
      reservedSeconds: 5340,
    },
  },
  {
    id: "deriving",
    label: "Deriving — stats being built",
    analysis: { ...BASE, status: "deriving", jobReference: "ss_7f3a92c1" },
  },
  {
    id: "processed",
    label: "Processed — Stats pending",
    analysis: { ...BASE, status: "processed", jobReference: "ss_7f3a92c1" },
  },
  {
    id: "failed-retry",
    label: "Failed — retry (INTERNAL_ERROR)",
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
    id: "failed-upload-again",
    label: "Failed — upload_again (uncoded “Failed to fetch”, no video)",
    analysis: {
      ...BASE,
      status: "failed",
      recovery: "upload_again",
      failNote: "Failed to fetch",
      jobId: undefined,
    },
  },
  {
    id: "failed-fix-recording",
    label: "Failed — fix_recording (frame rate rejected)",
    analysis: {
      ...BASE,
      status: "failed",
      recovery: "fix_recording",
      errorCode: "VIDEO_FRAME_RATE_TOO_LOW",
      note: "The video must be at least 29.9 fps.",
      jobReference: "ss_7f3a92c1",
    },
  },
  {
    id: "failed-ceiling",
    label: "Failed — wait_or_ask, attempt ceiling",
    analysis: {
      ...BASE,
      status: "failed",
      recovery: "wait_or_ask",
      errorCode: "INTERNAL_ERROR",
      attemptsUsed: 3,
      jobReference: "ss_7f3a92c1",
    },
  },
  {
    id: "rederive",
    label: "Derivation failed — rederive (DERIVATION_ERROR)",
    analysis: {
      ...BASE,
      status: "derivation_failed",
      recovery: "rederive",
      errorCode: "DERIVATION_ERROR",
      failNote: "Derivation crashed (eyes-on seed).",
      jobReference: "ss_7f3a92c1",
    },
  },
  {
    id: "stats-unavailable",
    label:
      "Derivation failed — stats_unavailable (defensive; the page renders instead)",
    analysis: {
      ...BASE,
      status: "derivation_failed",
      recovery: "stats_unavailable",
      errorCode: "DERIVATION_REFUSED",
      jobReference: "ss_7f3a92c1",
    },
  },
];

export function AnalysisStepsPreview() {
  return (
    <section id="analysis-stepper" className="mt-16">
      <h2 className="text-[14px] font-medium text-[var(--ink-900)]">
        Match analysis — stepper column
      </h2>
      <p className="mt-1 max-w-[60ch] text-[12px] leading-[1.6] text-[var(--ink-600)]">
        Every state of a match page while its analysis is in flight, has failed
        or was cancelled, drawn as the upload wizard&apos;s final screen: the
        same card-free column, title, match line and stepper. Fixed inputs and a
        fixed clock; the actions render but are not wired to a real job.
      </p>
      <div className="mt-6 grid max-w-[1120px] grid-cols-1 gap-x-10 gap-y-12 lg:grid-cols-2">
        {VARIANTS.map((v) => (
          <div key={v.id} id={`analysis-stepper-${v.id}`}>
            <p className="mb-3 text-[11px] text-[var(--ink-500)]">{v.label}</p>
            <AnalysisSteps
              analysis={v.analysis}
              matchId="00000000-0000-4000-8000-000000000000"
              match={MATCH}
              snapshotAt={NOW}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
