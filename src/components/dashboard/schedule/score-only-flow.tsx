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
 * (keyed on the entry plus a count of line switches), so the previous line's
 * choice and digits cannot survive into the next one. A shared, mutated form
 * is how S2 gets S1's 6-4.
 *
 * A tournament entry adds one question, the round, and answers it in state
 * WITHOUT remounting: the page hands over every round's seed (`roundSeeds`),
 * so an untouched form reseeds from whatever the chosen round already holds —
 * the honest way to open a recorded round for correction — while a form the
 * coach has typed into keeps its digits (`reseedForRound`). The URL's
 * `?round=` follows via `history.replaceState`, so a reload reopens the same
 * round with no server round-trip on the change itself.
 *
 * A round our side WON walks up that entry's draw instead of on to the next
 * entry: the primary reads "Save and next round" (decided from the typed
 * score before the write, by `nextRoundAfter`) and, once saved, the same
 * Round path moves the form to that round — the just-saved form counts as
 * its own seed, so the next round opens blank rather than carrying the score
 * that was just filed.
 *
 * A round our side LOST goes the same way when the loss has a consolation
 * draw to drop into (`nextRoundAfter(…, false)`): the primary reads "Save and
 * start consolation" and reopens this entry at that round, blank. Not every
 * player takes their consolation spot, so the form asks once rather than
 * assuming — "Save — they're out" beside it saves and walks on to the next
 * open entry as any other save does.
 *
 * A tournament round also asks WHOSE player the opponent is — the School
 * field beside Round, the dual builder's directory search over
 * `/api/programs/search` with a typed fallback. It is what points the opponent
 * picker's roster at the right program (`useOpponentPool` reads it), and it
 * travels with the save as `opponentSchool` + `opponentProgramKey`, onto the
 * ENTRY: `recordResult` writes them only from the entry's latest round, so a
 * correction of an earlier round cannot put a round-old school back.
 */

import { useId, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Check, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { advButton } from "@/lib/ui/adv-button";
import { advField } from "@/lib/ui/adv-field";
import { cn } from "@/lib/utils";
import { useListboxNav } from "@/hooks/use-listbox-nav";
import { divisionLabel } from "@/lib/data/programs-server";
import { useProgramSearch } from "@/components/dashboard/schedule/static/use-program-search";
import { recordResult, setOutcome } from "@/lib/schedule/actions";
import {
  ROUND_ORDER,
  doublesSetLabel,
  drawOfRound,
  splitNames,
} from "@/lib/schedule/format";
import {
  outcomeKey,
  planSave,
  presetAtRound,
  reseedForRound,
  savedLineUpload,
  scoreTyped,
  seedScoreForm,
  uploadInsteadHref,
  type RoundSeed,
  type SavedLineUpload,
  type ScoreFormState,
} from "@/lib/schedule/score-seed";
import { endingMark, resultInputWon } from "@/lib/schedule/entry-state";
import { nextRoundAfter } from "@/lib/schedule/tournament-run";
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
import {
  SCORE_FLOW_CONTENT_CLS,
  SCORE_FLOW_TITLE,
} from "@/components/dashboard/schedule/score-flow-copy";

export { SCORE_FLOW_TITLE };

/** The wizard's own content column, copied so the two pages measure the same. */
const CONTENT_CLS = SCORE_FLOW_CONTENT_CLS;

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

/**
 * The opponent's school on a tournament round: the name as it will be written,
 * and the directory key behind it — null when it was typed past the
 * directory, which is also "no roster to offer".
 */
export interface OpponentSchool {
  name: string;
  programKey: string | null;
}

const NO_SCHOOL: OpponentSchool = { name: "", programKey: null };

/**
 * What the School field opens with.
 *
 * The entry's `opponent_school` is "the last round filed", so it is only an
 * honest answer for a round that already HAS a match. A tournament round with
 * no match of its own is a new opponent — its name opens empty (`presetFor`),
 * and so does its school: seeding the last round's school pointed the picker
 * at that school's roster and filed it onto the entry for somebody else.
 */
function seedSchool(preset: EventPreset): OpponentSchool {
  if (preset.eventKind === "tournament" && !preset.matchId) return NO_SCHOOL;
  return {
    name: preset.opponentSchool ?? "",
    programKey: preset.opponentProgramKey ?? null,
  };
}

function sameSchool(a: OpponentSchool, b: OpponentSchool): boolean {
  return a.name === b.name && a.programKey === b.programKey;
}

export function ScoreOnlyFlow({
  preset,
  lineup,
  outcomes,
  recordedRounds = {},
  roundSeeds = {},
  eventHref,
  canUpload,
  ourTeam = null,
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
  /**
   * Per (entry, round), keyed by `outcomeKey`, what that round opens with —
   * its match, or the entry's blank seed under `outcomeKey(entryId, null)`.
   * Tournaments: lets the Round control reseed without a navigation.
   */
  roundSeeds?: Record<string, RoundSeed>;
  /** Where Cancel and "Save and close" land. */
  eventHref: string;
  /**
   * May this viewer open the upload wizard? Scoring follows the events policy
   * and uploading its own, so the two links into it are drawn only on a yes.
   */
  canUpload: boolean;
  /**
   * Our program's team. The School search offers only that team's programs —
   * a men's program plays men's teams — the rule the dual builder's
   * `dual-school-step.tsx` applies, so one school never lists twice.
   */
  ourTeam?: "mens" | "womens" | null;
}) {
  const [current, setCurrent] = useState<EventPreset>(preset);
  /**
   * Bumped on every LINE switch (the Change menu, "Save and next") and never
   * on a round change: the form's key, so a new line always opens a fresh
   * form while a new round keeps the one being typed into.
   */
  const [lineSwitches, setLineSwitches] = useState(0);
  /**
   * A tournament round's opponent school. Held here, beside the pool it
   * points, so one `useOpponentPool` serves every line. Reseeded on a LINE
   * switch; on a ROUND change it follows the score's own rule
   * (`reseedForRound`): a school the coach has not touched since it was
   * seeded reseeds for the new round, one they chose stays where they put it.
   */
  const [school, setSchool] = useState<OpponentSchool>(() =>
    seedSchool(preset),
  );
  /** What `school` was last seeded with — "untouched" means equal to this. */
  const [schoolSeed, setSchoolSeed] = useState<OpponentSchool>(() =>
    seedSchool(preset),
  );
  const reseedSchool = (next: OpponentSchool) => {
    setSchool(next);
    setSchoolSeed(next);
  };
  const switchLine = (next: EventPreset) => {
    setCurrent(next);
    reseedSchool(seedSchool(next));
    setLineSwitches((count) => count + 1);
  };
  /**
   * The line "Save and next line" just saved, offered in the footer with its
   * video. Held here, above the per-line remount, because the offer is about
   * the line the form has just LEFT.
   */
  const [lastSaved, setLastSaved] = useState<SavedLineUpload | null>(null);
  /**
   * Rounds saved this session, per entry — on top of the page's
   * `recordedRounds`, which only a refresh brings up to date. A round just
   * filed by "Save and next round" is recorded from that moment, so going
   * back to it says saving replaces it.
   */
  const [savedRounds, setSavedRounds] = useState<Record<string, string[]>>({});
  // The opponent's saved roster, fetched once for the event rather than on
  // every line's remount — and only when a form can name someone: some line
  // still needs a name, or this is a tournament, whose every round is named
  // (or renamed) in its own score row.
  //
  // A dual's school is the event's. A tournament's is whatever the School
  // field says right now — a directory pick re-points the roster at that
  // program in the same render, a typed school has no program and so no
  // roster, and the event's name stands in for the prose while it is blank.
  const naming =
    current.eventKind === "tournament" ||
    lineup.some(
      (choice) => choice.preset && choice.preset.opponentName.trim() === "",
    );
  const schoolName =
    (current.eventKind === "tournament"
      ? school.name || null
      : current.opponentSchool) ??
    current.eventName ??
    "";
  const programKey =
    current.eventKind === "tournament"
      ? school.programKey
      : current.opponentProgramKey;
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

  /** Every round this entry holds: the page's, plus this session's saves. */
  const heldRounds = current.entryId
    ? Array.from(
        new Set([
          ...(recordedRounds[current.entryId] ?? []),
          ...(savedRounds[current.entryId] ?? []),
        ]),
      )
    : [];

  /** The saved outcome under one key, this session's writes first. */
  const outcomeAt = (
    key: string | null,
  ): Pick<EntryOutcome, "kind" | "side"> | null =>
    key && Object.prototype.hasOwnProperty.call(outcomeOverrides, key)
      ? outcomeOverrides[key]
      : key
        ? (outcomes[key] ?? null)
        : null;

  return (
    <div className="flex min-h-[calc(100vh-44px)] flex-col">
      {/* Full bleed under the app header — chrome measuring the flow, not a
          rule belonging to the title. One step, so one filled segment. */}
      <StepIndicator currentStep={0} totalSteps={1} />

      <PinnedLineBar
        preset={barPreset}
        onSwitch={switchLine}
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
            {SCORE_FLOW_TITLE}
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

      {/* Remounted per line. Its state is seeded on mount from
          `seedScoreForm` — the single place a form's opening values are
          decided — and reseeded on a round change only while untouched.
          Without the key, switching lines would carry the previous line's
          digits into a form that looks freshly opened. The round is NOT in
          the key: changing it must not throw away what was typed. */}
      <ScoreForm
        key={`${current.entryId ?? "line"}#${lineSwitches}`}
        preset={current}
        lineup={lineup}
        pool={pool}
        school={school}
        onSchoolChange={setSchool}
        initialOutcome={outcomeAt(currentKey)}
        recorded={
          tournament && current.round
            ? heldRounds.includes(current.round)
            : false
        }
        heldRounds={heldRounds}
        noun={noun}
        onRoundChange={(round) => {
          const next = presetAtRound(current, round, roundSeeds);
          setCurrent(next);
          if (sameSchool(school, schoolSeed)) reseedSchool(seedSchool(next));
          return {
            preset: next,
            outcome: outcomeAt(
              next.entryId ? outcomeKey(next.entryId, round) : null,
            ),
          };
        }}
        eventHref={eventHref}
        stillOpen={stillOpen}
        nextOpen={openAfter[0]?.preset ?? null}
        canUpload={canUpload}
        ourTeam={ourTeam}
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
          if (next) switchLine(next);
        }}
        onAdvanced={(entryId, round, outcome, upload) => {
          // The entry stays open — it has a next round to record — so only
          // the round just filed, its outcome and its video offer move.
          // The next round is a NEW opponent, so the School starts blank:
          // carrying the last opponent's school would point the picker at
          // the wrong roster and file that school onto the entry. (A plain
          // Round change is a correction and keeps it — see `school`.)
          reseedSchool(NO_SCHOOL);
          setLastSaved(upload);
          setSavedRounds((prior) => ({
            ...prior,
            [entryId]: [...(prior[entryId] ?? []), round],
          }));
          if (currentKey) {
            setOutcomeOverrides((prior) => ({
              ...prior,
              [currentKey]: outcome,
            }));
          }
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
  school,
  onSchoolChange,
  initialOutcome,
  recorded,
  heldRounds,
  noun,
  onRoundChange,
  eventHref,
  stillOpen,
  nextOpen,
  canUpload,
  ourTeam,
  lastSaved,
  onSaved,
  onAdvanced,
  onCleared,
}: {
  preset: EventPreset;
  /** Every line of the event — who their other players already are. */
  lineup: LineChoice[];
  /** The opponent's school and saved roster, for naming a blank opponent. */
  pool: OpponentPool;
  /** A tournament round's opponent school — the pool's source, and the save's. */
  school: OpponentSchool;
  onSchoolChange: (school: OpponentSchool) => void;
  initialOutcome: Pick<EntryOutcome, "kind" | "side"> | null;
  /** A tournament round that already holds a result — saving replaces it. */
  recorded: boolean;
  /** The rounds this entry already holds — where a won round leads next. */
  heldRounds: string[];
  /** "line" on a dual, "entry" on a tournament — the footer's word. */
  noun: "line" | "entry";
  /**
   * A tournament's Round control: the parent moves the line to that round and
   * answers with its preset and saved outcome, for the reseed decision.
   */
  onRoundChange: (round: string) => {
    preset: EventPreset;
    outcome: Pick<EntryOutcome, "kind" | "side"> | null;
  };
  eventHref: string;
  stillOpen: number;
  /** The next open line to walk to, or null when this is the last one. */
  nextOpen: EventPreset | null;
  canUpload: boolean;
  ourTeam: "mens" | "womens" | null;
  /** The previous line's played score, still offering its video. */
  lastSaved: SavedLineUpload | null;
  onSaved: (
    entryId: string,
    next: EventPreset | null,
    outcome: Pick<EntryOutcome, "kind" | "side"> | null,
    /** What the footer offers for the line just saved; null for an outcome. */
    upload: SavedLineUpload | null,
  ) => void;
  /**
   * A won tournament round was saved and the form is moving up the draw:
   * the parent records the round just filed. The move itself is the Round
   * control's own path, taken from here.
   */
  onAdvanced: (
    entryId: string,
    savedRound: string,
    outcome: Pick<EntryOutcome, "kind" | "side"> | null,
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
  /** What the form was last seeded with — "untouched" is measured from it. */
  const [seeded, setSeeded] = useState<ScoreFormState>(state);
  // Decided once, on mount. A dual line names only what its lineup left
  // blank — a name the lineup holds is read here and changed through Edit
  // dual. A tournament has no lineup: each round's opponent belongs to that
  // round's match, so its row is ALWAYS the picker — a recorded name opens
  // in it and can be changed, and a round with no match opens on "Name their
  // player". The form is keyed per line, never per round, so this holds
  // across the Round control's reseeds.
  const [namingOpponent] = useState(
    () =>
      preset.eventKind === "tournament" || preset.opponentName.trim() === "",
  );

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
   * The Round control changes the round in state, never by navigating: a
   * remount would discard what the coach typed. An untouched form reseeds
   * from the chosen round (a recorded one opens with its score, and the
   * footer says saving replaces it); a typed-into one keeps its digits —
   * `reseedForRound` decides. The URL's `?round=` follows with
   * `history.replaceState` so a reload reopens this round; no server
   * round-trip, and nothing for the router to remount on.
   */
  const changeRound = (round: string) => {
    if (round === preset.round) return;
    moveToRound(round, false);
  };

  /**
   * The Round control's move, shared with "Save and next round". A form that
   * was just written is its own seed — nothing in it is unsaved — so
   * `reseedForRound` opens the next round from that round's seed (blank, with
   * no opponent, for a round holding no match) rather than keeping digits
   * that now belong to the round left behind.
   */
  const moveToRound = (round: string, justSaved: boolean) => {
    setError(null);
    const next = onRoundChange(round);
    const decided = reseedForRound(
      state,
      justSaved ? state : seeded,
      next.preset,
      next.outcome,
    );
    setState(decided.state);
    setSeeded(decided.seeded);
    setSavedOutcome(next.outcome);

    const query = new URLSearchParams(window.location.search);
    query.set("entry", next.preset.entryId ?? "");
    query.set("round", round);
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${query.toString()}`,
    );
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

  /**
   * Where the primary's save goes on this entry, or null when saving walks on
   * as it always has. Decided from the TYPED score, before anything is
   * written, with the writer's own payload (`planSave`) and winner rule
   * (`resultInputWon`): a tournament round played out and decided. A win
   * walks up the draw ("Save and next round"); a loss drops into its
   * consolation draw ("Save and start consolation"). A retirement or a
   * default, a dual line, an undecided score, a won final, a loss with no
   * consolation to go to — null.
   */
  const advance = (() => {
    if (!tournament || !preset.round || !preset.entryId || state.ending) {
      return null;
    }
    const plan = planSave(preset, state, savedOutcome);
    if (plan.kind !== "score") return null;
    const won = resultInputWon(plan.input);
    if (won === null) return null;
    const round = nextRoundAfter(
      { draw: null, matches: heldRounds.map((round) => ({ round })) },
      preset.round,
      won,
    );
    return round ? { round, won } : null;
  })();
  const advanceTo = advance?.round ?? null;
  /** A lost round with a consolation draw to drop into. */
  const consolation = advance !== null && !advance.won;

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

  /**
   * `next` is the primary: on to `advanceTo` when there is one, else the next
   * open entry. `out` is "Save — they're out": a lost round's consolation
   * declined, so it walks on exactly as `next` would with no advance.
   */
  function save(then: "next" | "close" | "out") {
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
    // Read now, from what was typed: the label the coach clicked promised it.
    const goTo = then === "next" ? advanceTo : null;
    const savedRound = preset.round;

    const finish = (
      outcome: Pick<EntryOutcome, "kind" | "side"> | null,
      upload: SavedLineUpload | null,
    ) => {
      router.refresh();
      if (goTo && savedRound) {
        onAdvanced(preset.entryId ?? "", savedRound, outcome, upload);
        moveToRound(goTo, true);
        return;
      }
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

      // A tournament round says whose player it was against; a dual's event
      // already does, so its input leaves both undefined and the entry's
      // school alone.
      const result = await recordResult(
        tournament
          ? {
              ...plan.input,
              opponentSchool: school.name.trim() || null,
              opponentProgramKey: school.programKey,
            }
          : plan.input,
      );
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
          <div className="flex flex-wrap items-start gap-x-8 gap-y-6">
            <div className="flex w-[280px] flex-col gap-2">
              <span className="eyebrow">Round</span>
              {/* Every code on the ladder, in `ROUND_ORDER`, under the draw
                  it belongs to — Prequalifying · PQ Consolation · Qualifying ·
                  Main draw · Consolation — so two dozen codes read as five
                  short lists. `scroll`, because the list is now taller than
                  the room under the field on a laptop. */}
              <MenuSelect
                label="Round"
                value={preset.round ?? undefined}
                placeholder="Choose the round"
                options={ROUND_ORDER.map((round) => ({
                  value: round,
                  label: round,
                  group: drawOfRound(round) ?? undefined,
                  description:
                    recorded && round === preset.round
                      ? "Recorded — saving replaces it."
                      : undefined,
                }))}
                onChange={changeRound}
                variant="underline"
                width={280}
                scroll
                disabled={pending}
              />
            </div>
            {/* Whose player the opponent is. Above the opponent's own name
                in reading order, because it decides which roster that name
                is picked from. */}
            <div className="flex w-[280px] flex-col gap-2">
              <span className="eyebrow">School</span>
              <SchoolField
                value={school}
                onChange={onSchoolChange}
                ourTeam={ourTeam}
                disabled={pending}
              />
            </div>
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
              {/* Only while there IS a next line (or a won round's next
                  round, which needs no open line). On the last one the primary
                  falls back to "Save and close", and drawing the ghost too
                  would put two identically labelled buttons side by side
                  doing the same thing — a choice that isn't one. A lost
                  round with a consolation to drop into asks that question
                  in this slot instead: its walk-on IS the declined answer. */}
              {consolation ? (
                // The consolation declined. A text action, not a second
                // button: the primary is the expected answer, and this one
                // walks on (the next open entry, or out) as any save does.
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => save("out")}
                  className="cursor-pointer rounded-[2px] text-[13px] font-medium text-[var(--blue)] transition-colors duration-150 outline-none hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] disabled:pointer-events-none disabled:opacity-50"
                >
                  Save — they&apos;re out
                </button>
              ) : nextOpen || advanceTo ? (
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
                  : consolation
                    ? "Save and start consolation"
                    : advanceTo
                      ? "Save and next round"
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

/** How many directory rows the School field offers at once. */
const MAX_SCHOOL_ROWS = 6;

/**
 * The opponent's school on a tournament round — the dual builder's question,
 * in a field.
 *
 * One underline input (`advField("underline")`, the same 34px rule as the
 * Round control beside it) that is also the search: from two characters the
 * directory answers under it (`useProgramSearch`, the dual builder's own
 * source), and whatever is typed is always the last row — a club side or a
 * school the directory never had is a real opponent, and a field that only
 * took directory rows would make the coach lie about who they played to get
 * past it. Enter takes the current row, a click takes that row, and leaving
 * the field with something typed that is not the chosen school keeps the
 * typed text as the school (with no program behind it), so nothing the coach
 * wrote is silently dropped.
 *
 * What it changes is the roster the opponent picker offers, which is why it
 * is drawn ABOVE the opponent's name: a directory school brings its saved
 * names, a typed one brings none. The line under the field says which it is.
 */
function SchoolField({
  value,
  onChange,
  ourTeam,
  disabled,
}: {
  value: OpponentSchool;
  onChange: (next: OpponentSchool) => void;
  ourTeam: "mens" | "womens" | null;
  disabled: boolean;
}) {
  const listboxId = useId();
  const [term, setTerm] = useState(value.name);
  const [open, setOpen] = useState(false);
  // Follow a school the PARENT changes (it clears the field when "Save and
  // next round" / "Save and start consolation" opens a new opponent's
  // round). Compared against the last value seen, during render, so typing
  // — which never touches `value` until a commit — is left alone.
  const [seenName, setSeenName] = useState(value.name);
  if (value.name !== seenName) {
    setSeenName(value.name);
    setTerm(value.name);
  }
  const results = useProgramSearch(term);

  const typed = term.trim();
  // Our team's programs only: the directory lists a school once per team,
  // and "Stanford University" twice with the same line under it is a coin
  // toss that files the opponent onto the wrong roster.
  const rows = results
    .filter((row) => ourTeam === null || row.team === ourTeam)
    .slice(0, MAX_SCHOOL_ROWS);
  // The typed row: always there once something is typed, even beside an
  // exact directory hit — "Ridgeline University" from the directory and
  // "Ridgeline University" typed past it are different answers (one has a
  // roster), and the coach gets to say which.
  const typedRow = typed.length > 0;
  const rowCount = rows.length + (typedRow ? 1 : 0);
  const listed = open && rowCount > 0;

  const commit = (next: OpponentSchool) => {
    setTerm(next.name);
    onChange(next);
    setOpen(false);
  };

  const activateRow = (index: number) => {
    const row = rows[index];
    if (row) {
      commit({ name: row.schoolName, programKey: row.programKey });
    } else if (typedRow) {
      commit({ name: typed, programKey: null });
    }
  };

  const { activeIndex, setActiveIndex, optionId, onKeyDown } = useListboxNav({
    count: rowCount,
    open: listed,
    onSelect: activateRow,
    onDismiss: () => setOpen(false),
    idPrefix: listboxId,
  });

  // Leaving the field is an answer too. Typed text that is not the chosen
  // school becomes the school, typed — never a directory row the coach did
  // not pick, and never the old value under new text.
  const settle = () => {
    setOpen(false);
    if (typed === value.name.trim()) return;
    onChange({ name: typed, programKey: null });
  };

  const directory = value.programKey !== null && value.name.trim() !== "";

  return (
    <div className="relative flex flex-col gap-1.5">
      <input
        value={term}
        disabled={disabled}
        onChange={(event) => {
          setTerm(event.target.value);
          setOpen(true);
        }}
        onBlur={settle}
        onKeyDown={(event) => {
          if (listed) {
            onKeyDown(event);
            return;
          }
          if (event.key === "Enter") {
            event.preventDefault();
            settle();
          }
        }}
        placeholder="Search programs, or type a school"
        aria-label="Their school"
        role="combobox"
        aria-expanded={listed}
        aria-controls={listed ? listboxId : undefined}
        aria-activedescendant={listed ? optionId(activeIndex) : undefined}
        aria-autocomplete="list"
        // The rule under the field thickens to 2px blue on focus — the one
        // indicator, so the field ring on top of it would be a second.
        data-focus-ring="none"
        className={cn(advField("underline"), "w-full min-w-0 outline-none")}
      />
      <span className="text-micro" style={{ color: "var(--ink-500)" }}>
        {value.name.trim() === ""
          ? "Decides whose roster their player is picked from."
          : directory
            ? "On the directory · their saved roster is offered below."
            : "Typed · no saved roster, so their player is typed too."}
      </span>

      {listed ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Schools"
          // Keeps focus in the field across a click on a row, so the click
          // lands before the blur would have settled the typed text.
          onMouseDown={(event) => event.preventDefault()}
          className="absolute top-[calc(100%-18px)] left-0 z-20 flex w-[320px] max-w-[calc(100vw-32px)] flex-col gap-1 rounded-[var(--radius-dropdown)] border border-[var(--border-medium)] bg-[var(--surface-card)] p-1.5 shadow-[var(--shadow-dropdown)]"
        >
          {rows.map((row, index) => (
            <SchoolOption
              key={`${row.programKey}:${row.team}`}
              id={optionId(index)}
              active={activeIndex === index}
              onHover={() => setActiveIndex(index)}
              onClick={() => activateRow(index)}
              title={row.schoolName}
              note={[divisionLabel(row.division), row.conference]
                .filter(Boolean)
                .join(" · ")}
            />
          ))}
          {typedRow ? (
            <SchoolOption
              id={optionId(rows.length)}
              active={activeIndex === rows.length}
              onHover={() => setActiveIndex(rows.length)}
              onClick={() => activateRow(rows.length)}
              title={`Use "${typed}" as typed`}
              note="No program record — their player gets typed by hand."
              divided={rows.length > 0}
            />
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

/** One row of the School field's list: a directory school, or the typed text. */
function SchoolOption({
  id,
  active,
  onHover,
  onClick,
  title,
  note,
  divided = false,
}: {
  id: string;
  active: boolean;
  onHover: () => void;
  onClick: () => void;
  title: string;
  note: string;
  divided?: boolean;
}) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      onMouseEnter={onHover}
      onClick={onClick}
      className={cn(
        "flex cursor-pointer flex-col gap-0.5 rounded-[var(--radius-element)] px-2.5 py-2 text-left transition-colors duration-[var(--duration-hover)]",
        active ? "bg-[var(--surface-subtle)]" : null,
        divided && "mt-0.5 border-t border-[var(--border-hairline)] pt-2.5",
      )}
    >
      <span className="truncate text-[12px] font-medium text-[var(--ink-900)]">
        {title}
      </span>
      {note ? (
        <span
          className="text-micro truncate"
          style={{ color: "var(--ink-600)" }}
        >
          {note}
        </span>
      ) : null}
    </li>
  );
}

/**
 * The opponent the lineup left blank, named in their score row — the lineup
 * page's own pickers, so the same names and the same rules: the typed popup
 * over their saved roster on a singles line, and the pick-two pair checklist
 * on a doubles line. Saving writes the name back to the lineup too.
 *
 * On a tournament round it is drawn even with a name in it: the popup opens
 * on the recorded name, and committing another one replaces it — saving then
 * renames that round's match and no other round's (`recordResult`'s
 * `syncEntryOpponent` writes the entry only from the entry's latest round).
 * Its roster is the School field's: pick a directory school there and the
 * popup offers that program's saved names; type one and it is a plain field.
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
