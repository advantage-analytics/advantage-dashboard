"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Calendar, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  OpponentPopup,
  opponentPoolFor,
  type OpponentPool,
} from "@/components/dashboard/schedule/static/opponent-popup";
import { useNewDualData } from "@/components/dashboard/schedule/static/dual-school-step";
import { programDisplayName } from "@/lib/data/programs-server";
import {
  createDual,
  opponentRosterForDual,
  type OpponentRosterCandidate,
} from "@/lib/schedule/actions";
import {
  EVENT_FORMATS,
  splitNames,
  todayISO,
  type EventFormatValue,
} from "@/lib/schedule/format";
import { rosterIdsForLabels } from "@/lib/schedule/roster-match";
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
interface DualFormat {
  /** The `<select>` option's value — matched against, never split. */
  value: EventFormatValue;
  /** What the dropdown lists, once open. */
  label: string;
  /** What the closed cell prints. */
  sets: string;
  /** What prints under the underline. */
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
  { label: string; sets: string; scoring: string }
> = {
  "bo3-no-ad": {
    label: "Best of 3 sets · no-ad",
    sets: "Best of 3 sets",
    scoring: "No-ad scoring",
  },
  "bo3-ad": {
    label: "Best of 3 sets · ad",
    sets: "Best of 3 sets",
    scoring: "Ad scoring",
  },
  "one-set-no-ad": {
    label: "One set · no-ad",
    sets: "One set",
    scoring: "No-ad scoring",
  },
  "one-set-ad": {
    label: "One set · ad",
    sets: "One set",
    scoring: "Ad scoring",
  },
};

const FORMATS: readonly DualFormat[] = EVENT_FORMATS.map((format) => ({
  ...format,
  ...FORMAT_WORDS[format.value],
}));

/** What `2b` draws: best of 3, no-ad. Explicit — never a default standing in
 *  for a null. */
const DEFAULT_FORMAT =
  FORMATS.find((format) => format.value === "bo3-no-ad") ?? FORMATS[0];

/**
 * The three sites a dual can be at, labelled as the dormant form labels them
 * and in its order. `EventSite` on `value`, so the union is checked here rather
 * than cast at the change handler.
 */
const SITES: readonly { value: EventSite; label: string }[] = [
  { value: "home", label: "Home" },
  { value: "away", label: "Away" },
  { value: "neutral", label: "Neutral" },
];

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

/** `2b`'s nine courts, in the order it draws them. */
const SINGLES_SLOTS = ["S1", "S2", "S3", "S4", "S5", "S6"];
const DOUBLES_SLOTS = ["D1", "D2", "D3"];

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
 * resolves it by being real: the coach forfeits S6 themselves if nobody can
 * play it.
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
      forfeit: null,
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
      forfeit: null,
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
 * seed alone" — `forfeit: null` is therefore a real value ("not forfeited"),
 * distinguished from absence, so a seed can take a forfeit back.
 */
export interface DualLineSeed {
  /** `"S1"`…`"D3"` — the same string `seedLineup()` puts on `key` and `slot`. */
  key: string;
  ourLabels?: string[];
  theirLabels?: string[];
  forfeit?: LineupLine["forfeit"];
}

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
      initial?.surface !== undefined ? initial.surface : defaultSurface ?? "",
    format: formatFor(initial?.format),
  }));

  // Seeded once. See the header.
  const [lines, setLines] = useState<LineupLine[]>(() =>
    seedLineup(ladder).map((line) => {
      const seed = initial?.lines?.find((row) => row.key === line.key);
      if (!seed) return line;
      const ourLabels = seed.ourLabels ?? line.ourLabels;
      return {
        ...line,
        ourLabels,
        // Re-resolved from the seeded label, never carried in by the caller:
        // this id is what the line's eventual match is attributed to, and the
        // one rule that may produce it is `rosterIdsForLabels`.
        ourIds: rosterIdsForLabels(ourLabels.join(" / "), ladder),
        theirLabels: seed.theirLabels ?? line.theirLabels,
        // `undefined` is "not stated"; `null` is "not forfeited".
        forfeit: seed.forfeit !== undefined ? seed.forfeit : line.forfeit,
      };
    })
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

  // The opponent's pooled roster, stored WITH the school key it was fetched
  // for. `dual-form.tsx`'s rule, ported: an in-flight request for School A
  // must not land after a change of school and pose as School B's. The
  // cleanup marks a superseded fetch stale, and `opponentPoolFor` below drops
  // any roster whose stamp no longer matches whatever is on screen.
  const [fetchedRoster, setFetchedRoster] = useState<{
    forKey: string;
    candidates: OpponentRosterCandidate[];
  } | null>(null);
  const programKey =
    school.kind === "program" ? school.program.programKey : null;

  useEffect(() => {
    // Free text has no directory row, so there is no pool to ask for — an
    // empty one, not an error.
    if (!programKey) return;
    let stale = false;
    void opponentRosterForDual(programKey).then((result) => {
      if (stale || "error" in result) return;
      // Stamped with `schoolKey` itself, never a second spelling of it: the
      // stamp and the pool's gate have to be the same string or the gate
      // silently never matches — an empty pool on every school, which looks
      // exactly like a school with nobody saved.
      setFetchedRoster({ forKey: schoolKey, candidates: result.candidates });
    });
    return () => {
      stale = true;
    };
  }, [programKey, schoolKey]);

  // The one place the school and its saved roster are joined, and the only
  // thing the popups are given — see `OpponentPool`.
  const pool = useMemo(
    () => opponentPoolFor(schoolKey, schoolName, fetchedRoster),
    [schoolKey, schoolName, fetchedRoster]
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
  function editOurLabels(key: string, value: string) {
    setLines((current) =>
      current.map((line) =>
        line.key === key
          ? {
              ...line,
              ourLabels: [value],
              ourIds: rosterIdsForLabels(value, ladder),
            }
          : line
      )
    );
  }

  function editTheirLabels(key: string, value: string) {
    setLines((current) =>
      current.map((line) =>
        line.key === key ? { ...line, theirLabels: [value] } : line
      )
    );
  }

  /**
   * Forfeit a line, or take the forfeit back.
   *
   * `lineup-editor.tsx`'s rule, ported: forfeiting clears both sides rather
   * than hiding names still in state, so the row says what it means and
   * nothing invisible is carried into `createDual`. Taking the forfeit back
   * leaves the row empty rather than restoring a name — the coach is choosing
   * who plays that court either way, and a restored name would be the form
   * guessing at one.
   *
   * `"ours"` is the only side a builder can set, and it awards the point to
   * THEM. The opponent forfeiting is discovered on match day, which is why
   * `line-row.tsx` on the event page carries the two-sided picker instead.
   */
  function setForfeited(key: string, forfeited: boolean) {
    setLines((current) =>
      current.map((line) =>
        line.key === key
          ? {
              ...line,
              forfeit: forfeited ? "ours" : null,
              ourIds: [],
              ourLabels: [],
              theirLabels: [],
            }
          : line
      )
    );
  }

  // A line counts once our side is named, and a forfeited line counts with
  // nobody named on either side — `dual-form.tsx`'s rule, which is why the
  // footer reads 9 over a lineup whose S6 is forfeited. Dropping it would
  // write eight lines under a dual that has nine points to give, and
  // `dualScore` would read a decided 4–3 as a 4–3 out of eight.
  const filled = lines
    .map((line) => ({
      line,
      ours: splitNames(line.ourLabels.join(" / ")),
      theirs: splitNames(line.theirLabels.join(" / ")),
    }))
    .filter((row) => row.ours.length > 0 || row.line.forfeit !== null);
  const lineCount = filled.length;

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

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createDual({
        opponent: opponentName,
        // The key, never the uuid: `createDual` resolves it server-side, and
        // a key that resolves to nothing leaves the dual on free text rather
        // than refusing it.
        opponentProgramKey: school.kind === "program"
          ? school.program.programKey
          : null,
        date: draft.date,
        site: draft.site,
        surface: draft.surface,
        // Read off the chosen `FORMATS` row, which states both as literals.
        // Nothing here parses a string, so no null can arrive as "null".
        bestOf: draft.format.bestOf,
        adScoring: draft.format.adScoring,
        lines: filled.map((row, index) => ({
          discipline: row.line.discipline,
          slot: row.line.slot,
          position: index,
          // A forfeited line carries nobody on either side. `setForfeited`
          // already emptied both, so these are empty anyway — stated here so
          // the write cannot drift from the row.
          playerUserIds: row.line.forfeit === null ? row.line.ourIds : [],
          playerLabels: row.line.forfeit === null ? row.ours : [],
          opponentLabels: row.line.forfeit === null ? row.theirs : [],
          forfeit: row.line.forfeit,
        })),
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
    pool,
    laddered,
    editOurLabels,
    editTheirLabels,
    setForfeited,
    lineCount,
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
 * ── What is a control and what is still a picture ──────────────────────────
 *   date/site/surface   Real: an `<input type="date">` and two native
 *                       `<select>`s under the artboard's own underline
 *                       treatment, with the drawn glyph beside each.
 *   Format              Real, and the one cell a plain native select could not
 *                       draw: `2b` prints the sets half inside the underline
 *                       and the scoring half BELOW it, and a select prints one
 *                       label. So the select is a real one laid over the cell
 *                       at `opacity:0` — it owns the click, the keyboard and
 *                       the dropdown — while the two strings the cell prints
 *                       are read off the chosen `FORMATS` row underneath it.
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
      <FieldCell label="Date" glyph="calendar">
        {/* `2b` draws "09-26", month and day; a native date input
            prints the platform's own form of the same value. The
            tournament builder made the same trade on its two dates. */}
        <input
          type="date"
          value={draft.date}
          onChange={(event) => onEdit({ date: event.target.value })}
          className="mono w-full bg-transparent text-[13px] text-[var(--ink-900)] outline-none"
        />
      </FieldCell>

      <FieldCell label="Site" glyph="chevron">
        <FieldSelect
          value={draft.site}
          options={SITES}
          onChange={(value) => {
            const chosen = SITES.find((option) => option.value === value);
            if (chosen) onEdit({ site: chosen.value });
          }}
        />
      </FieldCell>

      <FieldCell label="Surface" glyph="chevron">
        <FieldSelect
          value={draft.surface}
          options={SURFACES}
          onChange={(value) => onEdit({ surface: value })}
        />
      </FieldCell>

      {/* `2b` draws the ad half BELOW the underline rather than inside
          the value — see this component's header for how the select is
          laid over the cell rather than being it. */}
      <FieldCell label="Format" glyph="chevron" note={draft.format.scoring}>
        <span className="text-[13px] text-[var(--ink-900)]">
          {draft.format.sets}
        </span>
        <select
          aria-label="Format"
          value={draft.format.value}
          onChange={(event) => {
            // The chosen ROW, not a parse of the chosen string. This is
            // the only assignment `format` has, and every row of that
            // table states `adScoring` as a literal boolean.
            const chosen = FORMATS.find(
              (option) => option.value === event.target.value
            );
            if (chosen) onEdit({ format: chosen });
          }}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        >
          {FORMATS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </FieldCell>
    </div>
  );
}

/**
 * The nine courts: six singles, three doubles, and the note under them.
 *
 * A body, not a screen — see `DualFactsStep`. Everything here is real: an
 * input per side, a live Forfeit toggle, and an `OpponentPopup` on each
 * opponent cell.
 *
 * The two blocks are cut out of the one `lines` array rather than held apart,
 * so the array `submit()` sends and the rows on screen are the same nine
 * objects in the same order.
 *
 * Each popup is handed an `OpponentPool` — the school and ITS saved roster as
 * one value — so a popup cannot dedupe against a different school's pool. See
 * `OpponentPool` for why the mistake is not expressible, and `LineupBlock`'s
 * row key for the other half of the same contract.
 */
export function DualLineupStep({
  lines,
  pool,
  laddered,
  onOurLabels,
  onTheirLabels,
  onForfeit,
}: {
  lines: LineupLine[];
  /** The school and its saved roster. `pool.key` rides in every row's key. */
  pool: OpponentPool;
  /** Whether the program has a ladder — the singles note's only variable. */
  laddered: boolean;
  onOurLabels: (key: string, value: string) => void;
  onTheirLabels: (key: string, value: string) => void;
  onForfeit: (key: string, forfeited: boolean) => void;
}) {
  const singles = lines.filter((line) => line.discipline === "singles");
  const doubles = lines.filter((line) => line.discipline === "doubles");

  return (
    <>
      <LineupBlock
        title="Lineup · singles"
        // `2b`'s own note, and `dual-form.tsx`'s alternative for the
        // program the artboard never drew: a ladder nobody has ordered
        // seeds nothing, so promising six names "from your ladder" over
        // six empty courts would be the screen claiming a source it does
        // not have.
        note={
          laddered
            ? "six required · from your ladder"
            : "six required · type a name on each court"
        }
        lines={singles}
        addLabel="Add name"
        pool={pool}
        onOurLabels={onOurLabels}
        onTheirLabels={onTheirLabels}
        onForfeit={onForfeit}
      />

      <div>
        <LineupBlock
          title="Lineup · doubles"
          note="three required · pairs carried from singles"
          lines={doubles}
          addLabel="Add pair"
          pool={pool}
          onOurLabels={onOurLabels}
          onTheirLabels={onTheirLabels}
          onForfeit={onForfeit}
        />
        <div className="text-micro mt-2.5" style={{ color: "var(--ink-500)" }}>
          All nine lines are expected — forfeit a line only when a team
          can&apos;t field a player for it.
        </div>
      </div>
    </>
  );
}

/**
 * One underlined fact — `2b` draws all four the same way, with a trailing
 * glyph that says how it is answered.
 *
 * A `<label>` rather than a `<div>`, now that every cell holds a real control:
 * the eyebrow is the control's name, so it labels it rather than sitting beside
 * it. The underlined row is `relative` so the Format cell's overlaid select
 * has something to fill.
 *
 * Not the deleted `field-row.tsx`'s `FieldCellText`/`FieldCellSelect`: those
 * were 25b's row and carried its `FieldRow` spacing (`mt-3.5`, `gap-8`) where
 * this artboard draws a plain four-up at `gap:24px`. Everything below the
 * label matched those cells exactly, `pt-1.5 pb-[7px]` and a 12px glyph
 * included; `static-tournament-builder.tsx` still records the same numbers.
 */
function FieldCell({
  label,
  glyph,
  note,
  children,
}: {
  label: string;
  glyph: "calendar" | "chevron";
  /** Drawn under the underline, on Format alone. */
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <span className="relative flex items-center border-b border-[var(--border-hairline)] pb-[7px] pt-1.5">
        {children}
        <span className="flex-1" />
        {glyph === "calendar" ? (
          <Calendar
            size={12}
            strokeWidth={1.5}
            className="pointer-events-none shrink-0 text-[var(--ink-400)]"
          />
        ) : (
          <ChevronDown
            size={12}
            strokeWidth={1.5}
            className="pointer-events-none shrink-0 text-[var(--ink-400)]"
          />
        )}
      </span>
      {note ? (
        <span
          className="text-micro mt-[5px] block"
          style={{ color: "var(--ink-600)" }}
        >
          {note}
        </span>
      ) : null}
    </label>
  );
}

/**
 * The Site and Surface cells: a native `<select>` under the artboard's own
 * underline treatment, so the value the app will store is in the document
 * rather than implied by a label. `appearance-none` is what stops the platform
 * drawing a second chevron beside `FieldCell`'s.
 */
function FieldSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full cursor-pointer appearance-none bg-transparent text-[13px] text-[var(--ink-900)] outline-none"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

/** Six singles or three doubles, under a ruled heading. */
function LineupBlock({
  title,
  note,
  lines,
  addLabel,
  pool,
  onOurLabels,
  onTheirLabels,
  onForfeit,
}: {
  title: string;
  note: string;
  lines: LineupLine[];
  addLabel: string;
  /** The school and its saved roster. `pool.key` rides in every row's key. */
  pool: OpponentPool;
  onOurLabels: (key: string, value: string) => void;
  onTheirLabels: (key: string, value: string) => void;
  onForfeit: (key: string, forfeited: boolean) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline gap-2.5 border-b border-[var(--border-hairline)] pb-[9px]">
        <span className="eyebrow">{title}</span>
        <span className="text-micro" style={{ color: "var(--ink-500)" }}>
          {note}
        </span>
      </div>
      <div className="mt-1 flex flex-col">
        {lines.map((line, index) => (
          <LineRow
            // The school's key rides in the row key on purpose: every name on
            // this row was typed against ONE school, and
            // `contribute_opponent_player` matches by name WITHIN the target
            // program, so a name that survived a change of school could
            // attach to a real, different person at the new one. This key
            // remounts the row and drops the resolved name with it.
            key={`${pool.key}:${line.key}`}
            line={line}
            addLabel={addLabel}
            pool={pool}
            onOurLabels={onOurLabels}
            onTheirLabels={onTheirLabels}
            onForfeit={onForfeit}
            last={index === lines.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

const LINE_GRID = "grid grid-cols-[34px_1fr_20px_1fr_70px] items-center gap-2.5";

/**
 * One line.
 *
 * A forfeited line names nobody on either side, so its two middle cells are
 * empty — spans rather than nothing, because the grid's five columns are what
 * keeps "Forfeited" under "Forfeit" on the rows above it. `2b` draws the last
 * row of each block without the rule and without the hover wash; both follow
 * `last`.
 *
 * ── Both names are the line's, and this row is the only thing that can set
 *    either ────────────────────────────────────────────────────────────────
 * The lineup itself lives upstream now, because `createDual` has to be able to
 * read it. What does NOT move upstream is the ability to address a row: the
 * failure this screen has to be incapable of is a name landing on a line
 * nobody meant, and a keyed map is where that happens — one stale key, one
 * index off by one, and a name typed on S1 is submitted under D3. So every
 * handler this row hands out is a closure over THIS row's `line.key`, made
 * here. The popup and the input are given a plain `(value) => void` and no
 * line id, no index and no way to reach a sibling; the key is never a value
 * either of them holds.
 *
 * `active` is the popup saying it is open or still holding `2e`'s
 * confirmation. `2d` and `2e` both draw that row lifted above the rows below
 * it (`z-index:20`) with the Forfeit affordance showing — the resting row `2b`
 * draws keeps it hidden until the pointer is on it, and that stays. It is a button rather than a span now: `2b` draws the word and
 * nothing else, so the appearance is unchanged, but an `opacity:0` span is a
 * control no keyboard can reach — `focus-visible` reveals it, which is the
 * affordance the dormant editor gave the same word.
 */
function LineRow({
  line,
  addLabel,
  pool,
  onOurLabels,
  onTheirLabels,
  onForfeit,
  last,
}: {
  line: LineupLine;
  addLabel: string;
  pool: OpponentPool;
  onOurLabels: (key: string, value: string) => void;
  onTheirLabels: (key: string, value: string) => void;
  onForfeit: (key: string, forfeited: boolean) => void;
  last: boolean;
}) {
  const forfeited = line.forfeit !== null;
  const [active, setActive] = useState(false);

  return (
    <div
      className={cn(
        LINE_GRID,
        "py-[7px]",
        // The popup's containing block: `2d` anchors it to `right:0` of the
        // row, so the row is what it is positioned against.
        "relative",
        active ? "z-20" : null,
        last
          ? null
          : [
              "border-b border-[var(--border-hairline)]",
              "transition-colors duration-[var(--duration-hover)]",
              "hover:bg-[var(--surface-subtle)]",
            ]
      )}
    >
      <span
        className="mono text-[11px]"
        style={{ color: "var(--ink-600)" }}
      >
        {line.slot}
      </span>

      {forfeited ? (
        // The one string a forfeited builder line prints, and the one
        // `line-row.tsx` prints for the same state on the event page.
        <span className="text-[13px]" style={{ color: "var(--ink-500)" }}>
          — no available player
        </span>
      ) : (
        // `2b` draws our side as plain text because the artboard draws a
        // filled lineup. It is a real field under the same 13px ink-900 — the
        // ladder seeds it, and typing over a seeded name is how a sub goes on.
        <input
          value={line.ourLabels.join(" / ")}
          onChange={(event) => onOurLabels(line.key, event.target.value)}
          placeholder={line.discipline === "doubles" ? "Name / Name" : "Name"}
          aria-label={`Our player at ${line.slot}`}
          className="w-full min-w-0 bg-transparent text-[13px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-300)]"
        />
      )}

      {forfeited ? (
        <span />
      ) : (
        <span className="text-micro" style={{ color: "var(--ink-400)" }}>
          vs
        </span>
      )}

      {forfeited ? (
        <span />
      ) : (
        // `2d`/`2e`. The trigger `2b` draws is this component's closed state,
        // unchanged — 11px ink-400, a 9px plus, and the block's own
        // "Add name"/"Add pair".
        <OpponentPopup
          value={line.theirLabels.join(" / ")}
          addLabel={addLabel}
          discipline={line.discipline}
          // The school and ITS saved roster, as one value — the header's name,
          // the rail's tick, `2d`'s dedupe and `2e`'s confirmation all read
          // this one object, so none of them can name a different school than
          // the pool the name was matched against.
          pool={pool}
          draftName=""
          onCommit={(value) => onTheirLabels(line.key, value)}
          onActiveChange={setActive}
        />
      )}

      {forfeited ? (
        // The way back. `2b` draws the word and no other affordance on a
        // forfeited row, so the label and the title carry what the word alone
        // cannot say — the dormant editor's own two strings.
        <button
          type="button"
          onClick={() => onForfeit(line.key, false)}
          aria-label={`Clear the forfeit on ${line.slot}`}
          title="Clear the forfeit"
          className="text-micro rounded-[3px] text-right outline-none hover:text-[var(--blue)] focus-visible:shadow-[var(--focus-ring)]"
          style={{ color: "var(--ink-500)" }}
        >
          Forfeited
        </button>
      ) : (
        // `opacity:0` with `style-hover="opacity:1"` on the control itself,
        // which is what `2b` draws — the row's own hover is a separate wash.
        // Drawn as drawn, and reported: an invisible target is not a
        // discoverable control. `focus-visible` is the one addition, and it
        // only reveals what the pointer already can.
        //
        // `active` is the second half of the same drawing rather than a
        // softening of it: `2d` and `2e` draw this word plainly visible on the
        // row their popup is anchored to, and `2b` draws it hidden on a row at
        // rest. Both are reproduced — the resting row is untouched.
        <button
          type="button"
          onClick={() => onForfeit(line.key, true)}
          className={cn(
            "text-micro rounded-[3px] text-right outline-none transition-opacity duration-[var(--duration-hover)]",
            "hover:opacity-100 focus-visible:opacity-100 focus-visible:shadow-[var(--focus-ring)]",
            active ? "opacity-100" : "opacity-0"
          )}
          style={{ color: "var(--blue)" }}
        >
          Forfeit
        </button>
      )}
    </div>
  );
}
