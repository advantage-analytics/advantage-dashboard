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
 * **`OutcomeRail` is the one exception to that paragraph, and re-wiring must
 * not skip it.** Every other cell — the rows, the score line, the played
 * count, the per-line action — recomputes from whatever `EventDetail` it is
 * given, so a live loader genuinely changes nothing here. The rail does not:
 * its marks are fixed constants transcribed from the artboard (see
 * `SINGLES_MARKS` below and the note above it), because the design's own rail
 * contradicts the rows beside it and this run reproduces the design rather
 * than correcting it. Point this component at real matches without re-deriving
 * those marks and every dual, won or lost, renders the identical
 * `good bad good good good grey` — confidently wrong, with nothing on screen
 * looking broken. Re-deriving them from `entries` is part of the re-wiring,
 * not something that follows from it.
 */
export function DualWidget({ detail }: { detail: EventDetail }) {
  const { event, entries } = detail;
  const singles = entries.filter((entry) => entry.discipline === "singles");
  const doubles = entries.filter((entry) => entry.discipline === "doubles");
  const score = dualScore(entries);
  const played = entries.filter(entryPlayed).length;

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
          <div className="flex items-center gap-2.5">
            <OutcomeRail label="S" marks={SINGLES_MARKS} />
            <span className="h-2.5 w-px bg-[var(--border-medium)]" />
            <OutcomeRail label="D" marks={DOUBLES_MARKS} />
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
 * The six-mark and three-mark rails beside the team score.
 *
 * **Drawn, not derived — and the artboard contradicts itself here.** Both
 * `7c` and `4c` draw the singles rail as `good bad good good good ink-200`
 * and the doubles rail as `good bad ink-200`, byte-identical between the two
 * frames. Yet the rows directly below draw S6 as a loss and D3 as a win, and
 * the score above reads 5–2 — which is only reachable if S6 and D3 both
 * count. Read the greyed marks literally and the score is 4–1.
 *
 * An earlier pass computed the rail from `lineWon`/`entryPlayed` instead,
 * reasoning that a rail is a function of the lines rather than copy, and that
 * an "unplayed" mark two inches above a red cross for the same line is wrong
 * on any data. That reasoning is sound and it was still the wrong call: the
 * brief says the design wins and that divergence is a defect, not a judgement
 * call, and rule 4's remedy for design content that is wrong about the app is
 * to reproduce it as drawn AND report it — reporting alone is the forbidden
 * half. The sibling task on `7d` hit the same contradiction and reproduced it
 * literally; this now matches.
 *
 * So the sequences below are the artboard's own, transcribed. The
 * contradiction is recorded for the human, not resolved here.
 */
/** The singles rail, exactly as `7c` and `4c` draw it. */
const SINGLES_MARKS = [
  "--viz-good",
  "--viz-bad",
  "--viz-good",
  "--viz-good",
  "--viz-good",
  "--ink-200",
] as const;

/** The doubles rail, exactly as `7c` and `4c` draw it. */
const DOUBLES_MARKS = ["--viz-good", "--viz-bad", "--ink-200"] as const;

function OutcomeRail({
  label,
  marks,
}: {
  label: string;
  marks: readonly string[];
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
  const won = lineWon(entry, match);

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
 * `--blue-text`, not `--blue`.
 *
 * The artboard sets only size and weight and inherits colour from DS v3's
 * `tokens/base.css` (`a{color:var(--blue)}`), a file this app does not import.
 * `--blue` is 3.68:1 on white and fails WCAG 1.4.3 AA below 24px; `--blue-text`
 * exists for exactly this and is what every other 11px action link in the
 * schedule already uses. The focus ring comes from `focus.css`'s `a[href]`
 * rule, which is unlayered and cannot be overridden by a utility — the radius
 * here is only so that ring is not drawn square.
 */
const REPORT_LINK =
  "justify-self-start rounded-[3px] text-[11px] font-medium text-[var(--blue-text)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue)]";
