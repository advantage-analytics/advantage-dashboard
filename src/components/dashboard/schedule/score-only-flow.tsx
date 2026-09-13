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
 * no wizard hook and no browser storage. It shares `recordResult`, `setOutcome`
 * and `ResultChoice` with the inline row, so played scores and non-played
 * outcomes cannot acquire two action contracts or two vocabularies.
 *
 * **The reseed is the load-bearing detail.** Switching lines remounts the form
 * (`key={preset.entryId}`), so the previous line's choice and digits cannot
 * survive into the next one. A shared, mutated form is how S2 gets S1's 6-4.
 */

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { advButton } from "@/lib/ui/adv-button";
import { recordResult, setOutcome } from "@/lib/schedule/actions";
import {
  outcomeFromResultChoice,
  ResultChoice,
  resultChoiceFromOutcome,
  type ResultChoiceValue,
} from "@/components/dashboard/schedule/result-choice";
import {
  seedScoreForm,
  toRecordResultInput,
  type ScoreFormState,
} from "@/lib/schedule/score-seed";
import { StepIndicator } from "@/components/dashboard/matches/new-match-wizard/StepIndicator";
import { PinnedLineBar } from "@/components/dashboard/matches/new-match-wizard/PinnedLineBar";
import { ScoreBlock } from "@/components/dashboard/matches/new-match-wizard/ScoreBlock";
import type {
  EventPreset,
  LineChoice,
} from "@/components/dashboard/matches/new-match-wizard/types";
import type { EntryOutcome } from "@/lib/schedule/types";

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
  eventHref,
}: {
  /** The line the page resolved — `?entry=`, or the first line with no score. */
  preset: EventPreset;
  /** Every line of the event, for the pinned bar's Change menu and the walk. */
  lineup: LineChoice[];
  /** Saved schedule-only outcomes, keyed by entry id (legacy forfeits included). */
  outcomes: Record<
    string,
    Pick<EntryOutcome, "kind" | "side"> | null | undefined
  >;
  /** Where Cancel and "Save and close" land. */
  eventHref: string;
}) {
  const [current, setCurrent] = useState<EventPreset>(preset);
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
            Line {lineNumber} of {lineup.length}
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
            Choose how the line finished. If it was played, enter the score the
            way you would say it.
          </p>
        </div>
      </div>

      {/* Remounted per line. Its state is seeded once, on mount, from
          `seedScoreForm` — the single place a form's opening values are
          decided. Without the key, switching lines would carry the previous
          line's digits into a form that looks freshly opened. */}
      <ScoreForm
        key={current.entryId ?? "line"}
        preset={current}
        initialOutcome={
          current.entryId &&
          Object.prototype.hasOwnProperty.call(
            outcomeOverrides,
            current.entryId,
          )
            ? outcomeOverrides[current.entryId]
            : current.entryId
              ? (outcomes[current.entryId] ?? null)
              : null
        }
        eventHref={eventHref}
        stillOpen={stillOpen}
        nextOpen={openAfter[0]?.preset ?? null}
        onSaved={(entryId, next, outcome) => {
          setResolution((prior) => ({ ...prior, [entryId]: "resolved" }));
          setOutcomeOverrides((prior) => ({ ...prior, [entryId]: outcome }));
          if (next) setCurrent(next);
        }}
        onCleared={(entryId) => {
          setResolution((prior) => ({ ...prior, [entryId]: "open" }));
          setOutcomeOverrides((prior) => ({ ...prior, [entryId]: null }));
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
 */
function ScoreForm({
  preset,
  initialOutcome,
  eventHref,
  stillOpen,
  nextOpen,
  onSaved,
  onCleared,
}: {
  preset: EventPreset;
  initialOutcome: Pick<EntryOutcome, "kind" | "side"> | null;
  eventHref: string;
  stillOpen: number;
  /** The next open line to walk to, or null when this is the last one. */
  nextOpen: EventPreset | null;
  onSaved: (
    entryId: string,
    next: EventPreset | null,
    outcome: Pick<EntryOutcome, "kind" | "side"> | null,
  ) => void;
  onCleared: (entryId: string) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [savedOutcome, setSavedOutcome] = useState(initialOutcome !== null);
  const [resultChoice, setResultChoice] = useState<ResultChoiceValue>(
    initialOutcome ? resultChoiceFromOutcome(initialOutcome) : "played",
  );
  const [state, setState] = useState<ScoreFormState>(() =>
    seedScoreForm(preset),
  );

  const digit = (value: string): number | null =>
    value === "" ? null : Number(value);

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

  function save(then: "next" | "close") {
    setError(null);

    if (resultChoice !== "played") {
      const selectedOutcome = outcomeFromResultChoice(resultChoice);
      startTransition(async () => {
        const result = await setOutcome({
          entryId: preset.entryId ?? "",
          round: preset.eventKind === "tournament" ? preset.round : null,
          outcome: selectedOutcome,
        });
        if ("error" in result) {
          setError(result.error);
          return;
        }
        router.refresh();
        if (resultChoice === "clear") {
          setSavedOutcome(false);
          setResultChoice("played");
          onCleared(preset.entryId ?? "");
          return;
        }
        if (then === "close" || !nextOpen) {
          router.push(eventHref);
          return;
        }
        onSaved(preset.entryId ?? "", nextOpen, selectedOutcome);
      });
      return;
    }

    const input = toRecordResultInput(preset, state);

    if (input.ourGames.length === 0) {
      setError("Enter at least one set.");
      return;
    }
    if (input.opponentLabels.length === 0) {
      setError("Name the opponent.");
      return;
    }

    startTransition(async () => {
      const result = await recordResult(input);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
      if (then === "close" || !nextOpen) {
        router.push(eventHref);
        return;
      }
      onSaved(preset.entryId ?? "", nextOpen, null);
    });
  }

  return (
    <>
      <div className={`${CONTENT_CLS} flex flex-col gap-9 pb-16`}>
        <div className="flex w-[280px] flex-col gap-2">
          <span className="eyebrow">Result</span>
          <ResultChoice
            value={resultChoice}
            onChange={setResultChoice}
            canClear={savedOutcome}
            disabled={pending}
          />
        </div>

        {resultChoice === "played" ? (
          <>
            <ScoreBlock
              formData={{
                bestOf: String(preset.bestOf),
                // Whatever the event carries, `null` included — never defaulted.
                // A `false` here would print "no-ad" over a format nobody stated.
                adScoring: preset.adScoring ?? undefined,
                playerScores: state.playerScores,
                opponentScores: state.opponentScores,
                playerTiebreaks: state.playerTiebreaks,
                opponentTiebreaks: state.opponentTiebreaks,
                numberOfSets: undefined,
              }}
              playerName={preset.playerName}
              opponentName={state.opponentName}
              fromLine
              onScoreChange={onScoreChange}
              onTiebreakChange={onTiebreakChange}
              /* The block derives its columns from the cells that have digits in
                 them, so there is no separate count to keep in step. */
              onSetsChange={() => {}}
            />

            <div className="flex flex-col gap-2">
              <span className="eyebrow">Opponent</span>
              <input
                value={state.opponentName}
                onChange={(event) =>
                  setState((prior) => ({
                    ...prior,
                    opponentName: event.target.value,
                  }))
                }
                placeholder="Name"
                // The rule recolours to blue on focus, which IS the visible focus
                // indicator WCAG 2.4.7 asks for — so the neutral field ring from
                // `focus.css` would be a second, redundant one stacked on top.
                data-focus-ring="none"
                className="max-w-[320px] border-b border-[var(--border-hairline)] bg-transparent pb-1.5 text-[13px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-300)] focus:border-b-2 focus:border-[var(--blue)]"
              />
              <span className="text-micro">
                A doubles line takes both names, separated by a slash.
              </span>
            </div>
          </>
        ) : null}
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
          ) : (
            <span className="text-[11px] text-[var(--ink-500)]">
              <span className="font-medium text-[var(--ink-900)] tabular-nums">
                {stillOpen}
              </span>{" "}
              {stillOpen === 1 ? "line still needs" : "lines still need"} a
              result
            </span>
          )}

          <div className="flex-1" />

          {/* Only while there IS a next line. On the last one the primary
              falls back to "Save and close", and drawing the ghost too would
              put two identically labelled buttons side by side doing the same
              thing — a choice that isn't one. */}
          {nextOpen && resultChoice !== "clear" ? (
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
              : resultChoice === "clear"
                ? "Clear outcome"
                : nextOpen
                  ? "Save and next line"
                  : "Save and close"}
          </button>
        </div>
      </div>
    </>
  );
}
