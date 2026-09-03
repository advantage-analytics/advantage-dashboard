import Link from "next/link";
import { ChevronRight, CircleCheck, CircleX } from "lucide-react";
import { ScoreLine } from "@/components/dashboard/score-line";
import { StatusChip } from "@/components/ui/status-chip";
import { formatEventDay, siteTitle } from "@/lib/schedule/format";
import { LINE_STATUS } from "@/lib/schedule/line-status";
import {
  dualScore,
  entryPlayed,
  lineWon,
  matchState,
  supportsVideo,
} from "@/lib/schedule/entry-state";
import type { EntryMatch, EventDetail, EventEntry } from "@/lib/schedule/types";
import { scoreSetsFrom } from "@/lib/ui/score-format";
import { cn } from "@/lib/utils";

/**
 * `7c` and `4c` — the dual widget, which is the schedule pane once an event
 * with a lineup is selected.
 *
 * **One component, two heights.** `7c` draws it in a 620px frame and `4c` in an
 * 860px one, and that is the whole difference between the artboards: `7c`'s
 * markup simply stops after S3 because nothing below it is on screen at that
 * height, and `4c` draws all nine lines plus the Doubles heading. Both share
 * the same header, the same row grid, the same footer line and the same drawer
 * beside them. Rendering nine lines into a scroll container reproduces both —
 * `7c` is `4c` clipped, not a reduced variant of it, so there is no second
 * component and no `compact` prop.
 *
 * ── The chrome the caption names ───────────────────────────────────────────
 * "scoped detail header, inset hairlines". The header belongs to the PANE, not
 * to the page: its rule is an `::after` inset 32px on both sides so it starts
 * and ends with the pane's own content, rather than the full-bleed
 * `border-bottom` the breadcrumb topbar above it uses. Reproduced as a
 * pseudo-element for that reason — a `border-b` would run edge to edge.
 *
 * ── Nothing here fetches ───────────────────────────────────────────────────
 * It renders the `EventDetail` it is handed. `StaticSchedule` hands it
 * `POPULATED_SCHEDULE.details[selectedId]`, i.e. fixtures; the live loader
 * returns the same shape, so re-wiring is a changed import upstream and no
 * change here.
 *
 * ~~**`OutcomeRail` is the one exception to that paragraph**~~ — **it was, and
 * is not any more.** Until the re-wiring the rail drew two module-level
 * constants transcribed from the artboard, because the design's own rail
 * contradicts the rows beside it and the static run reproduced the design
 * rather than correcting it. That exception was scoped to the static run: it
 * survived only while this component drew fixtures, and the header said in as
 * many words that re-deriving the marks from `entries` "is part of the
 * re-wiring, not something that follows from it". The route now reads the
 * database, so the constants are gone and `railMarks()` below derives every
 * mark from the same `lineWon()` answer the row underneath it draws. Nothing
 * in this file is drawn-not-derived any more.
 *
 * The contradiction that produced them is still a real design defect and is
 * still on the record — `work/events-lineups/REGRESSION-NOTE.md` §5 item 10,
 * and §4's warning that this is exactly where the re-wiring goes silently
 * wrong. Reproducing it against live matches would have rendered the identical
 * `good bad good good good grey` rail on every dual a coach opens, won or lost,
 * with correct rows beneath it and nothing looking broken.
 */
export function DualWidget({ detail }: { detail: EventDetail }) {
  const { event, entries } = detail;
  const singles = entries.filter((entry) => entry.discipline === "singles");
  const doubles = entries.filter((entry) => entry.discipline === "doubles");
  const score = dualScore(entries);
  const played = entries.filter(entryPlayed).length;
  const singlesMarks = railMarks(singles);
  const doublesMarks = railMarks(doubles);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div
        className={cn(
          "relative flex shrink-0 items-end gap-5 px-8 pb-3.5 pt-5",
          "after:absolute after:inset-x-8 after:bottom-0 after:h-px",
          "after:bg-[var(--border-hairline)] after:content-['']"
        )}
      >
        <div className="flex min-w-0 flex-col gap-[5px]">
          <span className="eyebrow-sm">
            {formatEventDay(event.startsOn)} · {siteTitle(event.site)}
            {event.surface ? ` · ${event.surface}` : null}
          </span>
          <div className="text-title-lg">vs {event.name}</div>
        </div>

        <div className="flex-1" />

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {/* En dash, as drawn — the same character the drawer's row scores
              and `7d`'s season line use. */}
          <span className="text-score leading-none">
            {score.us}–{score.them}
          </span>
          {/* A rail per group that HAS lines, and the divider only when both
              do. A lineup can arrive half-built — six singles entered and the
              doubles still to come — and an "S"/"D" label with no marks after
              it, or a divider with nothing on one side, reads as a rail that
              failed to load rather than as a group nobody has filled in. The
              artboard draws no such state, so there is nothing to copy; the
              6 + divider + 3 case it does draw is untouched. */}
          <div className="flex items-center gap-2.5">
            {singlesMarks.length > 0 ? (
              <OutcomeRail label="S" marks={singlesMarks} />
            ) : null}
            {singlesMarks.length > 0 && doublesMarks.length > 0 ? (
              <span className="h-2.5 w-px bg-[var(--border-medium)]" />
            ) : null}
            {doublesMarks.length > 0 ? (
              <OutcomeRail label="D" marks={doublesMarks} />
            ) : null}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-8 pb-6 pt-2">
        <div className="flex flex-col">
          <SectionLabel>Singles</SectionLabel>
          {singles.map((entry) => (
            <LineRow key={entry.id} entry={entry} />
          ))}
          <SectionLabel>Doubles</SectionLabel>
          {doubles.map((entry) => (
            <LineRow key={entry.id} entry={entry} />
          ))}
        </div>

        <div className="mt-3 flex items-baseline gap-4">
          <span className="text-micro">
            {played} of {entries.length} matches · {singles.length} singles,{" "}
            {doubles.length} doubles
          </span>
        </div>
      </div>
    </div>
  );
}

/** "Singles" / "Doubles" — 14px above, 6px below, on both artboards. */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="eyebrow-sm pb-1.5 pt-3.5">{children}</div>;
}

/**
 * The three colours a mark can take. Exactly the tokens the artboard uses, and
 * the whole vocabulary — there is no fourth treatment.
 */
type OutcomeMark = "--viz-good" | "--viz-bad" | "--ink-200";

/**
 * The rail beside the team score — one mark per line, in the order the rows
 * below draw them.
 *
 * **Derived from the lines, not transcribed — and the artboard contradicts
 * itself here.** Both `7c` and `4c` draw the singles rail as
 * `good bad good good good ink-200` and the doubles rail as
 * `good bad ink-200`, byte-identical between the two frames. Yet the rows
 * directly below draw S6 as a loss and D3 as a win, and the score above reads
 * 5–2 — which is only reachable if S6 and D3 both count. Read the greyed marks
 * literally and the score is 4–1. Recorded as `REGRESSION-NOTE.md` §5 item 10;
 * it is a defect in the design, not a rule about this app.
 *
 * The static run reproduced that contradiction as constants, on the standing
 * "the design wins" rule, and reported it. That was the right call **for a
 * component drawing one frozen fixture**. It stops being the right call the
 * moment the component is handed real matches: a constant cannot be right
 * about a dual it was not transcribed from, so every dual in the program would
 * render one school's rail — nine grey/green/red marks that belong to a
 * different match — above nine correct rows. No amount of reporting makes a
 * coach reading his own score board immune to that, and there is no design
 * intent left to preserve, because the artboard never drew this dual.
 *
 * So the marks are computed, and computed through `lineWon()` specifically —
 * the same call `LineRow` makes for its own glyph, via `lineOutcome()` below,
 * so the rail and the row cannot disagree about a line. Won is `--viz-good`,
 * lost is `--viz-bad`, and undecided keeps the artboard's own `--ink-200`,
 * which is what its third doubles mark already meant. Colour, order, size and
 * stroke are unchanged; only the source of each mark is.
 *
 * **A forfeit is a decided line and takes a colour**, green or red by which
 * side walked — `lineWon()` reads `forfeit` before it reads any match, and its
 * doc comment says why that precedence is the rule rather than a shortcut.
 * That also keeps the rail in step with `dualScore()` overhead, which counts a
 * forfeited line as a point to the non-forfeiting side. Greying a forfeit
 * would say "not played yet" about a line that is over and has already moved
 * the score.
 */
function railMarks(entries: EventEntry[]): OutcomeMark[] {
  return entries.map((entry) => {
    const won = lineOutcome(entry);
    if (won === null) return "--ink-200";
    return won ? "--viz-good" : "--viz-bad";
  });
}

/**
 * Who took this line — asked once, for both the rail and the row.
 *
 * A dual entry carries at most one match, so `matches[0]` is the line's match;
 * passing it explicitly is what stops `lineWon` falling back to its
 * any-match-won reading, which belongs to tournament entries. Both callers go
 * through here so that the mark in the header and the glyph in the row are the
 * same answer by construction — a second, drifting definition of "won" two
 * inches above the first is the exact failure this task removed.
 */
function lineOutcome(entry: EventEntry): boolean | null {
  return lineWon(entry, entry.matches[0] ?? null);
}

function OutcomeRail({
  label,
  marks,
}: {
  label: string;
  marks: readonly OutcomeMark[];
}) {
  return (
    <div className="flex items-center gap-[5px]">
      <span className="eyebrow-sm">{label}</span>
      <div className="flex items-center gap-[3px]">
        {marks.map((token, i) => (
          <span
            key={i}
            className="h-3 w-[2.5px] rounded-[1px]"
            style={{ background: `var(${token})` }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * One line of the dual.
 *
 * The seven-column grid is the artboard's, unchanged between `7c` and `4c`:
 * slot, outcome, our side, theirs, score, action, chevron.
 *
 * The row washes on hover exactly as drawn, and also when the report link
 * inside it takes keyboard focus — the drawn hover is the only affordance the
 * design gives the row, and a keyboard user who cannot see it is left with a
 * ring on an 11px word. It is deliberately NOT `cursor-pointer` and not itself
 * a link: the design draws one anchor per row, on the "View report" cell, and
 * nothing else in the row has a destination.
 */
function LineRow({ entry }: { entry: EventEntry }) {
  const match = entry.matches[0] ?? null;
  const won = lineOutcome(entry);

  return (
    <div
      className={cn(
        "-mx-3 grid items-center gap-3 rounded-[var(--radius-element)] px-3 py-[11px]",
        "grid-cols-[26px_14px_minmax(112px,1.2fr)_minmax(104px,1fr)_106px_128px_13px]",
        "transition-colors duration-[var(--duration-hover)]",
        "hover:bg-[var(--surface-muted)] has-[a:focus-visible]:bg-[var(--surface-muted)]"
      )}
    >
      <span className="text-[11px] text-[var(--ink-500)]">{entry.slot}</span>

      {/* Empty when the line is undecided. The artboards draw only decided
          lines, so there is no drawn third glyph to copy and none is invented;
          the 14px column holds its width either way. */}
      {won === null ? (
        <span />
      ) : won ? (
        <CircleCheck
          size={14}
          strokeWidth={1.5}
          className="text-[var(--viz-good)]"
        />
      ) : (
        <CircleX size={14} strokeWidth={1.5} className="text-[var(--viz-bad)]" />
      )}

      <span className="text-[13px] font-medium text-[var(--ink-900)]">
        {entry.playerLabels.join(" / ")}
      </span>
      <span className="text-[12px] text-[var(--ink-600)]">
        vs {entry.opponentLabels.join(" / ")}
      </span>

      {/* `<ScoreLine>` is the product's one spelling of a score — hyphen
          between games, comma-space between sets, tiebreak raised — which is
          exactly what both artboards draw, S2's `6-7³` included. */}
      <ScoreLine
        className="text-scoreboard-sm"
        sets={scoreSetsFrom(match?.score)}
      />

      <LineAction entry={entry} match={match} />

      <ChevronRight
        size={13}
        strokeWidth={1.5}
        className="text-[var(--ink-300)]"
      />
    </div>
  );
}

/**
 * The action cell — the one thing that differs row to row.
 *
 * Three states are drawn: a report link on the five settled singles, the
 * analyzing chip on S2, and "Coming soon" on the three doubles. The words for
 * the states the artboards do NOT draw come from `LINE_STATUS`, which the
 * event page's own line rows and Team Home's dual sheet already read — the
 * point of that module is that one job is described the same way everywhere,
 * and inventing a fourth spelling here would be the drift it exists to stop.
 */
function LineAction({
  entry,
  match,
}: {
  entry: EventEntry;
  match: EntryMatch | null;
}) {
  if (!match) return <span />;

  const state = matchState(match);

  if (state === "ready") {
    /* A real link, against the fixture's match id. Decided at stage 03 over an
       inert placeholder: the hover and focus states are then real, the row's
       structure stays honest, and re-pointing it at live ids later is a no-op.
       It lands on the match route's existing not-found for a fixture id, which
       is the accepted cost and is recorded in the PR note. */
    return (
      <Link href={`/dashboard/matches/${match.id}`} className={REPORT_LINK}>
        View report
      </Link>
    );
  }

  const status = LINE_STATUS[state];
  if (status) {
    return (
      <StatusChip tone={status.tone} live={status.live}>
        {status.label}
      </StatusChip>
    );
  }

  /* `no-video` on a line the vendor cannot take. The words are the design's —
     see the report: the vendor rejects doubles outright, so "Coming soon"
     promises something no roadmap currently carries. Drawn, so reproduced. */
  if (!supportsVideo(entry)) {
    return <span className="text-[11px] text-[var(--ink-500)]">Coming soon</span>;
  }

  return <span />;
}

/**
 * `--blue` at rest, `--blue-hover` on hover — the one rule for a blue word
 * (colors.css, `--blue-text`). This link once rested on the darker
 * `--blue-text` for WCAG 1.4.3 AA at 11px; the design owner retired that
 * because it read as a second, off blue beside the regular one everywhere
 * else, and the contrast note now lives on the token. The focus ring comes
 * from `focus.css`'s `a[href]` rule, which is unlayered and cannot be
 * overridden by a utility — the radius here is only so that ring is not drawn
 * square.
 */
const REPORT_LINK =
  "justify-self-start rounded-[3px] text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]";
