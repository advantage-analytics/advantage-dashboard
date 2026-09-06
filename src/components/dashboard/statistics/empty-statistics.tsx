"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Percent, RotateCcw, Swords, TrendingUp } from "lucide-react";
import { DayZeroOffer } from "@/components/dashboard/home/day-zero-offer";

/**
 * Statistics with no match behind it.
 *
 * This is a **day zero**, not a coming-soon: the page is built, every one of
 * its twenty-one components exists, and only the data is missing. So it makes
 * the same offer Home and Matches make — one sentence, the primary and ghost
 * pair, the same conditions — and a player who has met that offer on either of
 * those pages meets it again here rather than a third invention.
 *
 * What it does not do is dim a copy of the page beneath. Home and Matches can,
 * because one card and one row are shapes worth previewing; twenty-one stat
 * components rendered as grey rules would be a screen of noise, and Carbon's
 * own guidance for a dashboard of empty widgets is to go text-only rather than
 * repeat a treatment per region.
 *
 * The four columns below stay, because they are the honest form of the same
 * promise: they name what arrives — serve, return, rally, trends — without a
 * figure being invented. They lost their blue rules (a fading accent across
 * four columns implied a ranking that is not there) and their semibold tracked
 * titles for the label register the rest of the product uses.
 */

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

const T = { LABEL: 0.4, START: 0.46, STAGGER: 0.07 } as const;

const ARRIVES = [
  {
    icon: Percent,
    title: "Serve",
    description: "First serve %, aces, double faults, and placement accuracy",
  },
  {
    icon: RotateCcw,
    title: "Return",
    description: "Return points won, break point conversion, and depth",
  },
  {
    icon: Swords,
    title: "Rally",
    description: "Short, medium, and long rally win rates under pressure",
  },
  {
    icon: TrendingUp,
    title: "Trends",
    description: "Performance ratings and win rate tracked over time",
  },
];

export function EmptyStatistics() {
  // `skip` feeds motion `initial` props, which React only consults when an
  // element mounts.
  const skip = useReducedMotion();

  function anim(delay: number) {
    if (skip) return { initial: false as const, animate: { opacity: 1 }, transition: { duration: 0 } };
    return {
      initial: { opacity: 0, y: 10 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.35, ease: EASE_CURVE, delay },
    };
  }

  return (
    <div className="flex flex-col">
      <DayZeroOffer
        headline="Your statistics build with every match."
        headlineMeasure="26ch"
      />

      <div className="mx-auto w-full max-w-[880px] pt-2">
        <motion.p className="eyebrow mb-3.5" {...anim(T.LABEL)}>
          What arrives
        </motion.p>

        <div className="flex flex-col gap-5 sm:flex-row sm:gap-6">
          {ARRIVES.map((item, i) => (
            <motion.div
              key={item.title}
              {...anim(T.START + i * T.STAGGER)}
              className="flex flex-1 flex-col gap-2 border-t border-[var(--border-hairline)] pt-3.5 text-left"
            >
              <div className="flex items-center gap-2">
                <item.icon
                  className="size-3.5 text-[var(--ink-500)]"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <p className="text-[12px] font-medium text-[var(--ink-900)]">
                  {item.title}
                </p>
              </div>
              <p className="text-micro" style={{ textWrap: "pretty" }}>
                {item.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
