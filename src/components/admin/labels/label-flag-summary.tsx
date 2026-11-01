"use client";

import { useRef, useState, type ReactNode } from "react";
import { ChevronDown, Flag, Scale } from "lucide-react";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import {
  FloatMenu,
  FloatMenuDivider,
  FloatMenuItem,
  FloatMenuLabel,
  FloatMenuNote,
} from "@/components/ui/float-menu";
import { Kbd } from "@/components/ui/kbd";
import {
  flagGroups,
  flagStopLabel,
  stepFlag,
  type FlagList,
  type FlagRow,
  type FlagStop,
  type OpenFlag,
  type ScoreStop,
} from "@/lib/services/labels/flag-nav";
import { dataFlagsLabel, toCheckLabel } from "@/lib/services/labels/marks-copy";
import type { LabelPoint } from "@/lib/services/labels/session";
import { cn } from "@/lib/utils";
import type { RailTone } from "./label-rail-tone";

/** A row of a long item shows this many point numbers, then "+N". */
const POINTS_SHOWN = 4;

/** The ink a hand-built row wears inside the menu, which renders outside the rail. */
const ROW_INK: Record<
  RailTone,
  {
    row: string;
    text: string;
    count: string;
    pt: string;
    next: string;
    warn: string;
    note: string;
  }
> = {
  dark: {
    row: "hover:bg-white/[0.08] has-[button:focus-visible]:bg-white/[0.08]",
    text: "text-white",
    count: "text-white/35",
    pt: "bg-white/[0.06] text-white/70 hover:bg-white/[0.14] hover:text-white",
    next: "bg-[rgba(253,230,138,0.14)] text-[rgb(252,211,77)]",
    warn: "text-[rgb(252,211,77)]",
    note: "bg-white/[0.06] text-white/70",
  },
  light: {
    row: "hover:bg-[var(--surface-subtle)] has-[button:focus-visible]:bg-[var(--surface-subtle)]",
    text: "text-[var(--ink-900)]",
    count: "text-[var(--ink-400)]",
    pt: "bg-[var(--surface-subtle)] text-[var(--ink-500)] hover:text-[var(--ink-900)]",
    next: "bg-[var(--warning-bg)] text-[var(--warning-text)]",
    warn: "text-[var(--warning-text)]",
    note: "bg-[var(--surface-subtle)] text-[var(--ink-500)]",
  },
};

const NO_STOPS: readonly ScoreStop[] = [];

/**
 * The jump keys, as the console binds them. Amber takes `]` and `[`; grey
 * takes the two keys directly under those on the keyboard, so the row a hand
 * is on says which list it is walking.
 */
export const SCORE_KEYS = { next: "]", prev: "[" } as const;
export const DATA_KEYS = { next: "'", prev: ";" } as const;

/**
 * The header's open flags, one per point: today's flag and count of points,
 * now the jump to the next flagged point after `fromPointId` (`]`, and `[`
 * back, are the console's keys for the same), and a quiet chevron that opens
 * every flag in one `FloatMenu`, grouped by the item each point asks. The
 * score mismatch, when there is one, leads the list (`score`) and is a stop
 * of its own (`scoreStop`): its words sit before the count as an amber chip
 * that goes to the set's last point, it counts as one point, and the jumps
 * land on it. It was a 6 px dot by the chevron until 2026-10-10, and a set
 * labelled 5–5 against a 6–4 record went to publish unnoticed.
 */
export function LabelFlagSummary({
  openMarks,
  points,
  fromPointId,
  onGoToPoint,
  score,
  scoreStop = null,
  extraStops = NO_STOPS,
  kind = "score",
  tone = "dark",
  bulk = null,
  notice = null,
}: {
  /** This list's share of `openFlags(points, marks)`: one per flagged point. */
  openMarks: readonly OpenFlag[];
  points: readonly Pick<LabelPoint, "id">[];
  /** Where a jump starts: the current point, else none (the top). */
  fromPointId: string | null;
  /** Told which list the jump came from: see `FlagList`. */
  onGoToPoint?: (pointId: string, list: FlagList) => void;
  /** The score mismatch's rows, given the menu's close; null when it adds up. */
  score: ((close: () => void) => ReactNode) | null;
  /** The mismatch as a stop (`scoreStop`, flag-nav.ts); null when it adds up. */
  scoreStop?: ScoreStop | null;
  /**
   * Further stops read off the rows (the rail's amber slots): the jumps
   * land on each and the jump's tooltip counts them; the total stays the
   * marks and the score.
   */
  extraStops?: readonly ScoreStop[];
  /**
   * Which list this control is for. `score` (the default) is the amber one:
   * the marks that can move the score, the score that does not add up and
   * the questions between rows, stepped with `]` and `[`. `data` is the grey
   * one beside it: wrong data that rarely moves the score, stepped with the
   * two keys under those, `'` and `;`. The caller passes each its own list.
   */
  kind?: FlagList;
  tone?: RailTone;
  /** One action over the whole list ("Add all 12 missing shots"); null: none. */
  bulk?: { label: string; description: string; onSelect: () => void } | null;
  /**
   * Something true of the whole match rather than a point ("Thin tracking"):
   * a quiet chip beside the count, and its sentence at the foot of the list.
   * It answers nothing and goes nowhere, so it is not a stop.
   */
  notice?: { label: string; detail: string } | null;
}) {
  const data = kind === "data";
  const keys = data ? DATA_KEYS : SCORE_KEYS;
  const [open, setOpen] = useState(false);
  const stops: readonly FlagStop[] = [
    ...openMarks,
    ...(scoreStop ? [scoreStop] : []),
    ...extraStops,
  ];
  // The total is the flagged points and the score — "Nothing left to check"
  // means no flag is open. A slot between rows is a place the jumps also
  // stop at; the jump's tooltip says how many there are, so the two numbers
  // never disagree unexplained.
  const count = openMarks.length + (scoreStop ? 1 : 0);
  const slots = extraStops.length;
  const next = stepFlag(stops, points, fromPointId, 1);
  const prev = stepFlag(stops, points, fromPointId, -1);
  const groups = flagGroups(openMarks);
  const ink = ROW_INK[tone];

  // A jump from the list arms the court for the landing point's current
  // review item (the console's `goToFlag`): the closing menu must not then
  // hand focus back to its trigger, which would keep the keys for itself.
  const jumped = useRef(false);
  const go = (pointId: string) => {
    jumped.current = open;
    setOpen(false);
    onGoToPoint?.(pointId, kind);
  };

  const noticeChip = notice ? (
    <ChromeTooltip
      label={notice.label}
      detail={notice.detail}
      side="bottom"
      hidden={open}
    >
      <span
        role="img"
        data-label-flag-notice=""
        aria-label={`${notice.label}: ${notice.detail}`}
        className={cn(
          "mr-1 h-6 min-w-0 truncate rounded-[6px] px-[7px] text-[11px] leading-6 whitespace-nowrap",
          ink.note,
        )}
      >
        {notice.label}
      </span>
    </ChromeTooltip>
  ) : null;

  // No grey flag open: the grey control is not drawn, and a note about the
  // whole match, which is still true, stands alone.
  if (data && count === 0) {
    return noticeChip ? (
      <span data-label-flag-summary="" className="inline-flex min-w-0 shrink">
        {noticeChip}
      </span>
    ) : null;
  }
  // Nothing open and the score adds up: today's quiet total, not a control.
  if (count === 0 && score === null) {
    return (
      <span
        role="img"
        aria-label={toCheckLabel(0)}
        data-label-rail-to-check=""
        className="mono tabular inline-flex shrink-0 items-center gap-1 text-[10px] whitespace-nowrap text-white/45"
      >
        <Flag className="size-2.5" strokeWidth={1.8} aria-hidden="true" />0
      </span>
    );
  }

  const totalLabel = data ? dataFlagsLabel(count) : toCheckLabel(count);
  // One glyph for both, as on the rows: the chip there is the same flag,
  // amber or grey.
  const total = (
    <>
      <Flag className="size-2.5" strokeWidth={1.8} aria-hidden="true" />
      {count}
    </>
  );
  // The attribute a spec, and the console's own probes, find each control by.
  const totalAttr = data
    ? { "data-label-rail-data-count": "" }
    : { "data-label-rail-to-check": "" };
  const lit = data
    ? "text-white/70 hover:bg-white/[0.08] hover:text-white"
    : "text-[var(--rail-amber)] hover:bg-[var(--rail-amber-wash)]";

  return (
    <span
      data-label-flag-summary=""
      className={cn(
        "inline-flex items-center",
        notice ? "min-w-0 shrink" : "shrink-0",
      )}
    >
      {scoreStop ? (
        <ChromeTooltip
          label={scoreStop.label}
          detail={`Point ${scoreStop.pointNumber} · the set's last point`}
          side="bottom"
          hidden={open}
        >
          <button
            type="button"
            data-label-score-stop=""
            aria-label={`Score doesn’t add up: ${scoreStop.label}`}
            disabled={!onGoToPoint}
            onClick={() => go(scoreStop.pointId)}
            className={cn(
              "mr-1 inline-flex h-6 max-w-[240px] cursor-pointer items-center gap-1 rounded-[6px] px-[7px] text-[11px] whitespace-nowrap transition-colors duration-150 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:cursor-default",
              ink.next,
            )}
          >
            <Scale
              className="size-3 shrink-0"
              strokeWidth={1.8}
              aria-hidden="true"
            />
            <span className="truncate">{scoreStop.label}</span>
          </button>
        </ChromeTooltip>
      ) : null}
      {noticeChip}
      {next && onGoToPoint ? (
        <ChromeTooltip
          label={`${data ? "Next data flag" : "Next flag"} · point ${next.pointNumber}`}
          detail={[
            flagStopLabel(next),
            totalLabel,
            ...(slots > 0
              ? [
                  slots === 1
                    ? "and 1 question between rows"
                    : `and ${slots} questions between rows`,
                ]
              : []),
          ]}
          shortcut={keys.next}
          side="bottom"
          hidden={open}
        >
          <button
            type="button"
            {...totalAttr}
            aria-label={totalLabel}
            onClick={() => go(next.pointId)}
            className={cn(
              "mono tabular inline-flex h-6 cursor-pointer items-center gap-1 rounded-l-[6px] px-[5px] text-[10px] whitespace-nowrap transition-colors duration-150 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
              count > 0
                ? lit
                : "text-white/45 hover:bg-white/[0.08] hover:text-white",
            )}
          >
            {total}
          </button>
        </ChromeTooltip>
      ) : (
        <span
          role="img"
          {...totalAttr}
          aria-label={totalLabel}
          className={cn(
            "mono tabular inline-flex h-6 items-center gap-1 px-[5px] text-[10px] whitespace-nowrap",
            count > 0
              ? data
                ? "text-white/70"
                : "text-[var(--rail-amber)]"
              : "text-white/45",
          )}
        >
          {total}
        </span>
      )}
      <FloatMenu
        open={open}
        onOpenChange={setOpen}
        onCloseAutoFocus={(event) => {
          if (!jumped.current) return;
          jumped.current = false;
          event.preventDefault();
        }}
        align="start"
        width={300}
        tone={tone}
        label={data ? "Data flag list" : "Flag list"}
        className="max-h-[480px] overflow-y-auto"
        trigger={
          <button
            type="button"
            data-label-flag-list=""
            data-label-flag-kind={kind}
            data-score-mismatch={score ? "" : undefined}
            aria-label={
              data
                ? "Every open data flag"
                : score
                  ? "Every open flag, and the score that doesn’t add up"
                  : "Every open flag"
            }
            aria-haspopup="menu"
            aria-expanded={open}
            className={cn(
              "relative grid h-6 w-[18px] cursor-pointer place-items-center rounded-r-[6px] text-white/45 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none aria-expanded:bg-white/[0.08] aria-expanded:text-white",
            )}
          >
            <ChevronDown
              className="size-3"
              strokeWidth={1.8}
              aria-hidden="true"
            />
          </button>
        }
      >
        {next && onGoToPoint ? (
          <FloatMenuItem
            label={data ? "Next data flag" : "Next flag"}
            description={`Point ${next.pointNumber} · ${flagStopLabel(next)}`}
            trailing={<MenuKey tone={tone}>{keys.next}</MenuKey>}
            onSelect={() => go(next.pointId)}
          />
        ) : null}
        {prev && onGoToPoint && prev.pointId !== next?.pointId ? (
          <FloatMenuItem
            label={data ? "Previous data flag" : "Previous flag"}
            description={`Point ${prev.pointNumber} · ${flagStopLabel(prev)}`}
            trailing={<MenuKey tone={tone}>{keys.prev}</MenuKey>}
            onSelect={() => go(prev.pointId)}
          />
        ) : null}
        {bulk ? (
          <>
            {next && onGoToPoint ? <FloatMenuDivider /> : null}
            <FloatMenuItem
              label={bulk.label}
              description={bulk.description}
              onSelect={() => {
                setOpen(false);
                bulk.onSelect();
              }}
            />
          </>
        ) : null}
        {score ? (
          <>
            {next && onGoToPoint ? <FloatMenuDivider /> : null}
            <FloatMenuLabel className={ink.warn}>
              Score doesn’t add up
            </FloatMenuLabel>
            {score(() => setOpen(false))}
          </>
        ) : null}
        {groups.length > 0 ? <FloatMenuDivider /> : null}
        {/* One group per review item, its one row the question: a label
            above it would only say the question twice. */}
        {groups.map((group) => (
          <div
            key={group.name}
            role="group"
            aria-label={`${group.name}, ${group.count === 1 ? "1 point" : `${group.count} points`}`}
          >
            {group.rows.map((row) => (
              <FlagKindRow
                key={row.code}
                row={row}
                next={
                  stepFlag(
                    openMarks.filter((f) =>
                      f.items.some((item) => String(item.id) === row.code),
                    ),
                    points,
                    fromPointId,
                    1,
                  )?.pointId ?? null
                }
                tone={tone}
                onGo={onGoToPoint ? go : undefined}
              />
            ))}
          </div>
        ))}
        {groups.length > 0 ? (
          <FloatMenuNote>
            {notice ? `${notice.detail} ` : null}
            {data
              ? "Wrong data that rarely moves the score. Each goes when its point is checked."
              : "Only what can move the score. Wrong data is the grey list beside this one."}
          </FloatMenuNote>
        ) : null}
      </FloatMenu>
    </span>
  );
}

/** A key, as the menu's trailing hint. */
function MenuKey({ tone, children }: { tone: RailTone; children: string }) {
  return (
    <Kbd
      size="sm"
      variant="flat"
      mono
      className={
        tone === "dark" ? "bg-white/[0.08] text-white/60 shadow-none" : ""
      }
    >
      {children}
    </Kbd>
  );
}

/**
 * One review item: its question goes to the item's next point, each number
 * to its own. The next one is drawn in amber; past `POINTS_SHOWN` the rest is
 * "+N", reached through the words.
 */
function FlagKindRow({
  row,
  next,
  tone,
  onGo,
}: {
  row: FlagRow;
  next: string | null;
  tone: RailTone;
  onGo?: (pointId: string) => void;
}) {
  const ink = ROW_INK[tone];
  const shown = row.points.slice(0, POINTS_SHOWN);
  const rest = row.points.length - shown.length;
  return (
    <div
      role="none"
      data-flag-kind={row.code}
      className={cn(
        "flex min-h-[30px] items-center gap-2.5 rounded-[7px] pr-1.5 transition-colors duration-100",
        onGo && ink.row,
      )}
    >
      <button
        type="button"
        role="menuitem"
        disabled={!onGo || next === null}
        onClick={() => next !== null && onGo?.(next)}
        className={cn(
          "min-w-0 flex-1 cursor-pointer truncate py-[7px] pl-[9px] text-left text-[12px] focus-visible:outline-none disabled:cursor-default",
          ink.text,
        )}
      >
        {row.label}
      </button>
      <span className="flex shrink-0 items-center gap-[3px]">
        {shown.map((p) => (
          <button
            key={p.pointId}
            type="button"
            role="menuitem"
            aria-label={`Point ${p.pointNumber}: ${row.label}`}
            disabled={!onGo}
            onClick={() => onGo?.(p.pointId)}
            className={cn(
              "mono tabular grid h-[18px] min-w-[22px] cursor-pointer place-items-center rounded-[5px] px-1 text-[10px] transition-colors duration-100 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:cursor-default",
              p.pointId === next ? ink.next : ink.pt,
            )}
          >
            {p.pointNumber}
          </button>
        ))}
        {rest > 0 ? (
          <span className={cn("mono tabular px-1 text-[10px]", ink.count)}>
            +{rest}
          </span>
        ) : null}
      </span>
    </div>
  );
}
