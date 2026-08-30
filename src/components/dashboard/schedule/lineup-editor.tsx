"use client";

import { useState } from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  OpponentNameCell,
  type OpponentTarget,
} from "@/components/dashboard/schedule/opponent-name-cell";
import type { LadderPlayer } from "@/lib/data/roster-server";

export interface LineupLine {
  key: string;
  slot: string;
  discipline: "singles" | "doubles";
  /** Roster ids where we know them; empty for a name typed in place. */
  ourIds: string[];
  ourLabels: string[];
  theirLabels: string[];
  /**
   * Which side forfeited this line, or null for a normal line.
   *
   * The builder can only ever set `"ours"`. A forfeit here means *we* cannot
   * field a player — that is the only side knowable while writing our own
   * lineup, and it is the one design 2b draws ("— no available player"). The
   * opponent forfeiting is discovered on match day, so `line-row.tsx` on the
   * event page carries the two-sided picker instead.
   *
   * `"ours"` awards the point to THEM. Getting that backwards would hand a
   * team a point it did not win with nothing on screen looking broken.
   */
  forfeit: "ours" | null;
}

/** Which column a drag is happening in. The two reorder independently. */
type Column = "ours" | "theirs";

const GRID =
  "grid grid-cols-[18px_36px_1.15fr_22px_1fr_70px] items-center gap-3";

/**
 * 25b's lineup — six singles, three doubles, both sides editable.
 *
 * The two columns reorder independently on purpose. A coach who learns the
 * opposing S1 is out shuffles their opponents down without touching their own
 * ladder, and a lineup editor that moved both together would force them to
 * re-enter their own side to fix the other one.
 *
 * Drag is native HTML5 with an ArrowUp/ArrowDown fallback on the grip. No drag
 * library: nine rows do not earn a dependency, and the keyboard path is the one
 * a library would most likely get wrong anyway.
 */
export function LineupEditor({
  lines,
  bench,
  onChange,
  ourName,
  theirName,
  opponentTarget,
}: {
  lines: LineupLine[];
  bench: LadderPlayer[];
  onChange: (lines: LineupLine[]) => void;
  ourName: string;
  theirName: string;
  /** The current opponent as the name popovers see it — `dual-form` builds
   *  it, and its `key` is what remounts every cell on a re-target. */
  opponentTarget: OpponentTarget;
}) {
  const [dragging, setDragging] = useState<{
    column: Column;
    index: number;
  } | null>(null);

  const singles = lines.filter((line) => line.discipline === "singles");
  const doubles = lines.filter((line) => line.discipline === "doubles");

  /**
   * Move one column's occupant from one row to another, leaving slots put.
   *
   * The slot is the court, not the player — dragging S3 above S2 means those
   * two players swap courts, so the labels move and `slot` stays where it is.
   *
   * **Forfeited rows are not courts and take no part in this.** They hold no
   * occupant, they render as "— no available player" whatever is in state, and
   * `dual-form` writes them empty — so letting one into the rotation would
   * shuffle a real player into a row that shows nobody and then submit that
   * player as nobody. The reorder runs over the playable rows only; a drop on
   * a forfeited row, or an arrow key that would step onto one, carries past it
   * to the next playable court in the direction of travel.
   */
  function move(
    discipline: LineupLine["discipline"],
    column: Column,
    from: number,
    to: number
  ) {
    const group = lines.filter((line) => line.discipline === discipline);
    if (to < 0 || to >= group.length || from === to) return;

    // Indices into `group` — which is what the rendered rows are numbered by,
    // forfeited rows included — that can actually hold somebody.
    const playable = group
      .map((line, index) => (line.forfeit === null ? index : -1))
      .filter((index) => index >= 0);

    const fromPos = playable.indexOf(from);
    if (fromPos < 0) return;

    // A forfeited destination is stepped over, not refused: an arrow key that
    // stops dead on the row above a forfeit reads as a broken key.
    const step = to > from ? 1 : -1;
    let target = to;
    while (target >= 0 && target < group.length && group[target].forfeit !== null) {
      target += step;
    }
    const toPos = playable.indexOf(target);
    if (toPos < 0 || toPos === fromPos) return;

    const field = column === "ours" ? "ourLabels" : "theirLabels";
    const idField = column === "ours" ? "ourIds" : null;

    const occupants = playable.map((index) => ({
      labels: group[index][field],
      ids: idField ? group[index][idField] : [],
    }));
    const [lifted] = occupants.splice(fromPos, 1);
    occupants.splice(toPos, 0, lifted);

    const rewritten = group.map((line, index) => {
      const pos = playable.indexOf(index);
      if (pos < 0) return line;
      return {
        ...line,
        [field]: occupants[pos].labels,
        ...(idField ? { [idField]: occupants[pos].ids } : {}),
      };
    });

    const byKey = new Map(rewritten.map((line) => [line.key, line]));
    onChange(lines.map((line) => byKey.get(line.key) ?? line));
  }

  function setLabels(key: string, column: Column, value: string) {
    onChange(
      lines.map((line) =>
        line.key === key
          ? {
              ...line,
              // Stored raw, as one element. Splitting on "/" and trimming here
              // would run on every keystroke and eat the space the user just
              // pressed — "Dana Brooks" could only be typed as "DanaBrooks".
              // splitNames() does that work at the boundaries instead.
              [column === "ours" ? "ourLabels" : "theirLabels"]: [value],
              // A name typed over a rostered player is a different person. Drop
              // the id rather than attributing their match to whoever was here.
              ...(column === "ours" ? { ourIds: [] } : {}),
            }
          : line
      )
    );
  }

  /**
   * Forfeit a line, or take the forfeit back.
   *
   * Forfeiting clears both sides of the row rather than hiding names that are
   * still in state. Two reasons, and they point the same way: the row then
   * says what it means — a forfeited line has nobody on it — and the player
   * returns to the bench, which is where a late scratch belongs, since
   * `benchFromLines` reads `ourLabels` alone. Nothing invisible is carried
   * into `createDual`; what the row shows is what gets written.
   *
   * Taking the forfeit back leaves the row empty rather than restoring the
   * name. The coach is choosing who plays that court either way, and a
   * restored name would be the form guessing at one.
   */
  function setForfeited(key: string, forfeited: boolean) {
    onChange(
      lines.map((line) =>
        line.key === key
          ? {
              ...line,
              forfeit: forfeited ? "ours" : null,
              ourIds: [],
              ourLabels: [],
              theirLabels: [],
            }
          : line
      )
    );
  }

  function renderGroup(group: LineupLine[], discipline: LineupLine["discipline"]) {
    return group.map((line, index) =>
      line.forfeit !== null ? (
        <ForfeitedRow
          key={line.key}
          line={line}
          onClear={() => setForfeited(line.key, false)}
        />
      ) : (
      <div
        key={line.key}
        className={cn(
          GRID,
          "group/line py-2.5",
          dragging?.index === index && "opacity-60"
        )}
      >
        <Grip
          label={`Reorder ${line.ourLabels.join(" / ") || line.slot}`}
          onDragStart={() => setDragging({ column: "ours", index })}
          onDragEnd={() => setDragging(null)}
          onDrop={() => {
            if (dragging?.column === "ours") move(discipline, "ours", dragging.index, index);
            setDragging(null);
          }}
          onMove={(delta) => move(discipline, "ours", index, index + delta)}
        />
        <span className="mono text-[11px]" style={{ color: "var(--ink-600)" }}>
          {line.slot}
        </span>
        <NameField
          value={line.ourLabels.join(" / ")}
          placeholder={discipline === "doubles" ? "Name / Name" : "Name"}
          onChange={(value) => setLabels(line.key, "ours", value)}
        />
        <span className="text-micro" style={{ color: "var(--ink-400)" }}>
          vs
        </span>
        <div className="flex items-center gap-2">
          <Grip
            label={`Reorder ${line.theirLabels.join(" / ") || `their ${line.slot}`}`}
            onDragStart={() => setDragging({ column: "theirs", index })}
            onDragEnd={() => setDragging(null)}
            onDrop={() => {
              if (dragging?.column === "theirs") {
                move(discipline, "theirs", dragging.index, index);
              }
              setDragging(null);
            }}
            onMove={(delta) => move(discipline, "theirs", index, index + delta)}
          />
          {/* Keyed on the opponent too: a re-target must remount the popover,
              so no draft, suggestion highlight or pending "saved" toast typed
              against the last school can survive into this one. */}
          <OpponentNameCell
            key={`${line.key}:${opponentTarget.key}`}
            value={line.theirLabels.join(" / ")}
            discipline={line.discipline}
            target={opponentTarget}
            onCommit={(value) => setLabels(line.key, "theirs", value)}
          />
        </div>

        {/* Quiet until the row is hovered or the button is focused, as 2b
            draws it — a destructive-ish action that should not compete with
            the names for attention, but must still be reachable by keyboard. */}
        <button
          type="button"
          onClick={() => setForfeited(line.key, true)}
          className="text-micro rounded-[3px] text-right opacity-0 outline-none transition-opacity group-hover/line:opacity-100 focus-visible:opacity-100 focus-visible:shadow-[var(--focus-ring)]"
          style={{ color: "var(--blue)" }}
        >
          Forfeit
        </button>
      </div>
      )
    );
  }

  return (
    <div className="flex flex-col">
      <div className={cn(GRID, "pb-1.5 pt-2.5")}>
        <span />
        <span />
        <div className="flex items-center gap-2">
          <span className="h-3 w-0.5 bg-[var(--player-1)]" />
          <span className="eyebrow">{ourName}</span>
        </div>
        <span />
        <div className="flex items-center gap-2">
          <span className="h-3 w-0.5 bg-[var(--player-2)]" />
          <span className="eyebrow" style={{ color: "var(--player-2-text)" }}>
            {theirName || "Opponent"}
          </span>
        </div>
        <span />
      </div>

      {renderGroup(singles, "singles")}

      <div className="mt-[22px]">
        <div className="flex items-baseline gap-2.5 border-b border-[var(--border-hairline)] pb-2.5">
          <span className="eyebrow">Lineup · doubles</span>
          <span className="text-micro" style={{ color: "var(--ink-500)" }}>
            three required · pairs carried from singles
          </span>
        </div>
        {renderGroup(doubles, "doubles")}
      </div>

      {bench.length > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-2.5 border-t border-[var(--border-hairline)] pt-[11px]">
          <span className="text-micro" style={{ color: "var(--ink-500)" }}>
            Not in — drag onto a line to sub in
          </span>
          {bench.map((player) => (
            <span
              key={player.userId}
              draggable
              onDragStart={(event) =>
                event.dataTransfer.setData("text/plain", player.name)
              }
              className="inline-flex cursor-grab items-center gap-[7px] rounded-full bg-[var(--surface-subtle)] px-[11px] py-1 text-[12px] text-[var(--ink-900)]"
            >
              <GripVertical
                strokeWidth={1.5}
                className="size-[11px] text-[var(--ink-400)]"
              />
              {player.name}
              {player.ladderPosition !== null ? (
                <span
                  className="mono tabular text-[10px]"
                  style={{ color: "var(--ink-600)" }}
                >
                  {player.ladderPosition}
                </span>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}

      <p className="text-micro mt-2.5" style={{ color: "var(--ink-500)" }}>
        All nine lines are expected — forfeit a line only when a team can&rsquo;t
        field a player for it. Either column drags to reorder; your names edit
        in place, opposing names go through the add-name popover.
      </p>
    </div>
  );
}

/**
 * A forfeited line, as design 2b's S6 draws it.
 *
 * No grip, no name field, no opponent affordance and no score: a forfeited
 * line is not a court anyone is standing on, and every control that implies
 * otherwise is gone. `dualScore` still counts it — as a point for the other
 * side — so the dual totals nine.
 *
 * The design draws "Forfeited" as plain text with no way back. It is a button
 * here because the marker has to be clearable (a mis-click on a hover-revealed
 * action is easy), and it keeps the design's exact type and colour so the row
 * still reads as a statement rather than an offer.
 */
function ForfeitedRow({
  line,
  onClear,
}: {
  line: LineupLine;
  onClear: () => void;
}) {
  return (
    <div className={cn(GRID, "py-2.5")}>
      <span />
      <span className="mono text-[11px]" style={{ color: "var(--ink-600)" }}>
        {line.slot}
      </span>
      <span className="text-[13px]" style={{ color: "var(--ink-500)" }}>
        — no available player
      </span>
      <span />
      <span />
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear the forfeit on ${line.slot}`}
        title="Clear the forfeit"
        className="text-micro rounded-[3px] text-right outline-none hover:text-[var(--blue)] focus-visible:shadow-[var(--focus-ring)]"
        style={{ color: "var(--ink-500)" }}
      >
        Forfeited
      </button>
    </div>
  );
}

function Grip({
  label,
  onDragStart,
  onDragEnd,
  onDrop,
  onMove,
}: {
  label: string;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  onMove: (delta: number) => void;
}) {
  return (
    <button
      type="button"
      draggable
      aria-label={label}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          onMove(-1);
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          onMove(1);
        }
      }}
      className="flex cursor-grab items-center justify-center rounded-[3px] outline-none focus-visible:shadow-[var(--focus-ring)]"
    >
      <GripVertical strokeWidth={1.5} className="size-3 text-[var(--ink-300)]" />
    </button>
  );
}

function NameField({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      onDrop={(event) => {
        // A bench pill carries its name as plain text, so dropping one onto a
        // line substitutes that player in — the sub-in 25b describes.
        const dropped = event.dataTransfer.getData("text/plain");
        if (!dropped) return;
        event.preventDefault();
        onChange(dropped);
      }}
      data-focus-ring="none" /* the border-b above carries focus */
      className="w-full min-w-0 bg-transparent text-[13px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-300)] focus:border-b focus:border-[var(--blue)]"
    />
  );
}
