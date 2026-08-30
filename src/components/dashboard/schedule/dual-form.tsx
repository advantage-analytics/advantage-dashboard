"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { advButton } from "@/lib/ui/adv-button";
import { EventShell } from "@/components/dashboard/schedule/event-shell";
import { OpponentRail } from "@/components/dashboard/schedule/opponent-rail";
import { SchoolSearch } from "@/components/dashboard/schedule/school-search";
import {
  LineupEditor,
  type LineupLine,
} from "@/components/dashboard/schedule/lineup-editor";
import type { OpponentTarget } from "@/components/dashboard/schedule/opponent-name-cell";
import {
  FieldRow,
  FieldCellSelect,
  FieldCellText,
} from "@/components/dashboard/schedule/field-row";
import {
  createDual,
  opponentRosterForDual,
  type OpponentRosterCandidate,
} from "@/lib/schedule/actions";
import { splitNames } from "@/lib/schedule/format";
import { benchFromLines } from "@/lib/schedule/roster-match";
import { divisionLabel, programDisplayName } from "@/lib/data/programs-server";
// `teamLabel` exists twice under two signatures. This is the workspace one,
// which takes a nullable squad and answers null for null. The programs-server
// twin takes a plain string and answers "Men's" to anything that is not
// "womens" — including null, which here would print a squad nobody chose into
// a warning about squads.
import { teamLabel, type Workspace } from "@/lib/workspace/types";
import type { LadderPlayer } from "@/lib/data/roster-server";
import type { ProgramSearchResult } from "@/lib/data/programs-server";
import type { OpponentDualHistory } from "@/lib/schedule/opponent-history";
import type { EventSite } from "@/lib/schedule/types";

const SINGLES_SLOTS = ["S1", "S2", "S3", "S4", "S5", "S6"];
const DOUBLES_SLOTS = ["D1", "D2", "D3"];

const SITES = [
  { value: "home", label: "Home" },
  { value: "away", label: "Away" },
  { value: "neutral", label: "Neutral" },
];

const SURFACES = ["Hard", "Clay", "Grass", "Indoor hard", "Carpet"].map(
  (surface) => ({ value: surface, label: surface })
);

const FORMATS = [
  { value: "3|false", label: "Best of 3 · no-ad" },
  { value: "3|true", label: "Best of 3 · ad" },
  { value: "1|false", label: "One set · no-ad" },
  { value: "1|true", label: "One set · ad" },
];

/**
 * 2b/2c — the new dual: find the school, then build the fixture beside it.
 *
 * Step one asks which school and nothing else (screen 2c, `school-search.tsx`);
 * step two is 2b's master–detail builder. The opponent rail stays on the left
 * — the conference always in view, the directory a keystroke away — and
 * clicking a different school there re-targets the dual in place: the name and
 * the directory row change through `takeOpponent`, and the date, the site, the
 * surface, the format and our own lineup stay exactly as the coach left them —
 * answers about the fixture, not about the opponent. The opposing names are
 * the opposite: typed against one school, they must not ride along to another,
 * so a re-target clears them (`takeOpponent` says why that is load-bearing).
 *
 * Creating this writes nine LINES, not nine matches. The design's footer says
 * "creates 9 matches"; taken literally that puts nine scoreless rows into
 * /dashboard/matches, which is scoped by created_by and so is the coach's own
 * list, and into every statistic computed from it. A line becomes a match when
 * somebody records how it went — the same rule the tournament rail states out
 * loud.
 */
export function DualForm({
  ourName,
  ourTeam,
  ladder,
  defaultSurface,
  ourConference,
  ourDivision,
  ourProgramKey,
  conferencePrograms,
  historyEntries,
}: {
  ourName: string;
  /** The active workspace's squad, so a men's coach who picks the women's row
   *  of the same school is told before nine lines are written under it. */
  ourTeam: Workspace["team"];
  ladder: LadderPlayer[];
  defaultSurface: string | null;
  /** Step one's props — see `SchoolSearch`. The rail shares them. */
  ourConference: string | null;
  ourDivision: string | null;
  ourProgramKey: string | null;
  conferencePrograms: ProgramSearchResult[];
  historyEntries: [string, OpponentDualHistory][];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Which of the two steps is on screen. Explicit rather than derived from
  // `opponent`, so a coach who re-targets in step two never gets thrown back
  // to a screen they already answered.
  const [step, setStep] = useState<"school" | "details">("school");

  const [opponent, setOpponent] = useState("");
  // The directory row behind the name, when the coach picked one rather than
  // typing. Null is a real answer — a club side or a school the ITA scrape
  // missed has no row — and the line is still recorded, just without a rival
  // to aggregate it under.
  // Only its key is sent. The rest of the row is here to be compared against
  // our own squad, which `createDual` has no field to carry and no reason to,
  // and to give the rail and the header the school's own name and subline.
  const [opponentProgram, setOpponentProgram] =
    useState<ProgramSearchResult | null>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [site, setSite] = useState<EventSite>("home");
  const [surface, setSurface] = useState(defaultSurface || "Hard");
  const [format, setFormat] = useState("3|false");

  const [lines, setLines] = useState<LineupLine[]>(() => seedLineup(ladder));

  // Whoever the ladder offered but the lineup does not currently name. Recomputed
  // from the lines rather than tracked separately, so a player dragged out of S4
  // is back on the bench without a second piece of state to keep in step.
  const bench = useMemo(() => benchFromLines(lines, ladder), [lines, ladder]);

  // The opponent's pooled roster, for the lineup popovers' saved-name dedupe.
  // Stored WITH the key it was fetched for and read back only while that key
  // is still the target, so a re-target empties the suggestions in the same
  // render that changes the school — not an effect later. `takeOpponent`
  // explains why nothing typed or suggested may outlive the school it was
  // typed against.
  const [fetchedRoster, setFetchedRoster] = useState<{
    forKey: string;
    list: OpponentRosterCandidate[];
  } | null>(null);
  const opponentKey = opponentProgram?.programKey ?? null;

  useEffect(() => {
    if (!opponentKey) return;
    let stale = false;
    void opponentRosterForDual(opponentKey).then((result) => {
      // The cleanup marks a superseded fetch stale, so School A's roster can
      // never land after a re-target and pose as School B's.
      if (stale || "error" in result) return;
      setFetchedRoster({ forKey: opponentKey, list: result.candidates });
    });
    return () => {
      stale = true;
    };
  }, [opponentKey]);

  const opponentTarget = useMemo<OpponentTarget>(
    () => ({
      key: opponentProgram ? `program:${opponentProgram.programKey}` : `text:${opponent}`,
      schoolName: opponentProgram?.schoolName ?? null,
      programKey: opponentProgram?.programKey ?? null,
      // Only an unclaimed directory row may be saved to —
      // `contribute_opponent_player` refuses a program with members, and the
      // popover must not offer a save it knows will be refused.
      canSave: opponentProgram?.status === "unclaimed",
      candidates:
        opponentKey !== null && fetchedRoster?.forKey === opponentKey
          ? fetchedRoster.list
          : [],
    }),
    [opponentProgram, opponent, opponentKey, fetchedRoster]
  );

  // A line counts once OUR side is named. The opposing names are optional —
  // `createDual` stores a line with an empty opponent list, which is the state
  // most duals are entered in: the other school's lineup lands the night
  // before, long after the fixture went on the schedule.
  const filled = lines
    .map((line) => ({
      line,
      ours: splitNames(line.ourLabels.join(" / ")),
      theirs: splitNames(line.theirLabels.join(" / ")),
    }))
    .filter((row) => row.ours.length > 0);

  // Two squads at one school are two programs with two budgets, and the
  // directory returns both rows under the same school name. Picking the wrong
  // one writes a dual that looks right on the schedule and aggregates under a
  // rival nobody played. Null on either side is a squad the dataset never told
  // us about, which is not a mismatch — and typed text has no row at all. The
  // squad itself rather than a boolean, so the warning can name it without
  // asking TypeScript to take the guard's word for the row being there.
  const mismatchedSquad =
    ourTeam !== null &&
    opponentProgram !== null &&
    opponentProgram.team !== ourTeam
      ? opponentProgram.team
      : null;

  /** The one place the name and the directory row move together, so neither
   *  step — nor the rail's re-target — can set one without the other. A
   *  re-target keeps the date, the site, the surface, the format and OUR OWN
   *  lineup — `ourIds` and `ourLabels` alike — exactly as entered: those are
   *  answers about the fixture, not about the opponent. The opposing names
   *  are the one thing that IS about the opponent, so an actual change of
   *  target clears `theirLabels`. A name typed against School A must never be
   *  submitted under School B's program id: `contribute_opponent_player`
   *  matches on name WITHIN the target program, so a carried-over name does
   *  not just create a stray row at School B — it can silently attach to a
   *  real, different person there. Re-picking the current row (same
   *  `programKey`, or same free-text name) is a no-op and clears nothing. */
  function takeOpponent(name: string, program: ProgramSearchResult | null) {
    const sameTarget =
      program !== null && opponentProgram !== null
        ? program.programKey === opponentProgram.programKey
        : program === null && opponentProgram === null && name === opponent;
    if (!sameTarget) {
      setLines((previous) =>
        previous.map((line) =>
          line.theirLabels.length > 0 ? { ...line, theirLabels: [] } : line
        )
      );
    }
    setOpponent(name);
    setOpponentProgram(program);
  }

  if (step === "school") {
    return (
      <SchoolSearch
        ourConference={ourConference}
        ourDivision={ourDivision}
        ourProgramKey={ourProgramKey}
        conferencePrograms={conferencePrograms}
        historyEntries={historyEntries}
        onChosen={(name, program) => {
          takeOpponent(name, program);
          setStep("details");
        }}
      />
    );
  }

  // The school's own name for the header and the footer — `opponent` carries
  // the squad by then ("Ridgeline University Men's Tennis"), which the rail's
  // subline and the mismatch warning already say once.
  const schoolDisplay = opponentProgram?.schoolName ?? opponent;
  // "{conference} · {division}" — only a directory row knows either, so a
  // free-text opponent renders no subline rather than an invented one.
  const headerSubline = opponentProgram
    ? [opponentProgram.conference, divisionLabel(opponentProgram.division)]
        .filter(Boolean)
        .join(" · ")
    : "";

  function submit() {
    setError(null);
    const [bestOf, adScoring] = format.split("|");

    startTransition(async () => {
      const result = await createDual({
        opponent,
        opponentProgramKey: opponentProgram?.programKey ?? null,
        date,
        site,
        surface,
        bestOf: Number(bestOf),
        adScoring: adScoring === "true",
        lines: filled.map((row, index) => ({
          discipline: row.line.discipline,
          slot: row.line.slot,
          position: index,
          playerUserIds: row.line.ourIds,
          playerLabels: row.ours,
          opponentLabels: row.theirs,
        })),
      });

      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.push(`/dashboard/team/schedule/${result.eventId}`);
    });
  }

  return (
    <EventShell
      crumb="New dual"
      flush
      footer={
        <>
          <button
            type="button"
            className={advButton("ghost", "md")}
            onClick={() => router.push("/dashboard/team/schedule")}
          >
            Cancel
          </button>
          <div className="flex-1" />
          {error ? (
            <span className="text-[11px]" style={{ color: "var(--danger)" }}>
              {error}
            </span>
          ) : (
            <span className="text-[11px]" style={{ color: "var(--ink-600)" }}>
              Creates <span className="tabular">{filled.length}</span>{" "}
              {filled.length === 1 ? "line" : "lines"} vs {schoolDisplay}
            </span>
          )}
          <button
            type="button"
            disabled={pending || filled.length === 0 || !opponent.trim()}
            className={advButton("primary", "md")}
            onClick={submit}
          >
            {pending ? "Creating…" : "Create dual"}
          </button>
        </>
      }
    >
      <OpponentRail
        ourConference={ourConference}
        ourProgramKey={ourProgramKey}
        conferencePrograms={conferencePrograms}
        historyEntries={historyEntries}
        currentName={opponent}
        currentProgram={opponentProgram}
        onPick={takeOpponent}
      />

      <div className="min-w-0 flex-1 overflow-y-auto px-8 pb-8 pt-6">
        <div className="flex flex-col gap-[22px]">
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
                  {schoolDisplay}
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

          {mismatchedSquad !== null ? (
            // Advisory, and deliberately nothing more: Create stays enabled and
            // the payload is untouched. A men's program really can host the
            // women's side of another school, and a form that refused it would
            // be wrong more often than the coach is.
            <div
              role="status"
              className="flex items-start gap-2.5 rounded-[var(--radius-element)] border border-[var(--border-medium)] bg-[var(--surface-subtle)] px-3 py-2.5"
            >
              <AlertTriangle
                strokeWidth={1.5}
                className="mt-px size-3.5 shrink-0 text-[var(--ink-700)]"
              />
              <p
                className="text-[12px] leading-[1.5]"
                style={{ color: "var(--ink-700)" }}
              >
                <span
                  className="font-medium"
                  style={{ color: "var(--ink-900)" }}
                >
                  {teamLabel(ourTeam)} squad, {teamLabel(mismatchedSquad)}{" "}
                  opponent.
                </span>{" "}
                This workspace is {programDisplayName(ourName, ourTeam)} and you
                picked {opponent}. Create the dual anyway if that is the
                fixture — nothing here is blocked.
              </p>
            </div>
          ) : null}

          <div>
            <FieldRow>
              <FieldCellText label="Date" value={date} onChange={setDate} type="date" mono />
              <FieldCellSelect
                label="Site"
                value={site}
                options={SITES}
                onChange={(value) => setSite(value as EventSite)}
              />
              <FieldCellSelect
                label="Surface"
                value={surface}
                options={SURFACES}
                onChange={setSurface}
              />
              <FieldCellSelect
                label="Format"
                value={format}
                options={FORMATS}
                onChange={setFormat}
              />
            </FieldRow>
            <p className="text-micro mt-3" style={{ color: "var(--ink-500)" }}>
              Your program defaults for site, surface and format — edit any
              before create.
            </p>
          </div>

          <div>
            <div className="flex items-baseline gap-2.5 border-b border-[var(--border-hairline)] pb-2.5">
              <span className="eyebrow">Lineup · singles</span>
              <span className="text-micro" style={{ color: "var(--ink-500)" }}>
                {ladder.some((player) => player.ladderPosition !== null)
                  ? "six required · from your ladder"
                  : "six required · type a name on each court"}
              </span>
            </div>
            <LineupEditor
              lines={lines}
              bench={bench}
              onChange={setLines}
              ourName={ourName}
              theirName={opponent}
              opponentTarget={opponentTarget}
            />
          </div>
        </div>
      </div>
    </EventShell>
  );
}

/**
 * Six singles and three doubles, seeded from the ladder where there is one.
 *
 * A program with no ladder gets nine empty courts rather than an invented
 * order: roster join order is not a ranking, and printing it as S1–S6 would be
 * the form claiming to know something nobody told it.
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
    };
  });

  return [...singles, ...doubles];
}
