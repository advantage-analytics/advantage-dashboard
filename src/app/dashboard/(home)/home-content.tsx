"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { DayZeroHome } from "@/components/dashboard/home/day-zero-home";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

// Module-scope so stagger doesn't replay on return navigation within the session.
let hasAnimatedOnce = false;

interface HomeContentProps {
  hasMatches: boolean;
  title: ReactNode;
  kpiStrip: ReactNode;
  recent: ReactNode;
  activity: ReactNode;
  insight: ReactNode;
  serves: ReactNode;
  footer: ReactNode;
}

export default function HomeContent({
  hasMatches,
  title,
  kpiStrip,
  recent,
  activity,
  insight,
  serves,
  footer,
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
        {recent}
        {activity}
      </motion.div>

      <motion.div
        initial={skipAnimation ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE_CURVE, delay: 0.2 }}
        className="flex flex-col gap-5"
      >
        {insight}
        {serves}
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
      {title}

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
      <div className="mt-auto flex flex-col gap-4">{footer}</div>
    </div>
  );
}
