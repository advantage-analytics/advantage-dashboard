"use client";

import { useState } from "react";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LadderPlayer } from "@/lib/data/roster-server";

export interface LineupLine {
  key: string;
  slot: string;
  discipline: "singles" | "doubles";
  /** Roster ids where we know them; empty for a name typed in place. */
  ourIds: string[];
  ourLabels: string[];
  theirLabels: string[];
}

/** Which column a drag is happening in. The two reorder independently. */
type Column = "ours" | "theirs";

const GRID = "grid grid-cols-[18px_36px_1.15fr_22px_1fr] items-center gap-3";

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
}: {
  lines: LineupLine[];
  bench: LadderPlayer[];
  onChange: (lines: LineupLine[]) => void;
  ourName: string;
  theirName: string;
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
   */
  function move(
    discipline: LineupLine["discipline"],
    column: Column,
    from: number,
    to: number
  ) {
    const group = lines.filter((line) => line.discipline === discipline);
    if (to < 0 || to >= group.length || from === to) return;

    const field = column === "ours" ? "ourLabels" : "theirLabels";
    const idField = column === "ours" ? "ourIds" : null;

    const occupants = group.map((line) => ({
      labels: line[field],
      ids: idField ? line[idField] : [],
    }));
    const [lifted] = occupants.splice(from, 1);
    occupants.splice(to, 0, lifted);

    const rewritten = group.map((line, index) => ({
      ...line,
      [field]: occupants[index].labels,
      ...(idField ? { [idField]: occupants[index].ids } : {}),
    }));

    const byKey = new Map(rewritten.map((line) => [line.key, line]));
    onChange(lines.map((line) => byKey.get(line.key) ?? line));
  }

  function setLabels(key: string, column: Column, value: string) {
    const parts = value.split("/").map((part) => part.trim()).filter(Boolean);
    onChange(
      lines.map((line) =>
        line.key === key
          ? {
              ...line,
              [column === "ours" ? "ourLabels" : "theirLabels"]:
                parts.length > 0 ? parts : [],
              // A name typed over a rostered player is a different person. Drop
              // the id rather than attributing their match to whoever was here.
              ...(column === "ours" ? { ourIds: [] } : {}),
            }
          : line
      )
    );
  }

  function renderGroup(group: LineupLine[], discipline: LineupLine["discipline"]) {
    return group.map((line, index) => (
      <div
        key={line.key}
        className={cn(
          GRID,
          "py-2.5",
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
          <NameField
            value={line.theirLabels.join(" / ")}
            placeholder={discipline === "doubles" ? "Name / Name" : "Name"}
            onChange={(value) => setLabels(line.key, "theirs", value)}
          />
        </div>
      </div>
    ));
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
      </div>

      {renderGroup(singles, "singles")}

      <div className="mt-[18px]">
        <div className="flex items-baseline gap-2.5 border-b border-[var(--border-hairline)] pb-2">
          <span className="eyebrow">Doubles</span>
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
        Either column drags to reorder — your ladder or their lineup,
        independently. Names stay editable in place.
      </p>
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
      className="w-full min-w-0 bg-transparent text-[13px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-300)] focus:border-b focus:border-[var(--blue)]"
    />
  );
}
