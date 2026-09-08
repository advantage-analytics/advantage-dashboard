import Link from "next/link";
import {
  Calendar,
  ChevronRight,
  Flag,
  MapPin,
  type LucideIcon,
} from "lucide-react";
import { StatusChip } from "@/components/ui/status-chip";
import { CardFooter } from "@/components/dashboard/shared/card-footer";
import { ResultMark } from "@/components/dashboard/result-mark";
import { ScoreLine } from "@/components/dashboard/score-line";
import { FormTicks } from "@/components/dashboard/shared/form-ticks";
import { formatEventDayLong, siteTitle } from "@/lib/schedule/format";
import { LINE_STATUS } from "@/lib/schedule/line-status";
import type {
  DualSheetLine,
  DualTally,
  WeekendDual,
} from "@/lib/data/team-home-server";

/**
 * Platform Audit Ta3 — this weekend's dual, as a card.
 *
 * The one thing a coach opens the page for on a Saturday: who is on each
 * court and where the dual stands. It sits directly under the KPI strip
 * because during a dual it IS the news.
 *
 * **It is always on the page.** Ta3's rule is Pa2's — the frame never moves —
 * so the card holds its slot in every state: this week's dual, else the next
 * one on the schedule with its lineup and no scores (`mode: "next"`), else
 * `dual-sheet-empty.tsx`'s ghost shape. Round 45 mounted it only on dual
 * weeks; a card that appears and vanishes with the fixture list is the frame
 * moving.
 *
 * **Nothing here is counted twice.** The tally, the S/D split, the clinch
 * slot, the state of every line and who won it are all resolved in
 * `team-home-server.ts` through `lib/schedule/entry-state.ts` — the same
 * functions the event page and the schedule list ask. This file draws them
 * and adds no arithmetic of its own.
 *
 * **Four lines, not nine.** Four rows, decided lines first, then whatever is
 * in flight, then the rest in slot order; the header's "Full dual sheet" link
 * and the footer's count say what the four are a slice of. The whole card is
 * one click away on the event page.
 */

/** How many lines the card shows before deferring to the event page. */
const VISIBLE_LINES = 4;

/**
 * The frame's seven tracks: slot · mark · ours · theirs · score · trailing ·
 * chevron. The trailing track is measured to "Analysis failed" as a chip
 * (~95px) with room, so no cell ever wraps a row taller.
 */
const ROW =
  "group grid items-center gap-3 rounded-[var(--radius-element)] px-3 py-[11px] -mx-3 transition-colors duration-150 hover:bg-[var(--surface-muted)] has-[:focus-visible]:bg-[var(--surface-muted)] sm:grid-cols-[26px_14px_minmax(112px,1.2fr)_minmax(104px,1fr)_106px_128px_13px]";

export function DualSheet({ dual }: { dual: WeekendDual }) {
  const lines = visibleLines(dual.lines);
  const hidden = dual.lines.length - lines.length;

  return (
    <section
      aria-label={dual.mode === "weekend" ? "This weekend's dual" : "Next dual"}
      className="surface-card p-5"
    >
      {/* Home's header grammar (Pa2): eyebrow left, the card's one 11px link
          right. The link used to sit in the footer as a 12px line of its own,
          which made this the one card on the page whose way out was at the
          bottom; the count it carried is now the footer's, beside the
          "showing 4 of 9" it belongs with. */}
      <div className="flex items-center gap-3">
        <span className="eyebrow">
          {dual.mode === "weekend" ? "This weekend" : "Next dual"}
        </span>
        <div className="flex-1" />
        <Link
          href={`/dashboard/team/schedule/${dual.id}`}
          className="text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
        >
          Full dual sheet
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-4">
        <div className="min-w-0">
          <h2>
            <Link
              href={`/dashboard/team/schedule/${dual.id}`}
              className="text-title-lg rounded-[var(--radius-cell)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue)]"
            >
              {dual.opponent}
            </Link>
          </h2>
          <div className="mt-[7px] flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
            <Fact icon={MapPin}>
              {siteTitle(dual.site)}
              {dual.surface ? ` · ${dual.surface}` : ""}
            </Fact>
            <Fact icon={Calendar}>
              <span className="tabular">{formatEventDayLong(dual.startsOn)}</span>
            </Fact>
            {dual.tally.clinchedBy && dual.tally.clinchedAt ? (
              <Fact icon={Flag}>
                {dual.tally.clinchedBy === "us"
                  ? `Clinched at ${dual.tally.clinchedAt}`
                  : `${dual.opponent} clinched at ${dual.tally.clinchedAt}`}
              </Fact>
            ) : null}
          </div>
        </div>

        <div className="hidden flex-1 sm:block" />

        <Tally tally={dual.tally} lines={dual.lines} />
      </div>

      <div className="mt-3.5 flex flex-col border-t border-[var(--border-hairline)] pt-1">
        {lines.map((line) => (
          <Row key={line.id} line={line} eventId={dual.id} />
        ))}
      </div>

      <CardFooter
        className="mt-2.5"
        left={
          <>
            {hidden > 0 ? (
              <>
                Showing <span className="tabular">{lines.length}</span> of{" "}
                <span className="tabular">{dual.lines.length}</span> ·{" "}
              </>
            ) : null}
            doubles arrive via SwingVision
          </>
        }
        right={
          <>
            <span className="tabular">{dual.lines.length}</span>{" "}
            {dual.lines.length === 1 ? "match" : "matches"}
          </>
        }
      />
    </section>
  );
}

/**
 * Decided lines first, in-flight next, the rest in slot order — a coach on
 * Sunday morning wants the results, and the four rows on the card are the
 * four with something to say. Stable within each group, so S1 stays above S2.
 */
function visibleLines(lines: DualSheetLine[]): DualSheetLine[] {
  // `LINE_STATUS` has a word for every line that is waiting on something —
  // analyzing, in line, failed, forfeited — and all of them outrank a line
  // nobody has touched. Ranking on `live` alone put a queued upload and a
  // FAILED analysis behind an empty court, so the one row needing a coach was
  // the row hidden behind "showing 4 of 9".
  const rank = (line: DualSheetLine) =>
    line.won !== null ? 0 : LINE_STATUS[line.state] ? 1 : 2;
  return [...lines]
    .map((line, index) => ({ line, index }))
    .sort((a, b) => rank(a.line) - rank(b.line) || a.index - b.index)
    .slice(0, VISIBLE_LINES)
    .map(({ line }) => line);
}

/** One fact about the dual — a 12px icon and a phrase, under the name. */
function Fact({
  icon: Icon,
  children,
}: {
  icon: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <span className="text-micro inline-flex items-center gap-[5px]">
      <Icon
        className="size-3 shrink-0 text-[var(--ink-400)]"
        strokeWidth={1.5}
        aria-hidden
      />
      {children}
    </span>
  );
}

/**
 * The team score, standing on its own, with the S/D form under it.
 *
 * The frame drops the "S 3–3 · D 1–0 · final" sentence for two pill strips —
 * every line's result in slot order, singles then doubles, a hairline
 * between. The sentence is still on the event page; here the eye reads the
 * card's shape rather than a second sentence about it.
 */
function Tally({ tally, lines }: { tally: DualTally; lines: DualSheetLine[] }) {
  const anyPoint = tally.us > 0 || tally.them > 0;
  const results = (prefix: "S" | "D"): ("win" | "loss")[] =>
    lines
      .filter((line) => line.slot.startsWith(prefix) && line.won !== null)
      .map((line) => (line.won ? "win" : "loss"));
  const singles = results("S");
  const doubles = results("D");

  return (
    <div className="flex shrink-0 flex-col items-end gap-[9px]">
      <span
        className="text-score leading-none"
        style={{ color: anyPoint ? "var(--ink-900)" : "var(--ink-300)" }}
      >
        {tally.us}–{tally.them}
      </span>
      {singles.length + doubles.length > 0 ? (
        <div className="flex items-center gap-2.5">
          <span className="flex items-center gap-[5px]">
            <span className="eyebrow-sm">S</span>
            <FormTicks form={singles} empty={null} />
          </span>
          {doubles.length > 0 ? (
            <>
              <span className="h-2.5 w-px bg-[var(--border-medium)]" aria-hidden />
              <span className="flex items-center gap-[5px]">
                <span className="eyebrow-sm">D</span>
                <FormTicks form={doubles} empty={null} />
              </span>
            </>
          ) : null}
        </div>
      ) : (
        <span className="text-micro tabular">
          {lines.length} {lines.length === 1 ? "line" : "lines"} · not started
        </span>
      )}
    </div>
  );
}

/**
 * One court. The row is a link — to the report when there is one, else to
 * the event page where the line lives — so the chevron on the right is
 * honest about where a click goes. `ResultMark` sits in its 14px track and
 * takes no container.
 */
function Row({ line, eventId }: { line: DualSheetLine; eventId: string }) {
  const href = line.reportId
    ? `/dashboard/matches/${line.reportId}`
    : `/dashboard/team/schedule/${eventId}`;

  return (
    <Link href={href} className={ROW}>
      <span className="text-[11px] text-[var(--ink-500)]">{line.slot}</span>
      <span className="flex w-3.5 justify-center">
        {line.won === null ? null : <ResultMark won={line.won} />}
      </span>
      <span className="min-w-0 truncate text-[13px] font-medium text-[var(--ink-900)]">
        {line.ours || "—"}
      </span>
      <span className="min-w-0 truncate text-[12px] text-[var(--ink-600)]">
        vs {line.theirs || "—"}
      </span>
      <ScoreLine
        sets={line.sets}
        className="text-scoreboard-sm tabular min-w-0 truncate"
      />
      <span className="flex sm:justify-start">
        <Trailing line={line} />
      </span>
      {/* ink-300 → ink-900 with the row, held in both states so nothing
          shifts — the design system's rule for a record row's chevron. */}
      <ChevronRight
        className="hidden size-[13px] text-[var(--ink-300)] transition-colors duration-[var(--duration-hover)] group-hover:text-[var(--ink-900)] group-focus-visible:text-[var(--ink-900)] sm:block"
        strokeWidth={1.5}
        aria-hidden
      />
    </Link>
  );
}

/**
 * The end of the line: where to read it, or what it is waiting for. The
 * waiting states come from `lib/schedule/line-status.ts`, which the event
 * page reads too — one set of words for one job.
 */
function Trailing({ line }: { line: DualSheetLine }) {
  if (line.reportId) {
    return (
      <span className="text-[11px] font-medium text-[var(--blue)]">
        View report
      </span>
    );
  }

  const status = LINE_STATUS[line.state];
  if (status) {
    return (
      <StatusChip tone={status.tone} live={status.live}>
        {status.label}
      </StatusChip>
    );
  }

  // Played and scored with no video: the score has said everything true
  // about this line. A hand-entered or imported result names its source.
  if (line.sets.length > 0) {
    return <span className="text-[11px] text-[var(--ink-500)]">Score only</span>;
  }

  return <StatusChip>Not played</StatusChip>;
}
