"use client";

/**
 * WizardShell — the chrome of a full-page step-by-step flow, and nothing else.
 *
 * The full-bleed step indicator under the app header, an optional pinned bar
 * beneath it, the 832px centred column with its "Step N of M" eyebrow, title
 * and lede, the keyed fade-in content, and the sticky 64px footer: Back or
 * Cancel · meter · status · spacer · secondary · primary.
 *
 * It owns no state and makes no decision. Which step this is, what the title
 * says, whether Continue is asleep and what it does when it wakes — all of
 * that is computed by the page and handed in. `UploadMatchFlow` is the first
 * consumer; `ScoreOnlyFlow` hand-rolls the same shape and could adopt this.
 */

import type { ReactNode, RefObject } from "react";
import Link from "next/link";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import { StepIndicator } from "./StepIndicator";

/** The design's column: 720px of content inside 56px gutters. */
export const CONTENT_CLS = "mx-auto w-full max-w-[832px] px-14";

export interface WizardShellProps {
  /** Zero-based. */
  stepIndex: number;
  stepCount: number;
  title: ReactNode;
  description: ReactNode;
  /** Full-bleed bar between the step indicator and the column. */
  pinned?: ReactNode;
  /** The content column's root, for the keyboard hook's focus walk. */
  contentRef?: RefObject<HTMLDivElement | null>;
  /** Remounts the content — and replays its fade — when it changes. */
  contentKey?: string | number;
  /** Extra classes on the content column (the title-to-content gap). */
  contentClassName?: string;
  /** Present when there is a previous step; the footer then shows Back. */
  back?: () => void;
  /** Where Cancel goes when there is no `back`. */
  cancelHref?: string;
  /** Footer, left of the status: the allowance meter. */
  meter?: ReactNode;
  /** Footer, left of the spacer: what the step is waiting on. */
  status?: ReactNode;
  /** Footer, right of the spacer, before the primary. */
  secondary?: ReactNode;
  continueLabel: ReactNode;
  onContinue: () => void;
  continueDisabled: boolean;
  children: ReactNode;
}

export function WizardShell({
  stepIndex,
  stepCount,
  title,
  description,
  pinned,
  contentRef,
  contentKey,
  contentClassName,
  back,
  cancelHref,
  meter,
  status,
  secondary,
  continueLabel,
  onContinue,
  continueDisabled,
  children,
}: WizardShellProps) {
  return (
    <div className="flex min-h-[calc(100vh-44px)] flex-col">
      {/* Full-bleed under the app header. Inside the content column it read as
          a rule belonging to the title; spanning the pane it reads as chrome
          measuring the whole flow. */}
      <StepIndicator currentStep={stepIndex} totalSteps={stepCount} />

      {pinned}

      <div className={`${CONTENT_CLS} pb-10 pt-16`}>
        <div className="flex flex-col gap-3">
          <span className="eyebrow-sm" style={{ color: "var(--ink-400)" }}>
            Step {stepIndex + 1} of {stepCount}
          </span>
          <h1
            className="max-w-[560px] text-[30px] font-light leading-[1.15] tracking-[-0.3px] text-[var(--ink-900)]"
            style={{ textWrap: "pretty" }}
          >
            {title}
          </h1>
          <p
            className="max-w-[480px] text-[13px] leading-[1.55] text-[var(--ink-600)]"
            style={{ textWrap: "pretty" }}
          >
            {description}
          </p>
        </div>

        <div
          ref={contentRef}
          key={contentKey}
          className={cn("animate-fadeIn", contentClassName)}
        >
          {children}
        </div>
      </div>

      {/* Footer sticks to the bottom of the viewport so the primary action is
          reachable without scrolling to the end of a long form. 64px, white on
          a hairline, matching the app header: Cancel · divider · meter, then
          the secondary and Continue. It is the same on every step — only the
          meter comes and goes, and it sits left of the spacer so nothing else
          shifts when it does. */}
      <div className="sticky bottom-0 mt-auto border-t border-[var(--border-hairline)] bg-white">
        <div className={`${CONTENT_CLS} flex h-16 items-center gap-4`}>
          {back ? (
            <button
              type="button"
              onClick={back}
              className="cursor-pointer text-[12px] text-[var(--ink-600)] transition-colors duration-150 hover:text-[var(--ink-900)]"
            >
              Back
            </button>
          ) : cancelHref ? (
            /* Esc is deliberately inert on step 1 and the breadcrumb is not
               obviously an exit — without this the flow has no way out that
               looks like one. */
            <Link
              href={cancelHref}
              className="text-[12px] text-[var(--ink-600)] transition-colors duration-150 hover:text-[var(--ink-900)]"
            >
              Cancel
            </Link>
          ) : null}

          {meter}

          {status}

          <div className="flex-1" />

          {secondary}

          {/* Always present; asleep at the design system's disabled state
              (`advButton()`: opacity 0.5, no pointer) until the step's
              requirement is met. The same button as every other page-level
              CTA — "New match", "Create dual", "Create tournament" — so `md`,
              not the `sm` the row actions use, and no width of its own. */}
          <button
            type="button"
            onClick={onContinue}
            disabled={continueDisabled}
            data-wizard-continue
            className={advButton("primary", "md")}
          >
            {continueLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
