"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { nextRound } from "@/components/dashboard/schedule/add-result-row";
import { ScoreEntry } from "@/components/dashboard/schedule/score-entry";
import { ROUND_ORDER } from "@/lib/schedule/format";
import type { EventEntry } from "@/lib/schedule/types";

const SELECT_CLS =
  "w-full cursor-pointer appearance-none border-b border-[var(--border-hairline)] bg-transparent pb-1.5 text-[13px] text-[var(--ink-900)] outline-none";

/**
 * "Add result" for a tournament — the page-level version of `AddResultRow`.
 *
 * The inline row hangs off one entry, so it only ever asks for the round. From
 * the tournament page's header there is no entry yet, so this asks for three
 * things in the order a coach knows them: WHO played, WHICH round, then the
 * score. `ScoreEntry` is the same component the inline row uses, so a score
 * reaches `recordResult` through exactly one path — this file talks to no
 * database of its own.
 *
 * ── Forfeited entries are not offered ───────────────────────────────────────
 * A forfeited line must never mint a match (see `EventEntry.forfeit`), so the
 * picker filters them out rather than letting one be chosen and rejected later.
 * When that leaves nothing the dialog says so and renders no form at all — an
 * empty picker above a live score form is an invitation to save a result
 * against nobody.
 *
 * ── Why there is no Save button in this file ────────────────────────────────
 * `ScoreEntry` already renders the surface's Cancel + primary pair, and the
 * design system allows a dialog exactly one primary. A second one here would
 * break that rule and give the coach two things that look like the save.
 */
export function AddResultDialog({
  entries,
  open,
  onOpenChange,
}: {
  entries: EventEntry[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const eligible = entries.filter((entry) => entry.forfeit === null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className="gap-0 border-0 bg-[var(--surface-card)] p-0 sm:max-w-none"
        style={{
          width: "520px",
          maxWidth: "calc(100vw - 32px)",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--shadow-dropdown)",
        }}
      >
        <div className="flex flex-col gap-[18px] p-6 pb-5">
          <div className="flex items-start gap-2.5">
            <div className="flex-1">
              <DialogTitle className="text-left text-[16px] font-medium text-[var(--ink-900)]">
                Add result
              </DialogTitle>
              <DialogDescription className="mt-1 text-left text-[12px] leading-[1.55] text-[var(--ink-600)]">
                Pick the player, the round, then type the score.
              </DialogDescription>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => onOpenChange(false)}
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
            >
              <X className="size-3.5" strokeWidth={1.5} aria-hidden />
            </button>
          </div>

          {eligible.length === 0 ? (
            <p className="text-[13px] text-[var(--ink-600)]">
              Every entry has forfeited
            </p>
          ) : (
            <AddResultForm eligible={eligible} onOpenChange={onOpenChange} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The picker and the score form, as a child of `DialogContent`.
 *
 * Split out so that "reset on every open" is structural rather than an effect:
 * Radix unmounts the portal when the dialog closes, so this mounts fresh each
 * time and its `useState` initializer runs again. A `useState` in the parent
 * would keep offering whoever was chosen last time, and — because
 * `recordResult` de-duplicates on (entry, round) — a stale round does not just
 * default wrong, it UPDATES the result already recorded and the earlier score
 * disappears with no error.
 */
function AddResultForm({
  eligible,
  onOpenChange,
}: {
  eligible: EventEntry[];
  onOpenChange: (open: boolean) => void;
}) {
  const [chosenId, setChosenId] = useState(eligible[0]?.id ?? "");
  const chosen = eligible.find((entry) => entry.id === chosenId) ?? eligible[0];

  return (
    <>
      <label className="flex flex-col gap-1.5">
        <span className="eyebrow">Player</span>
        <select
          value={chosen.id}
          onChange={(event) => setChosenId(event.target.value)}
          className={SELECT_CLS}
        >
          {eligible.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.playerLabels.join(" / ")}
            </option>
          ))}
        </select>
      </label>

      {/*
        Keyed on the entry, so picking a different player re-runs the round
        suggestion and clears the score cells rather than carrying the previous
        player's half-typed sets across.
      */}
      <RoundAndScore
        key={chosen.id}
        entry={chosen}
        onOpenChange={onOpenChange}
      />
    </>
  );
}

function RoundAndScore({
  entry,
  onOpenChange,
}: {
  entry: EventEntry;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [round, setRound] = useState(() => nextRound(entry));

  return (
    <>
      <label className="flex flex-col gap-1.5">
        <span className="eyebrow">Round</span>
        <select
          value={round}
          onChange={(event) => setRound(event.target.value)}
          className={SELECT_CLS}
        >
          {ROUND_ORDER.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <ScoreEntry
        entryId={entry.id}
        ourLabel={entry.playerLabels[0] ?? "Our player"}
        round={round}
        initialOpponent=""
        onDone={() => {
          onOpenChange(false);
          router.refresh();
        }}
      />
    </>
  );
}
