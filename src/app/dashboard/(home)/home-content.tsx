"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import WelcomeMessage from "@/components/dashboard/home/welcome-message";
import EmptyDashboard from "@/components/dashboard/home/empty-dashboard";
import RecentActivity from "./recent-activity";
import ServePlacementHome from "@/components/dashboard/home/serve-placement-home";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

// Module-scope so stagger doesn't replay on return navigation within the session.
let hasAnimatedOnce = false;

interface HomeContentProps {
  displayName: string;
  greeting: string;
  hasMatches: boolean;
  userId: string;
  kpiStrip?: ReactNode;
  sidebar?: ReactNode;
}

export default function HomeContent({
  displayName,
  greeting,
  hasMatches,
  userId,
  kpiStrip,
  sidebar,
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
    <>
      <WelcomeMessage name={displayName} greeting={greeting} />

      {!hasMatches ? (
        <div className="mt-10">
          <EmptyDashboard />
        </div>
      ) : (
        <>
          {kpiStrip && <div className="mt-8">{kpiStrip}</div>}

          <div className={cn("mt-10", sidebar
            ? "grid grid-cols-1 lg:grid-cols-[5fr_2fr] gap-8"
            : "flex flex-col gap-6"
          )}>
            <motion.div
              initial={skipAnimation ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE_CURVE, delay: 0.15 }}
              className="flex flex-col gap-6 min-w-0"
            >
              <RecentActivity userId={userId} />
              <ServePlacementHome userId={userId} />
            </motion.div>

            {sidebar && (
              <motion.div
                initial={skipAnimation ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: EASE_CURVE, delay: 0.2 }}
                className="flex flex-col gap-6"
              >
                {sidebar}
              </motion.div>
            )}
          </div>
        </>
      )}
    </>
  );
}
