"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Flag } from "lucide-react";
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
  stepFlag,
  type FlagRow,
  type OpenFlag,
} from "@/lib/services/labels/flag-nav";
import {
  MARK_LABEL,
  onPointsDetail,
  toCheckLabel,
} from "@/lib/services/labels/marks-copy";
import type { LabelPoint } from "@/lib/services/labels/session";
import { cn } from "@/lib/utils";
import type { RailTone } from "./label-rail-tone";

/** A row of a long kind shows this many point numbers, then "+N". */
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
  }
> = {
  dark: {
    row: "hover:bg-white/[0.08] has-[button:focus-visible]:bg-white/[0.08]",
    text: "text-white",
    count: "text-white/35",
    pt: "bg-white/[0.06] text-white/70 hover:bg-white/[0.14] hover:text-white",
    next: "bg-[rgba(253,230,138,0.14)] text-[rgb(252,211,77)]",
    warn: "text-[rgb(252,211,77)]",
  },
  light: {
    row: "hover:bg-[var(--surface-subtle)] has-[button:focus-visible]:bg-[var(--surface-subtle)]",
    text: "text-[var(--ink-900)]",
    count: "text-[var(--ink-400)]",
    pt: "bg-[var(--surface-subtle)] text-[var(--ink-500)] hover:text-[var(--ink-900)]",
    next: "bg-[var(--warning-bg)] text-[var(--warning-text)]",
    warn: "text-[var(--warning-text)]",
  },
};

/**
 * The header's open marks: today's flag and count, now the jump to the next open
 * flag after `fromPointId` (`]`, and `[` back, are the console's keys for the
 * same), and a quiet chevron that opens every flag in one `FloatMenu`. The
 * score mismatch, when there is one, leads the list (`score`), so the header
 * never carries a second amber pill.
 */
export function LabelFlagSummary({
  openMarks,
  points,
  fromPointId,
  onGoToPoint,
  score,
  tone = "dark",
}: {
  /** `openFlags(points, marks)`. */
  openMarks: readonly OpenFlag[];
  points: readonly Pick<LabelPoint, "id">[];
  /** Where a jump starts: the current point, else none (the top). */
  fromPointId: string | null;
  onGoToPoint?: (pointId: string) => void;
  /** The score mismatch's rows, given the menu's close; null when it adds up. */
  score: ((close: () => void) => ReactNode) | null;
  tone?: RailTone;
}) {
  const [open, setOpen] = useState(false);
  const count = openMarks.length;
  const openPoints = new Set(openMarks.map((f) => f.pointId)).size;
  const next = stepFlag(openMarks, points, fromPointId, 1);
  const prev = stepFlag(openMarks, points, fromPointId, -1);
  const groups = flagGroups(openMarks);
  const ink = ROW_INK[tone];

  const go = (pointId: string) => {
    setOpen(false);
    onGoToPoint?.(pointId);
  };

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

  const total = (
    <>
      <Flag className="size-2.5" strokeWidth={1.8} aria-hidden="true" />
      {count}
    </>
  );

  return (
    <span
      data-label-flag-summary=""
      className="inline-flex shrink-0 items-center"
    >
      {next && onGoToPoint ? (
        <ChromeTooltip
          label={`Next flag · point ${next.pointNumber}`}
          detail={[
            MARK_LABEL[next.code],
            [toCheckLabel(count), onPointsDetail(openPoints)?.toLowerCase()]
              .filter(Boolean)
              .join(" "),
          ]}
          shortcut="]"
          side="bottom"
          hidden={open}
        >
          <button
            type="button"
            data-label-rail-to-check=""
            aria-label={toCheckLabel(count)}
            onClick={() => go(next.pointId)}
            className="mono tabular inline-flex h-6 cursor-pointer items-center gap-1 rounded-l-[6px] px-[5px] text-[10px] whitespace-nowrap text-[var(--rail-amber)] transition-colors duration-150 hover:bg-[var(--rail-amber-wash)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            {total}
          </button>
        </ChromeTooltip>
      ) : (
        <span
          role="img"
          data-label-rail-to-check=""
          aria-label={toCheckLabel(count)}
          className={cn(
            "mono tabular inline-flex h-6 items-center gap-1 px-[5px] text-[10px] whitespace-nowrap",
            count > 0 ? "text-[var(--rail-amber)]" : "text-white/45",
          )}
        >
          {total}
        </span>
      )}
      <FloatMenu
        open={open}
        onOpenChange={setOpen}
        align="start"
        width={300}
        tone={tone}
        label="Flag list"
        className="max-h-[480px] overflow-y-auto"
        trigger={
          <button
            type="button"
            data-label-flag-list=""
            data-score-mismatch={score ? "" : undefined}
            aria-label={
              score
                ? "Every open flag, and the score that doesn’t add up"
                : "Every open flag"
            }
            aria-haspopup="menu"
            aria-expanded={open}
            className={cn(
              "relative grid h-6 cursor-pointer place-items-center rounded-r-[6px] text-white/45 transition-colors duration-150 hover:bg-white/[0.08] hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none aria-expanded:bg-white/[0.08] aria-expanded:text-white",
              // The score's dot rides beside the chevron, never in a pill of its own.
              score ? "w-[26px] grid-flow-col gap-[3px]" : "w-[18px]",
            )}
          >
            {score ? (
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-[var(--rail-amber)]"
              />
            ) : null}
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
            label="Next flag"
            description={`Point ${next.pointNumber} · ${MARK_LABEL[next.code]}`}
            trailing={<MenuKey tone={tone}>]</MenuKey>}
            onSelect={() => go(next.pointId)}
          />
        ) : null}
        {prev && onGoToPoint && prev.pointId !== next?.pointId ? (
          <FloatMenuItem
            label="Previous flag"
            description={`Point ${prev.pointNumber} · ${MARK_LABEL[prev.code]}`}
            trailing={<MenuKey tone={tone}>[</MenuKey>}
            onSelect={() => go(prev.pointId)}
          />
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
        {groups.map((group) => (
          <div key={group.name} role="group" aria-label={group.name}>
            <FloatMenuLabel>
              {group.name}{" "}
              <span className={cn("mono tabular text-[10px]", ink.count)}>
                {group.count}
              </span>
            </FloatMenuLabel>
            {group.rows.map((row) => (
              <FlagKindRow
                key={row.code}
                row={row}
                next={
                  stepFlag(
                    openMarks.filter((f) => f.code === row.code),
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
            Hints aren’t counted here. They show inside each open point.
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
 * One kind of flag: its words go to the kind's next point, each number to its
 * own. The next one is drawn in amber; past `POINTS_SHOWN` the rest is "+N",
 * reached through the words.
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
