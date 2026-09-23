"use client";

/**
 * ScoreOnlyFlow — the upload wizard with its video half switched off.
 *
 * Same chrome, deliberately: the full-bleed 2px step indicator under the app
 * header, the `PinnedLineBar` full bleed beneath it, the 832px centred column
 * with its "Step N of M" eyebrow, and the sticky 64px footer. A coach filling
 * in a weekend's results is doing the same thing they do when they upload,
 * minus the file — so it should be the same room, not a second one.
 *
 * One step, one question: the result. This file reaches for no database client,
 * no wizard hook and no browser storage. It is the only place a played score
 * or a stopped match is written from the schedule — `recordResult` and
 * `setOutcome` have one caller here, and `planSave` decides which.
 *
 * **The reseed is the load-bearing detail.** Switching lines remounts the form
 * (`key={outcomeKey(entryId, round)}`), so the previous line's choice and
 * digits cannot survive into the next one. A shared, mutated form is how S2
 * gets S1's 6-4.
 *
 * A tournament entry adds one question, the round, and answers it by
 * NAVIGATING (`?round=`) rather than in state: the page seeds the form from
 * whatever that round already holds, which is the only honest way to open a
 * recorded round for correction. See `score/page.tsx`.
 */

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Check, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { advButton } from "@/lib/ui/adv-button";
import { recordResult, setOutcome } from "@/lib/schedule/actions";
import {
  ROUND_ORDER,
  doublesSetLabel,
  splitNames,
} from "@/lib/schedule/format";
import {
  outcomeKey,
  planSave,
  savedLineUpload,
  scoreTyped,
  seedScoreForm,
  uploadInsteadHref,
  type SavedLineUpload,
  type ScoreFormState,
} from "@/lib/schedule/score-seed";
import { endingMark } from "@/lib/schedule/entry-state";
import {
  OpponentPopup,
  useOpponentPool,
  type OpponentPool,
} from "@/components/dashboard/schedule/static/opponent-popup";
import {
  OpponentPairPicker,
  opponentPairChoices,
  opponentPairedOn,
} from "@/components/dashboard/schedule/static/lineup-rows";
import { MenuSelect } from "@/components/ui/menu-select";
import { StepIndicator } from "@/components/dashboard/matches/new-match-wizard/StepIndicator";
import { PinnedLineBar } from "@/components/dashboard/matches/new-match-wizard/PinnedLineBar";
import { ScoreBlock } from "@/components/dashboard/matches/new-match-wizard/ScoreBlock";
import type {
  EventPreset,
  LineChoice,
} from "@/components/dashboard/matches/new-match-wizard/types";
import type {
  EntryOutcome,
  LineupLine,
  MatchEnding,
  OutcomeSide,
} from "@/lib/schedule/types";

/** The wizard's own content column, copied so the two pages measure the same. */
const CONTENT_CLS = "mx-auto w-full max-w-[832px] px-14";

function replaceAt(
  list: (number | null)[],
  index: number,
  value: number | null,
): (number | null)[] {
  const next = [...list];
  // A set typed past the end of the seeded array (best-of-3 form, a fourth
  // column added by the block's dashed cell) extends it rather than writing a
  // hole — `Array.prototype` holes read back as undefined, not null.
  while (next.length < index) next.push(null);
  next[index] = value;
  return next;
}

export function ScoreOnlyFlow({
  preset,
  lineup,
  outcomes,
  recordedRounds = {},
  eventHref,
  canUpload,
}: {
  /** The line the page resolved — `?entry=`, or the first line with no score. */
  preset: EventPreset;
  /** Every line of the event, for the pinned bar's Change menu and the walk. */
  lineup: LineChoice[];
  /**
   * Saved schedule-only outcomes, keyed by `outcomeKey` (legacy forfeits
   * included): the entry id on a dual, entry id + round on a tournament.
   */
  outcomes: Record<
    string,
    Pick<EntryOutcome, "kind" | "side"> | null | undefined
  >;
  /** Per entry, the rounds already holding a match or an outcome. Tournaments. */
  recordedRounds?: Record<string, string[]>;
  /** Where Cancel and "Save and close" land. */
  eventHref: string;
  /**
   * May this viewer open the upload wizard? Scoring follows the events policy
   * and uploading its own, so the two links into it are drawn only on a yes.
   */
  canUpload: boolean;
}) {
  const [current, setCurrent] = useState<EventPreset>(preset);
  /**
   * The line "Save and next line" just saved, offered in the footer with its
   * video. Held here, above the per-line remount, because the offer is about
   * the line the form has just LEFT.
   */
  const [lastSaved, setLastSaved] = useState<SavedLineUpload | null>(null);
  // The opponent's saved roster, fetched once for the event rather than on
  // every line's remount — and only when some line still needs a name.
  const naming = lineup.some(
    (choice) => choice.preset && choice.preset.opponentName.trim() === "",
  );
  const schoolName = current.opponentSchool ?? current.eventName ?? "";
  const programKey = current.opponentProgramKey;
  const pool = useOpponentPool(
    naming ? programKey : null,
    programKey ? `program:${programKey}` : `text:${schoolName}`,
    schoolName,
  );
  /** Session overrides for the server-seeded lineup's resolved/open state. */
  const [resolution, setResolution] = useState<
    Record<string, "open" | "resolved">
  >({});
  /** Successful outcome writes, including a null that means cleared. */
  const [outcomeOverrides, setOutcomeOverrides] = useState<
    Record<string, Pick<EntryOutcome, "kind" | "side"> | null>
  >({});

  // The lineup travels on the preset because that is where `PinnedLineBar`
  // reads it; the presets inside `lineup` carry no lineup of their own, so it
  // is merged here rather than being baked into each one server-side.
  const barPreset = useMemo<EventPreset>(
    () => ({ ...current, lineup }),
    [current, lineup],
  );

  const index = lineup.findIndex(
    (choice) => choice.preset?.entryId === current.entryId,
  );
  const lineNumber = index >= 0 ? index + 1 : 1;

  const isOpen = (choice: LineChoice): boolean => {
    const entryId = choice.preset?.entryId;
    if (!entryId) return false;
    return resolution[entryId]
      ? resolution[entryId] === "open"
      : choice.state === "open";
  };

  // Guarded on `index >= 0`. At -1 — a line the Change menu does not list,
  // which the slot de-duplication in `lineupChoices` can produce — the old
  // shape concatenated `slice(0)` with `slice(0, 0)` and walked the whole
  // lineup twice. The filter below still drops the current line, so the walk
  // stays right without building the list two deep.
  const rotated =
    index >= 0
      ? [...lineup.slice(index + 1), ...lineup.slice(0, index)]
      : lineup;
  /** The still-open lines other than this one, in lineup order from here. */
  const openAfter = rotated.filter(
    (choice) =>
      isOpen(choice) &&
      choice.preset !== null &&
      choice.preset.entryId !== current.entryId,
  );

  const stillOpen = lineup.filter(
    (choice) => choice.preset !== null && isOpen(choice),
  ).length;

  const tournament = current.eventKind === "tournament";
  const noun = tournament ? "entry" : "line";
  const currentKey = current.entryId
    ? outcomeKey(current.entryId, tournament ? current.round : null)
    : null;

  return (
    <div className="flex min-h-[calc(100vh-44px)] flex-col">
      {/* Full bleed under the app header — chrome measuring the flow, not a
          rule belonging to the title. One step, so one filled segment. */}
      <StepIndicator currentStep={0} totalSteps={1} />

      <PinnedLineBar
        preset={barPreset}
        onSwitch={setCurrent}
        outsideHref={eventHref}
      />

      <div className={`${CONTENT_CLS} pt-16 pb-10`}>
        <div className="flex flex-col gap-3">
          <span className="eyebrow-sm" style={{ color: "var(--ink-400)" }}>
            {tournament ? "Entry" : "Line"} {lineNumber} of {lineup.length}
          </span>
          <h1
            className="max-w-[560px] text-[30px] leading-[1.15] font-light tracking-[-0.3px] text-[var(--ink-900)]"
            style={{ textWrap: "pretty" }}
          >
            The result.
          </h1>
          <p
            className="max-w-[480px] text-[13px] leading-[1.55] text-[var(--ink-600)]"
            style={{ textWrap: "pretty" }}
          >
            Enter the score the way you would say it. If the {noun} didn&apos;t
            finish, say how.
          </p>
        </div>
      </div>

      {/* Remounted per line. Its state is seeded once, on mount, from
          `seedScoreForm` — the single place a form's opening values are
          decided. Without the key, switching lines would carry the previous
          line's digits into a form that looks freshly opened. */}
      <ScoreForm
        key={currentKey ?? "line"}
        preset={current}
        lineup={lineup}
        pool={pool}
        initialOutcome={
          currentKey &&
          Object.prototype.hasOwnProperty.call(outcomeOverrides, currentKey)
            ? outcomeOverrides[currentKey]
            : currentKey
              ? (outcomes[currentKey] ?? null)
              : null
        }
        recorded={
          tournament && current.entryId && current.round
            ? (recordedRounds[current.entryId] ?? []).includes(current.round)
            : false
        }
        noun={noun}
        scoreHref={`${eventHref}/score`}
        eventHref={eventHref}
        stillOpen={stillOpen}
        nextOpen={openAfter[0]?.preset ?? null}
        canUpload={canUpload}
        lastSaved={lastSaved}
        onSaved={(entryId, next, outcome, upload) => {
          setLastSaved(upload);
          setResolution((prior) => ({ ...prior, [entryId]: "resolved" }));
          if (currentKey) {
            setOutcomeOverrides((prior) => ({
              ...prior,
              [currentKey]: outcome,
            }));
          }
          if (next) setCurrent(next);
        }}
        onCleared={(entryId) => {
          setLastSaved(null);
          setResolution((prior) => ({ ...prior, [entryId]: "open" }));
          if (currentKey) {
            setOutcomeOverrides((prior) => ({ ...prior, [currentKey]: null }));
          }
        }}
      />
    </div>
  );
}

/**
 * One line's score, plus the footer that saves it.
 *
 * Body and footer are one component on purpose: the footer's primary button
 * submits this state, and lifting the state out to reach it would undo the
 * remount that keeps two lines' digits apart.
 *
 * Score first, because most lines were played. How a line that stopped
 * ended is a quiet "Didn't finish? Retired · Defaulted" under the score,
 * which turns into its one question — who — in the same place. A forfeit is
 * not asked here: nobody played, so it is the lineup's ("No player").
 */
function ScoreForm({
  preset,
  lineup,
  pool,
  initialOutcome,
  recorded,
  noun,
  scoreHref,
  eventHref,
  stillOpen,
  nextOpen,
  canUpload,
  lastSaved,
  onSaved,
  onCleared,
}: {
  preset: EventPreset;
  /** Every line of the event — who their other players already are. */
  lineup: LineChoice[];
  /** The opponent's school and saved roster, for naming a blank opponent. */
  pool: OpponentPool;
  initialOutcome: Pick<EntryOutcome, "kind" | "side"> | null;
  /** A tournament round that already holds a result — saving replaces it. */
  recorded: boolean;
  /** "line" on a dual, "entry" on a tournament — the footer's word. */
  noun: "line" | "entry";
  /** This page's own path, for the Round control's navigation. */
  scoreHref: string;
  eventHref: string;
  stillOpen: number;
  /** The next open line to walk to, or null when this is the last one. */
  nextOpen: EventPreset | null;
  canUpload: boolean;
  /** The previous line's played score, still offering its video. */
  lastSaved: SavedLineUpload | null;
  onSaved: (
    entryId: string,
    next: EventPreset | null,
    outcome: Pick<EntryOutcome, "kind" | "side"> | null,
    /** What the footer offers for the line just saved; null for an outcome. */
    upload: SavedLineUpload | null,
  ) => void;
  onCleared: (entryId: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedOutcome, setSavedOutcome] = useState(initialOutcome);
  const [state, setState] = useState<ScoreFormState>(() =>
    seedScoreForm(preset, initialOutcome),
  );
  // Decided once, on mount: a name the lineup never had is named in the score
  // row, and stays a picker while it is being chosen.
  const [namingOpponent] = useState(() => preset.opponentName.trim() === "");

  const tournament = preset.eventKind === "tournament";
  const doubles = preset.discipline === "doubles";
  // The lineup's forfeit ("No player", either side) is read here, never
  // changed: it belongs to Edit dual.
  const lineupForfeit = savedOutcome?.kind === "forfeit" ? savedOutcome : null;
  const uploadHref = uploadInsteadHref(preset, state, {
    canUpload,
    hasOutcome: savedOutcome !== null,
  });

  const digit = (value: string): number | null =>
    value === "" ? null : Number(value);

  /**
   * The Round control navigates rather than setting state: the page seeds the
   * form from whatever the chosen round already holds, so a recorded round
   * opens with its score in the cells and the status line says it will be
   * replaced. Client state could only offer an empty form over a saved one.
   */
  const changeRound = (round: string) => {
    const query = new URLSearchParams({
      entry: preset.entryId ?? "",
      round,
    });
    router.replace(`${scoreHref}?${query.toString()}`);
  };

  const onScoreChange = (
    row: "player" | "opponent",
    index: number,
    value: string,
  ) => {
    setState((prior) =>
      row === "player"
        ? {
            ...prior,
            playerScores: replaceAt(prior.playerScores, index, digit(value)),
          }
        : {
            ...prior,
            opponentScores: replaceAt(
              prior.opponentScores,
              index,
              digit(value),
            ),
          },
    );
  };

  const onTiebreakChange = (
    row: "player" | "opponent",
    index: number,
    value: string,
  ) => {
    setState((prior) =>
      row === "player"
        ? {
            ...prior,
            playerTiebreaks: replaceAt(
              prior.playerTiebreaks,
              index,
              digit(value),
            ),
          }
        : {
            ...prior,
            opponentTiebreaks: replaceAt(
              prior.opponentTiebreaks,
              index,
              digit(value),
            ),
          },
    );
  };

  const setEnding = (ending: MatchEnding | null) => {
    setError(null);
    setState((prior) => ({
      ...prior,
      ending,
      // Who stopped carries across Retired ↔ Defaulted; "It finished" drops it.
      stoppedBy: ending ? prior.stoppedBy : null,
    }));
  };

  const walkOn = () => {
    if (nextOpen) onSaved(preset.entryId ?? "", nextOpen, savedOutcome, null);
    else router.push(eventHref);
  };

  /** This line's outcome write; shows the refusal and answers whether it took. */
  async function writeOutcome(
    outcome: Pick<EntryOutcome, "kind" | "side"> | null,
  ): Promise<boolean> {
    const result = await setOutcome({
      entryId: preset.entryId ?? "",
      round: tournament ? preset.round : null,
      outcome,
    });
    if ("error" in result) {
      setError(result.error);
      return false;
    }
    return true;
  }

  /** Remove a no-score result (a default, or a legacy one) and start over. */
  function removeResult() {
    setError(null);
    startTransition(async () => {
      if (!(await writeOutcome(null))) return;
      router.refresh();
      setSavedOutcome(null);
      setState((prior) => ({ ...prior, ending: null, stoppedBy: null }));
      onCleared(preset.entryId ?? "");
    });
  }

  function save(then: "next" | "close") {
    setError(null);

    // The server refuses this too; saying it here keeps the digits typed.
    if (tournament && !preset.round) {
      setError("Choose the round first.");
      return;
    }

    const plan = planSave(preset, state, savedOutcome);
    if (plan.kind === "error") {
      setError(plan.message);
      return;
    }

    const finish = (
      outcome: Pick<EntryOutcome, "kind" | "side"> | null,
      upload: SavedLineUpload | null,
    ) => {
      router.refresh();
      if (then === "close" || !nextOpen) {
        router.push(eventHref);
        return;
      }
      onSaved(preset.entryId ?? "", nextOpen, outcome, upload);
    };

    startTransition(async () => {
      if (plan.kind === "outcome") {
        const outcome = { kind: "default" as const, side: plan.side };
        const changed =
          savedOutcome?.kind !== "default" || savedOutcome.side !== plan.side;
        // A saved outcome is never updated in place (the database refuses it),
        // so a changed side is a clear and a save.
        if (changed) {
          if (savedOutcome && !(await writeOutcome(null))) return;
          if (!(await writeOutcome(outcome))) return;
        }
        setSavedOutcome(outcome);
        finish(outcome, null);
        return;
      }

      if (plan.clearOutcomeFirst) {
        if (!(await writeOutcome(null))) return;
        setSavedOutcome(null);
      }

      const result = await recordResult(plan.input);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      finish(null, savedLineUpload(preset, result.matchId, canUpload));
    });
  }

  const opponentLabel = state.opponentName.trim() || "Opponent";
  const opponentSlot = namingOpponent ? (
    <OpponentInRow
      preset={preset}
      lineup={lineup}
      pool={pool}
      doubles={doubles}
      value={state.opponentName}
      onChange={(opponentName) =>
        setState((prior) => ({ ...prior, opponentName }))
      }
    />
  ) : undefined;

  return (
    <>
      <div className={`${CONTENT_CLS} flex flex-col gap-9 pb-16`}>
        {tournament ? (
          <div className="flex w-[280px] flex-col gap-2">
            <span className="eyebrow">Round</span>
            <MenuSelect
              label="Round"
              value={preset.round ?? undefined}
              placeholder="Choose the round"
              options={ROUND_ORDER.map((round) => ({
                value: round,
                label: round,
                description:
                  recorded && round === preset.round
                    ? "Recorded — saving replaces it."
                    : undefined,
              }))}
              onChange={changeRound}
              variant="underline"
              width={280}
              disabled={pending}
            />
          </div>
        ) : null}

        {lineupForfeit ? (
          <LineupForfeitNote
            side={lineupForfeit.side}
            tournament={tournament}
            editHref={`${eventHref}/edit`}
            disabled={pending}
            onRemove={removeResult}
          />
        ) : (
          <>
            <div className="flex flex-col gap-5">
              <ScoreBlock
                formData={{
                  bestOf: String(preset.bestOf),
                  // Whatever the event carries, `null` included — never
                  // defaulted. A `false` here would print "No-Ad" over a
                  // format nobody stated.
                  adScoring: preset.adScoring ?? undefined,
                  playerScores: state.playerScores,
                  opponentScores: state.opponentScores,
                  playerTiebreaks: state.playerTiebreaks,
                  opponentTiebreaks: state.opponentTiebreaks,
                  numberOfSets: undefined,
                }}
                playerName={preset.playerName}
                opponentName={opponentLabel}
                fromLine
                opponentSlot={opponentSlot}
                onScoreChange={onScoreChange}
                onTiebreakChange={onTiebreakChange}
                /* The block derives its columns from the cells that have
                   digits in them, so there is no separate count to keep in
                   step. */
                onSetsChange={() => {}}
                gamesTo={preset.gamesTo}
                setsLabel={
                  doubles
                    ? doublesSetLabel(preset.gamesTo === 8 ? 8 : 6)
                    : undefined
                }
              />

              <EndingLine
                state={state}
                ourName={preset.playerName || "Our player"}
                theirName={opponentLabel}
                noun={tournament ? "match" : "line"}
                canRemove={
                  savedOutcome !== null && savedOutcome.kind !== "forfeit"
                }
                disabled={pending}
                onEnding={setEnding}
                onStoppedBy={(stoppedBy) => {
                  setError(null);
                  setState((prior) => ({ ...prior, stoppedBy }));
                }}
                onRemove={removeResult}
              />
            </div>

            {/* For the coach holding the file already: the wizard takes the
                score at its last step, so the two go in together. Singles
                only: a doubles line is score-only, so uploadInsteadHref gives
                it no link. Gone once a digit is typed — those digits would not
                come along. */}
            {uploadHref ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-hairline)] pt-5">
                <Upload
                  className="size-3.5 shrink-0 text-[var(--ink-400)]"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
                <span className="text-[12px] text-[var(--ink-600)]">
                  Have the match video?
                </span>
                <Link
                  href={uploadHref}
                  className="text-[12px] font-medium text-[var(--blue)] transition-colors duration-150 hover:text-[var(--blue-hover)]"
                >
                  Upload it instead
                </Link>
                <span className="text-[11px] text-[var(--ink-500)]">
                  <span className="text-[var(--ink-300)]">·</span> the score is
                  entered with the file
                </span>
              </div>
            ) : null}
          </>
        )}
      </div>

      {/* Same 64px white-on-hairline footer as the wizard's, so the primary
          action sits where a coach already expects it. */}
      <div className="sticky bottom-0 mt-auto border-t border-[var(--border-hairline)] bg-white">
        <div className={`${CONTENT_CLS} flex h-16 items-center gap-4`}>
          <Link
            href={eventHref}
            className="text-[12px] text-[var(--ink-600)] transition-colors duration-150 hover:text-[var(--ink-900)]"
          >
            Cancel
          </Link>

          {/* One status slot. A failed write says why here rather than in a
              banner the eye has already left. */}
          {error ? (
            <span className="text-[11px]" style={{ color: "var(--danger)" }}>
              {error}
            </span>
          ) : lastSaved && !recorded ? (
            // The line just left, and its video. It stays until the next
            // save replaces it; "Save and close" needs none of this, because
            // the event page's row already offers the same link.
            <span className="flex items-center gap-1.5 text-[11px] whitespace-nowrap text-[var(--ink-500)]">
              <span className="font-medium text-[var(--ink-900)]">
                {lastSaved.label} saved
              </span>
              <span className="text-[var(--ink-300)]">·</span>
              <Link
                href={lastSaved.href}
                className="font-medium text-[var(--blue)] transition-colors duration-150 hover:text-[var(--blue-hover)]"
              >
                {lastSaved.action}
              </Link>
              <span className="text-[var(--ink-300)]">·</span>
              <StillOpen count={stillOpen} noun={noun} />
            </span>
          ) : recorded ? (
            <span className="text-[11px] text-[var(--ink-500)]">
              Replaces the {preset.round} result already recorded.
            </span>
          ) : (
            <span className="text-[11px] text-[var(--ink-500)]">
              <StillOpen count={stillOpen} noun={noun} />
            </span>
          )}

          <div className="flex-1" />

          {lineupForfeit ? (
            // Nothing to save on a forfeit line — only somewhere to go.
            <button
              type="button"
              disabled={pending}
              onClick={walkOn}
              className={advButton("primary", "md")}
            >
              {nextOpen ? `Next ${noun}` : "Close"}
            </button>
          ) : (
            <>
              {/* Only while there IS a next line. On the last one the primary
                  falls back to "Save and close", and drawing the ghost too
                  would put two identically labelled buttons side by side
                  doing the same thing — a choice that isn't one. */}
              {nextOpen ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => save("close")}
                  className={advButton("ghost", "md")}
                >
                  Save and close
                </button>
              ) : null}
              <button
                type="button"
                disabled={pending}
                onClick={() => save("next")}
                className={advButton("primary", "md")}
              >
                {pending
                  ? "Saving…"
                  : nextOpen
                    ? `Save and next ${noun}`
                    : "Save and close"}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function StillOpen({ count, noun }: { count: number; noun: "line" | "entry" }) {
  return (
    <span>
      <span className="font-medium text-[var(--ink-900)] tabular-nums">
        {count}
      </span>{" "}
      {count === 1
        ? `${noun} still needs`
        : `${noun === "line" ? "lines" : "entries"} still need`}{" "}
      a result
    </span>
  );
}

/** The blue words a changed mind reaches for — the same weight as the line they replace. */
const LINK_CLS =
  "cursor-pointer text-[12px] font-medium text-[var(--blue)] transition-colors duration-150 hover:text-[var(--blue-hover)] disabled:cursor-default disabled:opacity-50";

/**
 * "Didn't finish? Retired · Defaulted", and — once one is chosen — the same
 * line asking who, with the way back on its right: "Didn't retire? Defaulted
 * · It finished". The score stays above either way: a retirement stopped
 * mid-play, and a default may have.
 */
function EndingLine({
  state,
  ourName,
  theirName,
  noun,
  canRemove,
  disabled,
  onEnding,
  onStoppedBy,
  onRemove,
}: {
  state: ScoreFormState;
  ourName: string;
  theirName: string;
  noun: "line" | "match";
  /** A no-score result is saved — offer to take it off entirely. */
  canRemove: boolean;
  disabled: boolean;
  onEnding: (ending: MatchEnding | null) => void;
  onStoppedBy: (side: OutcomeSide) => void;
  onRemove: () => void;
}) {
  if (!state.ending) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[var(--ink-600)]">
          Didn&apos;t finish?
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onEnding("retired")}
          className={LINK_CLS}
        >
          Retired
        </button>
        <span className="text-[12px] text-[var(--ink-300)]">·</span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onEnding("defaulted")}
          className={LINK_CLS}
        >
          Defaulted
        </button>
      </div>
    );
  }

  const retired = state.ending === "retired";
  const verb = retired ? "retired" : "defaulted";
  const winner =
    state.stoppedBy === "ours"
      ? theirName
      : state.stoppedBy === "theirs"
        ? ourName
        : null;
  const typed = scoreTyped(state);
  const wins = winner?.includes(" / ") ? "win" : "wins";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-8 flex-wrap items-center gap-x-5 gap-y-2">
        <div
          role="radiogroup"
          aria-label={`Who ${verb}?`}
          className="flex flex-wrap items-center gap-5"
        >
          <span className="text-[12px] text-[var(--ink-600)]">Who {verb}?</span>
          {(
            [
              ["ours", ourName],
              ["theirs", theirName],
            ] as const
          ).map(([side, name]) => (
            <CheckDotRadio
              key={side}
              checked={state.stoppedBy === side}
              disabled={disabled}
              label={name}
              onSelect={() => onStoppedBy(side)}
            />
          ))}
        </div>
        <span className="flex-1" />
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-[var(--ink-600)]">
            {retired ? "Didn’t retire?" : "Didn’t default?"}
          </span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onEnding(retired ? "defaulted" : "retired")}
            className={LINK_CLS}
          >
            {retired ? "Defaulted" : "Retired"}
          </button>
          <span className="text-[12px] text-[var(--ink-300)]">·</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onEnding(null)}
            className={LINK_CLS}
          >
            It finished
          </button>
          {canRemove ? (
            <>
              <span className="text-[12px] text-[var(--ink-300)]">·</span>
              <button
                type="button"
                disabled={disabled}
                onClick={onRemove}
                className="cursor-pointer text-[12px] text-[var(--ink-600)] transition-colors duration-150 hover:text-[var(--ink-900)] disabled:opacity-50"
              >
                Remove this result
              </button>
            </>
          ) : null}
        </div>
      </div>
      <span className="text-micro">
        {winner
          ? `${winner} ${wins} the ${noun}`
          : `Choose who ${verb} — the other side takes the ${noun}`}
        {winner && typed ? (
          <>
            {" "}
            <span className="text-[var(--ink-300)]">·</span> the score stays as
            entered, marked {endingMark(state.ending)}
          </>
        ) : winner && !retired ? (
          <>
            {" "}
            <span className="text-[var(--ink-300)]">·</span> leave the score
            empty if no ball was hit
          </>
        ) : null}
      </span>
    </div>
  );
}

/**
 * The design system's check-dot `Radio`: a solid Signal Blue 14px dot with a
 * white check when chosen, a 1px ink-300 ring when not.
 */
function CheckDotRadio({
  checked,
  disabled,
  label,
  onSelect,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onSelect}
      className="flex min-h-8 cursor-pointer items-center gap-2 text-[13px] text-[var(--ink-900)] disabled:cursor-default disabled:opacity-50"
    >
      {checked ? (
        <span className="flex size-3.5 shrink-0 items-center justify-center rounded-full bg-[var(--blue)]">
          <Check
            className="size-[9px] text-white"
            strokeWidth={2.5}
            aria-hidden="true"
          />
        </span>
      ) : (
        <span className="size-3.5 shrink-0 rounded-full border border-[var(--ink-300)]" />
      )}
      <span className="truncate">{label}</span>
    </button>
  );
}

/**
 * A forfeit on this line — nobody played. The lineup recorded it ("No
 * player"), so the lineup is where it changes; a tournament, which has no
 * lineup, can take it off here.
 */
function LineupForfeitNote({
  side,
  tournament,
  editHref,
  disabled,
  onRemove,
}: {
  side: OutcomeSide;
  tournament: boolean;
  editHref: string;
  disabled: boolean;
  onRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="eyebrow">Result</span>
      <p className="text-[13px] text-[var(--ink-900)]">
        {side === "theirs"
          ? "No player on their side · we win by forfeit"
          : "No player on our side · they win by forfeit"}
      </p>
      {tournament ? (
        <button
          type="button"
          disabled={disabled}
          onClick={onRemove}
          className="w-fit cursor-pointer text-[12px] text-[var(--ink-600)] transition-colors duration-150 hover:text-[var(--ink-900)] disabled:opacity-50"
        >
          Remove this result
        </button>
      ) : (
        <span className="text-[12px] text-[var(--ink-600)]">
          It comes from the lineup.{" "}
          <Link
            href={editHref}
            className="font-medium text-[var(--blue)] transition-colors duration-150 hover:text-[var(--blue-hover)]"
          >
            Edit dual
          </Link>{" "}
          to change it.
        </span>
      )}
    </div>
  );
}

/**
 * The opponent the lineup left blank, named in their score row — the lineup
 * page's own pickers, so the same names and the same rules: the typed popup
 * over their saved roster on a singles line, and the pick-two pair checklist
 * on a doubles line. Saving writes the name back to the lineup too.
 */
function OpponentInRow({
  preset,
  lineup,
  pool,
  doubles,
  value,
  onChange,
}: {
  preset: EventPreset;
  /** Their school and saved roster — fetched once, above the per-line remount. */
  pool: OpponentPool;
  lineup: LineChoice[];
  doubles: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  const slot = preset.round ?? "Line";

  if (!doubles) {
    return (
      <OpponentPopup
        value={value}
        addLabel="Name their player"
        discipline="singles"
        pool={pool}
        draftName=""
        onCommit={onChange}
        onActiveChange={() => {}}
        variant="underline"
      />
    );
  }

  // The other lines as the lineup page holds them: their names, by court.
  const others = lineup.filter(
    (choice) => choice.preset && choice.preset.entryId !== preset.entryId,
  );
  const asLine = (choice: LineChoice): LineupLine => ({
    key: choice.preset?.entryId ?? choice.slot,
    slot: choice.slot,
    discipline: choice.preset?.discipline ?? "singles",
    ourIds: [],
    ourLabels: [],
    theirLabels: splitNames(choice.preset?.opponentName ?? ""),
    noPlayer: false,
    theirNoPlayer: false,
  });
  const otherDoubles = others
    .filter((choice) => choice.preset?.discipline === "doubles")
    .map(asLine);
  const singlesNames = others
    .filter((choice) => choice.preset?.discipline === "singles")
    .flatMap((choice) => splitNames(choice.preset?.opponentName ?? ""));
  const line: LineupLine = {
    key: preset.entryId ?? slot,
    slot,
    discipline: "doubles",
    ourIds: [],
    ourLabels: [],
    theirLabels: splitNames(value),
    noPlayer: false,
    theirNoPlayer: false,
  };

  return (
    <OpponentPairPicker
      line={line}
      pool={pool}
      choices={opponentPairChoices(singlesNames, pool, otherDoubles)}
      pairedOn={opponentPairedOn([...otherDoubles, line], line.key)}
      onTheirLabels={(_, next) => onChange(next)}
    />
  );
}
