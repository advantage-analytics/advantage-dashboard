"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { MatchPoint } from "@/lib/data/match-points-server";
import {
  normalizeReading,
  sameReading,
  type LastStroke,
  type PointReading,
  type Side,
} from "@/lib/data/self-review";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import { useSelfReview } from "./self-review-context";

/** The canvas's option chip: 26px, field border, pressed in blue. */
const OPTION =
  "h-[26px] cursor-pointer rounded-[var(--radius-cell)] border border-[var(--border-field)] bg-[var(--surface-card)] px-2.5 text-[12px] text-[var(--ink-700)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] aria-pressed:border-[var(--blue)] aria-pressed:bg-[var(--blue-tint-08)] aria-pressed:font-medium aria-pressed:text-[var(--ink-900)]";
const QUIET =
  "cursor-pointer rounded-[var(--radius-cell)] px-2 text-[11px] font-medium text-[var(--blue)] transition-colors hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none";

interface EndingOption {
  label: string;
  patch: Pick<PointReading, "ending" | "errorKind">;
}

const ENDINGS: EndingOption[] = [
  { label: "Winner", patch: { ending: "winner", errorKind: null } },
  { label: "Forced error", patch: { ending: "error", errorKind: "forced" } },
  {
    label: "Unforced error",
    patch: { ending: "error", errorKind: "unforced" },
  },
  { label: "Ace", patch: { ending: "ace", errorKind: null } },
  { label: "Double fault", patch: { ending: "double_fault", errorKind: null } },
];
const SERVICE_WINNER: EndingOption = {
  label: "Service winner",
  patch: { ending: "service_winner", errorKind: null },
};

const STROKES: { label: string; value: LastStroke }[] = [
  { label: "Forehand", value: "forehand" },
  { label: "Backhand", value: "backhand" },
  { label: "Volley", value: "volley" },
  { label: "Overhead", value: "overhead" },
];

/**
 * One point's fix, opened under its row in Fix points mode (Advantage Review
 * canvas, "Self review"): who won it, how it ended, and the stroke the
 * ending names. Nothing else — not the score, the game structure, the
 * strokes of the rally or their spin (Self-review and Verified canvas, "F2 ·
 * What each role can change").
 *
 * Choosing Ace or Double fault gives the point to the right side by itself
 * (`normalizeReading`), as the database requires. Done keeps the fix as a
 * draft; nothing is written until Save. "Undo fix" drops an unsaved draft;
 * "Reset" puts a saved fix back to Advantage Intelligence's reading.
 */
export function FixPointForm({
  point,
  youSide,
  youName,
  oppName,
  labelFor,
}: {
  point: MatchPoint;
  youSide: Side;
  youName: string;
  oppName: string;
  /** The row's own title for a reading ("Backhand unforced error"). */
  labelFor: (reading: PointReading) => string;
}) {
  const review = useSelfReview();
  const server: Side = point.serverIsPlayer1 ? "p1" : "p2";
  const original = review.originalFor(point);
  const hasDraft = review.drafts.has(point.id);
  const savedEdit = review.editOf(point.id);
  const [draft, setDraft] = useState<PointReading>(() =>
    review.readingFor(point),
  );
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    rootRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, []);

  const oppSide: Side = youSide === "p1" ? "p2" : "p1";
  const winners: { label: string; value: Side }[] = [
    { label: youName, value: youSide },
    { label: oppName, value: oppSide },
  ];
  const endings =
    draft.ending === "service_winner" || original.ending === "service_winner"
      ? [...ENDINGS, SERVICE_WINNER]
      : ENDINGS;
  const needsStroke = draft.ending === "winner" || draft.ending === "error";
  const flips = draft.winner !== original.winner;
  const close = () => review.setOpenPointId(null);

  function pick(next: Partial<PointReading>) {
    setDraft((current) => normalizeReading({ ...current, ...next }, server));
  }

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={`Fix point ${point.pointNumber}`}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
      className="mx-2 mt-1 mb-2.5 flex flex-col gap-2.5 rounded-[var(--radius-element)] border border-[var(--border-field)] bg-[var(--surface-card)] p-3"
    >
      <span className="text-[11px] text-[var(--ink-600)]">
        What happened on point {point.pointNumber}?
      </span>

      <Choices label="Who won it">
        {winners.map((option) => (
          <button
            key={option.value}
            type="button"
            className={OPTION}
            aria-pressed={draft.winner === option.value}
            onClick={() => pick({ winner: option.value })}
          >
            {option.label}
          </button>
        ))}
      </Choices>

      <Choices label="How it ended">
        {endings.map((option) => (
          <button
            key={option.label}
            type="button"
            className={OPTION}
            aria-pressed={
              draft.ending === option.patch.ending &&
              (draft.ending !== "error" ||
                draft.errorKind === option.patch.errorKind)
            }
            onClick={() => pick(option.patch)}
          >
            {option.label}
          </button>
        ))}
      </Choices>

      {needsStroke ? (
        <Choices label="Last shot">
          {STROKES.map((option) => (
            <button
              key={option.value}
              type="button"
              className={OPTION}
              aria-pressed={draft.lastStroke === option.value}
              onClick={() => pick({ lastStroke: option.value })}
            >
              {option.label}
            </button>
          ))}
        </Choices>
      ) : null}

      {flips ? (
        <p className="m-0 text-[11px] leading-[1.5] text-[var(--ink-700)]">
          <span className="font-medium text-[var(--ink-900)]">
            This changes who won the point.
          </span>{" "}
          The games may no longer add up to the match score, so check the score
          after you save.
        </p>
      ) : null}

      <div className="flex items-center gap-1.5 border-t border-[var(--border-hairline)] pt-2">
        <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--ink-500)]">
          {draft.ending ? labelFor(draft) : "Choose how it ended"}
        </span>
        {hasDraft ? (
          <button
            type="button"
            className={cn(QUIET, "h-[26px]")}
            onClick={() => {
              review.setDraft(point, null);
              close();
            }}
          >
            Undo fix
          </button>
        ) : savedEdit ? (
          <button
            type="button"
            className={cn(QUIET, "h-[26px]")}
            onClick={() => {
              review.setDraft(point, original);
              close();
            }}
          >
            Reset
          </button>
        ) : null}
        <button
          type="button"
          className={advButton("primary", "sm")}
          disabled={!draft.ending}
          onClick={() => {
            review.setDraft(
              point,
              sameReading(draft, review.readingFor(point)) && !hasDraft
                ? null
                : draft,
            );
            close();
          }}
        >
          Done
        </button>
      </div>
    </div>
  );
}

function Choices({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] text-[var(--ink-700)]">{label}</span>
      <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
        {children}
      </div>
    </div>
  );
}
