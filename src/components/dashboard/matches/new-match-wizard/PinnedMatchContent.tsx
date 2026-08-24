"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Check, CornerDownRight, Layers, Search } from "lucide-react";
import { normalizedPersonName } from "@/lib/data/person-name";
import type { EventPreset } from "./types";

/**
 * Step 1, in a team workspace.
 *
 * The personal wizard asks "where do the numbers come from?" here. A team
 * workspace already knows — so this slot answers a different question depending
 * on what kind of match it is:
 *
 *   line   — 22f's pinned destination. The lineup minted this court and the
 *            result named the players, so there is nothing to ask at all.
 *   single — 25h's one team question. A challenge, practice set or outside
 *            event has no lineup, so the only thing the workspace cannot infer
 *            is WHOSE match it is.
 *
 * Either way steps 2–4 are the personal wizard's own, unchanged.
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
  if (preset.kind === "single") {
    return (
      <SinglePlayerPicker
        roster={preset.roster ?? []}
        playerName={playerName}
        onPick={onPickPlayer}
      />
    );
  }
  return <PinnedLine preset={preset} />;
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
          */}
          {term.trim() && !shown.some((p) => p.name === term.trim()) ? (
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

/** 22f — the destination, already known. */
function PinnedLine({ preset }: { preset: EventPreset }) {
  const known: { label: string; value: string }[] = [
    { label: "Match", value: `${preset.playerName} vs ${preset.opponentName}` },
    ...(preset.eventName ? [{ label: "Event", value: preset.eventName }] : []),
    ...(preset.round ? [{ label: "Line", value: preset.round }] : []),
    { label: "Date", value: preset.date },
    ...(preset.surface ? [{ label: "Surface", value: preset.surface }] : []),
    {
      label: "Format",
      value: `Best of ${preset.bestOf}, ${
        preset.adScoring === null ? "scoring unset" : preset.adScoring ? "ad" : "no-ad"
      }`,
    },
    ...(preset.score
      ? [
          {
            label: "Score",
            value: preset.score.player1
              .map((game, index) => `${game}–${preset.score?.player2[index] ?? 0}`)
              .join(" "),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2.5 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-3.5 py-2.5">
        <CornerDownRight
          strokeWidth={1.5}
          className="size-[13px] shrink-0 text-[var(--ink-600)]"
        />
        <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-900)]">
          {preset.round ? `${preset.round} · ` : ""}
          {preset.playerName} vs {preset.opponentName}
          {preset.eventName ? ` · ${preset.eventName}` : ""}
        </span>
        <Link
          href={preset.eventHref}
          className="shrink-0 text-[11px] font-medium text-[var(--blue-text)]"
        >
          Change
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        <span className="eyebrow">What the event already knows</span>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2.5">
          {known.map((fact) => (
            <div key={fact.label} className="flex items-baseline gap-2">
              <Check
                strokeWidth={2}
                className="size-3 shrink-0 translate-y-0.5 text-[var(--ink-600)]"
              />
              <span
                className="text-micro w-[62px] shrink-0"
                style={{ color: "var(--ink-500)" }}
              >
                {fact.label}
              </span>
              <span className="min-w-0 truncate text-[12px] text-[var(--ink-900)]">
                {fact.value}
              </span>
            </div>
          ))}
        </div>
        <p
          className="text-[12px] leading-[1.55]"
          style={{ color: "var(--ink-700)" }}
        >
          None of it is re-asked here. If something is wrong, correct it on the
          event — a value typed twice is a value that can disagree with itself.
        </p>
      </div>

      {preset.supportsVideo ? null : (
        <p className="text-[12px] leading-[1.55]" style={{ color: "var(--danger)" }}>
          This is a doubles line, and video analysis is singles only. Import a
          SwingVision export from the event instead.
        </p>
      )}
    </div>
  );
}
