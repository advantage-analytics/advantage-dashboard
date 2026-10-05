"use client";

import { Flag, Pencil, WandSparkles } from "lucide-react";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import type {
  LabelMark,
  LabelMarkKind,
  LabelMarks,
} from "@/lib/services/labels/marks";
import {
  hoverLine,
  markState,
  markStates,
  missingPointAdded,
  mostOpen,
  rollupMarks,
  stateHoverParts,
  type MarkHoverParts,
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
  /**
   * The chip's accessible name: the tooltip's two lines as one, "name.
   * sentence" — a Radix tooltip renders nothing until it opens.
   */
  hover: string;
  /**
   * The tooltip's first line: the mark's short name ("Out call ignored"),
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
  /**
   * A stroke row's chip: its result track is 36px at the rail's narrowest
   * and grows only past 640, so the pill gives up its words and its side
   * padding for good and is an 18px disc — the icon, or the count when it
   * stands for more than one mark (`collapseShotMarks`). The hover says the
   * rest.
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
 * the score never moves. The hover says everything either way, in the dark
 * tooltip's two lines — the mark's name, then the sentence under it.
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
  name,
  detail,
  compact = false,
}: MarkChipProps) {
  const quiet = isQuiet(kind, state);
  const words = quiet ? null : text;
  const Icon = kind === "flag" ? Flag : WandSparkles;
  // A disc standing for several marks has room for the count or the icon,
  // not both; the count says more.
  const counted = compact && count > 1;
  return (
    <ChromeTooltip
      label={name}
      detail={detail}
      side="top"
      wrap={detail !== undefined}
    >
      <span
        role="img"
        data-mark-kind={kind}
        data-mark-state={state}
        data-mark-count={counted ? count : undefined}
        aria-label={hover}
        className={cn(
          "inline-flex h-[18px] shrink-0 items-center gap-[5px] rounded-full text-[10px] font-medium whitespace-nowrap",
          quiet
            ? "bg-transparent text-[rgba(255,255,255,0.38)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]"
            : kind === "flag"
              ? "bg-[rgba(253,230,138,0.14)] text-[rgba(252,211,77,1)]"
              : "bg-white/10 text-[rgba(255,255,255,0.78)]",
          compact
            ? "w-[18px] justify-center px-0"
            : words
              ? "px-1.5 @min-[600px]:px-[7px]"
              : "px-1.5",
        )}
      >
        {counted ? (
          <b className="font-medium tabular-nums">{count}</b>
        ) : (
          <Icon
            className={kind === "flag" ? "size-2.5" : "size-[11px]"}
            strokeWidth={1.8}
            aria-hidden="true"
          />
        )}
        {words ? (
          <span data-mark-text="" className="hidden @min-[600px]:inline">
            {words}
          </span>
        ) : null}
        {!compact && !quiet && text === null && count > 1 ? (
          <b className="font-medium tabular-nums">{count}</b>
        ) : null}
      </span>
    </ChromeTooltip>
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
        className="inline-flex shrink-0 cursor-pointer items-center rounded-[var(--radius-button)] transition-colors duration-200 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none hover:[&>svg]:text-[var(--blue-hover)]"
      >
        {glyph}
      </button>
    </ChromeTooltip>
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
 * hover line; by default the point's own. `points` — the rail's rows — lets
 * a "Same side twice" question read settled once a point was added between
 * the two (board 08m §5), with the hover saying so.
 *
 * A chip standing for several marks hovers every line it stands for: the
 * open ones while any flag is open, every flag once none is, every fix.
 */
export function pointRowMarks(
  point: LabelPoint,
  marks: LabelMarks | null | undefined,
  names: SideNames,
  sentence: string = pointSentence(point, names),
  points?: readonly LabelPoint[],
): PointRowMarks | null {
  if (!marks) return null;
  const pointMarks = liveGhostFixes(point, marks.points[point.id] ?? []);
  const shotMarks = point.shots
    // A deleted stroke's row is a tombstone and carries no chip, so its
    // marks are not counted toward what "open the point" would show.
    .filter((shot) => shot.status !== "deleted")
    .flatMap((shot) => marks.shots[shot.id] ?? [])
    .filter((mark) => mark.code !== SHOT_ONLY_CODE);
  const states = markStates(
    pointMarks,
    shotMarks,
    point,
    marks.suggestions,
    points,
  );
  const pointAdded = missingPointAdded(point, marks.suggestions, points);
  const rollup = rollupMarks(pointMarks, shotMarks, states);

  const all = [
    ...pointMarks.map((mark, i) => ({ mark, state: states.point[i] })),
    ...shotMarks.map((mark, i) => ({ mark, state: states.shots[i] })),
  ];
  const hoverOf = (kind: LabelMarkKind, many: string): ChipHover => {
    const members = all.filter((m) => m.mark.kind === kind);
    const open = members.filter((m) => m.state === "open");
    return chipHover(
      (open.length > 0 ? open : members).map((m) =>
        stateHoverParts(m.mark, m.state, names, sentence, pointAdded),
      ),
      many,
    );
  };

  return {
    flag: rollup.flag
      ? {
          kind: "flag",
          ...rollup.flag,
          // Several still open are the chip's own words, "3 to check".
          ...hoverOf("flag", rollup.flag.text ?? "Nothing left to check"),
        }
      : null,
    fix: rollup.fix
      ? {
          kind: "fix",
          ...rollup.fix,
          ...hoverOf("fix", `${rollup.fix.count} fixes`),
        }
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
      ...chipHover([stateHoverParts(mark, state, names, sentence)], ""),
      compact: true,
    };
  });
}

/**
 * What the stroke row draws of its marks: ONE 18px disc, or nothing. Its
 * result track is 36px at the rail's narrowest and no wider until the rail
 * passes 640, so the row never has room for a chip per mark — one mark is
 * its icon, several are their count, and the hover reads every line. The
 * disc is as loud as its loudest member: a flag if any is one, in the most
 * open state among them.
 */
export function collapseShotMarks(
  marks: readonly ShotRowMark[],
): ShotRowMark | null {
  if (marks.length === 0) return null;
  if (marks.length === 1) return marks[0];
  const flag = marks.find((m) => m.kind === "flag");
  const kind: LabelMarkKind = flag ? "flag" : "fix";
  const same = marks.filter((m) => m.kind === kind);
  return {
    code: (flag ?? marks[0]).code,
    kind,
    text: null,
    count: marks.length,
    state: mostOpen(same.map((m) => m.state)),
    ...chipHover(
      marks.map((m) => ({
        name: m.name,
        detail: typeof m.detail === "string" ? m.detail : null,
      })),
      `${marks.length} marks`,
    ),
    compact: true,
  };
}
