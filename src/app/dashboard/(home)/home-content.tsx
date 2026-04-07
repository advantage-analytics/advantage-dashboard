"use client";

import { useRef, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import WelcomeMessage from "@/components/dashboard/home/welcome-message";
import RecentActivity from "./recent-activity";
import ServePlacementHome from "@/components/dashboard/home/serve-placement-home";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

interface HomeContentProps {
  displayName: string;
  greeting: string;
  kpiStrip?: ReactNode;
  sidebar?: ReactNode;
}

export default function HomeContent({
  displayName,
  greeting,
  kpiStrip,
  sidebar,
}: HomeContentProps) {
  const shouldReduceMotion = useReducedMotion();
  const hasAnimated = useRef(false);
  const skipAnimation = shouldReduceMotion || hasAnimated.current;
  hasAnimated.current = true;

  return (
    <>
      <WelcomeMessage name={displayName} greeting={greeting} />

      {kpiStrip && <div className="mt-8">{kpiStrip}</div>}

      <div className={cn("mt-10", sidebar
        ? "grid grid-cols-1 lg:grid-cols-[5fr_2fr] gap-8"
        : "flex flex-col gap-6"
      )}>
        {/* Left Column */}
        <motion.div
          initial={skipAnimation ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE_CURVE, delay: 0.15 }}
          className="flex flex-col gap-6 min-w-0"
        >
          <RecentActivity />
          <ServePlacementHome />
        </motion.div>

        {/* Right Column */}
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
  );
}
