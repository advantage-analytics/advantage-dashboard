"use client";

import { Plus, X } from "lucide-react";
import { splitNames } from "@/lib/schedule/format";
import type { LadderPlayer } from "@/lib/data/roster-server";

export interface DraftEntry {
  key: string;
  discipline: "singles" | "doubles";
  labels: string[];
  userIds: string[];
  draw: string;
  seed: string;
}

const DRAWS = ["Main draw", "Qualifying", "Consolation", "Flight A", "Flight B"];

const GRID = "grid grid-cols-[1fr_220px_140px] items-center gap-4";

/**
 * 25e's entry list — who is going, and where they start.
 *
 * An entry is a player in a draw, not a match. Nothing here creates a fixture:
 * a tournament match exists once it is played, which is why the footer promises
 * entries and no matches. Draw moves — qualifying into the main draw, a loss
 * into consolation — are recorded per result on the event page rather than by
 * editing the entry, because a run through two draws is one player's weekend
 * and not two entries.
 */
export function EntryEditor({
  title,
  addLabel,
  entries,
  roster,
  onChange,
}: {
  title: string;
  addLabel: string;
  entries: DraftEntry[];
  roster: LadderPlayer[];
  onChange: (entries: DraftEntry[]) => void;
}) {
  const discipline = addLabel === "Add pair" ? "doubles" : "singles";

  function add() {
    onChange([
      ...entries,
      {
        key: `${discipline}-${entries.length}-${Date.now()}`,
        discipline,
        labels: [],
        userIds: [],
        draw: "Main draw",
        seed: "",
      },
    ]);
  }

  function update(key: string, patch: Partial<DraftEntry>) {
    onChange(
      entries.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry))
    );
  }

  return (
    <div>
      <div className="flex items-baseline gap-2.5 border-b border-[var(--border-hairline)] pb-2.5">
        <span className="eyebrow">{title}</span>
        <div className="flex-1" />
        <button
          type="button"
          onClick={add}
          className="inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-[var(--blue-text)]"
        >
          <Plus strokeWidth={2} className="size-3" />
          {addLabel}
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="text-micro py-3" style={{ color: "var(--ink-500)" }}>
          Nobody yet.
        </p>
      ) : null}

      {entries.map((entry, index) => (
        <div
          key={entry.key}
          className={`${GRID} py-3 ${index < entries.length - 1 ? "border-b border-[var(--border-hairline)]" : ""}`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="h-3 w-0.5 shrink-0 bg-[var(--blue)]" />
            <input
              list="schedule-roster"
              value={entry.labels.join(" / ")}
              placeholder={discipline === "doubles" ? "Name / Name" : "Name"}
              onChange={(event) => {
                // Raw, as one element. Trimming per keystroke eats the space
                // the user just pressed — see splitNames()'s note. Roster ids
                // are resolved from the split form, which is stable enough for
                // matching while the raw text keeps typing usable.
                const raw = event.target.value;
                const userIds = splitNames(raw)
                  .map(
                    (label) =>
                      roster.find(
                        (player) =>
                          player.name.toLowerCase() === label.toLowerCase()
                      )?.userId
                  )
                  .filter((id): id is string => Boolean(id));
                update(entry.key, { labels: [raw], userIds });
              }}
              className="w-full min-w-0 bg-transparent text-[14px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-300)]"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={entry.draw}
              onChange={(event) => update(entry.key, { draw: event.target.value })}
              className="cursor-pointer bg-transparent text-[12px] text-[var(--ink-700)] outline-none"
            >
              {DRAWS.map((draw) => (
                <option key={draw} value={draw}>
                  {draw}
                </option>
              ))}
            </select>
            <input
              value={entry.seed}
              inputMode="numeric"
              placeholder="seed"
              onChange={(event) =>
                update(entry.key, {
                  seed: event.target.value.replace(/[^0-9]/g, ""),
                })
              }
              className="tabular w-12 bg-transparent text-[12px] text-[var(--ink-700)] outline-none placeholder:text-[var(--ink-300)]"
            />
          </div>

          <div className="text-right">
            <button
              type="button"
              aria-label="Remove entry"
              onClick={() =>
                onChange(entries.filter((other) => other.key !== entry.key))
              }
              className="inline-flex cursor-pointer items-center gap-1 text-[11px] font-medium text-[var(--ink-500)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--danger)]"
            >
              <X strokeWidth={2} className="size-3" />
              Remove
            </button>
          </div>
        </div>
      ))}

      <datalist id="schedule-roster">
        {roster.map((player) => (
          <option key={player.userId} value={player.name} />
        ))}
      </datalist>
    </div>
  );
}
