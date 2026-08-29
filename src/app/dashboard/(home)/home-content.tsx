"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import WelcomeMessage from "@/components/dashboard/home/welcome-message";
import EmptyDashboard from "@/components/dashboard/home/empty-dashboard";
import RecentActivity from "./recent-activity";
import ServePlacementHome from "@/components/dashboard/home/serve-placement-home";
import { FocusCard } from "@/components/dashboard/home/focus-card";
import HomeAiInsight from "@/components/dashboard/home/home-ai-insight";
import { NewReportsSubline } from "@/components/dashboard/home/new-reports-subline";
import { UsageFooter } from "@/components/dashboard/shared/usage-footer";
import type { EvidencePart } from "@/lib/ui/insight-evidence";
import type { PersonalUsage } from "@/lib/data/usage-server";

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
    <div className="flex flex-col gap-6">
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
        <EmptyDashboard />
      ) : (
        <>
          {kpiStrip}

          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <motion.div
              initial={skipAnimation ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE_CURVE, delay: 0.15 }}
              className="min-w-0"
            >
              <RecentActivity userId={userId} playerIds={playerIds} />
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

      <UsageFooter
        usedSeconds={usage.usedSeconds}
        capSeconds={usage.capSeconds}
        billingMonth={usage.billingMonth}
      />
    </div>
  );
}
