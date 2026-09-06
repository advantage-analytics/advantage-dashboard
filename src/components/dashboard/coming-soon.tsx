"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { advButton } from "@/lib/ui/adv-button";

/**
 * The state a surface is in when it exists in navigation before it exists in
 * full — the feature is not built yet.
 *
 * **This is not a day-zero state and must not look like one.** Day zero shows
 * the page's own shape, dimmed, because the shape exists and only the data is
 * missing (SKILL.md → Empty State, and Personal Home Recipes → Day zero). A
 * feature that has not been built has no shape, so drawing a dimmed mock-up of
 * one would invent a layout that may never ship — the same fabrication the
 * empty-state rules exist to prevent. Here the page says plainly that it is
 * not here yet, says what it will do, and offers the nearest thing that works
 * today.
 *
 * The register: name the state, state what will be here, give somewhere to go.
 * No apology, no exclamation mark, no date the product cannot keep.
 */
const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

const T = { LABEL: 0.05, HEADING: 0.12, DESCRIPTION: 0.2, CTA: 0.32 } as const;

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
 * A whole route in this state: the page's own title, then the statement.
 *
 * The title stays because the sidebar highlights this destination and the
 * breadcrumb names it — landing on a page whose heading is only "not yet"
 * leaves no confirmation you arrived where you clicked. It is also why the
 * statement below sits at `text-title-lg` rather than the title's 30px: two
 * headings a hair apart in size read as a mistake, and the h1 should lead.
 */
export function ComingSoonPage({
  title,
  ...rest
}: ComingSoonProps & { title: string }) {
  return (
    <div className="flex w-full flex-1 flex-col bg-white">
      <div className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-col px-14 pt-5 pb-8">
        <h1 className="text-display">{title}</h1>
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
      transition: skip ? { duration: 0 } : { duration: 0.35, ease: EASE_CURVE, delay },
    };
  }

  return (
    <div className="mx-auto flex max-w-[440px] flex-1 flex-col items-center justify-center pb-24 text-center">
      {/* The state, named. Without it the page reads as though the feature is
          here and the reader failed to find it. */}
      <motion.span className="eyebrow mb-3.5" {...anim(T.LABEL)}>
        Coming soon
      </motion.span>

      <motion.h2 className="text-title-lg" style={{ maxWidth: "22ch" }} {...anim(T.HEADING)}>
        {heading}
      </motion.h2>

      <motion.p
        className="text-body-sm mt-2.5"
        style={{ maxWidth: "46ch", textWrap: "pretty" }}
        {...anim(T.DESCRIPTION)}
      >
        {description}
      </motion.p>

      {(action || showHelp) && (
        <motion.div className="mt-7 flex items-center gap-3" {...anim(T.CTA)}>
          {action && (
            <Link href={action.href} className={advButton("primary")}>
              {action.label}
            </Link>
          )}
          {/* A plain link at the page's own link size. It was an uppercase
              tracked run, which is the eyebrow treatment — a label register,
              not a control one — and the rail already carries Help Center
              permanently, so this is a convenience, not a second door. */}
          {showHelp && (
            <Link
              href="/dashboard/help"
              className="rounded-sm text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:outline-none"
            >
              Visit the help center
            </Link>
          )}
        </motion.div>
      )}
    </div>
  );
}
