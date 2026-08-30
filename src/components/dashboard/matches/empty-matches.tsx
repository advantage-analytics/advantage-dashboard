"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

/**
 * `scope` decides the words, not the layout.
 *
 * "Your match history starts here" is true of a personal workspace and wrong
 * inside a program, where the history belongs to the squad and the person
 * reading it may be a player who does not upload at all.
 *
 * Round 1's delta from the shipped page: title, primary and (on Home) the
 * usage footer are the same bytes as the populated view — the frame fills, it
 * never reorganizes. No skeleton table standing in for data that isn't there.
 */
export function EmptyMatches({
  scope = "personal",
}: {
  scope?: "personal" | "team";
}) {
  const isTeam = scope === "team";
  const shouldReduceMotion = useReducedMotion();
  const skip = shouldReduceMotion;

  function anim(delay: number) {
    if (skip) return { initial: false as const, animate: { opacity: 1 }, transition: { duration: 0 } };
    return {
      initial: { opacity: 0, y: 10 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.35, ease: EASE_CURVE, delay },
    };
  }

  return (
    <div className="flex flex-col gap-3 pt-2">
      <motion.span className="text-title-lg" {...anim(0.05)}>
        {isTeam ? "No matches on the program yet" : "Send your first match"}
      </motion.span>
      <motion.p className="text-body-sm max-w-[56ch]" {...anim(0.12)}>
        {isTeam
          ? "Send a match and it lands here for the whole coaching staff — scores, stats, and trends across the season."
          : "Upload video or import a SwingVision session. Every report lands here — searchable by opponent, event, and how the analysis went."}
      </motion.p>
      <motion.div className="mt-1.5 flex items-center gap-2.5" {...anim(0.18)}>
        <Link href="/dashboard/matches/new" className="text-[12px] font-medium" style={{ color: "var(--blue)" }}>
          Upload video
        </Link>
        <span className="text-[12px]" style={{ color: "var(--ink-300)" }}>
          ·
        </span>
        <Link href="/dashboard/matches/new" className="text-[12px] font-medium" style={{ color: "var(--blue)" }}>
          Import from SwingVision
        </Link>
      </motion.div>
    </div>
  );
}
