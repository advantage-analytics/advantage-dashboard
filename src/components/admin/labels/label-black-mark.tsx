"use client";

import { Flag, Pencil } from "lucide-react";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import type { LabelMarkCode, LabelMarks } from "@/lib/services/labels/marks";
import { MARK_LABEL, markHover } from "@/lib/services/labels/marks-copy";
import {
  hoverLine,
  markStates,
  missingPointAdded,
  pointRowMarkList,
  shotAfterPointEnd,
  rollupMarks,
  stateHoverParts,
  type MarkHoverParts,
  type MarkState,
} from "@/lib/services/labels/marks-state";
import type { LabelPoint } from "@/lib/services/labels/session";
import { cn } from "@/lib/utils";
import type { SideNames } from "./label-format";
import { railInk } from "./label-rail-tone";

/**
 * The rail's marks, drawn by tier (`LabelMarkTier`, marks.ts): a mark that can
 * change the score is the amber chip on the point's row (`MarkChip`), the only
 * thing the header counts; a mark about how the point ended is a word on one
 * quiet line in the open point (`PointHintLine`). These components only draw:
 * `pointRowMarks` and `pointHints` decide what, with words and states from
 * marks-copy.ts and marks-state.ts.
 */

export interface MarkChipProps {
  /** The chip's words; null for the icon-only short form. */
  text: string | null;
  count: number;
  state: MarkState;
  /** The accessible name: a Radix tooltip renders nothing until it opens. */
  hover: string;
  /** The tooltip's first line: the mark's name and state, or "3 to check". */
  name: string;
  /** The tooltip's second line; a line each for several marks. */
  detail?: string | readonly string[];
}

/**
 * One chip. Amber while a mark it stands for is open; a quiet outline, and no
 * words, once none is. Under a 600px row (the nearest `@container`) the words
 * are not drawn and the chip is its icon, so the point's two lines keep their
 * room. Not a tab stop: a click on it is a click on its row.
 */
export function MarkChip({
  text,
  count,
  state,
  hover,
  name,
  detail,
}: MarkChipProps) {
  const quiet = state !== "open";
  const words = quiet ? null : text;
  return (
    <ChromeTooltip
      label={name}
      detail={detail}
      side="top"
      wrap={detail !== undefined}
    >
      <span
        role="img"
        data-mark-chip=""
        data-mark-state={state}
        data-mark-count={count}
        aria-label={hover}
        className={cn(
          "inline-flex h-[18px] shrink-0 items-center gap-[5px] rounded-full px-1.5 text-[10px] font-medium whitespace-nowrap",
          quiet
            ? "bg-transparent text-white/[0.38] shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--color-white)_14%,transparent)]"
            : "bg-[var(--rail-amber-wash)] text-[var(--rail-amber)]",
          words && "@min-[600px]:px-[7px]",
        )}
      >
        <Flag className="size-2.5" strokeWidth={1.8} aria-hidden="true" />
        {words ? (
          <span data-mark-text="" className="hidden @min-[600px]:inline">
            {words}
          </span>
        ) : null}
      </span>
    </ChromeTooltip>
  );
}

/** One word of the open point's quiet line: a hint's label and its sentence. */
export interface PointHint {
  code: LabelMarkCode;
  /** The hint's words — its `MARK_LABEL`. */
  label: string;
  /** Its hover sentence — `markHover`, with the players' names. */
  detail: string;
}

/** The line's ink — the well's quiet ink, a tombstone's and a ghost line's. */
const HINT_INK = railInk(0.45);
/** The dot between two hints: a step quieter than the words it separates. */
const HINT_DOT_INK = railInk(0.25);

/**
 * The open point's quiet line: its hints by their labels, each with its
 * sentence on hover. Not a control and counted nowhere. Drawn as the first row
 * of the shots well, it takes the well's own arrival (`className` / `style`).
 */
export function PointHintLine({
  hints,
  className,
  style,
}: {
  hints: readonly PointHint[];
  className?: string;
  style?: React.CSSProperties;
}) {
  if (hints.length === 0) return null;
  return (
    <div
      data-point-hints=""
      className={cn(
        "flex h-[26px] shrink-0 items-center gap-[6px] overflow-hidden pr-[14px] pl-[44px] text-[11px] whitespace-nowrap",
        className,
      )}
      style={{ color: HINT_INK, ...style }}
    >
      {hints.map((hint, index) => (
        <span key={hint.code} className="contents">
          {index > 0 ? (
            <span aria-hidden="true" style={{ color: HINT_DOT_INK }}>
              ·
            </span>
          ) : null}
          <ChromeTooltip
            label={hint.label}
            detail={hint.detail}
            side="top"
            wrap
          >
            <span
              role="img"
              data-point-hint={hint.code}
              aria-label={hoverLine({ name: hint.label, detail: hint.detail })}
              className="min-w-0 truncate"
            >
              {hint.label}
            </span>
          </ChromeTooltip>
        </span>
      ))}
    </div>
  );
}

/**
 * The blue "Changed by you" pencil. With `reset` it is the row's Reset as well:
 * a button the size of the glyph that only asks (the console opens the
 * confirm); a click on it is not a click on its row. Without `reset` it is the
 * plain indicator, with no tooltip. Either way it is 11px wide.
 */
export function PencilMark({
  reset,
}: {
  reset?: { label: string; onClick: () => void };
} = {}) {
  const glyph = (
    <Pencil
      className="size-[11px] text-[var(--blue)]"
      strokeWidth={2}
      aria-hidden="true"
    />
  );
  if (!reset) {
    return (
      <span
        role="img"
        data-pencil=""
        aria-label="Changed by you"
        className="inline-flex"
      >
        {glyph}
      </span>
    );
  }
  return (
    <ChromeTooltip label="Changed by you" detail="Click to reset" side="top">
      <button
        type="button"
        data-pencil=""
        data-reset-pencil=""
        data-cell=""
        aria-label={reset.label}
        onClick={(event) => {
          event.stopPropagation();
          reset.onClick();
        }}
        className="inline-flex shrink-0 cursor-pointer items-center rounded-[var(--radius-button)] transition-[color,background-color,scale] duration-200 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none active:scale-[0.96] active:duration-100 motion-reduce:active:scale-100 [&>svg]:transition-colors [&>svg]:duration-200 hover:[&>svg]:text-[var(--blue-hover)]"
      >
        {glyph}
      </button>
    </ChromeTooltip>
  );
}

// ── What a row shows ───────────────────────────────────────────────────────

export interface PointRowMarks {
  flag: MarkChipProps | null;
}

/** What a chip's hover says: its accessible name and the tooltip's lines. */
type ChipHover = Pick<MarkChipProps, "hover" | "name" | "detail">;

/** A chip's hover: one mark's own lines, or `many` over a line each. */
function chipHover(parts: readonly MarkHoverParts[], many: string): ChipHover {
  const said = new Set<string>();
  const unique = parts.filter((part) => {
    const line = hoverLine(part);
    if (said.has(line)) return false;
    said.add(line);
    return true;
  });
  if (unique.length === 1) {
    const [only] = unique;
    return {
      hover: hoverLine(only),
      name: only.name,
      detail: only.detail ?? undefined,
    };
  }
  return {
    hover: `${many}. ${unique.map(hoverLine).join(" ")}`,
    name: many,
    detail: unique.map((part) =>
      part.detail ? `${part.name} — ${part.detail}` : part.name,
    ),
  };
}

/**
 * What the point row draws of its marks: `rollupMarks` over the point's `count`
 * marks (`pointRowMarkList`), or null when the session has no marks. `point` is
 * the row as stored, ghosts and all; `sentence` is the point as the row reads
 * it; `points` lets a "Same side twice" question read settled once a point was
 * added between the two.
 */
export function pointRowMarks(
  point: LabelPoint,
  marks: LabelMarks | null | undefined,
  names: SideNames,
  sentence: string,
  points: readonly LabelPoint[],
): PointRowMarks | null {
  if (!marks) return null;
  const { count } = pointRowMarkList(point, marks);
  const states = markStates(count, point, marks.suggestions, points);
  const pointAdded = missingPointAdded(point, marks.suggestions, points);
  const chip = rollupMarks(count, states);
  if (!chip) return { flag: null };

  const members = count.map((mark, i) => ({ mark, state: states[i] }));
  const open = members.filter((m) => m.state === "open");
  return {
    flag: {
      ...chip,
      ...chipHover(
        (open.length > 0 ? open : members).map((m) =>
          stateHoverParts(m.mark, m.state, names, sentence, pointAdded),
        ),
        // Several still open are the chip's own words, "3 to check".
        chip.text ?? "Nothing left to check",
      ),
    },
  };
}

/** The open point's hints, the one read off the rows last. */
export function pointHints(
  point: LabelPoint,
  marks: LabelMarks | null | undefined,
  names: SideNames,
): PointHint[] {
  if (!marks) return [];
  const after = shotAfterPointEnd(point);
  const hints = pointRowMarkList(point, marks).hints;
  return (after ? [...hints, after] : hints).map((mark) => ({
    code: mark.code,
    label: MARK_LABEL[mark.code],
    detail: markHover(mark, names),
  }));
}
