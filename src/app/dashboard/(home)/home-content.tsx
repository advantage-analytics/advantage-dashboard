"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import WelcomeMessage from "@/components/dashboard/home/welcome-message";
import EmptyDashboard, {
  type SetupProgress,
} from "@/components/dashboard/home/empty-dashboard";
import RecentActivity from "./recent-activity";
import ServePlacementHome from "@/components/dashboard/home/serve-placement-home";
import { FocusCard } from "@/components/dashboard/home/focus-card";
import HomeAiInsight from "@/components/dashboard/home/home-ai-insight";
import { NewReportsSubline } from "@/components/dashboard/home/new-reports-subline";
import { UsageFooter } from "@/components/dashboard/shared/usage-footer";
import { ActivityWidget } from "@/components/dashboard/home/activity-widget";
import type { EvidencePart } from "@/lib/ui/insight-evidence";
import type { PersonalUsage } from "@/lib/data/usage-server";
import type { PersonalActivity } from "@/lib/data/personal-activity-server";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

// Module-scope so stagger doesn't replay on return navigation within the session.
let hasAnimatedOnce = false;

interface HomeContentProps {
  displayName: string;
  greeting: string;
  hasMatches: boolean;
  userId: string;
  /** Which ids mean "me" on a match row — login plus claimed roster profiles. */
  playerIds: string[];
  kpiStrip?: ReactNode;
  usage: PersonalUsage;
  matchCount: number;
  /** Computed evidence for the Focus card, or null when there is none to state. */
  insightEvidence: EvidencePart[] | null;
  insightSignature: string;
  /** 52-week match-day heatmap for the Activity widget. */
  activity: PersonalActivity;
  /**
   * Persisted answers to the getting-set-up checklist, read on the server.
   * Only the empty state renders them, but they are resolved alongside the
   * rest of the page's data rather than fetched from inside it — the empty
   * dashboard is reached through this client component and so cannot query.
   */
  setup: SetupProgress;
}

export default function HomeContent({
  displayName,
  greeting,
  hasMatches,
  userId,
  playerIds,
  kpiStrip,
  usage,
  matchCount,
  insightEvidence,
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

  return (
    <div className="flex flex-1 flex-col gap-6">
      <WelcomeMessage
        name={displayName}
        greeting={greeting}
        subline={
          hasMatches ? (
            <NewReportsSubline userId={userId} fallback="" />
          ) : (
            <span className="text-body-sm">
              Send a match and the analysis comes back to this page.
            </span>
          )
        }
      />

      {!hasMatches ? (
        <EmptyDashboard setup={setup} />
      ) : (
        <>
          {kpiStrip}

          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <motion.div
              initial={skipAnimation ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE_CURVE, delay: 0.15 }}
              className="flex min-w-0 flex-col gap-4"
            >
              <RecentActivity userId={userId} playerIds={playerIds} />
              {/* Under the matches card in the main column — the design's
                  default `activityUnderMatches` placement (artboard 1b). */}
              <ActivityWidget activity={activity} />
            </motion.div>

            <motion.div
              initial={skipAnimation ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE_CURVE, delay: 0.2 }}
              className="flex flex-col gap-5"
            >
              {/* No computed evidence, no card — "Renders nothing without
                  real numbers" (SKILL.md's InsightCard spec). */}
              {insightEvidence && (
                <FocusCard>
                  <HomeAiInsight
                    evidence={insightEvidence}
                    cacheSignature={insightSignature}
                    matchCount={matchCount}
                  />
                </FocusCard>
              )}
              <ServePlacementHome userId={userId} />
            </motion.div>
          </div>
        </>
      )}

      {/* `mt-auto` eats the leftover column height, so on a short page — the
          empty state especially — the footer lands on the bottom edge instead
          of hanging directly under the cards. On a page taller than the
          viewport there is no leftover height and the margin resolves to zero,
          leaving the footer in normal flow after the content. */}
      <div className="mt-auto">
        <UsageFooter
          usedSeconds={usage.usedSeconds}
          capSeconds={usage.capSeconds}
          billingMonth={usage.billingMonth}
        />
      </div>
    </div>
  );
}
