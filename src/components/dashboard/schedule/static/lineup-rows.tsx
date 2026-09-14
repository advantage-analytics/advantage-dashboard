"use client";

/**
 * The lineup step's rows — "Grey well" from the Dual Lineup Step canvas.
 *
 * Three columns on every line: the court (`S1`…`D3`), our side, and the
 * opponent. Named opponents are plain text; a line still waiting for one draws
 * a small grey well, so the screen gets quieter as it is filled in.
 *
 * This step says who plays where and nothing else. How a line FINISHED —
 * played, forfeited, defaulted — is recorded on the event page's score flow,
 * the one place results are written. A line that already has one is drawn
 * read-only here, with a fourth column saying what it was.
 *
 * ── Singles move; lines do not ────────────────────────────────────────────
 * Our singles players are dragged between lines and across "Not in the
 * lineup" — the Roster's gesture, its sentinel, its landing disc and its
 * keyboard (Space lifts, ↑/↓ move, Space drops, Esc puts it back). What a drag
 * carries is our side only: the court number and the opponent stay put,
 * because the other school's S3 is S3 whoever we send out. So the singles
 * block is three columns side by side — static courts, the reorderable list,
 * static opponents — rather than nine rows that each move whole. The drop is
 * written through ONE block-level call (`onOrder`), resolved by the singles
 * lines' order in `applySinglesOrder`; no row handler ever addresses another
 * row. See `lib/schedule/singles-order.ts`.
 *
 * A dual with a settled singles line cannot be reordered at all, because the
 * save refuses any submission that moves one. Its singles draw as plain rows.
 *
 * ── Doubles are picked, not typed ──────────────────────────────────────────
 * One trigger per court — the pair's two faces, overlapped — opening a
 * pick-two checklist of the roster. A player already on another doubles line
 * shows which and cannot be picked: a player plays one singles line and one
 * doubles line, the `lineupClashes` rule the server enforces. The singles
 * picker leaves a player already on another singles line out of its list.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Reorder, useDragControls, useReducedMotion } from "framer-motion";
import { ChevronDown, GripVertical, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { normalizedPersonName } from "@/lib/data/person-name";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import {
  ChosenCheck,
  FloatMenu,
  FloatMenuDivider,
  FloatMenuNote,
} from "@/components/ui/float-menu";
import {
  OpponentPopup,
  type OpponentPool,
} from "@/components/dashboard/schedule/static/opponent-popup";
import { LineupNamePicker } from "@/components/dashboard/schedule/static/lineup-name-picker";
import {
  isDraftOpponentSet,
  isDraftOurSideSet,
} from "@/lib/schedule/lineup-validation";
import { splitNames } from "@/lib/schedule/format";
import { saveOpponentPlayer } from "@/lib/schedule/actions";
import {
  BENCH,
  EMPTY_OCCUPANT,
  aboveBench,
  fitLineup,
  moveToken,
  type SinglesOccupant,
} from "@/lib/schedule/singles-order";
import type { LadderPlayer } from "@/lib/data/roster-server";
import type { LineupLine } from "@/lib/schedule/types";
import type { DualLineLock } from "@/components/dashboard/schedule/static/dual-build-step";

/* ── Geometry ──────────────────────────────────────────────────────────────
   Fixed widths so the three singles columns and the doubles rows line up.
   44px lines, the design's height; the opponent column is 216 (a 180px well
   plus its gutter). The trailing column, 150, exists only while some line is
   settled — see `hasLocks` — and holds that line's `LockedNote`. */
const COL = {
  slot: "w-[52px] shrink-0 pl-2",
  opp: "w-[216px] shrink-0",
  trail: "w-[150px] shrink-0 pr-2",
};
const LINE_H = "h-11";
const WASH = "bg-[var(--surface-subtle)]";
/**
 * A hovered line: the wash, and a waiting well lifted to white so it does not
 * vanish into a band of its own colour. Rounded only while lit — a radius on a
 * resting row curls its hairline up at both ends.
 */
const LIT = cn(
  WASH,
  "[&_[data-opponent-well=empty]]:bg-[var(--surface-card)]",
  // Faces share the wash's grey too; lift them the same way.
  "[&_[data-face]>span]:bg-[var(--surface-card)]",
  "[&_[data-face]]:ring-[var(--surface-subtle)]",
);

/** The Roster's settle and slide — see `roster-table.tsx`. No bounce. */
const ROW_SETTLE = { bounceStiffness: 600, bounceDamping: 50 };
const ROW_SLIDE = { duration: 0.22, ease: [0.23, 1, 0.32, 1] as const };

/**
 * Whether the trailing column is drawn — true once any line, in either block,
 * is settled.
 *
 * Read off the whole `locked` map rather than the block's own lines, so the
 * singles and doubles blocks always agree and their opponent columns stay in
 * one vertical line. A dual with nothing recorded has no fourth column at all,
 * rather than 150px of nothing at the end of every row.
 */
function hasLocks(locked?: Record<string, DualLineLock>): boolean {
  return Object.values(locked ?? {}).some(Boolean);
}

/** Last word of a name — the pair trigger's short form. */
function surname(name: string): string {
  const words = name.trim().split(/\s+/);
  return words[words.length - 1] ?? name;
}

/* ── Small pieces ──────────────────────────────────────────────────────── */

function EmptyFace({ overlap = false }: { overlap?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-[26px] shrink-0 rounded-full border border-dashed border-[var(--ink-300)] bg-[var(--surface-card)]",
        overlap && "-ml-1.5",
      )}
    />
  );
}

/** Two faces, the second tucked 8px under the first with a 2px ring. */
function PairFaces({ labels }: { labels: string[] }) {
  return (
    <span aria-hidden className="flex shrink-0 items-center">
      {[0, 1].map((index) =>
        labels[index] ? (
          <span
            key={index}
            data-face
            className={cn(
              "rounded-full ring-2 ring-[var(--surface-card)]",
              // The first face sits on top so its initials stay whole.
              // 6px of overlap, not 8: at 26px the initials start ~7px in,
              // so a deeper tuck clips the letter under the other face.
              index === 0 ? "relative z-[1]" : "-ml-1.5",
            )}
          >
            <InitialsAvatar name={labels[index]} />
          </span>
        ) : (
          <EmptyFace key={index} overlap={index === 1} />
        ),
      )}
    </span>
  );
}

function CourtCell({ slot, className }: { slot: string; className?: string }) {
  return (
    <span
      className={cn(
        "mono flex items-center text-[11px] text-[var(--ink-400)]",
        className,
      )}
    >
      {slot}
    </span>
  );
}

/** The column heading: eyebrow on the left, how many lines are set on the right. */
export function LineupHeading({
  title,
  set,
  total,
}: {
  title: string;
  set: number;
  total: number;
}) {
  return (
    <div className="flex h-5 items-baseline justify-between">
      <span className="eyebrow">{title}</span>
      <span className="tabular text-[11px] text-[var(--ink-500)]">
        {set} of {total} set
      </span>
    </div>
  );
}

/* ── The opponent cell ─────────────────────────────────────────────────── */

/**
 * After a name lands, focus the next line still waiting for one.
 *
 * Found in the DOM rather than computed, because the next waiting line may be
 * in the other block; `data-opponent-well="empty"` is the popup trigger's own
 * mark for "waiting".
 */
function focusNextWaiting(from: HTMLElement | null) {
  if (!from) return;
  requestAnimationFrame(() => {
    const wells = Array.from(
      document.querySelectorAll<HTMLElement>('[data-opponent-well="empty"]'),
    );
    const next = wells.find(
      (well) =>
        from.compareDocumentPosition(well) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
    next?.focus();
  });
}

function OpponentCell({
  line,
  pool,
  onTheirLabels,
  onTheirNoPlayer,
  onActiveChange,
}: {
  line: LineupLine;
  pool: OpponentPool;
  onTheirLabels: (key: string, value: string) => void;
  onTheirNoPlayer: (key: string) => void;
  onActiveChange: (active: boolean) => void;
}) {
  const cellRef = useRef<HTMLDivElement>(null);
  // Nobody to name across the net: the line is our forfeit, and the row says
  // who wins it where the opponent would have been. "They", not the school:
  // a school name runs past the 216px column and cuts off the point. The
  // opponent's own No player reads "No player · we win by forfeit" — the
  // same 12px grey sentence, from the other side.
  if (line.noPlayer) {
    return (
      <span className="block max-w-full truncate text-[12px] text-[var(--ink-500)]">
        They win by forfeit
      </span>
    );
  }
  return (
    <div ref={cellRef} className="relative flex min-w-0 items-center">
      <OpponentPopup
        value={line.theirLabels.join(" / ")}
        addLabel={line.discipline === "doubles" ? "Opponent pair" : "Opponent"}
        discipline={line.discipline}
        pool={pool}
        draftName=""
        onCommit={(value) => {
          // A closure over THIS line's key — the popup never holds one.
          onTheirLabels(line.key, value);
          if (value.trim() !== "") focusNextWaiting(cellRef.current);
        }}
        noPlayer={line.theirNoPlayer}
        onNoPlayer={() => {
          onTheirNoPlayer(line.key);
          focusNextWaiting(cellRef.current);
        }}
        onActiveChange={onActiveChange}
      />
    </div>
  );
}

/* ── A settled line ────────────────────────────────────────────────────── */

/** A settled line's right-hand cell: how it was settled, and the way out. */
function LockedNote({ lock }: { lock: DualLineLock }) {
  return (
    <span className="text-right text-[11px] text-[var(--ink-500)]">
      {lock === "played" ? "Played" : lock}
      {lock !== "played" && (
        <span className="mt-1 block">
          Clear the outcome on the event to edit.
        </span>
      )}
    </span>
  );
}

/* ── Our side: singles ─────────────────────────────────────────────────── */

function OurSingles({
  line,
  occupant,
  singles,
  clashes,
  roster,
  onOurLabels,
  onOurSelection,
  onAddPlayer,
  onPickingChange,
  onNoPlayer,
}: {
  /** The line this occupant is on right now. */
  line: LineupLine;
  occupant: SinglesOccupant;
  /** Every singles line — who is already on the others. */
  singles: readonly LineupLine[];
  /** `draftClashes` — a line whose player is already on an earlier line. */
  clashes: ReadonlyMap<string, string>;
  roster: LadderPlayer[];
  onOurLabels: (key: string, value: string, added?: LadderPlayer) => void;
  onOurSelection: (
    key: string,
    selection: { ids: string[]; labels: string[] },
  ) => void;
  onAddPlayer: (key: string, player: LadderPlayer, value: string) => void;
  onPickingChange: (open: boolean) => void;
  onNoPlayer: (key: string) => void;
}) {
  const label = occupant.labels.join(" / ");
  const clashWith = clashes.get(line.slot);
  const unset = !isDraftOurSideSet(line) || clashWith !== undefined;
  // One singles line per player: whoever holds another court is left out of
  // this court's list.
  const takenOn = new Map<string, string>();
  for (const other of singles) {
    if (other.key === line.key) continue;
    for (const id of other.ourIds) takenOn.set(id, other.slot);
  }
  return (
    <span
      // The footer's progress pill walks these, in reading order.
      data-line-unset={unset ? line.slot : undefined}
      className="flex min-w-0 flex-1 items-center gap-2.5"
    >
      {label.trim() ? (
        <span data-face>
          <InitialsAvatar name={label} />
        </span>
      ) : (
        <EmptyFace />
      )}
      <LineupNamePicker
        value={label}
        selectedIds={occupant.ids}
        slot={line.slot}
        discipline="singles"
        ladder={roster}
        onChange={(value) => onOurLabels(line.key, value)}
        onSelection={(selection) => onOurSelection(line.key, selection)}
        onAddPlayer={(player, value) => onAddPlayer(line.key, player, value)}
        onOpenChange={onPickingChange}
        noPlayer={line.noPlayer}
        onNoPlayer={() => onNoPlayer(line.key)}
        takenOn={takenOn}
        clashWith={clashWith}
      />
    </span>
  );
}

/* ── Our side: doubles ─────────────────────────────────────────────────── */

function PairPicker({
  line,
  roster,
  pairedOn,
  clashWith,
  onOurSelection,
  onNoPlayer,
}: {
  line: LineupLine;
  roster: LadderPlayer[];
  /** Player id → the other doubles lines they are already on. */
  pairedOn: ReadonlyMap<string, string[]>;
  /** The earlier doubles line one of this pair is already on, if any. */
  clashWith: string | undefined;
  onOurSelection: (
    key: string,
    selection: { ids: string[]; labels: string[] },
  ) => void;
  onNoPlayer: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const unset = !isDraftOurSideSet(line) || clashWith !== undefined;
  const ids = line.ourIds;
  const labels = line.ourLabels;

  // Two players sharing a name are told apart by ladder spot and roster id —
  // a pair attributed to the wrong Alex Kim looks exactly like the right one.
  // Each roster id once — the list's React keys and the pick's identity.
  const people = useMemo(
    () =>
      roster.filter(
        (player, index) =>
          roster.findIndex((other) => other.userId === player.userId) === index,
      ),
    [roster],
  );

  const nameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const player of people) {
      const name = normalizedPersonName(player.name);
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return counts;
  }, [people]);

  function secondLine(player: LadderPlayer): string | undefined {
    if ((nameCounts.get(normalizedPersonName(player.name)) ?? 0) < 2) {
      return undefined;
    }
    const rank =
      player.ladderPosition !== null ? `S${player.ladderPosition} · ` : "";
    return `${rank}roster ${player.userId.slice(-8)}`;
  }

  function toggle(player: LadderPlayer) {
    const has = ids.includes(player.userId);
    const nextIds = has
      ? ids.filter((id) => id !== player.userId)
      : [...ids, player.userId];
    const nextLabels = nextIds.map((id) => {
      const known = roster.find((entry) => entry.userId === id);
      return known ? known.name : (labels[ids.indexOf(id)] ?? "");
    });
    onOurSelection(line.key, { ids: nextIds, labels: nextLabels });
    if (!has && nextIds.length === 2) setOpen(false);
  }

  const summary =
    labels.length === 0
      ? null
      : labels.length === 1
        ? `${surname(labels[0])} / `
        : labels.map(surname).join(" / ");

  return (
    <FloatMenu
      open={open}
      onOpenChange={setOpen}
      label={`Pair for ${line.slot}`}
      align="start"
      width={264}
      trigger={
        <button
          type="button"
          aria-label={`Our pair at ${line.slot}`}
          aria-expanded={open}
          data-line-unset={unset ? line.slot : undefined}
          className={cn(
            "-mx-2 flex h-8 min-w-0 cursor-pointer items-center gap-2.5 rounded-[7px] px-2 text-left transition-colors duration-[var(--duration-hover)]",
            "focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
            open ? WASH : "hover:bg-[var(--surface-card)]",
          )}
        >
          <PairFaces labels={labels} />
          <span className="min-w-0 truncate text-[13px] text-[var(--ink-700)]">
            {line.noPlayer ? (
              <span className="text-[var(--ink-500)]">No pair</span>
            ) : summary === null ? (
              <span className="text-[var(--ink-400)]">Choose pair</span>
            ) : labels.length === 1 ? (
              <>
                {summary}
                <span className="text-[var(--ink-400)]">Choose partner</span>
              </>
            ) : (
              summary
            )}
          </span>
          <ChevronDown
            className="size-3 shrink-0 text-[var(--ink-400)]"
            strokeWidth={1.5}
            aria-hidden
          />
        </button>
      }
    >
      <div className="px-2.5 pt-1.5 pb-1 text-[11px] text-[var(--ink-600)]">
        Pair for {line.slot} · pick two
      </div>
      <div className="flex max-h-[296px] flex-col overflow-y-auto">
        {people.map((player) => {
          const checked = ids.includes(player.userId);
          const elsewhere = pairedOn.get(player.userId);
          const full = !checked && ids.length >= 2;
          // One doubles line per player. A checked one stays untickable even
          // when it clashes, so a saved clash can still be undone here.
          const unavailable = full || (!checked && elsewhere !== undefined);
          const detail = secondLine(player);
          return (
            <button
              key={player.userId}
              type="button"
              role="menuitemcheckbox"
              aria-checked={checked}
              aria-disabled={unavailable || undefined}
              onClick={() => {
                if (!unavailable) toggle(player);
              }}
              className={cn(
                "flex min-h-[34px] cursor-pointer items-center gap-2.5 rounded-[7px] px-2.5 py-1 text-left transition-colors duration-100",
                "focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none",
                unavailable
                  ? "cursor-default opacity-45"
                  : "hover:bg-[var(--surface-subtle)]",
              )}
            >
              <InitialsAvatar name={player.name} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[12px] text-[var(--ink-900)]">
                  {player.name}
                </span>
                {detail ? (
                  <span className="mono text-[10px] text-[var(--ink-500)]">
                    {detail}
                  </span>
                ) : null}
              </span>
              {checked ? (
                <ChosenCheck chosen />
              ) : elsewhere ? (
                <span className="mono shrink-0 text-[10px] text-[var(--ink-400)]">
                  on {elsewhere.join(", ")}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <FloatMenuDivider />
      {/* The last resort, after every player: nobody to send to this court. */}
      <button
        type="button"
        role="menuitemradio"
        aria-checked={line.noPlayer}
        onClick={() => {
          onNoPlayer(line.key);
          setOpen(false);
        }}
        className={cn(
          "flex min-h-[34px] cursor-pointer items-center gap-2.5 rounded-[7px] px-2.5 py-1 text-left transition-colors duration-100",
          "hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none",
        )}
      >
        <EmptyFace />
        <span className="flex-1 text-[12px] text-[var(--ink-900)]">
          No pair
        </span>
        {line.noPlayer ? (
          <ChosenCheck chosen />
        ) : (
          <span className="shrink-0 text-[11px] text-[var(--ink-500)]">
            Counts as a forfeit
          </span>
        )}
      </button>
      <FloatMenuNote>
        {clashWith !== undefined
          ? `A player here is already on ${clashWith}. A player can play one doubles line.`
          : ids.length >= 2
            ? "Untick a player to swap in someone else."
            : "A player can play one doubles line."}
      </FloatMenuNote>
    </FloatMenu>
  );
}

/* ── A whole line, as one row ──────────────────────────────────────────── */

/**
 * One line drawn as a single row: every doubles court, and singles whenever
 * the singles cannot be reordered (a settled line exists).
 */
function LineRow({
  line,
  lock,
  last,
  ours,
  theirs,
  pool,
  onTheirLabels,
  onTheirNoPlayer,
  trailing,
}: {
  line: LineupLine;
  lock?: DualLineLock;
  last: boolean;
  /** Column two, already built — singles and doubles draw it differently. */
  ours: React.ReactNode;
  /** Column three, when the block draws its own — a doubles pair picker. */
  theirs?: React.ReactNode;
  pool: OpponentPool;
  onTheirLabels: (key: string, value: string) => void;
  onTheirNoPlayer: (key: string) => void;
  /** Draw the trailing column — some line in the step is settled. */
  trailing: boolean;
}) {
  const [active, setActive] = useState(false);
  const [hot, setHot] = useState(false);

  if (lock) {
    return (
      <div
        className={cn(
          "flex min-h-11 items-center py-2",
          !last && "border-b border-[var(--border-hairline)]",
        )}
      >
        <CourtCell slot={line.slot} className={COL.slot} />
        <span className="ml-6 flex min-w-0 flex-1 items-center gap-2.5 pr-4">
          <span className="truncate text-[13px] text-[var(--ink-900)]">
            {line.ourLabels.join(" / ") || "—"}
          </span>
        </span>
        <span
          className={cn(COL.opp, "truncate text-[13px] text-[var(--ink-900)]")}
        >
          {line.theirNoPlayer
            ? "No player"
            : line.theirLabels.join(" / ") || "—"}
        </span>
        <span className={cn(COL.trail, "flex justify-end")}>
          <LockedNote lock={lock} />
        </span>
      </div>
    );
  }

  return (
    <div
      onPointerEnter={() => setHot(true)}
      onPointerLeave={() => setHot(false)}
      onFocus={() => setHot(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setHot(false);
        }
      }}
      className={cn(
        "relative flex items-center transition-colors duration-[var(--duration-hover)]",
        LINE_H,
        !last && !hot && "border-b border-[var(--border-hairline)]",
        (last || hot) && "border-b border-transparent",
        hot && cn(LIT, "rounded-[8px]"),
        active && "z-20",
      )}
    >
      <CourtCell slot={line.slot} className={cn(COL.slot, "self-stretch")} />
      {/* `ml-6` puts the faces where the reorderable singles put theirs,
          past the grip's slot, so both blocks read as one column. */}
      <span className="ml-6 flex min-w-0 flex-1 items-center pr-4">{ours}</span>
      <span className={COL.opp}>
        {theirs ?? (
          <OpponentCell
            line={line}
            pool={pool}
            onTheirLabels={onTheirLabels}
            onTheirNoPlayer={onTheirNoPlayer}
            onActiveChange={setActive}
          />
        )}
      </span>
      {trailing ? <span className={COL.trail} /> : null}
    </div>
  );
}

/* ── Shared props ──────────────────────────────────────────────────────── */

interface BlockProps {
  lines: LineupLine[];
  locked?: Record<string, DualLineLock>;
  pool: OpponentPool;
  roster: LadderPlayer[];
  onOurLabels: (key: string, value: string, added?: LadderPlayer) => void;
  onOurSelection: (
    key: string,
    selection: { ids: string[]; labels: string[] },
  ) => void;
  onAddPlayer: (key: string, player: LadderPlayer, value: string) => void;
  onTheirLabels: (key: string, value: string) => void;
  /** Nobody on our side of this court — the save records our forfeit. */
  onNoPlayer: (key: string) => void;
  /** Nobody on THEIR side of this court — the save records their forfeit. */
  onTheirNoPlayer: (key: string) => void;
  /** `draftClashes` over the whole lineup. */
  clashes: ReadonlyMap<string, string>;
  /** The opponents named on S1–S6, in court order — their pair picker's lead. */
  opponentSinglesNames: readonly string[];
}

/* ── Doubles ───────────────────────────────────────────────────────────── */

export function DoublesLineup(props: BlockProps) {
  const { lines, locked, pool, roster, onOurSelection } = props;
  const opponentChoices = opponentPairChoices(
    props.opponentSinglesNames,
    pool,
    lines,
  );
  return (
    <div className="-mx-2 flex flex-col">
      {lines.map((line, index) => {
        const others = lines.filter((other) => other.key !== line.key);
        const pairedOn = new Map<string, string[]>();
        for (const other of others) {
          for (const id of other.ourIds) {
            pairedOn.set(id, [...(pairedOn.get(id) ?? []), other.slot]);
          }
        }
        return (
          <LineRow
            // The school's key rides in the row key: every name on this row was
            // typed against ONE school, and a change of school remounts it.
            key={`${pool.key}:${line.key}`}
            line={line}
            lock={locked?.[line.key]}
            last={index === lines.length - 1}
            pool={pool}
            onTheirLabels={props.onTheirLabels}
            onTheirNoPlayer={props.onTheirNoPlayer}
            trailing={hasLocks(locked)}
            theirs={
              // Our forfeit leaves nobody to name across the net; the cell
              // says who wins instead.
              line.noPlayer ? undefined : (
                <OpponentPairPicker
                  line={line}
                  pool={pool}
                  choices={opponentChoices}
                  pairedOn={opponentPairedOn(lines, line.key)}
                  onTheirLabels={props.onTheirLabels}
                  onTheirNoPlayer={props.onTheirNoPlayer}
                />
              )
            }
            ours={
              <PairPicker
                line={line}
                roster={roster}
                pairedOn={pairedOn}
                clashWith={props.clashes.get(line.slot)}
                onOurSelection={onOurSelection}
                onNoPlayer={props.onNoPlayer}
              />
            }
          />
        );
      })}
    </div>
  );
}

/* ── Their side: doubles ───────────────────────────────────────────────── */

/**
 * Who their pair can be drawn from, in the order a coach reaches for them:
 * the opponents already named on S1–S6 in court order (where our ladder sits
 * in ours), then the rest of their saved roster, then anyone typed onto a
 * doubles line in this lineup — a player who only plays doubles. One row per
 * name, by `normalizedPersonName`: opponents have names here, not ids.
 */
export function opponentPairChoices(
  singlesNames: readonly string[],
  pool: OpponentPool,
  doubles: readonly LineupLine[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (name: string) => {
    const key = normalizedPersonName(name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(name.trim());
  };
  singlesNames.forEach(add);
  pool.candidates.forEach((candidate) => add(candidate.name));
  for (const line of doubles) {
    splitNames(line.theirLabels.join(" / ")).forEach(add);
  }
  return out;
}

/** Opponent name → the OTHER doubles lines it is already on. */
export function opponentPairedOn(
  doubles: readonly LineupLine[],
  key: string,
): Map<string, string[]> {
  const on = new Map<string, string[]>();
  for (const other of doubles) {
    if (other.key === key) continue;
    for (const name of splitNames(other.theirLabels.join(" / "))) {
      const id = normalizedPersonName(name);
      on.set(id, [...(on.get(id) ?? []), other.slot]);
    }
  }
  return on;
}

/**
 * Their pair on a doubles line — `PairPicker`, drawn for the other side.
 *
 * The same trigger and the same pick-two checklist, without faces: the other
 * school has no profiles here. Two differences, both because their roster is
 * only what has been typed: rows are names rather than roster ids, and an
 * "Add a player" row opens in place for someone who plays doubles only. A
 * pair is two names — one reads "Choose partner" and the line is not set.
 */
export function OpponentPairPicker({
  line,
  pool,
  choices,
  pairedOn,
  onTheirLabels,
  onTheirNoPlayer,
}: {
  line: LineupLine;
  pool: OpponentPool;
  choices: readonly string[];
  pairedOn: ReadonlyMap<string, string[]>;
  onTheirLabels: (key: string, value: string) => void;
  /**
   * Offers "No pair", their forfeit. The lineup's alone: the score page names
   * a pair that played, and a forfeit is the lineup's to record.
   */
  onTheirNoPlayer?: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const names = line.theirNoPlayer
    ? []
    : splitNames(line.theirLabels.join(" / "));
  const picked = new Set(names.map((name) => normalizedPersonName(name)));
  const unset = !isDraftOpponentSet(line);

  function write(next: string[]) {
    onTheirLabels(line.key, next.join(" / "));
    if (next.length === 2) setOpen(false);
  }

  function toggle(name: string) {
    const id = normalizedPersonName(name);
    write(
      picked.has(id)
        ? names.filter((other) => normalizedPersonName(other) !== id)
        : [...names, name],
    );
  }

  function addTyped() {
    const name = draft.trim().replace(/\s+/g, " ");
    if (name.split(" ").length < 2) {
      setError("Type a first and last name.");
      return;
    }
    if (picked.has(normalizedPersonName(name))) {
      setError("They're already in this pair.");
      return;
    }
    if (names.length >= 2) {
      setError("Untick a player to swap in someone else.");
      return;
    }
    setDraft("");
    setAdding(false);
    setError(null);
    write([...names, name]);
    // An enrichment, never a precondition — `OpponentPopup`'s rule. A
    // `text:` school has nowhere to save to, and a refusal changes nothing.
    if (pool.programKey) {
      void saveOpponentPlayer({ opponentProgramKey: pool.programKey, name });
    }
  }

  const summary =
    names.length === 0 ? null : names.length === 1 ? (
      <>
        {surname(names[0])} /{" "}
        <span className="text-[var(--ink-400)]">Choose partner</span>
      </>
    ) : (
      names.map(surname).join(" / ")
    );

  return (
    <FloatMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setAdding(false);
          setDraft("");
          setError(null);
        }
      }}
      label={`Their pair for ${line.slot}`}
      align="start"
      width={264}
      trigger={
        <button
          type="button"
          aria-label={`Their pair at ${line.slot}`}
          aria-expanded={open}
          title={names.length > 0 ? names.join(" / ") : undefined}
          data-line-unset={unset ? line.slot : undefined}
          data-opponent-well={
            names.length === 0 && !line.theirNoPlayer ? "empty" : "named"
          }
          className={cn(
            "-mx-2 flex h-8 max-w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-[7px] px-2 text-left transition-colors duration-[var(--duration-hover)]",
            "focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
            open ? WASH : "hover:bg-[var(--surface-card)]",
          )}
        >
          <span className="min-w-0 truncate text-[13px] text-[var(--ink-700)]">
            {line.theirNoPlayer ? (
              <span className="text-[12px] text-[var(--ink-500)]">
                No pair · we win by forfeit
              </span>
            ) : summary === null ? (
              <span className="text-[var(--ink-400)]">Choose pair</span>
            ) : (
              summary
            )}
          </span>
          <ChevronDown
            className="size-3 shrink-0 text-[var(--ink-400)]"
            strokeWidth={1.5}
            aria-hidden
          />
        </button>
      }
    >
      <div className="px-2.5 pt-1.5 pb-1 text-[11px] text-[var(--ink-600)]">
        Pair for {line.slot} · pick two
      </div>
      <div className="flex max-h-[296px] flex-col overflow-y-auto">
        {choices.map((name) => {
          const id = normalizedPersonName(name);
          const checked = picked.has(id);
          const elsewhere = pairedOn.get(id);
          const unavailable =
            !checked && (names.length >= 2 || elsewhere !== undefined);
          return (
            <button
              key={id}
              type="button"
              role="menuitemcheckbox"
              aria-checked={checked}
              aria-disabled={unavailable || undefined}
              onClick={() => {
                if (!unavailable) toggle(name);
              }}
              className={cn(
                "flex min-h-[34px] cursor-pointer items-center gap-2.5 rounded-[7px] px-2.5 py-1 text-left transition-colors duration-100",
                "focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none",
                unavailable
                  ? "cursor-default opacity-45"
                  : "hover:bg-[var(--surface-subtle)]",
              )}
            >
              <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-900)]">
                {name}
              </span>
              {checked ? (
                <ChosenCheck chosen />
              ) : elsewhere ? (
                <span className="mono shrink-0 text-[10px] text-[var(--ink-400)]">
                  on {elsewhere.join(", ")}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <FloatMenuDivider />
      {adding ? (
        <div className="flex min-h-[34px] items-center gap-2.5 rounded-[7px] bg-[var(--surface-subtle)] px-2.5 py-1">
          <Plus
            className="size-3 shrink-0 text-[var(--ink-500)]"
            strokeWidth={1.5}
            aria-hidden
          />
          <input
            autoFocus
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addTyped();
              }
            }}
            placeholder="First and last name"
            aria-label={`Add a player to their pair at ${line.slot}`}
            data-focus-ring="none"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--ink-900)] caret-[var(--blue)] outline-none placeholder:text-[var(--ink-300)]"
          />
          <span className="mono shrink-0 text-[10px] text-[var(--ink-500)]">
            ↵
          </span>
        </div>
      ) : (
        <button
          type="button"
          role="menuitem"
          onClick={() => setAdding(true)}
          className={cn(
            "flex min-h-[34px] cursor-pointer items-center gap-2.5 rounded-[7px] px-2.5 py-1 text-left transition-colors duration-100",
            "hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none",
          )}
        >
          <Plus
            className="size-3 shrink-0 text-[var(--ink-500)]"
            strokeWidth={1.5}
            aria-hidden
          />
          <span className="text-[12px] text-[var(--ink-900)]">
            Don&apos;t see their player? Add a player
          </span>
        </button>
      )}
      {onTheirNoPlayer ? (
        <button
          type="button"
          role="menuitemradio"
          aria-checked={line.theirNoPlayer}
          onClick={() => {
            onTheirNoPlayer(line.key);
            setOpen(false);
          }}
          className={cn(
            "flex min-h-[34px] cursor-pointer items-center gap-2.5 rounded-[7px] px-2.5 py-1 text-left transition-colors duration-100",
            "hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none",
          )}
        >
          <span className="flex-1 text-[12px] text-[var(--ink-900)]">
            No pair
          </span>
          {line.theirNoPlayer ? (
            <ChosenCheck chosen />
          ) : (
            <span className="shrink-0 text-[11px] text-[var(--ink-500)]">
              Counts as their forfeit
            </span>
          )}
        </button>
      ) : null}
      <FloatMenuNote>
        {error ??
          (adding
            ? "Type a first and last name."
            : names.length >= 2
              ? "Untick a player to swap in someone else."
              : "Players already on another doubles line show it.")}
      </FloatMenuNote>
    </FloatMenu>
  );
}

/* ── Singles ───────────────────────────────────────────────────────────── */

/** `useDualDraft().setSinglesOrder` — S1…S6's occupants, in order. */
export type SinglesOrderHandler = (order: SinglesOccupant[]) => void;

export function SinglesLineup(
  props: BlockProps & { onOrder: SinglesOrderHandler },
) {
  const { lines, locked, pool, roster } = props;
  const reorderable = !lines.some((line) => locked?.[line.key] !== undefined);

  if (!reorderable) {
    return (
      <div className="-mx-2 flex flex-col">
        {lines.map((line, index) => (
          <LineRow
            key={`${pool.key}:${line.key}`}
            line={line}
            lock={locked?.[line.key]}
            last={index === lines.length - 1}
            pool={pool}
            onTheirLabels={props.onTheirLabels}
            onTheirNoPlayer={props.onTheirNoPlayer}
            trailing={hasLocks(locked)}
            ours={
              <OurSingles
                line={line}
                occupant={{ ids: line.ourIds, labels: line.ourLabels }}
                singles={lines}
                clashes={props.clashes}
                roster={roster}
                onOurLabels={props.onOurLabels}
                onOurSelection={props.onOurSelection}
                onAddPlayer={props.onAddPlayer}
                onPickingChange={() => undefined}
                onNoPlayer={props.onNoPlayer}
              />
            }
          />
        ))}
      </div>
    );
  }

  return <ReorderableSingles key={pool.key} {...props} />;
}

const benchToken = (userId: string) => `bench:${userId}`;
const gripId = (token: string) => `lineup-grip-${token}`;

function ReorderableSingles({
  lines,
  locked,
  pool,
  roster,
  onOurLabels,
  onOurSelection,
  onAddPlayer,
  onTheirLabels,
  onNoPlayer,
  onTheirNoPlayer,
  clashes,
  onOrder,
}: BlockProps & { onOrder: SinglesOrderHandler }) {
  const reduceMotion = useReducedMotion();
  // No singles line is settled here (that is what makes it reorderable), but a
  // doubles line can be — and then the doubles rows draw the trailing column,
  // so these must too or the two opponent columns step out of line.
  const trailing = hasLocks(locked);
  const listRef = useRef<HTMLDivElement>(null);

  /**
   * One stable token per line's occupant.
   *
   * Tokens move with the occupant on a drop and do NOT change while a name is
   * typed, so an input keeps its focus through every keystroke. A token is
   * never parsed: which line an occupant is on is its index here.
   */
  // Seeded from `useId` and the line's index, so the server and the client
  // agree on the first render; later tokens count up from there.
  const tokenBase = useId();
  const minted = useRef(lines.length);
  const mintToken = () => `${tokenBase}-${(minted.current += 1)}`;
  const [tokens, setTokens] = useState<string[]>(() =>
    lines.map((_, index) => `${tokenBase}-${index}`),
  );

  // Who is benched: everyone on the roster not already holding a line.
  const bench = useMemo(() => {
    const lined = new Set(lines.flatMap((line) => line.ourIds));
    const seen = new Set<string>();
    return roster.filter((player) => {
      if (lined.has(player.userId) || seen.has(player.userId)) return false;
      seen.add(player.userId);
      return true;
    });
  }, [lines, roster]);

  const occupants = useMemo(() => {
    const map = new Map<string, SinglesOccupant>();
    tokens.forEach((token, index) => {
      const line = lines[index];
      if (line) map.set(token, { ids: line.ourIds, labels: line.ourLabels });
    });
    for (const player of bench) {
      map.set(benchToken(player.userId), {
        ids: [player.userId],
        labels: [player.name],
      });
    }
    return map;
  }, [tokens, lines, bench]);

  const resting = useMemo(
    () => [
      ...tokens.slice(0, lines.length),
      BENCH,
      ...bench.map((player) => benchToken(player.userId)),
    ],
    [tokens, lines.length, bench],
  );

  /** The order being edited — a drag or a keyboard lift — or null at rest. */
  const [draft, setDraft] = useState<string[] | null>(null);
  const draftRef = useRef<string[] | null>(null);
  const [lifted, setLifted] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [hot, setHot] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [activeOpp, setActiveOpp] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const sequence = draft ?? resting;
  const benchAt = sequence.indexOf(BENCH);

  function setDraftSeq(next: string[] | null) {
    draftRef.current = next;
    setDraft(next);
  }

  function nameOf(token: string): string {
    return occupants.get(token)?.labels.join(" / ") || "Empty line";
  }

  function spotOf(seq: string[], token: string): number | null {
    const at = seq.indexOf(token);
    const bar = seq.indexOf(BENCH);
    return at < bar ? at + 1 : null;
  }

  /** Write a finished order onto the draft and re-key the lines to it. */
  function commit(seq: string[]) {
    const fitted = fitLineup(aboveBench(seq), occupants, lines.length);
    const order = fitted.map((token) => occupants.get(token) ?? EMPTY_OCCUPANT);
    while (order.length < lines.length) order.push(EMPTY_OCCUPANT);
    setTokens([
      ...fitted,
      ...Array.from({ length: lines.length - fitted.length }, () =>
        mintToken(),
      ),
    ]);
    setDraftSeq(null);
    onOrder(order);
  }

  function lift(token: string) {
    setDraftSeq(resting);
    setLifted(token);
    const spot = spotOf(resting, token);
    setAnnouncement(
      `${nameOf(token)} lifted, ${spot ? `line ${spot} of ${lines.length}` : "not in the lineup"}. Arrows move, Space drops, Escape cancels.`,
    );
  }

  function drop(token: string) {
    const seq = draftRef.current ?? resting;
    const spot = spotOf(seq, token);
    setLifted(null);
    commit(seq);
    setAnnouncement(
      `${nameOf(token)} dropped, ${spot ? `line ${spot}` : "not in the lineup"}.`,
    );
    // The token survives the drop if it stayed in the lineup; refocus it.
    requestAnimationFrame(() =>
      document.getElementById(gripId(token))?.focus(),
    );
  }

  function cancel(token: string) {
    setLifted(null);
    setDraftSeq(null);
    setAnnouncement(`${nameOf(token)} put back.`);
    requestAnimationFrame(() =>
      document.getElementById(gripId(token))?.focus(),
    );
  }

  function step(token: string, direction: 1 | -1) {
    const seq = moveToken(draftRef.current ?? resting, token, direction);
    setDraftSeq(seq);
    const spot = spotOf(seq, token);
    setAnnouncement(
      `${nameOf(token)}, ${spot ? `line ${spot} of ${lines.length}` : "not in the lineup"}.`,
    );
    requestAnimationFrame(() =>
      document.getElementById(gripId(token))?.focus(),
    );
  }

  // A lift abandoned by tabbing away is put back rather than half-applied.
  useEffect(() => {
    if (!lifted) return;
    function onFocusIn(event: FocusEvent) {
      if ((event.target as HTMLElement | null)?.id !== gripId(lifted!)) {
        setLifted(null);
        setDraftSeq(null);
      }
    }
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [lifted]);

  const held = lifted ?? dragging;

  return (
    <div className="relative -mx-2 flex">
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      {/* The courts. They never move. */}
      <div aria-hidden className="flex flex-col">
        {lines.map((line, index) => (
          <CourtCell
            key={line.key}
            slot={line.slot}
            className={cn(
              COL.slot,
              LINE_H,
              "border-b transition-colors duration-[var(--duration-hover)]",
              index === lines.length - 1 || hot === line.key
                ? "border-transparent"
                : "border-[var(--border-hairline)]",
              hot === line.key && !held && cn(WASH, "rounded-l-[8px]"),
            )}
          />
        ))}
      </div>

      {/* Our players — the only column a drag moves. */}
      <Reorder.Group
        ref={listRef}
        as="div"
        axis="y"
        values={sequence}
        onReorder={(next) => setDraftSeq(next)}
        className="flex min-w-0 flex-1 flex-col"
      >
        {sequence.map((token, index) => {
          if (token === BENCH) {
            return (
              <Reorder.Item
                key={BENCH}
                as="div"
                value={BENCH}
                dragListener={false}
                layout="position"
                transition={reduceMotion ? { duration: 0 } : ROW_SLIDE}
                className="relative h-8 select-none"
              >
                {/* Spans the court, player and opponent columns — and the
                    trailing one when it is drawn — so the rule reads as a
                    line across the whole lineup. */}
                <span
                  className={cn(
                    "absolute inset-y-0 -left-[52px] flex items-center gap-3 pl-2",
                    trailing ? "-right-[366px]" : "-right-[216px]",
                  )}
                >
                  <span className="shrink-0 text-[11px] text-[var(--ink-500)]">
                    Not in the lineup
                  </span>
                  <span className="h-px flex-1 bg-[var(--border-hairline)]" />
                </span>
              </Reorder.Item>
            );
          }
          const inLineup = index < benchAt;
          const line = inLineup ? lines[index] : undefined;
          return (
            <PlayerItem
              key={token}
              token={token}
              line={line}
              lastLine={index === lines.length - 1}
              occupant={occupants.get(token) ?? EMPTY_OCCUPANT}
              spot={spotOf(sequence, token)}
              held={held === token}
              hot={line !== undefined && hot === line.key && !held}
              picking={picking === token}
              reduceMotion={Boolean(reduceMotion)}
              listRef={listRef}
              roster={roster}
              singles={lines}
              clashes={clashes}
              onHot={(on) => setHot(on && line ? line.key : null)}
              onPickingChange={(open) =>
                setPicking((current) =>
                  open ? token : current === token ? null : current,
                )
              }
              onDragStart={() => {
                setDragging(token);
                setDraftSeq(resting);
              }}
              onDragEnd={() => {
                setDragging(null);
                commit(draftRef.current ?? resting);
              }}
              onKey={(event) => {
                if (event.key === " " || event.key === "Enter") {
                  event.preventDefault();
                  event.stopPropagation();
                  if (lifted === token) drop(token);
                  else lift(token);
                  return;
                }
                if (lifted !== token) return;
                if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                  event.preventDefault();
                  event.stopPropagation();
                  step(token, event.key === "ArrowDown" ? 1 : -1);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  cancel(token);
                }
              }}
              onOurLabels={onOurLabels}
              onOurSelection={onOurSelection}
              onAddPlayer={onAddPlayer}
              onNoPlayer={onNoPlayer}
            />
          );
        })}
      </Reorder.Group>

      {/* The opponents. They never move either. */}
      <div className="flex flex-col">
        {lines.map((line, index) => (
          <div
            key={`${pool.key}:${line.key}`}
            onPointerEnter={() => setHot(line.key)}
            onPointerLeave={() => setHot(null)}
            onFocus={() => setHot(line.key)}
            onBlur={() => setHot(null)}
            className={cn(
              "relative flex items-center border-b transition-colors duration-[var(--duration-hover)]",
              LINE_H,
              index === lines.length - 1 || hot === line.key
                ? "border-transparent"
                : "border-[var(--border-hairline)]",
              hot === line.key && !held && cn(LIT, "rounded-r-[8px]"),
              activeOpp === line.key && "z-20",
            )}
          >
            <span className={COL.opp}>
              <OpponentCell
                line={line}
                pool={pool}
                onTheirLabels={onTheirLabels}
                onTheirNoPlayer={onTheirNoPlayer}
                // Every cell reports on each render, so only THIS line may
                // clear itself — a sibling's "not active" must not drop the
                // open popup under the next row.
                onActiveChange={(active) =>
                  setActiveOpp((current) =>
                    active ? line.key : current === line.key ? null : current,
                  )
                }
              />
            </span>
            {trailing ? <span className={COL.trail} /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayerItem({
  token,
  line,
  lastLine,
  occupant,
  spot,
  held,
  hot,
  picking,
  reduceMotion,
  listRef,
  roster,
  singles,
  clashes,
  onHot,
  onPickingChange,
  onDragStart,
  onDragEnd,
  onKey,
  onOurLabels,
  onOurSelection,
  onAddPlayer,
  onNoPlayer,
}: {
  token: string;
  /** The line this occupant holds, or undefined on the bench. */
  line: LineupLine | undefined;
  lastLine: boolean;
  occupant: SinglesOccupant;
  spot: number | null;
  held: boolean;
  hot: boolean;
  picking: boolean;
  reduceMotion: boolean;
  listRef: React.RefObject<HTMLDivElement | null>;
  roster: LadderPlayer[];
  singles: readonly LineupLine[];
  clashes: ReadonlyMap<string, string>;
  onHot: (on: boolean) => void;
  onPickingChange: (open: boolean) => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onKey: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  onOurLabels: (key: string, value: string, added?: LadderPlayer) => void;
  onOurSelection: (
    key: string,
    selection: { ids: string[]; labels: string[] },
  ) => void;
  onAddPlayer: (key: string, player: LadderPlayer, value: string) => void;
  onNoPlayer: (key: string) => void;
}) {
  const controls = useDragControls();
  const label = occupant.labels.join(" / ");
  const benched = line === undefined;

  return (
    <Reorder.Item
      as="div"
      value={token}
      // Only the grip starts a drag, so typing in the name never moves a row.
      dragListener={false}
      dragControls={controls}
      dragConstraints={listRef}
      dragElastic={0.08}
      dragTransition={ROW_SETTLE}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      layout="position"
      transition={{ layout: reduceMotion ? { duration: 0 } : ROW_SLIDE }}
      onPointerEnter={() => onHot(true)}
      onPointerLeave={() => onHot(false)}
      onFocus={() => onHot(true)}
      onBlur={() => onHot(false)}
      className={cn(
        "group relative flex items-center gap-2 pr-4 transition-[background-color,box-shadow] duration-[var(--duration-hover)]",
        benched ? "h-[38px]" : cn(LINE_H, "border-b"),
        !benched &&
          (lastLine || hot || held
            ? "border-transparent"
            : "border-[var(--border-hairline)]"),
        hot && LIT,
        held &&
          "z-[3]! rounded-[8px] bg-[var(--surface-card)] shadow-[0_0_0_2px_var(--blue),var(--shadow-card-emphasis)]!",
        picking && "z-30!",
      )}
    >
      {held ? (
        <span
          aria-hidden
          className="mono tabular absolute top-1/2 -left-[86px] inline-flex size-5 -translate-y-1/2 items-center justify-center rounded-full bg-[var(--blue)] text-[10px] font-medium text-white"
        >
          {spot ?? "—"}
        </span>
      ) : null}

      <button
        id={gripId(token)}
        type="button"
        aria-label={`Move ${label || "empty line"}${spot ? `, line ${spot}` : ", not in the lineup"}`}
        aria-pressed={held}
        onPointerDown={(event) => {
          event.currentTarget.focus({ preventScroll: true });
          controls.start(event);
        }}
        onKeyDown={onKey}
        className={cn(
          "-ml-1 inline-flex h-7 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-[5px] text-[var(--ink-400)] transition-opacity duration-[var(--duration-hover)] active:cursor-grabbing",
          "focus-visible:opacity-100 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
          held || hot
            ? cn("opacity-100", held && "text-[var(--ink-900)]")
            : "opacity-0 group-hover:opacity-100",
        )}
      >
        <GripVertical className="size-3.5" strokeWidth={1.5} aria-hidden />
      </button>

      {benched ? (
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="opacity-60">
            <InitialsAvatar name={label} />
          </span>
          <span className="truncate text-[13px] text-[var(--ink-500)]">
            {label}
          </span>
        </span>
      ) : (
        <OurSingles
          line={line}
          occupant={occupant}
          singles={singles}
          clashes={clashes}
          roster={roster}
          onOurLabels={onOurLabels}
          onOurSelection={onOurSelection}
          onAddPlayer={onAddPlayer}
          onPickingChange={onPickingChange}
          onNoPlayer={onNoPlayer}
        />
      )}
    </Reorder.Item>
  );
}

/* ── The footer's progress pill ────────────────────────────────────────── */

/** A 14px ring filled to `set / total`, Signal Blue on a hairline track. */
function ProgressRing({ set, total }: { set: number; total: number }) {
  const r = 5.5;
  const circumference = 2 * Math.PI * r;
  const filled = total > 0 ? (set / total) * circumference : 0;
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      aria-hidden
      className="shrink-0 -rotate-90"
    >
      <circle
        cx="7"
        cy="7"
        r={r}
        fill="none"
        stroke="var(--border-hairline)"
        strokeWidth="1.5"
      />
      <circle
        cx="7"
        cy="7"
        r={r}
        fill="none"
        stroke="var(--blue)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference}`}
        className="transition-[stroke-dasharray] duration-[var(--duration-hover)] ease-[var(--ease-out-expo)] motion-reduce:transition-none"
      />
    </svg>
  );
}

/**
 * "7 of 9 lines set" — beside a Create dual that waits for nine.
 *
 * The button is disabled until the lineup is complete, and a disabled button
 * cannot say why; this does. It is a button: each click takes the coach to the
 * next line still to set, in reading order and wrapping round — the page
 * scrolls to it, the cursor lands in its name (the player list opens, "No
 * player" at its foot) or its pair picker opens. The line lifts the wash it
 * already wears on focus, so arriving needs no highlight of its own.
 *
 * Grey, never red: an unfinished lineup is not an error. The lines are found
 * by `data-line-unset` (their slot) inside `scope`, so this holds no copy of
 * which lines are set — the rows are the one answer.
 */
export function LineupProgress({
  set,
  total,
  scope,
}: {
  set: number;
  total: number;
  /** The step's content root — where the lineup rows live. */
  scope: React.RefObject<HTMLElement | null>;
}) {
  const reduceMotion = useReducedMotion();
  const lastSlot = useRef<string | null>(null);
  const left = total - set;

  function unsetLines(): HTMLElement[] {
    return Array.from(
      scope.current?.querySelectorAll<HTMLElement>("[data-line-unset]") ?? [],
    );
  }

  function goToNext() {
    const lines = unsetLines();
    if (lines.length === 0) return;
    const at = lines.findIndex(
      (line) => line.dataset.lineUnset === lastSlot.current,
    );
    const target = lines[(at + 1) % lines.length];
    lastSlot.current = target.dataset.lineUnset ?? null;

    target.scrollIntoView({
      block: "center",
      behavior: reduceMotion ? "auto" : "smooth",
    });
    // The pair trigger IS the marked element; a singles line marks the span
    // around its name field.
    if (target.matches("button")) {
      target.focus({ preventScroll: true });
      target.click();
      return;
    }
    target
      .querySelector<HTMLInputElement>("input")
      ?.focus({ preventScroll: true });
  }

  return (
    <button
      type="button"
      onClick={goToNext}
      aria-label={`${set} of ${total} lines set. ${left === 1 ? "Go to the line" : "Go to the next line"} still to set.`}
      className={cn(
        "inline-flex h-[26px] shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-[var(--surface-subtle)] pr-2.5 pl-2 text-[11px] font-medium whitespace-nowrap text-[var(--ink-700)]",
        "transition-colors duration-[var(--duration-hover)] hover:bg-[var(--ink-200)] active:bg-[var(--ink-200)]",
        "focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
      )}
    >
      <ProgressRing set={set} total={total} />
      <span>
        <span className="tabular text-[var(--ink-900)]">{set}</span> of{" "}
        <span className="tabular">{total}</span> lines set
      </span>
      {/* The count, said again as it changes — the button's own name is only
          read when focus reaches it. */}
      <span className="sr-only" aria-live="polite">
        {left === 1 ? "1 line to set" : `${left} lines to set`}
      </span>
    </button>
  );
}
