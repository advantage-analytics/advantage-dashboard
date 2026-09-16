"use client";

import { useCallback, useRef, useState, type RefObject } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, ChevronDown, ChevronUp } from "lucide-react";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import { splitInsight } from "@/components/dashboard/matches/match-detail/insight-text";

/** `--ease-out-expo`: the DS curve for layout transitions. */
const EASE_OUT_EXPO = [0.23, 1, 0.32, 1] as const;

/** Which toggle should take focus once the other variant has swapped in. */
type PendingFocus = RefObject<"collapse" | "show" | null>;

/**
 * The Advantage Intelligence insight at the top of the Statistics view
 * (design 04 F2 expanded, F3 collapsed), successor to the rail's
 * `RailInsightCard`.
 *
 * It shows the viewer's own `meta.summary` and nothing else. That string
 * arrives already picked by side in `page.tsx` (guardrails §4), so neither
 * variant chooses a player. The claim is its first sentence and the evidence
 * is the rest, split by `splitInsight`. Nothing is invented and no figure is
 * emphasised (spec › Decisions 4).
 *
 * Two explicit variants rather than a `collapsed` flag on one component.
 * Collapse is this visit's state, owned by the provider; there is no dismiss
 * (spec › Decisions 5), so the summary can be folded away but always returns.
 *
 * ── The fold ────────────────────────────────────────────────────────────────
 * The card's surface (border, radius, shadow) lives here, not in the
 * variants, so collapsing reads as one card folding rather than one card
 * replaced by another. Its height tweens from the outgoing layout to the
 * incoming one on `--ease-out-expo` (320ms open, 240ms close: exits run
 * faster), and the widgets row below travels with it instead of jumping.
 * Inside, `AnimatePresence`'s `popLayout` lifts the outgoing content out of
 * flow, so the height being measured is always the incoming layout's; the
 * outgoing content fades in 120ms under the clip, the incoming one fades in
 * and settles 4px. The height comes from a `ResizeObserver` on the content,
 * so a reflow at a new pane width follows too.
 *
 * Reduced motion: no height tween and no travel. The swap is immediate and
 * only the crossfade remains, which still says the content changed.
 *
 * Focus: the pressed toggle unmounts with its variant, so the other variant's
 * toggle takes focus as it mounts. The request is made in the click handler,
 * which is why a first render never steals focus.
 */
export function MatchReportInsight() {
  const { state, meta } = useMatchReport();
  const reduceMotion = useReducedMotion();
  const pendingFocusRef = useRef<"collapse" | "show" | null>(null);
  const [contentHeight, setContentHeight] = useState<number | null>(null);

  const observerRef = useRef<ResizeObserver | null>(null);
  const measure = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;
    const resize = new ResizeObserver(([entry]) => {
      setContentHeight(
        entry.borderBoxSize?.[0]?.blockSize ??
          entry.target.getBoundingClientRect().height,
      );
    });
    resize.observe(node);
    observerRef.current = resize;
  }, []);

  // No summary means no card, not an empty one. An empty string counts as no
  // summary too.
  if (!meta.summary) return null;

  const collapsed = state.insight === "collapsed";

  return (
    <motion.section
      aria-label="Advantage Intelligence summary"
      className="relative shrink-0 overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]"
      initial={false}
      animate={{ height: contentHeight ?? "auto" }}
      transition={{
        duration: reduceMotion ? 0 : collapsed ? 0.24 : 0.32,
        ease: EASE_OUT_EXPO,
      }}
    >
      <div ref={measure}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={collapsed ? "collapsed" : "expanded"}
            initial={{ opacity: 0, y: reduceMotion ? 0 : collapsed ? -4 : 4 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: {
                duration: reduceMotion ? 0.15 : 0.22,
                delay: reduceMotion ? 0 : 0.06,
                ease: EASE_OUT_EXPO,
              },
            }}
            exit={{
              opacity: 0,
              transition: { duration: 0.12, ease: "linear" },
            }}
          >
            {collapsed ? (
              <InsightCollapsed pendingFocusRef={pendingFocusRef} />
            ) : (
              <InsightExpanded pendingFocusRef={pendingFocusRef} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.section>
  );
}

/**
 * A ref callback that focuses the toggle this variant was swapped in by, once,
 * and never on a first render (nothing requested it then).
 */
function focusWhenRequested(
  pendingFocusRef: PendingFocus,
  which: "collapse" | "show",
) {
  return (element: HTMLButtonElement | null) => {
    if (!element || pendingFocusRef.current !== which) return;
    pendingFocusRef.current = null;
    element.focus({ preventScroll: true });
  };
}

/**
 * One column, and the text runs the card's full width: the claim at 13px
 * medium ink-900, the evidence under it at 11px, then a foot row with the
 * engine credit and Collapse (sizes reduced at the user's request,
 * 2026-09-16). Across the whole pane a 2–3 sentence summary sets as a line or
 * two. No `max-w`, so the text's edges line up with the widgets row below.
 * The card's surface is `MatchReportInsight`'s; this is its content.
 */
export function InsightExpanded({
  pendingFocusRef,
}: {
  pendingFocusRef: PendingFocus;
}) {
  const { actions, meta } = useMatchReport();
  if (!meta.summary) return null;
  const { claim, evidence } = splitInsight(meta.summary);

  return (
    <div className="flex flex-col gap-2 p-[16px_20px_12px]">
      {/* `.text-body` is the scale's 13px step. It sets its own colour and
          weight, and the class is unlayered, so the claim's ink-900 and 500
          go inline. */}
      <p
        className="text-body [text-wrap:pretty]"
        style={{ color: "var(--ink-900)", fontWeight: 500 }}
      >
        {claim}
        {!evidence && (
          <>
            {" "}
            <WhyThisLink />
          </>
        )}
      </p>

      {evidence && (
        <p className="text-[11px] leading-[1.6] [text-wrap:pretty] text-[var(--ink-700)]">
          {evidence} <WhyThisLink />
        </p>
      )}

      <div className="mt-1 flex items-center gap-[7px] border-t border-[var(--border-hairline)] pt-2.5">
        <InsightMark />
        {/* `.text-micro` already paints ink-500, which is the credit's colour. */}
        <span className="text-micro">Advantage Intelligence</span>
        <div className="flex-1" />
        <ChromeTooltip label="Collapse summary" side="top">
          <button
            ref={focusWhenRequested(pendingFocusRef, "collapse")}
            type="button"
            aria-label="Collapse summary"
            aria-expanded="true"
            onClick={() => {
              pendingFocusRef.current = "show";
              actions.collapseInsight();
            }}
            className="-my-1 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-400)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-700)]"
          >
            <ChevronUp
              className="size-3.5"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </button>
        </ChromeTooltip>
      </div>
    </div>
  );
}

/**
 * F3: one 44px line holding the mark, the claim cut to one line, then Show
 * (the only blue). Collapse is session state that starts at "expanded", so
 * this variant only appears after the player collapses the card this visit.
 *
 * 42px of content inside the card's 1px border keeps the row at F3's 44px.
 * The card's surface is `MatchReportInsight`'s; this is its content.
 */
export function InsightCollapsed({
  pendingFocusRef,
}: {
  pendingFocusRef: PendingFocus;
}) {
  const { actions, meta } = useMatchReport();
  if (!meta.summary) return null;
  const { claim } = splitInsight(meta.summary);

  return (
    <div className="flex h-[42px] items-center gap-2.5 pr-3 pl-5">
      {/* No credit line here, so the mark names the engine for a screen reader. */}
      <InsightMark label="Advantage Intelligence" />
      {/* The same claim type as the expanded card: `.text-body` 13px with
          ink-900 and 500 inline, since the class is unlayered. */}
      <p
        className="text-body min-w-0 flex-1 truncate"
        style={{ color: "var(--ink-900)", fontWeight: 500 }}
      >
        {claim}
      </p>
      <button
        ref={focusWhenRequested(pendingFocusRef, "show")}
        type="button"
        aria-expanded="false"
        onClick={() => {
          pendingFocusRef.current = "collapse";
          actions.expandInsight();
        }}
        className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-[var(--radius-element)] px-2 py-1 text-[11px] font-medium whitespace-nowrap text-[var(--blue)] transition-colors duration-200 hover:text-[var(--blue-hover)]"
      >
        Show
        <ChevronDown
          className="size-3.5"
          strokeWidth={1.5}
          aria-hidden="true"
        />
      </button>
    </div>
  );
}

/**
 * The engine mark at the size F2 and F3 draw it beside small text: a 16px
 * ink-900 square with the 9×6 swoosh inverted to white (the frame's
 * `logo-mark.svg` is `/logos/logo3.svg` here, as on Home's Focus card). With a
 * `label` the mark is an image that names the engine; without one it is
 * decoration beside the visible credit.
 */
function InsightMark({ label }: { label?: string }) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="flex size-4 shrink-0 items-center justify-center rounded-[3px] bg-[var(--ink-900)]"
    >
      <Image
        src="/logos/logo3.svg"
        alt=""
        width={9}
        height={6}
        className="brightness-0 invert"
        aria-hidden="true"
      />
    </span>
  );
}

/**
 * The inline link at the end of the evidence, or the claim when a summary is
 * one sentence. `/dashboard/ask` is the retired rail card's destination. A
 * blue word rests on `--blue` and hovers to `--blue-hover`
 * (foundations › Text Colors). It is a text link, so it gets no tooltip.
 */
function WhyThisLink() {
  return (
    <Link
      href="/dashboard/ask"
      className="text-[11px] font-medium tracking-normal whitespace-nowrap text-[var(--blue)] transition-colors duration-200 hover:text-[var(--blue-hover)]"
    >
      Why this
      <ArrowUpRight
        className="ml-[3px] inline-block size-3 align-[-1px]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </Link>
  );
}
