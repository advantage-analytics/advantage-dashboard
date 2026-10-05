"use client";

import { Flag, Pencil, WandSparkles } from "lucide-react";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import type {
  LabelMark,
  LabelMarkKind,
  LabelMarks,
} from "@/lib/services/labels/marks";
import {
  markState,
  markStates,
  rollupMarks,
  stateHover,
  type MarkState,
} from "@/lib/services/labels/marks-state";
import {
  isGhostShot,
  type LabelPoint,
  type LabelShot,
} from "@/lib/services/labels/session";
import { cn } from "@/lib/utils";
import { pointSentence } from "./label-black-format";
import type { SideNames } from "./label-format";

/**
 * The marks of the black rail (board 08m): what the derivation flagged or
 * fixed on a point, drawn beside the row it came from.
 *
 * Two things live here. `MarkChip` and `PencilMark` only DRAW — the frame's
 * `.bk-flag`, `.fx-auto`, `.fx-io`, `.fx-res` and `.fx-pen`. `pointRowMarks`
 * and `shotRowMarks` turn a row and the session's `LabelMarks` into the chips
 * to draw; every word, state and hover line in them is T35's
 * (`marks-copy.ts`, `marks-state.ts`).
 *
 * Colours are the frame's, written as rgba because its amber and its blue
 * are not palette hexes: amber on an amber wash for a flag still open, white
 * on a white wash for a fix, and one quiet outline once either is answered.
 */

/** What `MarkChip` draws. */
export interface MarkChipProps {
  kind: LabelMarkKind;
  /** The chip's words; null for the icon-only short form. */
  text: string | null;
  /** How many marks it stands for — drawn only without words, past one. */
  count: number;
  state: MarkState;
  /** The hover line: the tooltip's text and the chip's accessible name. */
  hover: string;
  /**
   * A stroke row's chip: its result track is 28px at the rail's narrowest,
   * so there the pill gives up its side padding and is an 18px disc.
   */
  compact?: boolean;
}

/**
 * A flag is quiet once it is no longer open; a fix — which the site already
 * acted on, so is `settled` by nature — once its point is checked.
 */
function isQuiet(kind: LabelMarkKind, state: MarkState): boolean {
  return kind === "flag" ? state !== "open" : state !== "settled";
}

/**
 * One mark — the frame's 18px pill.
 *
 * Its words are the first thing to give when the rail narrows: under a 600px
 * row (the nearest `@container`, which each black row is) they are not drawn
 * and the chip is its icon, so the point's own two lines keep their room and
 * the score never moves. The hover line says everything either way, and is
 * the accessible name — a Radix tooltip renders nothing until it opens.
 *
 * Not a tab stop: the rail's rows already are, and a chip per row would
 * double them. A click on it is a click on its row.
 */
export function MarkChip({
  kind,
  text,
  count,
  state,
  hover,
  compact = false,
}: MarkChipProps) {
  const quiet = isQuiet(kind, state);
  const words = quiet ? null : text;
  const Icon = kind === "flag" ? Flag : WandSparkles;
  return (
    <ChromeTooltip label={hover} side="top" wrap>
      <span
        role="img"
        data-mark-kind={kind}
        data-mark-state={state}
        aria-label={hover}
        className={cn(
          "inline-flex h-[18px] shrink-0 items-center gap-[5px] rounded-full text-[10px] font-medium whitespace-nowrap",
          quiet
            ? "bg-transparent text-[rgba(255,255,255,0.38)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]"
            : kind === "flag"
              ? "bg-[rgba(253,230,138,0.14)] text-[rgba(252,211,77,1)]"
              : "bg-white/10 text-[rgba(255,255,255,0.78)]",
          compact
            ? "w-[18px] justify-center px-0 @min-[600px]:w-auto @min-[600px]:px-1.5"
            : words
              ? "px-1.5 @min-[600px]:px-[7px]"
              : "px-1.5",
        )}
      >
        <Icon
          className={kind === "flag" ? "size-2.5" : "size-[11px]"}
          strokeWidth={1.8}
          aria-hidden="true"
        />
        {words ? (
          <span data-mark-text="" className="hidden @min-[600px]:inline">
            {words}
          </span>
        ) : null}
        {!quiet && text === null && count > 1 ? (
          <b className="font-medium tabular-nums">{count}</b>
        ) : null}
      </span>
    </ChromeTooltip>
  );
}

/** The blue "Changed by you" pencil — the frame's `.fx-pen`. */
export function PencilMark() {
  return (
    <span role="img" aria-label="Changed by you" className="inline-flex">
      <Pencil
        className="size-[11px] text-[var(--blue)]"
        strokeWidth={2}
        aria-hidden="true"
      />
    </span>
  );
}

// ── What a row shows ───────────────────────────────────────────────────────

/** The point row's tail: at most one flag chip, one fix chip and the pencil. */
export interface PointRowMarks {
  flag: MarkChipProps | null;
  fix: MarkChipProps | null;
  pencil: boolean;
}

/**
 * "Out call ignored" is the vendor file's commonest defect — on up to a
 * third of all strokes — so it is shown on its shot only and never raised to
 * the point row (board 08m).
 */
const SHOT_ONLY_CODE = "out_ball_rally_continued";

/** The lines of several marks as one hover, each said once. */
function joinHovers(lines: readonly string[]): string {
  return [...new Set(lines)].join(" ");
}

/**
 * "1 shot removed" stands for the point's ghosts — the strokes the site
 * removed that are still out of the rally (`isGhostShot`). Restore puts one
 * back and the chip must follow: it counts the ghosts still live, and goes
 * when none is (board 08m §3: "Restore … drops the grey mark from the
 * point"). The mark's `eventIds` are narrowed to the live ghosts' vendor ids
 * where they line up, so "2 shots removed" reads "1 shot removed" after one
 * Restore; where they do not, the mark keeps its own count.
 */
function liveGhostFixes(
  point: Pick<LabelPoint, "shots">,
  pointMarks: readonly LabelMark[],
): LabelMark[] {
  const ghosts = point.shots.filter(isGhostShot);
  return pointMarks.flatMap((mark): LabelMark[] => {
    if (mark.code !== "phantom_strokes_dropped") return [mark];
    if (ghosts.length === 0) return [];
    const live = new Set(ghosts.map((shot) => shot.eventId));
    const eventIds = mark.params.eventIds.filter((id) => live.has(id));
    if (eventIds.length === 0) return [mark];
    const narrowed: LabelMark = {
      ...mark,
      params: { ...mark.params, eventIds },
    };
    return [narrowed];
  });
}

/**
 * What the point row draws of its marks — `rollupMarks` over the point's own
 * marks and those of its live strokes — or null when the session has no
 * marks at all, which is the row exactly as it was before them.
 *
 * `point` is the row as stored, ghosts and all: the life-cycle reads every
 * stroke's status, and the removed-shot fix counts the ghosts still live.
 * `sentence` is the point as the row READS it (`pointSentence` over the
 * point without its ghosts while they are drawn as ghosts), for the settled
 * hover line; by default the point's own.
 *
 * A chip standing for several marks hovers every line it stands for: the
 * open ones while any flag is open, every flag once none is, every fix.
 */
export function pointRowMarks(
  point: LabelPoint,
  marks: LabelMarks | null | undefined,
  names: SideNames,
  sentence: string = pointSentence(point, names),
): PointRowMarks | null {
  if (!marks) return null;
  const pointMarks = liveGhostFixes(point, marks.points[point.id] ?? []);
  const shotMarks = point.shots
    // A deleted stroke's row is a tombstone and carries no chip, so its
    // marks are not counted toward what "open the point" would show.
    .filter((shot) => shot.status !== "deleted")
    .flatMap((shot) => marks.shots[shot.id] ?? [])
    .filter((mark) => mark.code !== SHOT_ONLY_CODE);
  const states = markStates(pointMarks, shotMarks, point, marks.suggestions);
  const rollup = rollupMarks(pointMarks, shotMarks, states);

  const all = [
    ...pointMarks.map((mark, i) => ({ mark, state: states.point[i] })),
    ...shotMarks.map((mark, i) => ({ mark, state: states.shots[i] })),
  ];
  const hoverOf = (kind: LabelMarkKind): string => {
    const members = all.filter((m) => m.mark.kind === kind);
    const open = members.filter((m) => m.state === "open");
    return joinHovers(
      (open.length > 0 ? open : members).map((m) =>
        stateHover(m.mark, m.state, names, sentence),
      ),
    );
  };

  return {
    flag: rollup.flag
      ? { kind: "flag", ...rollup.flag, hover: hoverOf("flag") }
      : null,
    fix: rollup.fix
      ? { kind: "fix", ...rollup.fix, hover: hoverOf("fix") }
      : null,
    pencil: rollup.pencil,
  };
}

/** One of a stroke row's chips, keyed by the mark it draws. */
export type ShotRowMark = MarkChipProps & { code: LabelMark["code"] };

/**
 * A stroke's own marks, one icon-only chip each, in the derivation's order.
 * Empty when the session has no marks.
 */
export function shotRowMarks(
  point: LabelPoint,
  shot: LabelShot,
  marks: LabelMarks | null | undefined,
  names: SideNames,
): ShotRowMark[] {
  const own = marks?.shots[shot.id];
  if (!marks || !own || own.length === 0) return [];
  const sentence = pointSentence(point, names);
  return own.map((mark) => {
    const state = markState(mark, point, shot, marks.suggestions);
    return {
      code: mark.code,
      kind: mark.kind,
      text: null,
      count: 1,
      state,
      hover: stateHover(mark, state, names, sentence),
      compact: true,
    };
  });
}
