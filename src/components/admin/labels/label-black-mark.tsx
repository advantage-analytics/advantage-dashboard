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
  rollupMarks,
  stateHoverParts,
  type MarkHoverParts,
  type MarkState,
} from "@/lib/services/labels/marks-state";
import type { LabelPoint } from "@/lib/services/labels/session";
import { cn } from "@/lib/utils";
import { pointSentence } from "./label-black-format";
import type { SideNames } from "./label-format";
import { railInk } from "./label-rail-tone";

/**
 * The marks of the black rail (board 08m): what the derivation questioned on
 * a point, drawn beside the row it came from — in two voices, by the mark's
 * tier (`LabelMarkTier`, marks.ts).
 *
 * A mark that can change the score is the amber chip on the point's row
 * (`MarkChip`, the frame's `.bk-flag`), and the only thing the rail header
 * counts. A mark about how the point ended is a word on ONE quiet grey line
 * in the open point (`PointHintLine`): no chip, no count, nothing on a
 * closed row. A stroke row draws no mark of its own, and what the site did
 * by itself has no chip anywhere — the strokes it removed are still the
 * well's struck-through rows (`BlackGhostShot`).
 *
 * `MarkChip`, `PointHintLine` and `PencilMark` only DRAW. `pointRowMarks`
 * and `pointHints` turn a row and the session's `LabelMarks` into what to
 * draw; every word, state and hover line in them is `marks-copy.ts`'s and
 * `marks-state.ts`'s.
 *
 * Colours are the rail's (`label-rail-tone.ts`): its amber on its amber wash
 * for a mark still open, one quiet outline once it is answered, and the
 * rail's ink at an alpha for the line — white on black, the page's ink on
 * the light ground.
 */

/** What `MarkChip` draws. */
export interface MarkChipProps {
  /** The chip's words; null for the icon-only short form. */
  text: string | null;
  /** How many marks it stands for. */
  count: number;
  state: MarkState;
  /**
   * The chip's accessible name: the tooltip's two lines as one, "name.
   * sentence" — a Radix tooltip renders nothing until it opens.
   */
  hover: string;
  /**
   * The tooltip's first line: the mark's short name ("Check the ending"),
   * with its state once it has one ("Check the ending · settled"), or what a
   * chip standing for several says ("3 to check").
   */
  name: string;
  /**
   * The tooltip's second line: the sentence that explains the name. Several
   * marks are a line each, "name — sentence". Absent when the name says it
   * all (a dismissed question).
   */
  detail?: string | readonly string[];
}

/**
 * One chip — the frame's 18px pill. Amber while a mark it stands for is
 * open; a quiet outline, and no words, once none is.
 *
 * Its words are the first thing to give when the rail narrows: under a 600px
 * row (the nearest `@container`, which each black row is) they are not drawn
 * and the chip is its icon, so the point's own two lines keep their room and
 * the score never moves. The hover says everything either way, in the dark
 * tooltip's two lines — the mark's name, then the sentence under it.
 *
 * Not a tab stop: the rail's rows already are, and a chip per row would
 * double them. A click on it is a click on its row.
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
 * The open point's quiet line: its hints by their labels, a middle dot
 * between them — "Close to the line · Serve fault?" — each with its sentence
 * on hover, in the dark tooltip the chips use.
 *
 * It is not a control: nothing to click, nothing to dismiss, no tab stop,
 * and it is counted nowhere. A point with no hints draws nothing at all.
 * It is drawn as the FIRST row of the shots well (`BlackShotsWell`), on the
 * line a ghost or a tombstone takes and indented to the times, so it reads
 * as the point's and the strokes under it keep their tracks; it takes the
 * well's own arrival (`className` / `style`, the row's `film-shot-row-in`),
 * so it comes in with the rally rather than by itself.
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
 * The blue "Changed by you" pencil — the frame's `.fx-pen`.
 *
 * With `reset`, it is the row's Reset as well: a button the size of the
 * glyph, named for what it does ("Reset shot 3"), its hover saying both
 * things — "Changed by you" over "Click to reset". It only ASKS — the
 * console opens the confirm — and a click on it is not a click on its row.
 * Without `reset` (an added row, a row with no seed, a session that cannot
 * be written) it is the plain indicator, and has no tooltip: the dark
 * tooltip names a control, and this is not one (its accessible name still
 * says "Changed by you"). Either way it is 11px wide: the marks slot that
 * holds it never grows.
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

/** The point row's tail: at most one chip, and the pencil. */
export interface PointRowMarks {
  flag: MarkChipProps | null;
  pencil: boolean;
}

/** What a chip's hover says: its accessible name and the tooltip's lines. */
type ChipHover = Pick<MarkChipProps, "hover" | "name" | "detail">;

/**
 * The hover of a chip standing for `parts`, each said once. One mark is its
 * own name over its own sentence. Several are named by `many` — what the
 * chip itself says, "3 to check" — over a line each, "name — sentence".
 */
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
 * What the point row draws of its marks — `rollupMarks` over the point's
 * `count` marks (`pointRowMarkList`, marks-state.ts) — or null when the
 * session has no marks at all, which is the row exactly as it was before
 * them. Hints are not here: a closed row shows none (`pointHints`).
 *
 * `point` is the row as stored, ghosts and all: the life-cycle reads every
 * stroke's status. `sentence` is the point as the row READS it
 * (`pointSentence` over the point without its ghosts while they are drawn
 * as ghosts), for the settled hover line; by default the point's own.
 * `points` — the rail's rows — lets a "Same side twice" question read
 * settled once a point was added between the two (board 08m §5), with the
 * hover saying so.
 *
 * A chip standing for several marks hovers every line it stands for: the
 * open ones while any is open, every one once none is.
 */
export function pointRowMarks(
  point: LabelPoint,
  marks: LabelMarks | null | undefined,
  names: SideNames,
  sentence: string = pointSentence(point, names),
  points?: readonly LabelPoint[],
): PointRowMarks | null {
  if (!marks) return null;
  const { count } = pointRowMarkList(point, marks);
  const states = markStates(count, point, marks.suggestions, points);
  const pointAdded = missingPointAdded(point, marks.suggestions, points);
  const rollup = rollupMarks(count, states);
  if (!rollup.flag) return { flag: null, pencil: rollup.pencil };

  const members = count.map((mark, i) => ({ mark, state: states.marks[i] }));
  const open = members.filter((m) => m.state === "open");
  return {
    flag: {
      ...rollup.flag,
      ...chipHover(
        (open.length > 0 ? open : members).map((m) =>
          stateHoverParts(m.mark, m.state, names, sentence, pointAdded),
        ),
        // Several still open are the chip's own words, "3 to check".
        rollup.flag.text ?? "Nothing left to check",
      ),
    },
    pencil: rollup.pencil,
  };
}

/**
 * The open point's hints, for `PointHintLine` — `pointRowMarkList`'s `hints`
 * in their words. Empty when the session has no marks, and for a point that
 * has none: the line is then not drawn.
 */
export function pointHints(
  point: LabelPoint,
  marks: LabelMarks | null | undefined,
  names: SideNames,
): PointHint[] {
  if (!marks) return [];
  return pointRowMarkList(point, marks).hints.map((mark) => ({
    code: mark.code,
    label: MARK_LABEL[mark.code],
    detail: markHover(mark, names),
  }));
}
