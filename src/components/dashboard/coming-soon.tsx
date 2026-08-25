"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { HelpCircle } from "lucide-react";

/**
 * The empty state for a surface that exists in navigation before it exists in
 * full.
 *
 * Extracted from the statistics page, which had the only copy. The v2 sidebar
 * adds four more destinations in the same condition, and five hand-copied
 * versions would drift in wording and in motion timing — this page family is
 * the one place a user meets the product's voice while being told "not yet",
 * so it needs to sound the same every time.
 *
 * Register: state what will be here and what to do meanwhile. No apology, no
 * exclamation mark, no countdown we cannot keep.
 */
const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

const T = {
  HEADING: 0.1,
  DESCRIPTION: 0.2,
  CTA: 0.35,
  HELP: 0.45,
} as const;

export interface ComingSoonProps {
  heading: string;
  description: string;
  /** Where to send someone who came here wanting to do something now. */
  action?: { label: string; href: string };
  /**
   * Offer the help centre. On by default; off where the page has nothing a
   * reader could be stuck on yet, so the only link out is not a shrug.
   */
  showHelp?: boolean;
}

/**
 * A whole route in this state: the page's own title, then the empty state.
 *
 * The title stays because the sidebar highlights this destination and the
 * breadcrumb names it — landing on a page whose heading is only "not yet"
 * leaves no confirmation you arrived where you clicked.
 */
export function ComingSoonPage({
  title,
  ...rest
}: ComingSoonProps & { title: string }) {
  return (
    <div className="w-full flex-1 bg-white">
      <div className="mx-auto max-w-screen-2xl px-6 py-8 sm:px-8 sm:py-10">
        <h1 className="text-[30px] font-light leading-[36px] tracking-[-0.6px] text-[#0D0D0D]">
          {title}
        </h1>
        <ComingSoon {...rest} />
      </div>
    </div>
  );
}

function ComingSoon({
  heading,
  description,
  action,
  showHelp = true,
}: ComingSoonProps) {
  // `skip` feeds motion `initial` props, which React only consults when an
  // element mounts.
  const skip = useReducedMotion();

  function anim(delay: number) {
    return {
      initial: skip ? (false as const) : { opacity: 0, y: 10 },
      animate: { opacity: 1, y: 0 },
      transition: skip
        ? { duration: 0 }
        : { duration: 0.35, ease: EASE_CURVE, delay },
    };
  }

  return (
    <div className="mx-auto flex max-w-[440px] flex-col items-center px-6 pb-20 pt-16 text-center">
      <motion.h2
        className="mb-3 text-[28px] font-light leading-[34px] tracking-[-0.5px] text-[#0D0D0D]"
        {...anim(T.HEADING)}
      >
        {heading}
      </motion.h2>

      <motion.p
        className="max-w-[400px] text-[13px] font-normal leading-[1.6] text-[#888888]"
        {...anim(T.DESCRIPTION)}
      >
        {description}
      </motion.p>

      {(action || showHelp) && (
        <div className="mt-9 flex flex-col items-center gap-4">
          {action && (
            <motion.div {...anim(T.CTA)}>
              <Link
                href={action.href}
                className="inline-flex h-9 items-center justify-center rounded-[6px] bg-[#3B82F6] px-4 text-[13px] font-medium text-white shadow-[0_1px_3px_rgba(57,134,243,0.25)] transition-colors duration-200 hover:bg-[#2563EB] focus-visible:outline-none"
              >
                {action.label}
              </Link>
            </motion.div>
          )}
          {showHelp && (
            <motion.div {...anim(T.HELP)}>
              <Link
                href="/dashboard/help"
                className="inline-flex items-center gap-1.5 rounded-sm text-[11px] font-medium uppercase tracking-[1.5px] text-[#888888] transition-colors duration-200 hover:text-[#525252] focus-visible:outline-none"
              >
                <HelpCircle className="h-3 w-3" strokeWidth={1.5} aria-hidden="true" />
                Visit the help center
              </Link>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
