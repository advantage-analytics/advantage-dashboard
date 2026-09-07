import Link from "next/link";
import { Calendar, Check, MapPin, Rows3, Upload } from "lucide-react";
import { ResultMark } from "@/components/dashboard/result-mark";
import { StatusChip } from "@/components/ui/status-chip";
import { formatLabel } from "@/lib/schedule/format";
import { cn } from "@/lib/utils";
import type { EventFormat } from "@/lib/schedule/types";

/**
 * The event page's shared furniture — the frame, the facts line, the detail
 * line and the table card that a dual and a tournament both draw.
 *
 * ── Why these live together, and why they are dumb ─────────────────────────
 * A dual and a tournament are two different reads with two different tables,
 * but they are ONE page shape: same title geometry, same facts row, same
 * hairline under the same one-line summary, same white table card underneath.
 * When each screen owned its own copy of that shape the two drifted — a 14px
 * gap here, a 16px one there, a header row that lost its hairline on one page
 * only — and the drift was invisible in review because each page looked right
 * on its own. Exactly the argument `ResultMark` records for collapsing two
 * outcome registers into one.
 *
 * So every prop here is DATA a caller already has, in the form it already has
 * it: strings that are formatted, counts that are counted, nodes the caller
 * decides the ink of. Nothing in this file reads Supabase, imports a loader, or
 * knows what a dual is. That is what lets both pages compose it without one
 * page's shape leaking into the other's.
 *
 * ── The one blue in the file ───────────────────────────────────────────────
 * `DetailLine`'s `action` count ("3 need a file") and the `live` count's
 * `StatusChip tone="blue"`. Blue is the product's single accent and it means
 * "there is something for you to do here" — spending it anywhere else on this
 * page (a heading, a table header, a decorative rule) spends the only signal
 * the coach's eye is trained on. No coloured left borders anywhere, and no
 * status pill that carries a count: a count belongs in the count register
 * beside it, which is what `counts` is.
 */

/* ── Frame ──────────────────────────────────────────────────────────────── */

/**
 * The page container: title, facts, actions, a one-line detail on a hairline,
 * and a `1fr / 340px` body.
 *
 * `h1.text-display` is the FIRST child with no eyebrow above it. The dashboard
 * header already draws the breadcrumb that an eyebrow would restate — the same
 * call `static-event-chooser.tsx` records making, for the same reason.
 *
 * The 340px rail track is the product's one rail width (roster, schedule,
 * matches), so an event's rail and the schedule's rail line up when a coach
 * moves between them.
 */
export function EventPageFrame({
  title,
  actions,
  facts,
  detail,
  rail,
  children,
}: {
  /** The heading. A dual passes its own `vs` prefix — see `EventTitle`. */
  title: React.ReactNode;
  /** Right-aligned on the title baseline. Ghost + primary, both `advButton()`. */
  actions?: React.ReactNode;
  /** `EventFacts`, drawn directly under the title. */
  facts?: React.ReactNode;
  /** `DetailLine` — one row, on the hairline that closes the header. */
  detail?: React.ReactNode;
  /** The 340px column. Omitted, the body is a single fluid column. */
  rail?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[18px] px-14 pb-8 pt-5">
      <div>
        <div className="flex items-start justify-between gap-6">
          <h1 className="text-display min-w-0">{title}</h1>
          {actions ? (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          ) : null}
        </div>
        {facts}
      </div>

      {detail ? (
        <div className="border-b border-[var(--border-hairline)] pb-[14px]">
          {detail}
        </div>
      ) : null}

      {rail ? (
        <div className="grid min-w-0 grid-cols-[1fr_340px] gap-8">
          <div className="min-w-0">{children}</div>
          {rail}
        </div>
      ) : (
        <div className="min-w-0">{children}</div>
      )}
    </div>
  );
}

/**
 * "vs Ridgemont Tech" — the `vs` in `--ink-600` so the opponent's name carries
 * the line on its own.
 *
 * A helper rather than a rule inside the frame: a tournament's title is its own
 * name with no prefix, and a frame that prefixed everything would print
 * "vs Fall Invitational".
 */
export function EventTitle({ vs, name }: { vs?: boolean; name: string }) {
  if (!vs) return <>{name}</>;
  return (
    <>
      <span style={{ color: "var(--ink-600)" }}>vs </span>
      {name}
    </>
  );
}

/* ── Facts ──────────────────────────────────────────────────────────────── */

/**
 * A tennis court, as a 16×16 stroke glyph.
 *
 * Lucide has no court — `land-plot` is the nearest and reads as a plot of
 * ground, `grid-2x2` as a layout control — so this is the design's own path,
 * drawn the way `BracketMark` in `static-event-chooser.tsx` is and documented
 * for the same reason: an inlined path with no note beside it is the thing a
 * later pass "cleans up" into the wrong Lucide icon.
 *
 * Outer rounded rect (the doubles court), a centre net line across it, and the
 * two service lines. `currentColor` throughout, so it takes the fact row's ink
 * like the Lucide glyphs beside it.
 */
function CourtGlyph({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      className={className}
      style={style}
      aria-hidden="true"
    >
      <rect
        x="2"
        y="3.25"
        width="12"
        height="9.5"
        rx="1"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M8 3.25V12.75M4.75 6.25V9.75M11.25 6.25V9.75"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Date · site · surface · how many lines · the format capsule.
 *
 * No middots between the facts — each one leads with its own glyph, and a
 * separator on top of that is punctuation doing a job the icons already did.
 * Every string arrives formatted (`formatEventDatesLong`, `siteTitle`,
 * `surfaceTitle`): this row picks no words of its own, so the page and the
 * schedule row beside it cannot spell the same day two ways.
 */
export function EventFacts({
  date,
  site,
  surface,
  count,
  format,
}: {
  /** Already formatted — "Fri, Sep 26", or a tournament's two-ended span. */
  date: string;
  /** Already labelled — "Home", "Away", "Neutral". */
  site: string;
  /** "Hard". Null when the event never recorded one; the fact is omitted. */
  surface?: string | null;
  /** `{ n: 9, noun: "lines" }` for a dual, `{ n: 3, noun: "entries" }` above. */
  count: { n: number; noun: string };
  /** Null while an event carries no format at all — capsule omitted. */
  format?: EventFormat | null;
}) {
  return (
    <div
      className="mt-[10px] flex flex-wrap items-center gap-4 text-[12px]"
      style={{ color: "var(--ink-700)" }}
    >
      <span className="inline-flex items-center gap-1.5">
        <Calendar
          className="size-[13px] shrink-0"
          strokeWidth={1.5}
          style={{ color: "var(--ink-500)" }}
          aria-hidden="true"
        />
        {date}
      </span>

      <span className="inline-flex items-center gap-1.5">
        <MapPin
          className="size-[13px] shrink-0"
          strokeWidth={1.5}
          style={{ color: "var(--ink-500)" }}
          aria-hidden="true"
        />
        {site}
      </span>

      {surface ? (
        <span className="inline-flex items-center gap-1.5">
          <CourtGlyph
            className="size-[13px] shrink-0"
            style={{ color: "var(--ink-500)" }}
          />
          {surface}
        </span>
      ) : null}

      <span className="inline-flex items-center gap-1.5">
        <Rows3
          className="size-[13px] shrink-0"
          strokeWidth={1.5}
          style={{ color: "var(--ink-500)" }}
          aria-hidden="true"
        />
        <span className="tabular">{count.n}</span> {count.noun}
      </span>

      {format ? <FormatCapsule format={format} /> : null}
    </div>
  );
}

/**
 * The format, as an OUTLINED capsule — a hairline border, no fill.
 *
 * Outlined on purpose: the facts row's other items are bare text, and a filled
 * chip here would read as a state ("this event is Best of 3") rather than a
 * property of it. Filled greys are `DetailLine`'s register, where the thing
 * being said IS a state.
 */
export function FormatCapsule({ format }: { format: EventFormat }) {
  return (
    <span
      className="inline-flex h-[22px] items-center whitespace-nowrap rounded-full border border-[var(--border-field)] px-2 text-[11px]"
      style={{ color: "var(--ink-700)" }}
    >
      {formatLabel(format)}
    </span>
  );
}

/* ── Detail line ────────────────────────────────────────────────────────── */

/**
 * One count in `DetailLine`.
 *
 * `action` is work waiting on the coach — the only blue on the page, and the
 * only kind that DISAPPEARS at zero: "0 need a file" is not a to-do, it is
 * noise where a to-do used to be. `live` and `done` describe the event and
 * stay put.
 */
export interface DetailCount {
  kind: "action" | "live" | "done";
  n: number;
  label: string;
  /** `action` only — makes the count the link to the work. */
  href?: string;
}

/**
 * The single row under the header: score, outcome, state, then the counts.
 *
 * The caller owns the score's ink, because only the caller knows whether the
 * number means anything yet — a dual that has not started passes `0–0` in
 * `--ink-300`, and a frame that coloured it `--ink-900` for everyone would
 * print a confident nil-all for a match nobody has played.
 */
export function DetailLine({
  score,
  mark,
  state,
  counts = [],
}: {
  score: React.ReactNode;
  /** `true` won · `false` lost · `null`/omitted → no mark. */
  mark?: boolean | null;
  /** "Across 6 matches", "In progress" — a grey filled capsule. */
  state?: string;
  counts?: DetailCount[];
}) {
  const shown = counts.filter(
    (count) => !(count.kind === "action" && count.n === 0)
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="tabular text-[15px]">{score}</span>

      {mark !== undefined && mark !== null ? <ResultMark won={mark} /> : null}

      {/* `inline-block`, NOT `inline-flex`: a flex container turns each word
          into its own flex item and eats the spaces between them, so "Across 6
          matches" renders as "Across6matches". The capsule holds a sentence,
          not a row of parts. */}
      {state ? (
        <span
          className="inline-block h-[20px] whitespace-nowrap rounded-full bg-[var(--surface-subtle)] px-2 text-[11px] leading-[20px]"
          style={{ color: "var(--ink-600)" }}
        >
          {state}
        </span>
      ) : null}

      {shown.length > 0 ? (
        <>
          <span
            aria-hidden="true"
            className="h-3 w-px shrink-0"
            style={{ background: "var(--ink-200)" }}
          />
          <span className="flex flex-wrap items-center gap-2">
            {shown.map((count, index) => (
              <span key={`${count.kind}-${count.label}`} className="flex items-center gap-2">
                {index > 0 ? (
                  <span aria-hidden="true" style={{ color: "var(--ink-300)" }}>
                    ·
                  </span>
                ) : null}
                <CountItem count={count} />
              </span>
            ))}
          </span>
        </>
      ) : null}
    </div>
  );
}

function CountItem({ count }: { count: DetailCount }) {
  if (count.kind === "live") {
    return (
      <StatusChip tone="blue" live>
        <span className="tabular">{count.n}</span>
        <span className="ml-1">{count.label}</span>
      </StatusChip>
    );
  }

  if (count.kind === "done") {
    return (
      <span
        className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px]"
        style={{ color: "var(--ink-600)" }}
      >
        <Check
          className="size-[13px] shrink-0"
          strokeWidth={1.5}
          style={{ color: "var(--ink-400)" }}
          aria-hidden="true"
        />
        <span className="tabular">{count.n}</span> {count.label}
      </span>
    );
  }

  const body = (
    <>
      <Upload
        className="size-[13px] shrink-0"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <span className="tabular">{count.n}</span> {count.label}
    </>
  );
  const className =
    "inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium text-[var(--blue)]";

  return count.href ? (
    <Link href={count.href} className={className}>
      {body}
    </Link>
  ) : (
    <span className={className}>{body}</span>
  );
}

/* ── Table card ─────────────────────────────────────────────────────────── */

/**
 * The 52px row geometry, exported so a page's rows IMPORT it rather than
 * restate it.
 *
 * Lifted verbatim from `schedule-table.tsx`: a row inset 8px inside the card's
 * 24px padding (`-mx-4 px-4` on a `w-[calc(100%+32px)]`), so the hover wash
 * bleeds past the text without touching the card's edge. A caller adds its own
 * `grid-cols-*` — the same column string it handed `TableCard`'s `columns`,
 * which is the whole point of that prop being one value.
 */
export const TABLE_ROW_CLS =
  "-mx-4 grid h-[52px] w-[calc(100%+32px)] items-center gap-4 rounded-[var(--radius-element)] px-4 text-left transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-muted)]";

/**
 * One white table card — `eyebrow-sm` headers over a single hairline, rows
 * below it with no rules between them.
 *
 * The Round 15 table laws as `schedule-table.tsx` applies them, with the column
 * template passed in so the header and every row are laid out by ONE string. A
 * header that states its own grid and rows that state theirs is two sources of
 * truth for the same geometry, and they drift a column at a time.
 *
 * Every cell flush left under a flush-left header — including score and
 * outcome, which the schedule table records the argument for.
 */
export function TableCard({
  columns,
  headers,
  children,
}: {
  /** e.g. `"grid-cols-[56px_52px_minmax(0,1fr)_120px_130px]"`. */
  columns: string;
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="surface-card min-w-0 px-6 pb-1.5 pt-0.5">
      <div
        className={cn(
          "grid items-center gap-4 border-b border-[var(--border-hairline)] pb-2.5 pt-3.5",
          columns
        )}
      >
        {headers.map((label) => (
          <span key={label} className="eyebrow-sm">
            {label}
          </span>
        ))}
      </div>
      {children}
    </div>
  );
}

/**
 * A group's heading inside a `TableCard` — "SINGLES · 6 lines", "MAIN DRAW".
 *
 * A label and a note on one baseline, with an optional right-aligned slot for a
 * group's own tally. Deliberately NOT a second header row: the card's columns
 * are stated once, and a group head that re-drew them would put a second set of
 * column labels halfway down a table that already has one.
 */
export function GroupHead({
  label,
  note,
  right,
}: {
  label: string;
  note?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2.5 pb-1.5 pt-4">
      <span className="eyebrow">{label}</span>
      {note ? <span className="text-micro">{note}</span> : null}
      {right ? (
        <span
          className="ml-auto text-[11px]"
          style={{ color: "var(--ink-500)" }}
        >
          {right}
        </span>
      ) : null}
    </div>
  );
}
