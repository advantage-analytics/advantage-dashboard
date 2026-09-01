"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Calendar, Check, Clock, Play, Swords } from "lucide-react";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { parseMatchTab } from "@/components/dashboard/matches/match-detail/match-tabs";
import { ScoreLine } from "@/components/dashboard/score-line";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

/**
 * The 300px match rail (artboard 46a–46d): identity block (names + verified
 * check + score with superscript tiebreaks), fact list, the Advantage
 * Intelligence blurb, and — pinned to the bottom — either the film cross-link
 * card (video present) or the round-44 no-video note strip.
 *
 * Which side is "you" comes exclusively from `useMatchSides()`
 * (guardrails §4) — nothing here looks at player1/player2 directly.
 */

interface MatchRailProps {
  /** The viewer's insight summary, already picked by side in `page.tsx`. */
  aiSummary: string | null;
  /**
   * Bottom slot: `card` = film cross-link card + "Open film room" (video
   * exists) · `none` = nothing (analysing/failed — there is no Film tab to
   * open and no verdict yet on whether video will exist). The two no-video
   * variants both render the 44a strip shape but must not share copy: a
   * `.xlsx` import genuinely has no video behind it, but an Advantage
   * Intelligence–analyzed match with no `video` here only means its trimmed
   * copy is missing or was reclaimed — it was never a SwingVision import, and
   * saying so would misstate where the stats came from.
   * `note-swingvision` = true SwingVision import, no video ever existed ·
   * `note-neutral` = video-analyzed match whose trimmed copy isn't available.
   */
  film: "card" | "note-swingvision" | "note-neutral" | "none";
}

/** `match.date` ("August 2, 2026") → the rail's short-month "Aug 2, 2026". */
function shortMonthDate(displayDate: string): string {
  const date = new Date(displayDate);
  if (Number.isNaN(date.getTime())) return displayDate;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Seconds → "1:26:00" (h:mm:ss, mono machine value). */
function clockOf(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function FactRow({
  icon,
  mono = false,
  children,
}: {
  icon: React.ReactNode;
  mono?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span className="grid grid-cols-[16px_1fr] items-center gap-x-2">
      {icon}
      <span
        className={cn("text-micro tabular", mono && "mono")}
        style={{ color: "var(--ink-700)" }}
      >
        {children}
      </span>
    </span>
  );
}

export function MatchRail({ aiSummary, film }: MatchRailProps) {
  const { match, points } = useMatchData();
  const sides = useMatchSides();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = parseMatchTab(searchParams.get("tab"));

  const games = match.score.sets.reduce(
    (total, set) => total + set.player1 + set.player2,
    0,
  );
  const duration =
    typeof match.durationSec === "number" && match.durationSec > 0
      ? clockOf(match.durationSec)
      : null;

  const openFilmRoom = () => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", "film");
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <>
      {/* Identity */}
      <div className="flex flex-col gap-4">
        <span className="eyebrow">Match</span>

        <div className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-medium text-[var(--ink-900)]">
              {sides.you.name}
            </span>
            {match.verificationStatus ? (
              <Check
                className="h-3 w-3 text-[var(--viz-good)]"
                strokeWidth={2}
                aria-label="Verified result"
              />
            ) : null}
            <span className="mx-0.5 text-[12px] text-[var(--ink-500)]">vs</span>
            <span className="text-[13px] text-[var(--ink-600)]">
              {sides.opp.name}
            </span>
          </div>
          <ScoreLine
            sets={sides.sets}
            className="text-score"
            style={{ fontSize: "30px" }}
          />
        </div>

        {/* Facts */}
        <div className="flex flex-col gap-[9px]">
          <div className="flex flex-col gap-[9px]">
            <FactRow
              icon={
                <Calendar
                  className="h-[13px] w-[13px] text-[var(--ink-400)]"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              }
            >
              {shortMonthDate(match.date)}
            </FactRow>
            {match.courtType ? (
              <FactRow
                icon={
                  <Image
                    src="/icons/tennis-court-icon.svg"
                    width={13}
                    height={13}
                    alt=""
                    aria-hidden="true"
                  />
                }
              >
                {match.courtType}
              </FactRow>
            ) : null}
            {match.tournamentName ? (
              <FactRow
                icon={
                  <Image
                    src="/icons/tournament-icon.svg"
                    width={13}
                    height={13}
                    alt=""
                    aria-hidden="true"
                  />
                }
              >
                {match.tournamentName}
              </FactRow>
            ) : null}
          </div>

          <div className="mt-[5px] flex flex-col gap-[9px]">
            {duration ? (
              <FactRow
                mono
                icon={
                  <Clock
                    className="h-[13px] w-[13px] text-[var(--ink-400)]"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                }
              >
                {duration}
              </FactRow>
            ) : null}
            {points.length > 0 ? (
              <FactRow
                icon={
                  <Swords
                    className="h-[13px] w-[13px] text-[var(--ink-400)]"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                }
              >
                {points.length} points · {games} games
              </FactRow>
            ) : null}
          </div>
        </div>
      </div>

      {/* Advantage Intelligence blurb — on the Statistics tab the insight
          renders as the pane's own strip instead (artboard 46a vs 46b–46d). */}
      {aiSummary && activeTab !== "statistics" ? (
        <div className="flex flex-col gap-2.5 border-t border-[var(--border-hairline)] pt-5">
          <span className="eyebrow">Advantage Intelligence</span>
          <span className="text-body-sm" style={{ color: "var(--ink-900)" }}>
            {aiSummary}
          </span>
          <Link
            href="/dashboard/ask"
            className="text-[11px] font-medium text-[var(--blue)]"
          >
            View analysis
          </Link>
        </div>
      ) : null}

      {/* Bottom slot */}
      {film === "card" ? (
        <div className="mt-auto flex flex-col gap-3">
          <button
            type="button"
            onClick={openFilmRoom}
            aria-label="Open film room"
            className="relative h-32 cursor-pointer overflow-hidden rounded-xl bg-[var(--surface-dark)] text-left"
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-pill)] bg-white/[0.14]">
                <Play
                  className="h-3.5 w-3.5 text-white"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </div>
            </div>
            <div className="absolute bottom-3 left-3 flex flex-col gap-0.5">
              <span className="text-[11px] font-medium text-white">
                Full match film
              </span>
              <span className="mono text-[10px] text-white/60">
                {duration ? `${duration} · ` : ""}
                {points.length} points
              </span>
            </div>
          </button>
          <button
            type="button"
            onClick={openFilmRoom}
            className={cn(advButton("primary", "md"), "w-full")}
          >
            Open film room
          </button>
        </div>
      ) : film === "note-swingvision" || film === "note-neutral" ? (
        <div className="mt-auto">
          <div className="flex flex-col gap-[5px] rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-3 py-[11px]">
            <span className="text-[11px] leading-[1.5] text-[var(--ink-700)] [text-wrap:pretty]">
              {film === "note-swingvision"
                ? "No video on this match — the stats came from the SwingVision export."
                : "No video available for this match."}
            </span>
            <Link
              href="/dashboard/matches/new"
              className="text-[11px] font-medium text-[var(--blue)]"
            >
              Add video
            </Link>
          </div>
        </div>
      ) : null}
    </>
  );
}
