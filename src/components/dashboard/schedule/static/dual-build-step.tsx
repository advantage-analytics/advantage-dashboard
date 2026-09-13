"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DOUBLES_SLOTS, SINGLES_SLOTS } from "@/lib/schedule/courts";
import { DateField } from "@/components/ui/date-field";
import { MenuSelect, type MenuOption } from "@/components/ui/menu-select";
import { resultLabelFromOutcome } from "@/components/dashboard/schedule/result-choice";
import {
  useOpponentPool,
  type OpponentPool,
} from "@/components/dashboard/schedule/static/opponent-popup";
import {
  DoublesLineup,
  LineupHeading,
  SinglesLineup,
} from "@/components/dashboard/schedule/static/lineup-rows";
import { useNewDualData } from "@/components/dashboard/schedule/static/dual-school-step";
import { programDisplayName } from "@/lib/data/programs-server";
import {
  createDual,
  updateDual,
  type LineupLineInput,
} from "@/lib/schedule/actions";
import {
  EVENT_FORMATS,
  siteTitle,
  splitNames,
  todayISO,
  type EventFormatValue,
} from "@/lib/schedule/format";
import { rosterIdsForLabels } from "@/lib/schedule/roster-match";
import {
  draftClashes,
  draftOurNames,
  isDraftLineSet,
} from "@/lib/schedule/lineup-validation";
import {
  applySinglesOrder,
  type SinglesOccupant,
} from "@/lib/schedule/singles-order";
import { courtIndex } from "@/lib/schedule/courts";
import type { LadderPlayer } from "@/lib/data/roster-server";
import type { ProgramSearchResult } from "@/lib/data/programs-server";
import type { EventSite, LineupLine } from "@/lib/schedule/types";

/**
 * The school step one chose, as step two receives it.
 *
 * Two shapes rather than a name beside a nullable row, so the name and the
 * row cannot disagree: a directory pick carries the row and nothing else — its
 * name is read off the row wherever it is printed — and a typed opponent
 * carries the text and no row. `createDual` takes the two apart again at
 * submit: the squad-qualified `programDisplayName` and the key for a pick,
 * the text and a null key for the rest.
 */
export type ChosenSchool =
  | { kind: "program"; program: ProgramSearchResult }
  | { kind: "text"; name: string };

/**
 * One row of the Format control: the option it is, and what it means.
 *
 * ── Why this is a table and not an encoding ────────────────────────────────
 * The deleted `dual-form.tsx` carried the format through a `<select>` as one
 * pipe-joined string of the two fields, and decoded it by splitting on the
 * pipe, numbering the first half and string-comparing the second against the
 * word true. Until an earlier pass the cell here held the same string, with
 * both halves hard-coded — and because `adScoring` is `boolean | null` on
 * `EventFormat`, a null interpolates into such a string as the four characters
 * spelling null, which that comparison then reads as a confident
 * `false`: a wrong answer that looks like a real one. That is the recorded
 * cause of a real outage — format arrived as `{}`, `adScoring` arrived null,
 * and every tournament video failed vendor submission long after the coach had
 * left. See `docs/ui-revamp-guardrails.md` §3.1 and §4, and `TournamentFormat`
 * in `static-tournament-builder.tsx`, which made this same call first.
 *
 * So there is no encoding to get wrong. `value` is an opaque option name that
 * is only ever compared, never parsed; `bestOf` and `adScoring` are stated as
 * literals in `FORMATS` and travel as themselves. `adScoring` is typed
 * `boolean` rather than `boolean | null`, which makes "the control carries a
 * real boolean" a compile error to break rather than a convention to
 * remember: no null can be assigned into this shape, so none can reach
 * `createDual`'s `format` jsonb.
 *
 * `sets` and `scoring` are the two strings `2b` prints — the sets half inside
 * the underline, the scoring half under it. Both are read off the chosen row,
 * so the label and the value cannot drift into disagreeing about which format
 * this dual is.
 */
export interface DualFormat {
  /** The option's name — matched against, never split. */
  value: EventFormatValue;
  /** What the closed cell prints, and the menu row's first line. */
  sets: string;
  /** What prints under the cell, and the menu row's second line. */
  scoring: string;
  bestOf: number;
  adScoring: boolean;
}

/**
 * The four formats the control offers.
 *
 * `2b` draws one — "Best of 3 sets" over "No-ad scoring" — and no dropdown
 * contents, so the other three are built from vocabulary that already exists
 * rather than invented: "One set", "ad" and "no-ad" are the dormant
 * `FORMATS`' words, in that table's order. The first row is what the artboard
 * draws, and what a new dual opens on.
 */
/**
 * `2b`'s wording over the shared format table.
 *
 * Only the words live here. `bestOf` and `adScoring` come from
 * `EVENT_FORMATS` in `lib/schedule/format.ts`, so the two builders cannot word
 * the same option differently where it counts — see that table's header, and
 * `docs/ui-revamp-guardrails.md` §3.1 and §4.
 */
const FORMAT_WORDS: Record<
  EventFormatValue,
  { sets: string; scoring: string }
> = {
  "bo3-no-ad": {
    sets: "Best of 3 sets",
    scoring: "No-ad scoring",
  },
  "bo3-ad": {
    sets: "Best of 3 sets",
    scoring: "Ad scoring",
  },
  "one-set-no-ad": {
    sets: "One set",
    scoring: "No-ad scoring",
  },
  "one-set-ad": {
    sets: "One set",
    scoring: "Ad scoring",
  },
};

export const FORMATS: readonly DualFormat[] = EVENT_FORMATS.map((format) => ({
  ...format,
  ...FORMAT_WORDS[format.value],
}));

/**
 * The Format control's options: one per `FORMATS` row, carrying `2b`'s two
 * halves as the two lines `MenuSelect` draws — `sets` as the label the closed
 * trigger prints, `scoring` as the description beneath it in the open menu.
 *
 * Pure and exported so the mapping can be asserted without mounting the step
 * (`tests/dual-format-options.spec.ts`). What it deliberately does NOT carry
 * is `bestOf` or `adScoring`: an option is a NAME to look the row back up by,
 * so nothing downstream can read a scoring rule off the dropdown instead of
 * off the row. See `DualFormat`'s header and
 * `docs/ui-revamp-guardrails.md` §3.1.
 */
export function formatOptions(
  formats: readonly DualFormat[],
): MenuOption<EventFormatValue>[] {
  return formats.map((format) => ({
    value: format.value,
    label: format.sets,
    description: format.scoring,
  }));
}

/** Built once: `FORMATS` is a module constant, so its options are too. */
const FORMAT_OPTIONS = formatOptions(FORMATS);

/** What `2b` draws: best of 3, no-ad. Explicit — never a default standing in
 *  for a null. */
const DEFAULT_FORMAT =
  FORMATS.find((format) => format.value === "bo3-no-ad") ?? FORMATS[0];

/**
 * The three sites a dual can be at, titled through the shared schedule
 * formatter and in the dormant form's order. `EventSite` on `value`, so the
 * union is checked here rather than cast at the change handler.
 */
const SITES: readonly { value: EventSite; label: string }[] = (
  ["home", "away", "neutral"] as const
).map((value) => ({ value, label: siteTitle(value) }));

/**
 * The surfaces a dual can be on — `programs.default_surface`'s own vocabulary,
 * which is the settings form's `SURFACE_OPTIONS` (`team-settings-form.tsx`).
 *
 * Not the dormant form's "Hard"/"Indoor hard" list: the column stores the
 * lowercase key, this cell opens on that column's value, and the event page
 * prints `event.surface` verbatim — so a dual written from here has to spell
 * its surface the way the program's default already does, or one schedule
 * reads "hard" on one row and "Hard" on the next. The first option is none,
 * under the app's own glyph for an absent value; `createDual` stores it as a
 * null column.
 */
const SURFACES: readonly { value: string; label: string }[] = [
  { value: "", label: "—" },
  { value: "hard", label: "Hard" },
  { value: "clay", label: "Clay" },
  { value: "grass", label: "Grass" },
  { value: "carpet", label: "Carpet" },
];

/** The four facts `2b`'s top row asks for, held as what the coach entered. */
interface DualDraft {
  /** YYYY-MM-DD, as `program_events.starts_on` stores it. */
  date: string;
  site: EventSite;
  /** One of `SURFACES`' values; `""` is none. */
  surface: string;
  format: DualFormat;
}

/**
 * Six singles and three doubles, seeded from the ladder where there is one.
 *
 * `dual-form.tsx`'s own, ported unchanged as that file is deleted: S1–S6 take
 * `ladder[0..5]` and D1–D3 pair out of the same list. A program with no ladder
 * gets nine empty courts rather than an invented order — roster join order is
 * not a ranking, and printing it as S1–S6 would be the form claiming to know
 * something nobody told it.
 *
 * This replaces `DUAL_DRAFT_LINES`, the artboard's own nine rows. Those were
 * stated rather than seeded because `2b` draws S6 forfeited while pairing
 * Adeyemi into D3, so no derivation can satisfy both halves of the drawing —
 * a contradiction recorded as item 24 in the regression note. A real ladder
 * resolves it by being real: if nobody can play S6, the coach leaves it empty
 * and records the forfeit on the event page's score flow.
 */
function seedLineup(ladder: LadderPlayer[]): LineupLine[] {
  // Only players the program actually ranked. `getLadder` returns the whole
  // roster, sorting the unranked alphabetically last — so `ladder[0..5]` on a
  // program that never set a ladder is alphabetical order presented as S1–S6.
  // That is the "invented order" the paragraph above forbids, and it would be
  // persisted: these ids become `program_event_entries.player_user_ids`
  // against court numbers nobody assigned.
  const ranked = ladder.filter((player) => player.ladderPosition !== null);

  const singles = SINGLES_SLOTS.map((slot, index) => {
    const player = ranked[index];
    return {
      key: slot,
      slot,
      discipline: "singles" as const,
      ourIds: player ? [player.userId] : [],
      ourLabels: player ? [player.name] : [],
      theirLabels: [],
      noPlayer: false,
      theirNoPlayer: false,
    };
  });

  const doubles = DOUBLES_SLOTS.map((slot, index) => {
    // A pair or nothing. An odd ranked count would otherwise leave one player
    // alone on a doubles court, which submits as `discipline: "doubles"` with a
    // single id and later mints a doubles match with one name — the same
    // "claiming to know something nobody told it" the singles filter above
    // refuses.
    const slice = ranked.slice(index * 2, index * 2 + 2);
    const pair = slice.length === 2 ? slice : [];
    return {
      key: slot,
      slot,
      discipline: "doubles" as const,
      ourIds: pair.map((player) => player.userId),
      ourLabels: pair.map((player) => player.name),
      theirLabels: [],
      noPlayer: false,
      theirNoPlayer: false,
    };
  });

  return [...singles, ...doubles];
}

/**
 * A draft handed in from outside — one line's half of it.
 *
 * Keyed by `LineupLine.key` (S1–S6, D1–D3) rather than by index, because an
 * index is exactly the mistake `LineRow`'s header forbids: one row off, and a
 * name lands on a court nobody meant. A key that matches no seeded line is
 * simply not applied.
 *
 * Every field is optional and every absent field means "leave the ladder's
 * seed alone".
 */
export interface DualLineSeed {
  /** `"S1"`…`"D3"` — the same string `seedLineup()` puts on `key` and `slot`. */
  key: string;
  /**
   * The `program_event_entries` row this line was loaded from, when there is
   * one.
   *
   * **Every loaded line must state it, and `submit()` must send it back.**
   * `planEntryChanges` matches a submitted line to a saved one by id first and
   * by slot second, so a lineup round-tripped without ids reads as nine
   * deletes and nine inserts the moment any slot moves — and a renamed slot
   * would orphan the matches hanging off the row it used to be. See
   * `LineupLineInput.id` and `entry-plan.ts`.
   */
  id?: string;
  /** Stable roster identities saved beside `ourLabels`. */
  ourIds?: string[];
  ourLabels?: string[];
  theirLabels?: string[];
  /** Saved as "No player" — see `LineupLine.noPlayer`. */
  noPlayer?: boolean;
  /** Saved as the opponent's "No player" — see `LineupLine.theirNoPlayer`. */
  theirNoPlayer?: boolean;
  /**
   * This line is settled and may not be edited — `isSettled` in
   * `entry-plan.ts` is the same question, asked server-side at save.
   *
   * `"played"` — a `matches` row points at it. Otherwise the saved outcome's
   * own words ("We won — opponent forfeited"), legacy forfeits included.
   * Either way `planEntryChanges` REFUSES the whole save if the submission
   * moves it, so the row is drawn read-only rather than offered as an edit
   * that will be rejected after the coach has retyped it. Absent means a free
   * line.
   */
  locked?: DualLineLock;
}

export type DualLineLock = "played" | ReturnType<typeof resultLabelFromOutcome>;

/**
 * The facts and lines a caller can open the builder on.
 *
 * T19 hands one in; `NewDualFlow` passes none, and every absent field falls
 * back to exactly what a new dual has always opened on — today, home, the
 * program's `default_surface`, `2b`'s format, and `seedLineup()`'s nine
 * courts.
 *
 * `format` is the option NAME (`EventFormatValue`), never a `"<bestOf>|<ad>"`
 * string and never a pair of loose numbers: `useDualDraft` resolves it to the
 * `FORMATS` row, which states `bestOf` and `adScoring` as literals. See
 * `DualFormat`'s header and `docs/ui-revamp-guardrails.md` §3.1 — there is no
 * encoding here to get wrong, and a seed cannot introduce one.
 */
export interface DualDraftSeed {
  /**
   * The dual being edited. Present ONLY on an edit — its presence is what
   * makes `submit()` call `updateDual` instead of `createDual`, and it is the
   * one field that says which of the two writes this draft is for.
   *
   * Not folded into `CreateDualInput` as an optional field: creating and
   * editing are different actions with different rules (an edit consults
   * `planEntryChanges` before it writes anything at all), and a create call
   * that quietly became an update on the strength of one extra property is
   * exactly the branch this seed keeps out of `actions.ts`.
   */
  eventId?: string;
  /** YYYY-MM-DD. */
  date?: string;
  site?: EventSite;
  /** One of `SURFACES`' values; `""` is none, and is honoured as none. */
  surface?: string;
  format?: EventFormatValue;
  lines?: DualLineSeed[];
}

/** The `FORMATS` row an option name names, or `2b`'s own. Never a parse. */
function formatFor(value: EventFormatValue | undefined): DualFormat {
  if (!value) return DEFAULT_FORMAT;
  return FORMATS.find((option) => option.value === value) ?? DEFAULT_FORMAT;
}

/**
 * The saved entry id behind each seeded line — see `DualLineSeed.id`.
 *
 * Pulled out of `useDualDraft` (a mechanical extraction, no behaviour change)
 * so the seed→payload path is importable without mounting the hook. See
 * `tests/entry-round-trip.spec.ts`.
 */
export function seededIdsFromSeed(
  initial?: DualDraftSeed,
): Map<string, string> {
  return new Map(
    (initial?.lines ?? [])
      .filter((row): row is DualLineSeed & { id: string } => Boolean(row.id))
      .map((row) => [row.key, row.id] as const),
  );
}

/** Which courts are settled, and how — see `DualLineSeed.locked`. */
export function lockedByKeyFromSeed(
  initial?: DualDraftSeed,
): Record<string, DualLineLock> {
  const locked: Record<string, DualLineLock> = {};
  for (const row of initial?.lines ?? []) {
    if (row.locked) locked[row.key] = row.locked;
  }
  return locked;
}

/** The nine courts, seeded from the ladder and overlaid with `initial.lines`. */
export function seedDualLines(
  ladder: LadderPlayer[],
  initial?: DualDraftSeed,
): LineupLine[] {
  // A seed that states its lines is a lineup that was SAVED, and a court it
  // does not mention is a court that has no saved row — because the coach
  // emptied it. Falling back to the ladder there would quietly put a doubles
  // pair back on a court they deliberately removed, and the next save would
  // insert it for real. Only a draft with no `lines` at all (a brand new dual)
  // opens on the ladder.
  const loaded = initial?.lines !== undefined;

  return seedLineup(ladder).map((line) => {
    const seed = initial?.lines?.find((row) => row.key === line.key);
    if (!seed) {
      if (!loaded) return line;
      return {
        ...line,
        ourIds: [],
        ourLabels: [],
        theirLabels: [],
        noPlayer: false,
        theirNoPlayer: false,
      };
    }
    const ourLabels = seed.ourLabels ?? line.ourLabels;
    return {
      ...line,
      ourLabels,
      // New identity-aware seeds carry the saved ids. The fallback preserves
      // compatibility with older callers that supplied labels alone.
      ourIds: seed.ourIds ?? rosterIdsForLabels(ourLabels.join(" / "), ladder),
      theirLabels: seed.theirLabels ?? line.theirLabels,
      noPlayer: seed.noPlayer ?? false,
      theirNoPlayer: seed.theirNoPlayer ?? false,
    };
  });
}

/**
 * The lines that count toward the write — set (a player, a pair, or No
 * player), or already settled. A dual saves only when all nine are here; see
 * `useDualDraft`'s `lineCount` and `validateDualLineup`.
 */
export function filledDualLines(
  lines: LineupLine[],
  lockedByKey: Record<string, DualLineLock>,
): { line: LineupLine; ours: string[]; theirs: string[] }[] {
  return lines
    .map((line) => ({
      line,
      ours: line.noPlayer ? [] : draftOurNames(line),
      theirs:
        line.noPlayer || line.theirNoPlayer
          ? []
          : splitNames(line.theirLabels.join(" / ")),
    }))
    .filter(
      (row) =>
        isDraftLineSet(row.line) ||
        // A settled line always submits, whatever is on it: dropping it would
        // submit a lineup missing a line the save is not allowed to delete.
        lockedByKey[row.line.key] !== undefined,
    );
}

/**
 * The nine courts as the two writes take them — `useDualDraft`'s
 * `payloadLines()`, pulled out so it can be composed and tested without the
 * hook. One mapping for create and edit both, so an edit cannot start sending
 * a subtly different row than a create does. `id` is the only field that
 * means anything to just one of them: `createDual` ignores it, and
 * `updateDual` needs EVERY loaded line to carry it or `planEntryChanges`
 * matches by slot, where a reorder reads as a rename and the save is refused.
 */
export function buildDualPayloadLines(
  filled: { line: LineupLine; ours: string[]; theirs: string[] }[],
  seededIds: Map<string, string>,
): LineupLineInput[] {
  return filled.map((row) => ({
    // Absent on a line the coach typed into an empty court — a fresh line
    // has no saved row to be, and `planEntryChanges` inserts it.
    id: seededIds.get(row.line.key),
    discipline: row.line.discipline,
    slot: row.line.slot,
    // The court's own index, NOT this row's index in `filled`. `filled` skips
    // empty courts, so an index into it moves whenever a court above changes:
    // fill an empty S1 above a played S2 and S2's position slides 0 → 1,
    // `planEntryChanges` reads that as an edit to a settled line, and the whole
    // save is refused naming a court the coach never touched. A dual's court
    // order is fixed, so the position of a line is a fact about its slot and
    // nothing else.
    position: courtIndex(row.line.slot),
    // A result does not erase the lineup: a settled line hands back the
    // identities and labels it was saved with.
    playerUserIds: row.line.noPlayer ? [] : row.line.ourIds,
    playerLabels: row.ours,
    opponentLabels: row.theirs,
    noPlayer: row.line.noPlayer,
    opponentNoPlayer: row.line.theirNoPlayer,
  }));
}

/**
 * The ladder plus players added from a court, each id once.
 *
 * A player added mid-lineup is held locally until the route re-renders, and
 * `addProgramPlayer`'s revalidation then hands the same player back inside
 * `ladder`. Appending blindly listed them twice — two rows under one React key
 * in every picker, and a player who could be chosen twice.
 */
export function withAddedPlayers(
  ladder: LadderPlayer[],
  added: LadderPlayer[],
): LadderPlayer[] {
  if (added.length === 0) return ladder;
  const known = new Set(ladder.map((player) => player.userId));
  const fresh = added.filter((player) => !known.has(player.userId));
  return fresh.length === 0 ? ladder : [...ladder, ...fresh];
}

/**
 * A new dual's draft: the four facts, the nine lines, the opponent's pool, and
 * the write.
 *
 * ── Why this is a hook and not a component ─────────────────────────────────
 * The builder is being taken apart into steps, and the one thing the steps
 * cannot each own is the draft: a lineup held inside the lineup step would be
 * thrown away every time the coach walked back to the facts, and a facts step
 * that held the date would leave `submit()` with nothing to send. So the draft
 * lives above whatever is on screen and the step bodies below are given the
 * slice they draw. Nothing here renders.
 *
 * ── The lineup ─────────────────────────────────────────────────────────────
 * Seeded once from `getLadder` through `seedLineup()`, then overlaid with
 * `initial.lines` where a caller states one. Seeded ONCE on purpose: a ladder
 * that changed under an open builder would rewrite a lineup the coach is
 * halfway through entering, which is the one thing this screen must not do.
 *
 * `ourIds` is recomputed from the label on every edit rather than tracked
 * beside it, so the two cannot drift — see `editOurLabels`.
 *
 * ── The opponent's pool ────────────────────────────────────────────────────
 * The school and ITS saved roster travel as one value, stamped with the
 * `schoolKey` the fetch was made for. `dual-form.tsx`'s rule, ported: an
 * in-flight request for School A must not land after a change of school and
 * pose as School B's.
 */
export function useDualDraft(school: ChosenSchool, initial?: DualDraftSeed) {
  const { ladder, defaultSurface } = useNewDualData();

  const router = useRouter();
  const [pending, startTransition] = useTransition();
  /** `createDual`'s `ActionError`, held so the footer can print it. */
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<DualDraft>(() => ({
    date: initial?.date ?? todayISO(),
    site: initial?.site ?? "home",
    // The seed first — including `""`, which is a coach saying "no surface"
    // and not an absent answer — then the program's own default, then none.
    // Never "Hard": a court type nobody stated is a fact about the fixture we
    // would be inventing.
    surface:
      initial?.surface !== undefined ? initial.surface : (defaultSurface ?? ""),
    format: formatFor(initial?.format),
  }));

  /**
   * The saved entry behind each seeded line, and whether it is settled.
   *
   * Held beside `lines` rather than folded into `LineupLine`, which is the
   * pre-persist shape and says so: a line the coach typed has no id and no
   * lock, and widening the type would make both look optional on every row
   * rather than absent from the ones that never had them.
   *
   * Keyed on `LineupLine.key` (S1–D3) — never on an index. `DualLineSeed`'s
   * header states why, and it is the same reason: one row off, and an id lands
   * on a court nobody meant, which is a save that re-points a played line at
   * another player.
   */
  const seededIds = useMemo(() => seededIdsFromSeed(initial), [initial?.lines]);

  const lockedByKey = useMemo(
    () => lockedByKeyFromSeed(initial),
    [initial?.lines],
  );

  // Seeded once. See the header.
  const [lines, setLines] = useState<LineupLine[]>(() =>
    seedDualLines(ladder, initial),
  );

  /**
   * Players created from a lineup court, mid-flow.
   *
   * `addProgramPlayer` revalidates the roster's routes, but this client tree
   * holds the ladder it was rendered with — the new row will not appear in
   * `useNewDualData()` until a navigation re-runs the loader, which is long
   * after the coach has typed the other eight courts. So the ids they carry
   * are remembered here, and `editOurLabels` resolves against ladder + these.
   * Nothing invented: every entry came back from the server with a real
   * `program_players.id`.
   */
  const [extraPlayers, setExtraPlayers] = useState<LadderPlayer[]>([]);

  /** The ladder as this flow now knows it — see `extraPlayers`. */
  const roster = useMemo(
    () => withAddedPlayers(ladder, extraPlayers),
    [ladder, extraPlayers],
  );

  function edit(patch: Partial<DualDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  const schoolName =
    school.kind === "program" ? school.program.schoolName : school.name;
  // `OpponentTarget.key`'s mechanism (`opponent-name-cell.tsx`): every name on
  // a line is typed against ONE school, and this key rides in each row's React
  // key so a change of school remounts the row and drops the name with it.
  const schoolKey =
    school.kind === "program"
      ? `program:${school.program.programKey}`
      : `text:${school.name}`;

  // The one place the school and its saved roster are joined, and the only
  // thing the popups are given — see `OpponentPool` and `useOpponentPool`.
  const pool = useOpponentPool(
    school.kind === "program" ? school.program.programKey : null,
    schoolKey,
    schoolName,
  );

  /**
   * One line's own side, edited in place.
   *
   * Stored raw as ONE label, not split: `splitNames` at the boundaries is what
   * turns "Dana Brooks / Ama Osei" into two, and doing it per keystroke eats
   * the space the coach just pressed — "Dana Brooks" could then only be typed
   * as "DanaBrooks" (`lineup-editor.tsx` records that bug).
   *
   * `ourIds` is recomputed from the label every time rather than tracked
   * beside it, so the two cannot drift: `rosterIdsForLabels` is exact beyond
   * case and whitespace, so a name typed over a rostered player contributes no
   * id at all rather than that player's — this is the id the line's eventual
   * match is attributed to, and a looser rule would hand an athlete's match to
   * someone else with nothing on screen saying so.
   */
  function editOurLabels(key: string, value: string, added?: LadderPlayer) {
    // The just-created player is folded in for THIS call as well as kept,
    // because `roster` is this render's value and `setExtraPlayers` will not
    // have widened it yet. Without that, the player the coach just added
    // resolves to no id on the very edit that placed them — the exact silent
    // miss this screen is being fixed for.
    const against = added ? [...roster, added] : roster;
    if (added) {
      setExtraPlayers((current) =>
        current.some((player) => player.userId === added.userId)
          ? current
          : [...current, added],
      );
    }
    setLines((current) =>
      current.map((line) =>
        line.key === key
          ? {
              ...line,
              ourLabels: [value],
              ourIds: rosterIdsForLabels(value, against),
              noPlayer: false,
            }
          : line,
      ),
    );
  }

  /** Apply an explicit roster choice without reparsing its display label. */
  function selectOurPlayers(
    key: string,
    selection: { ids: string[]; labels: string[] },
  ) {
    setLines((current) =>
      current.map((line) =>
        line.key === key
          ? {
              ...line,
              ourIds: selection.ids,
              ourLabels: selection.labels,
              noPlayer: false,
            }
          : line,
      ),
    );
  }

  /**
   * "No player" on one court: nobody on our side, and nobody to name on
   * theirs — the save records a forfeit for us. Choosing a player afterwards
   * (`editOurLabels`, `selectOurPlayers`, a drag) takes it back.
   */
  function setNoPlayer(key: string) {
    if (lockedByKey[key]) return;
    setLines((current) =>
      current.map((line) =>
        line.key === key
          ? {
              ...line,
              ourIds: [],
              ourLabels: [],
              theirLabels: [],
              noPlayer: true,
              // One side forfeits a court, never both.
              theirNoPlayer: false,
            }
          : line,
      ),
    );
  }

  function editTheirLabels(key: string, value: string) {
    setLines((current) =>
      current.map((line) =>
        line.key === key
          ? { ...line, theirLabels: [value], theirNoPlayer: false }
          : line,
      ),
    );
  }

  /**
   * "No player" across the net: the opponent has nobody for this court, and
   * the save records THEIR forfeit — the point to us. Naming an opponent
   * afterwards (`editTheirLabels`) takes it back. Not offered while our own
   * side is No player: one side forfeits a court, never both.
   */
  function setTheirNoPlayer(key: string) {
    if (lockedByKey[key]) return;
    setLines((current) =>
      current.map((line) =>
        line.key === key && !line.noPlayer
          ? { ...line, theirLabels: [], theirNoPlayer: true }
          : line,
      ),
    );
  }

  /**
   * A new singles order from the lineup's drag — S1…S6's occupants, in order.
   *
   * The one lineup write that spans lines, so it is taken as a whole order and
   * applied by the singles lines' own order (`applySinglesOrder`), never by a
   * slot string or an index a row computed. Opponents stay on their lines.
   * Refused while any singles line is settled.
   */
  function setSinglesOrder(order: SinglesOccupant[]) {
    setLines((current) => applySinglesOrder(current, order, lockedByKey));
  }

  // A line counts once it is set — a player, a pair, or No player — and a
  // settled line counts whoever is on it. The dual saves at nine of nine: a
  // hole would read as unfinished and as forfeited at once, and `dualScore`
  // would read a decided 4–3 as a 4–3 out of eight.
  const filled = filledDualLines(lines, lockedByKey);
  // A player already on another line of the same kind is a line still to
  // set, not a set one — see `lineupClashes`.
  const clashes = draftClashes(lines);
  const lineCount = filled.filter(
    (row) =>
      !clashes.has(row.line.slot) || lockedByKey[row.line.key] !== undefined,
  ).length;
  const lineTotal = lines.length;

  // The name the dual is recorded under — squad-qualified for a directory
  // pick, so a school fielding both sides is two opponents and not one, and
  // the typed text otherwise. `ChosenSchool` states this contract.
  const opponentName =
    school.kind === "program"
      ? programDisplayName(school.program.schoolName, school.program.team)
      : school.name;

  // Whether the singles block may promise "from your ladder" — see
  // `DualLineupStep`.
  const laddered = ladder.some((player) => player.ladderPosition !== null);

  /**
   * The nine courts as the two writes take them.
   *
   * One mapping for create and edit both, so an edit cannot start sending a
   * subtly different row than a create does. `id` is the only field that means
   * anything to just one of them: `createDual` ignores it, and `updateDual`
   * needs EVERY loaded line to carry it or `planEntryChanges` matches by slot,
   * where a reorder reads as a rename and the save is refused.
   */
  function payloadLines(): LineupLineInput[] {
    return buildDualPayloadLines(filled, seededIds);
  }

  /**
   * Write the draft — creating a dual, or saving one that already exists.
   *
   * Two actions, chosen here by whether the seed named an event, rather than
   * one action that decides for itself. `updateDual` takes no opponent at all:
   * a dual's school is fixed once its lines point at it, which is why the edit
   * flow pins the school with no way to change it.
   */
  function submit() {
    setError(null);
    const eventId = initial?.eventId;

    startTransition(async () => {
      const result = eventId
        ? await updateDual({
            eventId,
            date: draft.date,
            site: draft.site,
            surface: draft.surface,
            bestOf: draft.format.bestOf,
            adScoring: draft.format.adScoring,
            lines: payloadLines(),
          })
        : await createDual({
            opponent: opponentName,
            // The key, never the uuid: `createDual` resolves it server-side, and
            // a key that resolves to nothing leaves the dual on free text rather
            // than refusing it.
            opponentProgramKey:
              school.kind === "program" ? school.program.programKey : null,
            date: draft.date,
            site: draft.site,
            surface: draft.surface,
            // Read off the chosen `FORMATS` row, which states both as literals.
            // Nothing here parses a string, so no null can arrive as "null".
            bestOf: draft.format.bestOf,
            adScoring: draft.format.adScoring,
            lines: payloadLines(),
          });

      if ("error" in result) {
        // The action's own sentence, on screen. A refusal that only turned the
        // button off would leave a coach re-clicking a form that had already
        // said why it could not save.
        setError(result.error);
        return;
      }

      router.push(`/dashboard/team/schedule/${result.eventId}`);
    });
  }

  return {
    draft,
    edit,
    lines,
    /** Which courts are settled, and how — see `DualLineSeed.locked`. */
    locked: lockedByKey,
    pool,
    laddered,
    editOurLabels,
    selectOurPlayers,
    editTheirLabels,
    setNoPlayer,
    setTheirNoPlayer,
    setSinglesOrder,
    lineCount,
    lineTotal,
    opponentName,
    submit,
    pending,
    error,
  };
}

/**
 * The four facts `2b` draws across the top: Date, Site, Surface, Format.
 *
 * A body, not a screen — no shell, no header and no footer, so whichever frame
 * shows it decides those. `2b` draws the four in one four-up at `gap:24px`.
 *
 * ── What draws what ────────────────────────────────────────────────────────
 *   Date                `DateField variant="bare"` inside `FieldCell`'s ruled
 *                       row. The primitive brings the app's own segments,
 *                       calendar button and popover, so the row draws no
 *                       glyph of its own: the rule and the height are the
 *                       cell's, everything inside them is the field's.
 *   Site/Surface/Format `MenuSelect` — the app's select — in a cell that
 *                       draws no chrome of its own.
 *
 * Format is why `MenuSelect` is here rather than a native select: `2b` prints
 * the sets half inside the underline and the scoring half BELOW it, and an
 * `<option>` carries one label. That used to be a real select laid over the
 * cell at `opacity:0` — invisible, unstyleable, and a second focus target
 * sitting on the cell. `MenuSelect` carries the two halves as an option's
 * label and description, so the open menu says the same two things the closed
 * cell does.
 *
 * `static-tournament-builder.tsx` draws a `FieldCell` of the same name and the
 * same numbers, still on the old pattern. It is a separate task — do not edit
 * it from here, and do not assume the two have already been reconciled.
 */
export function DualFactsStep({
  draft,
  onEdit,
}: {
  draft: DualDraft;
  onEdit: (patch: Partial<DualDraft>) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-6">
      <FieldCell label="Date">
        <DateField
          label="Date"
          variant="bare"
          value={draft.date}
          onChange={(date) => onEdit({ date })}
          className="w-full"
        />
      </FieldCell>

      <FieldCell label="Site" chrome="none">
        <MenuSelect
          label="Site"
          variant="underline"
          value={draft.site}
          options={SITES}
          onChange={(site) => onEdit({ site })}
        />
      </FieldCell>

      <FieldCell label="Surface" chrome="none">
        <MenuSelect
          label="Surface"
          variant="underline"
          value={draft.surface}
          options={SURFACES}
          onChange={(surface) => onEdit({ surface })}
        />
      </FieldCell>

      {/* `2b` draws the ad half BELOW the underline rather than inside the
          value, so the cell prints `scoring` under a trigger printing `sets`
          — the two halves of the one chosen row. */}
      <FieldCell label="Format" chrome="none" note={draft.format.scoring}>
        <MenuSelect
          label="Format"
          variant="underline"
          value={draft.format.value}
          options={FORMAT_OPTIONS}
          onChange={(value) => {
            // The chosen ROW, looked up by option name — never a parse of the
            // option's text. This is `format`'s only assignment, and every row
            // of that table states `adScoring` as a literal boolean. See
            // `DualFormat`'s header and `docs/ui-revamp-guardrails.md` §3.1.
            const chosen = FORMATS.find((option) => option.value === value);
            if (chosen) onEdit({ format: chosen });
          }}
        />
      </FieldCell>
    </div>
  );
}

/**
 * The nine courts: six singles and three doubles — "Grey well" from the Dual
 * Lineup Step canvas.
 *
 * A body, not a screen — see `DualFactsStep`. The rows live in
 * `lineup-rows.tsx`: singles reorder by their grip and across "Not in the
 * lineup", doubles are picked as pairs. How a line finished is not asked
 * here — that is the event page's score flow.
 *
 * The two blocks are cut out of the one `lines` array rather than held apart,
 * so the array `submit()` sends and the rows on screen are the same nine
 * objects in the same order.
 *
 * Each opponent cell is handed an `OpponentPool` — the school and ITS saved
 * roster as one value — so a popup cannot dedupe against a different school's
 * pool, and the pool's key rides in every row's React key.
 */
export function DualLineupStep({
  lines,
  locked,
  pool,
  onOurLabels,
  onOurSelection,
  onTheirLabels,
  onNoPlayer,
  onTheirNoPlayer,
  onSinglesOrder,
}: {
  lines: LineupLine[];
  /**
   * Courts the save may not move, by line key — `useDualDraft().locked`.
   *
   * Empty on a new dual. On an edit it is the same question
   * `planEntryChanges` asks server-side, asked early so a settled line is
   * drawn read-only instead of accepting an edit the save will refuse.
   */
  locked?: Record<string, DualLineLock>;
  /** The school and its saved roster. `pool.key` rides in every row's key. */
  pool: OpponentPool;
  /**
   * Our side of one court. `added` is a player the picker just created,
   * handed over on the same call that names them — see `editOurLabels`.
   */
  onOurLabels: (key: string, value: string, added?: LadderPlayer) => void;
  onOurSelection: (
    key: string,
    selection: { ids: string[]; labels: string[] },
  ) => void;
  onTheirLabels: (key: string, value: string) => void;
  /** `useDualDraft().setNoPlayer` — nobody on our side of this court. */
  onNoPlayer: (key: string) => void;
  /** `useDualDraft().setTheirNoPlayer` — the opponent has nobody here. */
  onTheirNoPlayer: (key: string) => void;
  /** `useDualDraft().setSinglesOrder` — a drag's whole new singles order. */
  onSinglesOrder: (order: SinglesOccupant[]) => void;
}) {
  const singles = lines.filter((line) => line.discipline === "singles");
  const doubles = lines.filter((line) => line.discipline === "doubles");

  // Read from context rather than taken as a prop: the flow already provides
  // it, and every caller would read it from the same place.
  const { ladder } = useNewDualData();

  /**
   * Players added from a court since this step mounted — held here as well as
   * in `useDualDraft` because the two answer different questions: this one is
   * "who may the pickers and the bench offer", the hook's is "which id does
   * this label resolve to". There is exactly one path that appends to either.
   */
  const [added, setAdded] = useState<LadderPlayer[]>([]);
  const roster = useMemo(
    () => withAddedPlayers(ladder, added),
    [ladder, added],
  );

  function onAddPlayer(key: string, player: LadderPlayer, value: string) {
    setAdded((current) =>
      current.some((entry) => entry.userId === player.userId)
        ? current
        : [...current, player],
    );
    onOurLabels(key, value, player);
  }

  const shared = {
    locked,
    pool,
    roster,
    onOurLabels,
    onOurSelection,
    onAddPlayer,
    onTheirLabels,
    onNoPlayer,
    onTheirNoPlayer,
    clashes: draftClashes(lines),
    opponentSinglesNames: singles.flatMap((line) =>
      line.noPlayer || line.theirNoPlayer
        ? []
        : splitNames(line.theirLabels.join(" / ")),
    ),
  };

  return (
    <>
      <div className="flex flex-col gap-1">
        <LineupHeading
          title="Singles"
          set={setCount(singles, locked, shared.clashes)}
          total={singles.length}
        />
        <SinglesLineup {...shared} lines={singles} onOrder={onSinglesOrder} />
      </div>
      <div className="flex flex-col gap-1">
        <LineupHeading
          title="Doubles"
          set={setCount(doubles, locked, shared.clashes)}
          total={doubles.length}
        />
        <DoublesLineup {...shared} lines={doubles} />
      </div>
    </>
  );
}

/** Lines that are set, or settled — the headings' count. */
function setCount(
  lines: LineupLine[],
  locked: Record<string, DualLineLock> | undefined,
  clashes: ReadonlyMap<string, string>,
): number {
  return lines.filter(
    (line) =>
      locked?.[line.key] !== undefined ||
      (isDraftLineSet(line) && !clashes.has(line.slot)),
  ).length;
}

/**
 * One fact under its eyebrow — `2b` draws all four the same way.
 *
 * Two chromes, because the four cells no longer answer the same way. `rule`
 * is the artboard's row drawn here: a hairline and the control inside it.
 * `none` hands the whole treatment to the child, because `MenuSelect`'s
 * underline trigger already draws that hairline, its own chevron and its own
 * 2px blue rule on focus — a second hairline here would stack a rule on a
 * rule and a chevron beside a chevron.
 *
 * Both are a `<div>`, and `rule` is one on purpose. It was a `<label>` while
 * a native date input sat in it and the eyebrow named that input. `DateField`
 * is a group of segments plus a calendar `<button>`, and a button IS
 * labelable: the `<label>` forwarded every click on a segment to the calendar
 * button instead, so the month could never be clicked into. Measured, not
 * assumed. Each cell's `label` string goes to its child as an `aria-label`,
 * which is what names the control now.
 *
 * Not the deleted `field-row.tsx`'s `FieldCellText`/`FieldCellSelect`: those
 * were 25b's row and carried its `FieldRow` spacing (`mt-3.5`, `gap-8`) where
 * this artboard draws a plain four-up at `gap:24px`. The row's own spacing
 * matched those cells exactly, `pt-1.5 pb-[7px]` included;
 * `static-tournament-builder.tsx` still records the same numbers.
 */
function FieldCell({
  label,
  chrome = "rule",
  note,
  children,
}: {
  label: string;
  /** `rule` draws the hairline row; `none` lets the child draw its own. */
  chrome?: "rule" | "none";
  /** Drawn under the cell, on Format alone. */
  note?: string;
  children: React.ReactNode;
}) {
  const eyebrow = <span className="eyebrow">{label}</span>;
  const footnote = note ? (
    <span
      className="text-micro mt-[5px] block"
      style={{ color: "var(--ink-600)" }}
    >
      {note}
    </span>
  ) : null;

  if (chrome === "none") {
    return (
      <div>
        {eyebrow}
        {children}
        {footnote}
      </div>
    );
  }

  return (
    <div>
      {eyebrow}
      {/* `focus-within`, not `focus-visible`: the rule belongs to the row and
          what it answers is focus landing on the control inside it. The
          control inside opts out of the ring — the rule going blue IS the one
          mark (`styles/design-system/focus.css`).

          34px, not padding around the content: this row sits in a four-up
          beside three `MenuSelect` underline triggers, which are 34px, and a
          rule whose height is whatever its content happens to be does not
          line up with them. It did while the content was bare text; the date
          brought a 28px calendar button with it and the row grew, leaving the
          Date rule sitting ~7px below the other three. Borders are inside the
          box, so thickening to 2px on focus moves nothing.

          `--border-field`, not `--border-hairline`: this rule IS a field's
          underline, and the field family draws it in that token —
          `MenuSelect`'s underline trigger in the three cells beside this one,
          `SettingsUnderlineInput`, `DateField`'s own `underline` variant. The
          two are not interchangeable greys (#E5E5EA against #F3F3F3), so the
          hairline read visibly fainter than its neighbours in the same row.
          `--border-hairline` is for a divider between things, which is what
          the rest of this file uses it for. */}
      <span className="relative flex h-[34px] items-center border-b border-[var(--border-field)] focus-within:border-b-2 focus-within:border-[var(--blue)]">
        {children}
      </span>
      {footnote}
    </div>
  );
}
