"use client";

import { useMemo, useState } from "react";
import { Check, Layers, Search } from "lucide-react";
import { normalizedPersonName } from "@/lib/data/person-name";
import type { EventPreset } from "./types";

/**
 * Step 1, for a single match in a team workspace.
 *
 * A challenge, practice set or outside event has no lineup, so the only
 * thing the workspace cannot infer is WHOSE match it is. (A line preset never
 * shows step 1 at all: it arrives answered and opens on the file step, with
 * the line pinned in a bar — see `PinnedLineBar`.)
 */
export function PinnedMatchContent({
  preset,
  playerName,
  onPickPlayer,
}: {
  preset: EventPreset;
  /** The current form value, so the picker can show what is chosen. */
  playerName: string;
  onPickPlayer: (name: string, userId: string | null) => void;
}) {
  return (
    <SinglePlayerPicker
      roster={preset.roster ?? []}
      playerName={playerName}
      onPick={onPickPlayer}
    />
  );
}

/** 25h — whose match is this? */
function SinglePlayerPicker({
  roster,
  playerName,
  onPick,
}: {
  roster: NonNullable<EventPreset["roster"]>;
  playerName: string;
  /**
   * `userId` is null for a name typed by hand — that is the answer, not a
   * gap. Writing the uploader's id there would attribute the match to them.
   */
  onPick: (name: string, userId: string | null) => void;
}) {
  const [term, setTerm] = useState("");

  // Narrowing only — the id still comes from the row that gets clicked, never
  // from the text. Both sides go through `normalizedPersonName` so the search
  // is asking the same question about whitespace that the rest of the app does:
  // a roster row spelled "Dana  Brooks" was previously unreachable by typing
  // her name.
  const shown = useMemo(() => {
    const needle = normalizedPersonName(term);
    if (!needle) return roster;
    return roster.filter((player) =>
      normalizedPersonName(player.name).includes(needle)
    );
  }, [roster, term]);

  return (
    // Stacked, not 25h's two columns. That frame is 1280px wide; the wizard's
    // content column is 780px, where side-by-side squeezes the checklist into
    // three words per line. The order is the same and so is the content.
    <div className="flex flex-col gap-7">
      <div>
        <div className="flex items-center gap-[11px] border-b-2 border-[var(--blue)] px-[13px] py-2.5">
          <Search strokeWidth={1.5} className="size-3.5 text-[var(--ink-600)]" />
          <input
            autoFocus
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder={roster.length ? "Search the roster" : "Type a name"}
            className="w-full bg-transparent text-[13px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-300)]"
          />
        </div>

        <div className="mt-2 flex flex-col">
          {shown.map((player) => {
            const chosen = player.name === playerName;
            return (
              <button
                key={player.userId}
                type="button"
                onClick={() => onPick(player.name, player.userId)}
                className={`flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-element)] px-[13px] py-2.5 text-left transition-colors duration-[var(--duration-hover)] ${
                  chosen ? "bg-[var(--blue-soft)]" : "hover:bg-[var(--surface-subtle)]"
                }`}
              >
                <span className="flex-1 text-[13px] text-[var(--ink-900)]">
                  {player.name}
                </span>
                {player.ladderPosition !== null ? (
                  <span className="text-micro" style={{ color: "var(--ink-600)" }}>
                    S{player.ladderPosition}
                  </span>
                ) : null}
                {chosen ? (
                  <Check strokeWidth={2} className="size-3.5 text-[var(--blue)]" />
                ) : null}
              </button>
            );
          })}

          {/*
            A roster is not a closed list. Challenge matches get played by people
            who have not accepted an invite yet, and a picker that refused them
            would push the coach to attribute the match to somebody else.

            Offered only when the typed name reaches NOBODY on the roster, and
            asking that with the same rule the list above filters by. Compared
            raw, a roster row stored as "Dana  Brooks" shows up in the list
            AND under this button — two rows that look identical, one of which
            hands `onPick` a null id. That null becomes `player1_id`, so the
            match is written unattributed for an athlete who is on the roster,
            and `player1_id` is half the SELECT policy on `matches` — she
            cannot read her own match.
          */}
          {term.trim() &&
          !shown.some(
            (p) => normalizedPersonName(p.name) === normalizedPersonName(term)
          ) ? (
            <button
              type="button"
              onClick={() => onPick(term.trim(), null)}
              className={`flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-element)] px-[13px] py-2.5 text-left transition-colors duration-[var(--duration-hover)] ${
                playerName === term.trim()
                  ? "bg-[var(--blue-soft)]"
                  : "hover:bg-[var(--surface-subtle)]"
              }`}
            >
              <span className="flex-1 text-[13px] text-[var(--ink-900)]">
                Use &ldquo;{term.trim()}&rdquo;
              </span>
              <span className="text-micro" style={{ color: "var(--ink-600)" }}>
                not on the roster
              </span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-w-0">
        <span className="eyebrow">Then — nothing team-specific left</span>
        <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-[9px]">
          <Known done>Workspace &amp; season — known</Known>
          <Known done={Boolean(playerName)}>
            Player — {playerName ? `${playerName}` : "picked here"}
          </Known>
          <Known>Opponent · date · site · surface — details step</Known>
          <Known>Score — only if courtside entry missed it</Known>
          <Known>Video answers — camera end, starting side</Known>
        </div>

        <div className="mt-[18px] flex items-center gap-[9px] rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-[13px] py-2.5">
          <Layers
            strokeWidth={1.5}
            className="size-[13px] shrink-0 text-[var(--blue)]"
          />
          <span className="text-[12px]" style={{ color: "var(--ink-700)" }}>
            Challenge matches, practice sets and outside events all land here —
            they count toward the player&rsquo;s season, not a team score.
          </span>
        </div>
      </div>
    </div>
  );
}

function Known({ done, children }: { done?: boolean; children: React.ReactNode }) {
  return (
    <span
      className="flex gap-[7px] text-[12px] leading-[1.5]"
      style={{ color: "var(--ink-700)" }}
    >
      {done ? (
        <Check
          strokeWidth={2}
          className="mt-[3px] size-[11px] shrink-0 text-[var(--ink-600)]"
        />
      ) : (
        <span
          className="w-[11px] shrink-0 text-center"
          style={{ color: "var(--ink-400)" }}
        >
          +
        </span>
      )}
      {children}
    </span>
  );
}
