"use client";

import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";

import { useInsightDismissal } from "@/components/dashboard/matches/match-detail/insight-dismissal";

/**
 * The rail's Advantage Intelligence card (frame 47f) — successor to the
 * Statistics-tab `InsightStrip`, now the insight's only home so it reads the
 * same on every tab. It shows the viewer's own `summary` and nothing
 * synthesized: a match carries exactly one `insights.{player1|player2}.summary`
 * string and no corpus count, so the artboard's second, numbers-bearing
 * sentence has no source and is dropped rather than fabricated (flags #1).
 *
 * `summary` is already picked by side in `page.tsx` (guardrails §4 — the card
 * never chooses a player itself). A null summary or a prior dismissal renders
 * nothing, and the rail's `mt-auto` group closes up around the absence.
 */

interface RailInsightCardProps {
  summary: string | null;
  matchId: string;
}

export function RailInsightCard({ summary, matchId }: RailInsightCardProps) {
  const { dismissed, dismiss } = useInsightDismissal(matchId);

  if (!summary || dismissed) return null;

  return (
    <div className="relative flex flex-col gap-[7px] rounded-[var(--radius-element)] bg-[var(--surface-subtle)] p-[13px_14px]">
      <span
        aria-hidden="true"
        className="flex h-5 w-5 flex-[0_0_20px] items-center justify-center rounded-[var(--radius-button)] bg-[var(--ink-900)]"
      >
        {/* Same mark, size and inversion the retired strip's chip used
            (home/focus-card.tsx's chip too) — logo3 is what stands for the
            Advantage mark across the app; the artboard's `logo-mark.svg` has
            no counterpart in this repo. */}
        <Image
          src="/logos/logo3.svg"
          alt=""
          width={12}
          height={8}
          className="brightness-0 invert"
          aria-hidden="true"
        />
      </span>

      <p className="pr-6 text-[13px] font-medium leading-[1.45] text-[var(--ink-900)] [text-wrap:pretty]">
        {summary}
      </p>

      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/ask"
          className="text-[11px] font-medium text-[var(--blue)]"
        >
          View full analysis
        </Link>
        {/* text-micro hardcodes ink-500, and it is unlayered so a Tailwind
            colour utility loses to it — force ink-400 inline, as FactRow does. */}
        <span className="text-micro" style={{ color: "var(--ink-400)" }}>
          Advantage Intelligence
        </span>
      </div>

      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss insight"
        className="absolute right-2 top-2 flex h-5 w-5 cursor-pointer items-center justify-center rounded-[var(--radius-element)] transition-colors duration-200 hover:bg-[var(--ink-100)]"
      >
        <X
          className="h-3 w-3 text-[var(--ink-400)]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}
