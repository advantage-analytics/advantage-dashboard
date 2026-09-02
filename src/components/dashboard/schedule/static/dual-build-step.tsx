"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar, Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { advButton } from "@/lib/ui/adv-button";
import { EventShell } from "@/components/dashboard/schedule/event-shell";
import {
  OpponentPopup,
  opponentPoolFor,
  type OpponentPool,
} from "@/components/dashboard/schedule/static/opponent-popup";
import { useNewDualData } from "@/components/dashboard/schedule/static/dual-school-step";
import {
  divisionLabel,
  programDisplayName,
  teamLabel,
} from "@/lib/data/programs-server";
import {
  formatOpponentRecord,
  opponentHistoryFor,
  type OpponentDualHistory,
} from "@/lib/schedule/opponent-history";
import {
  createDual,
  opponentRosterForDual,
  type OpponentRosterCandidate,
} from "@/lib/schedule/actions";
import { splitNames } from "@/lib/schedule/format";
import { rosterIdsForLabels } from "@/lib/schedule/roster-match";
import type { LineupLine } from "@/components/dashboard/schedule/lineup-editor";
import type { LadderPlayer } from "@/lib/data/roster-server";
import type { ProgramSearchResult } from "@/lib/data/programs-server";
import type { EventSite } from "@/lib/schedule/types";

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
 * The deleted `dual-form.tsx` carried the format through a `<select>` as the
 * string `"<bestOf>|<adScoring>"` and decoded it with `format.split("|")` →
 * `Number(bestOf)` and `adScoring === "true"`. Until this change the cell here
 * held the same string, hard-coded to `"3|false"` — because `adScoring` is
 * `boolean | null` on `EventFormat`, a null interpolates into that string as
 * the four characters `null`, and `=== "true"` reads those as a confident
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
  value: string;
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
const FORMATS: readonly DualFormat[] = [
  {
    value: "bo3-no-ad",
    label: "Best of 3 sets · no-ad",
    sets: "Best of 3 sets",
    scoring: "No-ad scoring",
    bestOf: 3,
    adScoring: false,
  },
  {
    value: "bo3-ad",
    label: "Best of 3 sets · ad",
    sets: "Best of 3 sets",
    scoring: "Ad scoring",
    bestOf: 3,
    adScoring: true,
  },
  {
    value: "one-set-no-ad",
    label: "One set · no-ad",
    sets: "One set",
    scoring: "No-ad scoring",
    bestOf: 1,
    adScoring: false,
  },
  {
    value: "one-set-ad",
    label: "One set · ad",
    sets: "One set",
    scoring: "Ad scoring",
    bestOf: 1,
    adScoring: true,
  },
];

/** What `2b` draws: best of 3, no-ad. Explicit — never a default standing in
 *  for a null. */
const DEFAULT_FORMAT = FORMATS[0];

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

/**
 * Local today, in the `YYYY-MM-DD` shape a date input and the column share.
 * `static-tournament-builder.tsx`'s own, repeated rather than exported from a
 * screen: `toISOString()` is UTC and puts a dual on yesterday for anyone west
 * of Greenwich after dinner.
 */
function todayISO(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
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
  const singles = SINGLES_SLOTS.map((slot, index) => {
    const player = ladder[index];
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
    const pair = ladder.slice(index * 2, index * 2 + 2);
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
 * `2b` — step two of a new dual: the master–detail builder.
 *
 * The conference stays on the left while the fixture fills in on the right, so
 * the answer step one asked for is revisable without a screen hop. Date, site,
 * surface and format across the top; six singles and three doubles under them.
 *
 * ── The shell ──────────────────────────────────────────────────────────────
 * `EventShell` with `flush`, which is the prop that exists for this artboard by
 * name (see its doc comment). In `flush` mode the shell contributes
 * `flex min-h-0 flex-1 overflow-hidden` and NO padding, so the rail and the
 * detail pane own their own insets and each scrolls on its own — two panes edge
 * to edge, not one padded column. The default body would put 48/32/26 around
 * both of them and scroll them together, which is a different screen.
 *
 * The footer is `2b`'s own `16px 32px 20px` rather than the shell's `footer`
 * slot, whose `px-12 pb-[22px]` is 48/22 — the same call `dual-school-step.tsx`
 * made for `2c`. The shell's body padding is what `flush` exists to remove; its
 * footer padding belongs to the four create screens its comment names, and this
 * artboard draws different numbers. Where the design and the shell disagree the
 * design wins.
 *
 * ── Reading again, as of the schedule re-wiring ────────────────────────────
 * The school is the one step one chose — a `ChosenSchool`, handed down by
 * `static-dual-builder.tsx`, which holds nothing else. It names the header,
 * the rail's check, the subline, the footer and the popup, and every one of
 * those reads the same object, so they cannot drift. This used to be a module
 * const pinned to Ridgeline, and that const was the fix for a real defect:
 * step two's date, site, format and nine lines were Ridgeline's fixtures,
 * drawn and unvarying, so a header that followed step one's pick put one
 * school's name over another school's data. The pin comes out now because the
 * data travels with the school — see below — not because the guard was
 * unwanted.
 *
 * Date, site, surface and format are controlled state, opened on today, home,
 * the program's `default_surface` and `2b`'s own format. The rail lists the
 * real conference — `getConferenceTable`'s rows, own program already dropped —
 * with the chosen school checked, and pins that school on top when it is not
 * a conference row: a searched school, or a club side typed past the
 * directory. Sublines are this program's own head-to-head, from
 * `opponentDualHistory()`. All of it arrives through `useNewDualData()`; the
 * route reads once for both steps.
 *
 * The nine lines are the program's own: `seedLineup()` fills S1–S6 and D1–D3
 * from `getLadder`, every name is editable in place, and a typed name is
 * resolved back to a roster id by `rosterIdsForLabels` — exact beyond case and
 * whitespace, because that id is what the line's eventual match is attributed
 * to. Forfeiting is live too, which is what makes `2b`'s own "— no available
 * player" row reachable now that no fixture states one.
 *
 * Create calls `createDual` and pushes to the event it made. Its `ActionError`
 * is a sentence meant for the coach, so it is held in `error` and printed in
 * the footer where the line count goes — the same shape
 * `static-tournament-builder.tsx` uses.
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
 *   the lineup          Real: an input per side, a live Forfeit toggle, and
 *                       `createDual` behind the footer's button.
 *   the rail rows       Still drawn: a hover wash and no `cursor:pointer`,
 *                       which is what `2b` gives the unselected rows, and this
 *                       task's criteria do not ask for a re-target. The two
 *                       things a re-target needs are now both here — the row
 *                       key drops names typed against the old school, and
 *                       `OpponentPool` swaps the saved roster with it — so a
 *                       later task can make them live without re-deriving
 *                       either. The search field above them is a picture for
 *                       the same reason.
 *
 * The opponent cells ("Add name" / "Add pair") are `OpponentPopup`s, each
 * writing to its own row's state and nowhere else. Each is handed an
 * `OpponentPool` — the school and ITS saved roster as one value — built here
 * from `opponentRosterForDual()` and stamped with the school key it was
 * fetched for. That is the shape rather than two props on purpose: a popup
 * that dedupes against a different school's pool either merges two people or
 * fails to merge one, and the screen looks entirely correct either way. See
 * `OpponentPool` for why the mistake is not expressible.
 *
 * ── What the design draws that this app cannot know ────────────────────────
 * "18–4" and its five siblings on the rail were each opponent's OWN season
 * record, from matches this program never saw — `opponent-history.ts`'s header
 * says outright that the figure does not exist anywhere in this app. The slot
 * is gone rather than filled, the same call `2c` made in the previous task:
 * the rail's subline is squad · head-to-head now, two facts instead of three.
 */
export function DualBuildStep({ school }: { school: ChosenSchool }) {
  const {
    ladder,
    ourConference,
    conferencePrograms,
    historyEntries,
    defaultSurface,
  } = useNewDualData();

  const router = useRouter();
  const [pending, startTransition] = useTransition();
  /** `createDual`'s `ActionError`, held so the footer can print it. */
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<DualDraft>(() => ({
    date: todayISO(),
    site: "home",
    // The program's own default, or none — not "Hard". A court type nobody
    // stated is a fact about the fixture we would be inventing.
    surface: defaultSurface ?? "",
    format: DEFAULT_FORMAT,
  }));

  // Seeded once. A ladder that changed under an open builder would rewrite a
  // lineup the coach is halfway through entering, which is the one thing this
  // screen must not do.
  const [lines, setLines] = useState<LineupLine[]>(() => seedLineup(ladder));

  function edit(patch: Partial<DualDraft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  const histories = useMemo(() => new Map(historyEntries), [historyEntries]);

  const program = school.kind === "program" ? school.program : null;
  const schoolName =
    school.kind === "program" ? school.program.schoolName : school.name;
  // `OpponentTarget.key`'s mechanism (`opponent-name-cell.tsx`): every name on
  // a line is typed against ONE school, and this key rides in each row's React
  // key so a change of school remounts the row and drops the name with it.
  const schoolKey =
    school.kind === "program"
      ? `program:${school.program.programKey}`
      : `text:${school.name}`;

  // "Big Ten · D-I" — conference first. `programSubtitle()` prints the two the
  // other way round ("D-I · Big Sky") and four claim-flow call sites depend on
  // that order, so this composes its own rather than reversing a shared helper
  // for one screen. The artboard's order, and reported. Only a directory row
  // knows either, so a typed opponent renders no subline rather than an
  // invented one.
  const headerSubline = program
    ? [program.conference, divisionLabel(program.division)]
        .filter(Boolean)
        .join(" · ")
    : "";

  // The chosen school always has a row carrying the check. When it is a
  // conference row that row is it; when it is not — a searched school, or a
  // club side typed past the directory — it is pinned on top rather than
  // silently absent. The dormant `OpponentRail`'s rule.
  const pinned =
    program === null ||
    !conferencePrograms.some((row) => row.programKey === program.programKey);

  // The opponent's pooled roster, stored WITH the school key it was fetched
  // for. `dual-form.tsx`'s rule, ported: an in-flight request for School A
  // must not land after a change of school and pose as School B's. The
  // cleanup marks a superseded fetch stale, and `opponentPoolFor` below drops
  // any roster whose stamp no longer matches whatever is on screen.
  const [fetchedRoster, setFetchedRoster] = useState<{
    forKey: string;
    candidates: OpponentRosterCandidate[];
  } | null>(null);
  const programKey = program?.programKey ?? null;

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

  const singles = lines.filter((line) => line.discipline === "singles");
  const doubles = lines.filter((line) => line.discipline === "doubles");

  // The name the dual is recorded under — squad-qualified for a directory
  // pick, so a school fielding both sides is two opponents and not one, and
  // the typed text otherwise. `ChosenSchool` states this contract.
  const opponentName =
    school.kind === "program"
      ? programDisplayName(school.program.schoolName, school.program.team)
      : school.name;

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

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-[var(--surface-card)]">
      <EventShell flush>
        {/* ── The rail ─────────────────────────────────────────────────── */}
        <div className="flex w-80 min-h-0 shrink-0 flex-col border-r border-[var(--border-hairline)]">
          <div className="px-5 pb-3 pt-[18px]">
            <span className="eyebrow">Opponent</span>
            {/* Drawn, not wired — see the header. */}
            <div className="mt-2.5 flex h-8 items-center gap-[9px] rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-2.5">
              <Search
                size={14}
                strokeWidth={1.5}
                className="shrink-0 text-[var(--ink-500)]"
              />
              <span
                className="text-[12px]"
                style={{ color: "var(--ink-600)" }}
              >
                {/* The artboard's sentence in full where the program has a
                    conference to name, and its second half alone where it
                    does not — never a separator with nothing before it. */}
                {ourConference
                  ? `${ourConference} · type to search all`
                  : "type to search all"}
              </span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
            {pinned ? (
              <RailRow
                name={schoolName}
                subline={
                  program
                    ? railSubline(program, histories)
                    : // "unlisted" is the dormant rail's own word for a typed
                      // opponent, and `2c`'s escape row's. No squad — nothing
                      // said one. Looked up under the typed text, which is the
                      // name a free-text dual is recorded under.
                      [
                        "unlisted",
                        formatOpponentRecord(
                          opponentHistoryFor(histories, schoolName)
                        ),
                      ].join(" · ")
                }
                selected
              />
            ) : null}
            {conferencePrograms.map((row) => (
              <RailRow
                key={row.programKey}
                name={row.schoolName}
                subline={railSubline(row, histories)}
                selected={program?.programKey === row.programKey}
              />
            ))}
          </div>
        </div>

        {/* ── The detail pane ──────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col gap-[22px] overflow-auto px-8 py-6">
          <div className="flex items-end gap-3 border-b border-[var(--border-hairline)] pb-3">
            <div className="min-w-0 flex-1">
              <span className="eyebrow">Dual</span>
              <div className="mt-1.5 flex items-baseline gap-2.5">
                <span
                  className="text-[30px] font-light leading-none tracking-[-0.6px]"
                  style={{ color: "var(--ink-600)" }}
                >
                  vs
                </span>
                <span
                  className="min-w-0 truncate text-[30px] font-light leading-none tracking-[-0.6px]"
                  style={{ color: "var(--ink-900)" }}
                >
                  {schoolName}
                </span>
              </div>
            </div>
            {headerSubline ? (
              <span
                className="text-micro shrink-0"
                style={{ color: "var(--ink-500)" }}
              >
                {headerSubline}
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-4 gap-6">
            <FieldCell label="Date" glyph="calendar">
              {/* `2b` draws "09-26", month and day; a native date input
                  prints the platform's own form of the same value. The
                  tournament builder made the same trade on its two dates. */}
              <input
                type="date"
                value={draft.date}
                onChange={(event) => edit({ date: event.target.value })}
                className="mono w-full bg-transparent text-[13px] text-[var(--ink-900)] outline-none"
              />
            </FieldCell>

            <FieldCell label="Site" glyph="chevron">
              <FieldSelect
                value={draft.site}
                options={SITES}
                onChange={(value) => {
                  const chosen = SITES.find((option) => option.value === value);
                  if (chosen) edit({ site: chosen.value });
                }}
              />
            </FieldCell>

            <FieldCell label="Surface" glyph="chevron">
              <FieldSelect
                value={draft.surface}
                options={SURFACES}
                onChange={(value) => edit({ surface: value })}
              />
            </FieldCell>

            {/* `2b` draws the ad half BELOW the underline rather than inside
                the value — see the header for how the select is laid over
                the cell rather than being it. */}
            <FieldCell
              label="Format"
              glyph="chevron"
              note={draft.format.scoring}
            >
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
                  if (chosen) edit({ format: chosen });
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

          <LineupBlock
            title="Lineup · singles"
            // `2b`'s own note, and `dual-form.tsx`'s alternative for the
            // program the artboard never drew: a ladder nobody has ordered
            // seeds nothing, so promising six names "from your ladder" over
            // six empty courts would be the screen claiming a source it does
            // not have.
            note={
              ladder.some((player) => player.ladderPosition !== null)
                ? "six required · from your ladder"
                : "six required · type a name on each court"
            }
            lines={singles}
            addLabel="Add name"
            pool={pool}
            onOurLabels={editOurLabels}
            onTheirLabels={editTheirLabels}
            onForfeit={setForfeited}
          />

          <div>
            <LineupBlock
              title="Lineup · doubles"
              note="three required · pairs carried from singles"
              lines={doubles}
              addLabel="Add pair"
              pool={pool}
              onOurLabels={editOurLabels}
              onTheirLabels={editTheirLabels}
              onForfeit={setForfeited}
            />
            <div
              className="text-micro mt-2.5"
              style={{ color: "var(--ink-500)" }}
            >
              All nine lines are expected — forfeit a line only when a team
              can&apos;t field a player for it.
            </div>
          </div>
        </div>
      </EventShell>

      {/* `padding:16px 32px 20px` — the artboard's, not `EventShell`'s footer
          slot at 16/48/22. See the header. */}
      <div className="flex shrink-0 items-center gap-3 border-t border-[var(--border-hairline)] px-8 pb-5 pt-4">
        {/* Inside the rebuilt set. */}
        <Link
          href="/dashboard/team/schedule"
          className={advButton("ghost", "md")}
        >
          Cancel
        </Link>
        <div className="flex-1" />
        {error ? (
          // `createDual`'s own sentence, in the count line's place — the same
          // slot the tournament builder gives it.
          <span className="text-[11px]" style={{ color: "var(--danger)" }}>
            {error}
          </span>
        ) : (
          <span className="text-[11px]" style={{ color: "var(--ink-600)" }}>
            Creates <span className="tabular">{lineCount}</span>{" "}
            {lineCount === 1 ? "line" : "lines"} vs {schoolName}
          </span>
        )}
        {/* `createDual` refuses a dual with no lines, so the button is off
            until there is one to write — a disabled button says that better
            than a sentence the coach has to read to find out. */}
        <button
          type="button"
          disabled={pending || lineCount === 0}
          className={advButton("primary", "md")}
          onClick={submit}
        >
          {pending ? "Creating…" : "Create dual"}
        </button>
      </div>
    </div>
  );
}

/**
 * A rail row's subline: squad · how it has gone against us.
 *
 * The history is looked up under the name a dual is actually recorded under —
 * `programDisplayName()`, squad-qualified — and under nothing else. Step one's
 * `historyForProgram` (`dual-school-step.tsx`) explains why there is
 * deliberately no fall back to the bare school name: a school fielding both
 * squads is two rows here, and a record keyed on the bare name would print
 * on both of them.
 */
function railSubline(
  program: ProgramSearchResult,
  histories: Map<string, OpponentDualHistory>
): string {
  const history = opponentHistoryFor(
    histories,
    programDisplayName(program.schoolName, program.team)
  );
  return [teamLabel(program.team), formatOpponentRecord(history)].join(" · ");
}

/**
 * One rail row.
 *
 * Subline is squad · how it has gone against us — `teamLabel` and
 * `formatOpponentRecord`. No conference and no division: `2b` keeps those for
 * the detail header, unlike `2c`'s list, which prints one of them per row. And
 * no season record — see the header.
 *
 * The selected row is not washed — it is weighted and carries a blue check,
 * which is the whole of what the artboard distinguishes it by — and it is the
 * one row with no hover state.
 */
function RailRow({
  name,
  subline,
  selected,
}: {
  name: string;
  subline: string;
  selected: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-[var(--radius-element)] p-2.5",
        "transition-colors duration-[var(--duration-hover)]",
        selected ? null : "hover:bg-[var(--surface-subtle)]"
      )}
    >
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "truncate text-[13px] text-[var(--ink-900)]",
            selected ? "font-medium" : null
          )}
        >
          {name}
        </div>
        <div
          className="text-micro mt-0.5 truncate"
          style={{ color: "var(--ink-600)" }}
        >
          {subline}
        </div>
      </div>
      {selected ? (
        <Check
          size={13}
          strokeWidth={1.5}
          className="shrink-0 text-[var(--blue)]"
        />
      ) : null}
    </div>
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
