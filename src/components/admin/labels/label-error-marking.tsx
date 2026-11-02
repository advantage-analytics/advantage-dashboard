"use client";

import { CornerDownRight, Flag } from "lucide-react";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { Kbd } from "@/components/ui/kbd";
import { ERROR_STOP_LABEL } from "@/lib/services/labels/flag-nav";
import type { LabelErrorKind } from "@/lib/services/labels/session";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import { ERROR_KIND_CHOICES } from "./label-black-shot-row";

/**
 * Forced or unforced, asked in the rail once nothing is left that can move the
 * score: a third count beside the amber and grey flags, a chip on each error
 * still to mark, one line under the missed stroke with the two answers, and a
 * strip that says when it starts and when it is done. Blue, because this is
 * neither amber (can move the score) nor grey (wrong data): it is the next
 * thing to do. Never required: a publish past it reports plain Errors.
 */

/** The rail's flag glyph, as `MarkChip` and the header's counts draw it. */
function ErrorGlyph() {
  return <Flag className="size-2.5" strokeWidth={1.8} aria-hidden="true" />;
}

/** The header's count: a jump to the next error to mark. */
export function LabelErrorCount({
  count,
  nextPointNumber,
  onNext,
  keyed,
}: {
  count: number;
  nextPointNumber: number;
  onNext: () => void;
  /** Whether `]` walks this list now: only with no amber stop open. */
  keyed: boolean;
}) {
  const label =
    count === 1 ? "1 error left to mark" : `${count} errors left to mark`;
  return (
    <ChromeTooltip
      label={`Next error · point ${nextPointNumber}`}
      detail={[ERROR_STOP_LABEL, label]}
      shortcut={keyed ? "]" : undefined}
      side="bottom"
    >
      <button
        type="button"
        data-label-rail-errors=""
        aria-label={label}
        onClick={onNext}
        className="mono tabular inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-[6px] bg-[var(--rail-blue-wash)] px-[5px] text-[10px] whitespace-nowrap text-[var(--rail-blue)] transition-colors duration-150 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
      >
        <ErrorGlyph />
        {count}
      </button>
    </ChromeTooltip>
  );
}

/** A point row's chip while its error is still to mark. */
export function LabelErrorChip() {
  return (
    <ChromeTooltip label={ERROR_STOP_LABEL} side="top">
      <span
        role="img"
        data-error-chip=""
        aria-label={`Error to mark: ${ERROR_STOP_LABEL}`}
        className="inline-flex h-[18px] shrink-0 items-center rounded-full bg-[var(--rail-blue-wash)] px-1.5 text-[var(--rail-blue)]"
      >
        <ErrorGlyph />
      </span>
    </ChromeTooltip>
  );
}

/**
 * The question, under the missed stroke and its tray: the hook line
 * `ReviewNote` draws, with the two answers on it and the keys that say them.
 * The film has just played the point's last two strokes.
 */
export function LabelErrorQuestion({
  index,
  total,
  onAnswer,
}: {
  /** This error's place among every error in the match, from 1. */
  index: number;
  total: number;
  onAnswer: (kind: LabelErrorKind) => void;
}) {
  return (
    <div
      data-error-question=""
      className="flex h-[38px] min-w-0 items-center gap-2 pr-[14px] pl-[44px] text-[11px] font-medium text-[var(--rail-blue)]"
    >
      <CornerDownRight
        aria-hidden="true"
        strokeWidth={2}
        className="size-3 shrink-0 opacity-60"
      />
      <span className="shrink-0">{ERROR_STOP_LABEL}</span>
      <span
        role="group"
        aria-label={ERROR_STOP_LABEL}
        className="ml-1 inline-flex shrink-0 items-center gap-1"
      >
        {ERROR_KIND_CHOICES.map(({ kind, label }) => (
          <button
            key={kind}
            type="button"
            data-error-answer={kind}
            aria-keyshortcuts={kind === "forced" ? "E" : "U"}
            onClick={(event) => {
              event.stopPropagation();
              onAnswer(kind);
            }}
            className="inline-flex h-[26px] cursor-pointer items-center gap-1.5 rounded-[var(--radius-button)] bg-white/[0.10] px-2 text-[11px] font-medium whitespace-nowrap text-white transition-colors duration-150 hover:bg-white/[0.18] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            {label}
            <Kbd
              size="sm"
              variant="flat"
              mono
              className="bg-white/[0.08] text-white/60 shadow-none"
            >
              {kind === "forced" ? "E" : "U"}
            </Kbd>
          </button>
        ))}
      </span>
      <span className="mono tabular ml-auto shrink-0 pl-3 font-normal text-white/45">
        {index} of {total}
      </span>
    </div>
  );
}

/** The strip's frame, under the rail's header. */
function Strip({
  title,
  detail,
  children,
  ...attrs
}: {
  title: string;
  detail: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...attrs}
      className="flex shrink-0 items-center gap-3 bg-white/[0.06] px-[14px] py-3 shadow-[inset_0_-1px_0_color-mix(in_oklab,var(--color-white)_8%,transparent)]"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-[12px] leading-[18px] font-medium text-white">
          {title}
        </span>
        <span className="text-[11px] leading-[16.5px] text-white/45">
          {detail}
        </span>
      </div>
      {children}
    </div>
  );
}

/** A strip's quiet answer. */
const STRIP_QUIET =
  "h-8 shrink-0 cursor-pointer rounded-[var(--radius-button)] px-2 text-[12px] font-medium whitespace-nowrap text-white/70 transition-colors duration-150 hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none";

/** The moment it starts: the score is settled and errors are left. */
export function LabelErrorPrompt({
  count,
  onStart,
  onDismiss,
}: {
  count: number;
  onStart: () => void;
  onDismiss: () => void;
}) {
  return (
    <Strip
      data-error-prompt=""
      title={`The score is settled. ${count} ${count === 1 ? "error" : "errors"} left to mark.`}
      detail="Forced or unforced, one at a time. Skip it and the match reports plain Errors."
    >
      <button
        type="button"
        data-error-prompt-dismiss=""
        onClick={onDismiss}
        className={STRIP_QUIET}
      >
        Not now
      </button>
      <button
        type="button"
        data-error-prompt-start=""
        aria-keyshortcuts="]"
        onClick={onStart}
        className={cn(advButton("primary", "sm"))}
      >
        Start
        <Kbd
          size="sm"
          variant="flat"
          mono
          className="bg-white/20 text-white shadow-none"
        >
          ]
        </Kbd>
      </button>
    </Strip>
  );
}

/** The moment it ends: every error marked, in this sitting. */
export function LabelErrorsDone({
  total,
  onDismiss,
}: {
  total: number;
  onDismiss: () => void;
}) {
  return (
    <Strip
      data-errors-done=""
      title={
        total === 1 ? "The error is marked." : `All ${total} errors marked.`
      }
      detail="This match will report forced and unforced."
    >
      <button
        type="button"
        data-errors-done-dismiss=""
        onClick={onDismiss}
        className={STRIP_QUIET}
      >
        Dismiss
      </button>
    </Strip>
  );
}
