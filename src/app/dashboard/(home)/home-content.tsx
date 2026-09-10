"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { SeasonTitle } from "@/components/dashboard/home/season-title";
import {
  SetupLine,
  type SetupProgress,
} from "@/components/dashboard/home/setup-line";
import { FocusEmpty } from "@/components/dashboard/home/focus-empty";
import { DayZeroHome } from "@/components/dashboard/home/day-zero-home";
import RecentActivity from "./recent-activity";
import ServePlacementHome from "@/components/dashboard/home/serve-placement-home";
import { FocusCard } from "@/components/dashboard/home/focus-card";
import HomeAiInsight from "@/components/dashboard/home/home-ai-insight";
import { UsageFooter } from "@/components/dashboard/shared/usage-footer";
import { ActivityWidget } from "@/components/dashboard/home/activity-widget";
import type { EvidencePart } from "@/lib/ui/insight-evidence";
import type { PersonalUsage } from "@/lib/data/usage-server";
import type { PersonalActivity } from "@/lib/data/personal-activity-server";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

// Module-scope so stagger doesn't replay on return navigation within the session.
let hasAnimatedOnce = false;

interface HomeContentProps {
  hasMatches: boolean;
  userId: string;
  /** Which ids mean "me" on a match row — login plus claimed roster profiles. */
  playerIds: string[];
  kpiStrip?: ReactNode;
  usage: PersonalUsage;
  /** Every match filed — the insight cache's signature. */
  matchCount: number;
  /** Matches a report exists for — what the title and the Focus card count. */
  analyzedMatchCount: number;
  /** Matches the viewer won — the matches card's "M matches · W won". */
  wonCount: number;
  /** Computed evidence for the Focus card, or null when there is none to state. */
  insightEvidence: EvidencePart[] | null;
  /** What the evidence measured — the Focus card's footer caption. */
  insightCaption: string | null;
  insightSignature: string;
  /** 52-week match-day heatmap for the Activity widget. */
  activity: PersonalActivity;
  /**
   * Persisted answers to the getting-set-up questions, read on the server —
   * this is a client component and cannot query for them itself.
   */
  setup: SetupProgress;
}

export default function HomeContent({
  hasMatches,
  userId,
  playerIds,
  kpiStrip,
  usage,
  matchCount,
  analyzedMatchCount,
  wonCount,
  insightEvidence,
  insightCaption,
  insightSignature,
  activity,
  setup,
}: HomeContentProps) {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const skipAnimation = shouldReduceMotion || hasAnimatedOnce;

  useEffect(() => {
    const handler = () => router.refresh();
    window.addEventListener("match-processed", handler);
    return () => window.removeEventListener("match-processed", handler);
  }, [router]);

  useEffect(() => {
    hasAnimatedOnce = true;
  }, []);

  // The card grid, composed once. Day zero renders it behind the offer under
  // a grade; every other state renders it as the page.
  //
  // `items-start`, as Pa2 draws it: each column's cards keep their natural
  // heights and the columns bottom out where their content does. Nothing is
  // stretched to level them — the slack under the shorter column is
  // invisible because the column has no surface of its own, and a card
  // stretched to fill it would be trapped empty surface.
  const grid = (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
      <motion.div
        initial={skipAnimation ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE_CURVE, delay: 0.15 }}
        className="flex min-w-0 flex-col gap-5"
      >
        <RecentActivity
          userId={userId}
          playerIds={playerIds}
          hasMatches={hasMatches}
          showEmptyAction={hasMatches}
          showMatchesLink={hasMatches}
          matchCount={matchCount}
          wonCount={wonCount}
        />
        {/* Under the matches card in the main column — the design's
            default `activityUnderMatches` placement (artboard 1b). */}
        <ActivityWidget activity={activity} showSessionLog={hasMatches} />
      </motion.div>

      <motion.div
        initial={skipAnimation ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE_CURVE, delay: 0.2 }}
        className="flex flex-col gap-5"
      >
        {/* Three states, one card. With computed evidence it states a
            finding; on day zero it shows its own anatomy holding nothing, the
            way every other region on that page does. In between — matches
            filed, nothing analysed yet — it stays off the page, because
            "Renders nothing without real numbers" (SKILL.md's InsightCard
            spec) and a placeholder after the player has already sent a match
            would be the page failing to notice. */}
        {insightEvidence ? (
          <FocusCard
            footer={{
              left: insightCaption,
              right: (
                <>
                  <span className="tabular">{analyzedMatchCount}</span>{" "}
                  {analyzedMatchCount === 1 ? "match" : "matches"}
                </>
              ),
            }}
          >
            <HomeAiInsight
              evidence={insightEvidence}
              cacheSignature={insightSignature}
            />
          </FocusCard>
        ) : (
          !hasMatches && (
            <FocusCard
              showStatisticsLink={false}
              footer={{ left: "One thing to work on, after your first match." }}
            >
              <FocusEmpty />
            </FocusCard>
          )
        )}
        <ServePlacementHome userId={userId} />
      </motion.div>
    </div>
  );

  // Day zero is its own composition: the offer centred over a graded copy of
  // the page it is offering, and none of the furniture — no title row, no
  // getting-set-up line, no usage footer. All of it returns with the first
  // match, and from then on the frame never moves again.
  if (!hasMatches) {
    return <DayZeroHome kpiStrip={kpiStrip}>{grid}</DayZeroHome>;
  }

  return (
    // 16px between the title row, the strip, the grid and the footer — Pa2's
    // column gap (21a ran 22px; the audit's 1440×900 frames tightened it).
    <div className="flex flex-1 flex-col gap-4">
      <SeasonTitle
        hasMatches={hasMatches}
        matchCount={matchCount}
        analyzedMatchCount={analyzedMatchCount}
        usage={usage}
        userId={userId}
      />

      {/* The frame never moves once a match is in: every region stays present
          and labelled with what will fill it, whether or not it has a figure
          to show yet. */}
      {kpiStrip}

      {/* 400px right column and a 24px gutter, as Pa2 draws it (21a ran
          348px); the cards inside each column sit 20px apart. */}
      {grid}

      {/* `mt-auto` eats the leftover column height, so on a short page — the
          empty state especially — the footer lands on the bottom edge instead
          of hanging directly under the cards. On a page taller than the
          viewport there is no leftover height and the margin resolves to zero,
          leaving the footer in normal flow after the content. */}
      <div className="mt-auto flex flex-col gap-4">
        <SetupLine setup={setup} />
        <UsageFooter
          usedSeconds={usage.usedSeconds}
          capSeconds={usage.capSeconds}
          billingMonth={usage.billingMonth}
        />
      </div>
    </div>
  );
}
