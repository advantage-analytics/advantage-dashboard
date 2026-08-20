"use client";

import Link from "next/link";
import { CornerDownRight, Check } from "lucide-react";
import type { EventPreset } from "./types";

/**
 * Step 1, in a team workspace — 22f's pinned destination.
 *
 * The personal wizard asks "where do the numbers come from?" here. In a team
 * workspace that question has one answer: the lineup already minted this line
 * and the result already named the players, so video IS the source and the only
 * thing worth confirming is which match the file belongs to.
 *
 * Editable, not locked. Arriving from the wrong row should cost a click, not a
 * restart.
 */
export function PinnedMatchContent({ preset }: { preset: EventPreset }) {
  const known: { label: string; value: string }[] = [
    { label: "Match", value: `${preset.playerName} vs ${preset.opponentName}` },
    { label: "Event", value: preset.eventName },
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
          {preset.playerName} vs {preset.opponentName} · {preset.eventName}
        </span>
        <Link
          href={preset.eventHref}
          className="shrink-0 text-[11px] font-medium text-[var(--blue)]"
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
