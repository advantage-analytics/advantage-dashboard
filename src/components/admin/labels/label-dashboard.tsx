"use client";

import { useMemo, type ReactNode } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
} from "lucide-react";
import { AdminBackLink } from "@/components/admin/admin-back-link";
import { AdminPage } from "@/components/admin/admin-page";
import { LABEL_SESSION_PAGE } from "@/components/admin/labels/label-layout";
import {
  PendingBar,
  PendingRegion,
} from "@/components/dashboard/loading/pending";
import type { LabelUploadInfo } from "@/lib/data/label-overview-server";
import { buildAppliedRows, expectedStats } from "@/lib/services/labels/apply";
import {
  allErrorsJudged,
  isMarkableError,
  unmarkableErrors,
} from "@/lib/services/labels/ending-derived";
import {
  errorStops,
  flagGroups,
  openFlags,
  type FlagGroup,
  type OpenFlag,
} from "@/lib/services/labels/flag-nav";
import type { FlagCounts } from "@/lib/services/labels/job-groups";
import type { LabelMarks } from "@/lib/services/labels/marks";
import type { LabelGameBand } from "@/lib/services/labels/score";
import {
  isWithdrawnAdd,
  isWithdrawnPointAdd,
  labelProgress,
  type LabelPoint,
  type LabelSide,
  type LabelStartScore,
  type MatchScore,
} from "@/lib/services/labels/session";
import {
  enteredScore,
  formatPair,
  labelSetScores,
  type LabelSetScore,
} from "@/lib/services/labels/set-scores";
import { partialPublishWarnings } from "@/lib/services/labels/session-status";
import { advButton } from "@/lib/ui/adv-button";
import { MenuSelect } from "@/components/ui/menu-select";
import { cn } from "@/lib/utils";

/**
 * The label session outside full screen: the match's data, read. Nobody labels
 * here — there is no film, no court and no editable row — so the page answers
 * the questions asked before and after a labelling sitting.
 *
 * The admin's page is one column across the full width of the admin page
 * (2026-11-12, MatchOverview.dc.html; full width since 2026-11-13):
 *
 *   a progress line counted in flags, "X of Y flags resolved" over a bar
 *     once the session has a starting count, else "N flags left"
 *   the publish checklist as the body, each open row naming the set, point
 *     or game it concerns and opening full screen there
 *   what was entered at upload, one row closed by default
 *
 * The admin works until the flags are resolved, not every point, so there is
 * no "Every point checked" item and no points-checked count here.
 *
 * The labeller's page keeps its two columns, one card each:
 *
 *   left, the work     Left to check · Statistics from the labels
 *   right, the facts   Progress · Before you publish · Score · Entered at upload
 *
 * Every point number is a way in: it opens full screen on that point
 * (`onOpen`). The cards size to their content and none stretches to its
 * column: an empty foot under a short card reads worse than uneven columns.
 *
 * Read off the same pure rules the rail draws from, so the two never
 * disagree: `openFlags` / `flagGroups` for what is flagged, `labelSetScores`
 * for the score, `completeWarnings` (computed by the console, handed in as
 * `warnings`) for what a publish writes partly or leaves out,
 * `buildAppliedRows` +
 * `expectedStats` for the statistics — the rows a publish would write,
 * counted.
 *
 * The layout was chosen from eighteen card variations and three page designs
 * (2026-10-13); `/design/labels` shows it on a made-up match.
 */

export interface LabelDashboardProps {
  points: readonly LabelPoint[];
  /** The live marks; null on a session labelled without them. */
  marks: LabelMarks | null;
  /** `labelScores(points, adScoring, startScore).games`, as the console scored them. */
  games: readonly LabelGameBand[];
  adScoring: boolean;
  /** Where the video starts in the match; null or absent: at the beginning. */
  startScore?: LabelStartScore | null;
  /**
   * The flags open when the console first counted them
   * (`LabelSession.startOpenCounts`). Null or absent: no starting count, and
   * the admin's progress line reads "N flags left" with no bar.
   */
  startOpenCounts?: FlagCounts | null;
  /**
   * The console's open count now, amber and grey — the pair it saves as
   * `open_counts`, the same rule `startOpenCounts` was copied from. Absent:
   * counted from `openFlags` here.
   */
  openCounts?: FlagCounts | null;
  names: Record<LabelSide, string>;
  /**
   * Who reads it. Both publish (a labeller through submit-session.ts), so
   * both read "Before you publish"; a labeller's check words are their own.
   */
  audience?: "admin" | "labeller";
  finalScore: readonly (readonly number[])[] | null;
  matchScore: MatchScore | null;
  /** The video stops before the match does: the sets are not held to the record. */
  videoEndsEarly: boolean | null;
  /** `completeWarnings(...)`: what "Publish" would list. */
  warnings: readonly string[];
  /** Whether the console is asking for the errors yet (`errorMarkingReady`). */
  errorsReady?: boolean;
  /** Start marking errors, full screen. Absent: the check only reads. */
  onMarkErrors?: () => void;
  /** The session is published; nothing is left to do but read. */
  complete: boolean;
  /** What the uploader entered; null when it could not be read. */
  upload: LabelUploadInfo | null;
  /** Change the scoring this session counts by; absent where it cannot change. */
  onAdScoringChange?: (adScoring: boolean) => void;
  /** Open full screen, on a point when one is named. */
  onOpen: (pointId?: string) => void;
}

/** Everything the cards read, computed once. */
interface Reading {
  flagged: OpenFlag[];
  scoreGroups: FlagGroup[];
  dataGroups: FlagGroup[];
  sets: LabelSetScore[];
  entered: number[][] | null;
  changes: Changes;
  stats: ReturnType<typeof expectedStats> | null;
}

type WidgetProps = LabelDashboardProps & { reading: Reading };

export function LabelDashboard(props: LabelDashboardProps) {
  const {
    points,
    marks,
    games,
    adScoring,
    finalScore,
    matchScore,
    upload,
    startScore = null,
    audience = "admin",
  } = props;
  const admin = audience === "admin";
  const bestOf = upload?.bestOf ?? 3;
  const flagged = useMemo(
    () => (marks ? openFlags(points, marks) : []),
    [points, marks],
  );
  const reading: Reading = {
    flagged,
    scoreGroups: useMemo(
      () => flagGroups(flagged.filter((flag) => !flag.data)),
      [flagged],
    ),
    dataGroups: useMemo(
      () => flagGroups(flagged.filter((flag) => flag.data)),
      [flagged],
    ),
    sets: useMemo(
      () => labelSetScores(points, games, startScore),
      [points, games, startScore],
    ),
    entered: enteredScore(finalScore, matchScore),
    changes: useMemo(() => changeCounts(points), [points]),
    stats: useMemo(() => {
      // The admin's page draws no statistics: nothing to count.
      if (admin) return null;
      try {
        // The labeller's own marks: a partly marked session publishes no
        // forced string, and this still counts what they have marked so far.
        return expectedStats(
          buildAppliedRows({ points, adScoring, bestOf, start: startScore })
            .points,
          { labellerMarks: true },
        );
      } catch {
        return null;
      }
    }, [admin, points, adScoring, bestOf, startScore]),
  };
  const widget = { ...props, reading };

  if (admin) {
    return (
      <div
        data-label-dashboard=""
        className="-mr-14 flex min-h-0 flex-1 flex-col overflow-y-auto pr-14 pb-10"
      >
        <div className="flex w-full flex-col gap-7">
          {/* A complete session reads "Published": flags still counted
              above it would read as a contradiction. */}
          {props.complete ? null : <FlagsLeft {...widget} />}
          <AdminChecklist {...widget} />
          <UploadDetails {...widget} />
        </div>
      </div>
    );
  }

  return (
    <div
      data-label-dashboard=""
      className="-mr-14 grid min-h-0 flex-1 grid-cols-[minmax(0,7fr)_minmax(0,5fr)] content-start items-start gap-5 overflow-y-auto pr-14 pb-10 max-[1100px]:grid-cols-1"
    >
      <div className="flex min-w-0 flex-col gap-5">
        <LeftToCheck {...widget} />
        <Statistics {...widget} />
      </div>
      <div className="flex min-w-0 flex-col gap-5">
        <Progress {...widget} />
        <PublishCheck {...widget} />
        <Score {...widget} />
        <UploadInputs {...widget} />
      </div>
    </div>
  );
}

// ── Shared parts ───────────────────────────────────────────────────────────

/**
 * The page's inks, as inline styles: the DS type classes (`text-body`,
 * `text-data`…) are unlayered and set a colour of their own, which a Tailwind
 * colour utility on the same element loses to.
 */
const INK = {
  900: { color: "var(--ink-900)" },
  600: { color: "var(--ink-600)" },
  500: { color: "var(--ink-500)" },
} as const;

/** One reading of the match: a card, its title and an optional aside. */
function Card({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-dashboard-card={title}
      className="flex min-w-0 flex-col gap-3.5 rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] p-5 shadow-[var(--shadow-card)]"
    >
      <div className="flex items-baseline justify-between gap-6">
        <h2 className="text-title" style={INK[900]}>
          {title}
        </h2>
        {aside ? (
          <span className="text-micro tabular shrink-0" style={INK[500]}>
            {aside}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Quiet({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-body" style={INK[500]}>
      {children}
    </p>
  );
}

function Th({ children }: { children?: React.ReactNode }) {
  return (
    <th scope="col" className="pr-6 pb-2 font-normal last:pr-0">
      {children}
    </th>
  );
}

function Td({
  children,
  className,
  style,
}: {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <td className={cn("py-2 pr-6 last:pr-0", className)} style={style}>
      {children}
    </td>
  );
}

/** A way into full screen: words or a point number that open on a point. */
function PointLink({
  children,
  label,
  onClick,
  className,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{ color: "var(--link)" }}
      className={cn(
        "cursor-pointer rounded-[var(--radius-button)] transition-colors duration-[var(--duration-hover)] [--link:var(--blue)] hover:[--link:var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
        className,
      )}
    >
      {children}
    </button>
  );
}

// ── Entered at upload ──────────────────────────────────────────────────────

const HAND: Record<string, string> = {
  right: "Right-handed",
  left: "Left-handed",
};
const BACKHAND: Record<string, string> = {
  "two-handed": "two-handed backhand",
  "one-handed": "one-handed backhand",
};

function playerStyle(player: {
  hand: string | null;
  backhand: string | null;
}): string | null {
  const parts = [
    player.hand ? (HAND[player.hand] ?? player.hand) : null,
    player.backhand ? (BACKHAND[player.backhand] ?? player.backhand) : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}

const clock = (seconds: number | null) => {
  if (seconds === null) return null;
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${rest}` : `${m}:${rest}`;
};

const day = (iso: string | null) =>
  iso === null
    ? null
    : new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(iso));

// ── Score ──────────────────────────────────────────────────────────────────

function Score({ reading, onOpen }: WidgetProps) {
  const { sets, entered } = reading;
  return (
    <Card title="Score">
      {sets.length === 0 ? (
        <Quiet>No points with a set and game yet.</Quiet>
      ) : (
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="text-micro" style={INK[500]}>
              <Th>Set</Th>
              <Th>Labelled</Th>
              <Th>Match record</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {sets.map((set, i) => {
              const want = entered?.[i];
              const record = want
                ? formatPair([want[0] ?? 0, want[1] ?? 0])
                : null;
              const labelled = formatPair(set.games);
              const open = set.unfinished.length + set.overflow.length;
              const differs = record !== null && record !== labelled;
              return (
                <tr
                  key={set.setNumber}
                  className="text-data border-t border-[var(--border-card)]"
                >
                  <Td style={INK[500]}>{set.setNumber}</Td>
                  <Td className="tabular" style={INK[900]}>
                    {labelled}
                  </Td>
                  <Td className="tabular" style={INK[600]}>
                    {record ?? "Not entered"}
                  </Td>
                  <Td className="text-body-sm">
                    {differs ? (
                      <PointLink
                        onClick={() => onOpen(set.lastPointId)}
                        label={`Open set ${set.setNumber}'s last point`}
                      >
                        Differs
                      </PointLink>
                    ) : open > 0 ? (
                      <span style={INK[600]}>
                        {open === 1 ? "1 game open" : `${open} games open`}
                      </span>
                    ) : record ? (
                      <span style={INK[500]}>Matches</span>
                    ) : null}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Card>
  );
}

// ── Left to check ──────────────────────────────────────────────────────────

function LeftToCheck({ points, marks, reading, onOpen }: WidgetProps) {
  const unchecked = points.some(
    (point) => point.status !== "deleted" && point.checkedAt === null,
  );
  return (
    <Card title="Left to check">
      {!marks ? (
        <Quiet>
          This session is labelled without marks, so nothing is flagged.
        </Quiet>
      ) : reading.flagged.length === 0 ? (
        <Quiet>
          {unchecked
            ? "No flag is open. The unchecked points have nothing raised on them."
            : "Nothing is left to check."}
        </Quiet>
      ) : (
        <div className="flex flex-col gap-6">
          <FlagList
            heading="Can move the score"
            tone="score"
            groups={reading.scoreGroups}
            empty="Nothing open that can move the score."
            onOpen={onOpen}
          />
          <FlagList
            heading="Wrong data"
            tone="data"
            groups={reading.dataGroups}
            empty="No wrong data flagged."
            onOpen={onOpen}
          />
        </div>
      )}
    </Card>
  );
}

/** A review item shows this many point numbers, then "+N". */
const POINTS_SHOWN = 8;

/**
 * One of the two lists the rail's header carries, laid out as a table: each
 * review item's question, how many points ask it, and those points. The
 * heading counts points, each once — a point open on two items is on two
 * rows. The dot before the
 * heading is the chip's own colour in the rail — amber or grey — and the only
 * colour on the list.
 */
function FlagList({
  heading,
  tone,
  groups,
  empty,
  onOpen,
}: {
  heading: string;
  tone: "score" | "data";
  groups: readonly FlagGroup[];
  empty: string;
  onOpen: (pointId?: string) => void;
}) {
  const rows = groups.flatMap((group) => group.rows);
  const listed = rows.flatMap((row) => row.points);
  const count = new Set(listed.map((point) => point.pointId)).size;
  // The rows run in item order, so the first point in the match is found,
  // not read off the top row.
  const first = listed.reduce<(typeof listed)[number] | undefined>(
    (min, point) =>
      min === undefined || point.pointNumber < min.pointNumber ? point : min,
    undefined,
  );
  return (
    <div data-flag-list={tone} className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 rounded-full",
            tone === "score"
              ? "bg-[var(--warning-text)]"
              : "bg-[var(--ink-400)]",
          )}
        />
        <h3 className="text-body font-medium" style={INK[900]}>
          {heading}
        </h3>
        <span className="text-body-sm tabular" style={INK[500]}>
          {count}
        </span>
        {first ? (
          <PointLink
            onClick={() => onOpen(first.pointId)}
            label={`Open labelling on the first of these, point ${first.pointNumber}`}
            className="text-body-sm ml-auto inline-flex items-center gap-1"
          >
            Start here
            <ArrowUpRight
              className="size-3"
              strokeWidth={1.8}
              aria-hidden="true"
            />
          </PointLink>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <Quiet>{empty}</Quiet>
      ) : (
        <ul className="flex flex-col">
          {rows.map((row) => {
            const shown = row.points.slice(0, POINTS_SHOWN);
            const rest = row.points.length - shown.length;
            return (
              <li
                key={row.code}
                data-flag-kind={row.code}
                className="grid grid-cols-[minmax(0,14rem)_2.5rem_minmax(0,1fr)] items-baseline gap-x-4 border-t border-[var(--border-card)] py-2"
              >
                <span className="text-body truncate" style={INK[900]}>
                  {row.label}
                </span>
                <span className="text-data tabular" style={INK[900]}>
                  {row.points.length}
                </span>
                <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  {shown.map((point) => (
                    <PointLink
                      key={point.pointId}
                      onClick={() => onOpen(point.pointId)}
                      label={`Open point ${point.pointNumber}: ${row.label}`}
                      className="text-body-sm tabular"
                    >
                      {point.pointNumber}
                    </PointLink>
                  ))}
                  {rest > 0 ? (
                    <span className="text-body-sm tabular" style={INK[500]}>
                      +{rest}
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Progress ───────────────────────────────────────────────────────────────

/** How far the labelling is, and the three changes that say what it did. */
function Progress({ points, reading }: WidgetProps) {
  const { checked, total } = labelProgress(points);
  const { changes } = reading;
  const rows: [string, number][] = [
    ["Winners changed", changes.winners],
    ["Endings changed", changes.endings],
    ["Shots added or removed", changes.shotsAdded + changes.shotsRemoved],
  ];
  return (
    <Card title="Progress">
      <div className="flex items-baseline gap-2">
        <span className="text-display tabular">{checked}</span>
        <span className="text-body" style={INK[600]}>
          of {total} points checked
        </span>
      </div>
      <div
        role="img"
        aria-label={`${checked} of ${total} points checked`}
        className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-subtle)]"
      >
        <div
          className="h-full rounded-full bg-[var(--ink-900)]"
          style={{ width: `${total === 0 ? 0 : (checked / total) * 100}%` }}
        />
      </div>
      <dl className="flex flex-col gap-1">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="text-body-sm" style={INK[600]}>
              {label}
            </dt>
            <dd className="text-body-sm tabular" style={INK[900]}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

interface Changes {
  winners: number;
  endings: number;
  shotsAdded: number;
  shotsRemoved: number;
}

/** What the labeller did to the vendor's rows. */
function changeCounts(points: readonly LabelPoint[]): Changes {
  const changes: Changes = {
    winners: 0,
    endings: 0,
    shotsAdded: 0,
    shotsRemoved: 0,
  };
  for (const point of points) {
    if (isWithdrawnPointAdd(point)) continue;
    if (point.status !== "deleted" && point.seed) {
      if (
        point.winner !== null &&
        point.seed.winner !== null &&
        point.winner !== point.seed.winner
      ) {
        changes.winners += 1;
      }
      if (point.ending !== point.seed.ending) changes.endings += 1;
    }
    for (const shot of point.shots) {
      if (isWithdrawnAdd(shot)) continue;
      if (shot.status === "deleted") changes.shotsRemoved += 1;
      else if (shot.status === "added") changes.shotsAdded += 1;
    }
  }
  return changes;
}

// ── Before you publish ─────────────────────────────────────────────────────

type CheckState = "done" | "open" | "blocking";

interface CheckItem {
  state: CheckState;
  title: string;
  detail: string;
  /** Where to go to deal with it: the labeller's "Open". */
  pointId?: string;
  /**
   * The admin's way in: the set, point or game the check concerns, named
   * ("Set 1", "Point 57", "Game 9"), and the point full screen opens on.
   */
  target?: { label: string; pointId: string };
  /** A way in other than a point: a quiet link, or the card's one button. */
  link?: { label: string; onClick: () => void };
  button?: { label: string; onClick: () => void };
}

/** The flag on the earliest point, in rail order. */
function firstFlag(list: readonly OpenFlag[]): OpenFlag | undefined {
  return list.reduce<OpenFlag | undefined>(
    (min, flag) =>
      min === undefined || flag.pointNumber < min.pointNumber ? flag : min,
    undefined,
  );
}

/**
 * The route to publishing, as the things that must be true first. The
 * labeller's list (`admin` false) is the one it has always been; the admin's
 * drops "Every point checked", counts flags rather than marks, adds "Wrong
 * data fixed", and names each open check's set, point or game (`target`).
 */
function publishChecks(
  {
    points,
    marks,
    warnings,
    videoEndsEarly,
    reading,
    errorsReady = false,
    onMarkErrors,
  }: WidgetProps,
  admin = false,
): CheckItem[] {
  const { sets, entered, flagged } = reading;
  const { checked, total } = labelProgress(points);
  const live = points.filter((point) => point.status !== "deleted");
  const firstUnchecked = live.find((point) => point.checkedAt === null);
  const amber = flagged.filter((flag) => !flag.data);
  const greyFlags = flagged.filter((flag) => flag.data);
  const grey = greyFlags.length;
  const pointTarget = (flag: OpenFlag | undefined) =>
    flag
      ? { label: `Point ${flag.pointNumber}`, pointId: flag.pointId }
      : undefined;
  const differing = sets.flatMap((set, i) => {
    const want = entered?.[i];
    if (!want) return [];
    const record = formatPair([want[0] ?? 0, want[1] ?? 0]);
    const labelled = formatPair(set.games);
    return record === labelled ? [] : [{ set, record, labelled }];
  });
  const openGames = sets.reduce(
    (sum, set) => sum + set.unfinished.length + set.overflow.length,
    0,
  );
  // A point the publish writes only partly, or leaves out.
  const partial = partialPublishWarnings(warnings);
  const plural = (n: number, one: string, many = `${one}s`) =>
    `${n} ${n === 1 ? one : many}`;
  // The first such point, read off its sentence ("Point 9 isn't on…").
  const partialPoint = partial
    .map((warning) => /^Point (\d+)\b/.exec(warning))
    .map((match) => (match ? Number(match[1]) : null))
    .find((n): n is number => n !== null);
  const partialId =
    partialPoint === undefined
      ? undefined
      : live.find((point) => point.pointIndex + 1 === partialPoint)?.id;
  // The first game left short or run over, opened on its first point.
  const openGame = sets
    .flatMap((set) => [...set.unfinished, ...set.overflow])
    .sort((a, b) => a.setNumber - b.setNumber || a.gameNumber - b.gameNumber)
    .at(0);
  const openGamePoint = openGame
    ? live
        .filter(
          (point) =>
            point.setNumber === openGame.setNumber &&
            point.gameNumber === openGame.gameNumber,
        )
        .reduce<LabelPoint | undefined>(
          (min, point) =>
            min === undefined || point.pointIndex < min.pointIndex
              ? point
              : min,
          undefined,
        )
    : undefined;
  const gameTarget =
    openGame && openGamePoint
      ? {
          label:
            sets.length > 1
              ? `Set ${openGame.setNumber} · Game ${openGame.gameInSet}`
              : `Game ${openGame.gameInSet}`,
          pointId: openGamePoint.id,
        }
      : undefined;
  const flagsOn = (list: readonly OpenFlag[]) =>
    `${plural(list.length, "flag")} open on ${plural(new Set(list.map((f) => f.pointId)).size, "point")}.`;

  const everyPointChecked: CheckItem =
    checked < total
      ? {
          state: "open",
          title: "Every point checked",
          detail: `${total - checked} of ${total} still to check.`,
          pointId: firstUnchecked?.id,
        }
      : {
          state: "done",
          title: "Every point checked",
          detail: `All ${total} points checked.`,
        };
  const scoreFlags: CheckItem = admin
    ? amber.length > 0
      ? {
          state: "open",
          title: "Nothing open that can move the score",
          detail: flagsOn(amber),
          target: pointTarget(firstFlag(amber)),
        }
      : {
          state: "done",
          title: "Nothing open that can move the score",
          detail: "No flag that can move the score is open.",
        }
    : amber.length > 0
      ? {
          state: "open",
          title: "Nothing open that can move the score",
          detail: `${plural(amber.length, "mark")} open on ${plural(new Set(amber.map((f) => f.pointId)).size, "point")}.`,
          pointId: amber[0].pointId,
        }
      : {
          state: "done",
          title: "Nothing open that can move the score",
          detail:
            grey > 0
              ? `${plural(grey, "wrong-data mark")} still open; none blocks a publish.`
              : "No mark is open.",
        };
  const wrongData: CheckItem =
    grey > 0
      ? {
          state: "open",
          title: "Wrong data fixed",
          detail: `${flagsOn(greyFlags)} None blocks publishing.`,
          target: pointTarget(firstFlag(greyFlags)),
        }
      : {
          state: "done",
          title: "Wrong data fixed",
          detail: "No wrong data is flagged.",
        };

  return [
    videoEndsEarly === true
      ? {
          state: "done",
          title: "Score adds up",
          detail:
            "The video ends before the match does, so the sets are not held to the record.",
        }
      : entered === null
        ? {
            state: "open",
            title: "Score adds up",
            detail: "No score was entered to check the sets against.",
          }
        : differing.length > 0
          ? {
              // Published as labelled either way; the record still disagrees.
              state: "open",
              title: "Score adds up",
              detail: differing
                .map(
                  (d) =>
                    `Set ${d.set.setNumber} is labelled ${d.labelled} against a record of ${d.record}`,
                )
                .join(". "),
              pointId: differing[0].set.lastPointId,
              target: {
                label: `Set ${differing[0].set.setNumber}`,
                pointId: differing[0].set.lastPointId,
              },
            }
          : {
              state: "done",
              title: "Score adds up",
              detail: "Every labelled set matches the match record.",
            },
    partial.length > 0
      ? {
          state: "open",
          title: "Every point can be written",
          detail:
            partial.length === 1
              ? partial[0]
              : `${partial[0]} (and ${partial.length - 1} more)`,
          target:
            partialPoint !== undefined && partialId
              ? { label: `Point ${partialPoint}`, pointId: partialId }
              : undefined,
        }
      : {
          state: "done",
          title: "Every point can be written",
          detail: "No point is missing what a publish needs.",
        },
    // The admin works until the flags are resolved, not every point.
    ...(admin ? [] : [everyPointChecked]),
    scoreFlags,
    ...(admin ? [wrongData] : []),
    openGames > 0
      ? {
          state: "open",
          title: "Every game finished",
          detail: `${plural(openGames, "game")} unfinished or with points past its end.`,
          target: gameTarget,
        }
      : {
          state: "done",
          title: "Every game finished",
          detail: "No game is short or runs over.",
        },
    errorsCheck(points, errorsReady, onMarkErrors),
    ...scoreStreamCheck(marks),
  ];
}

/**
 * The vendor's score stream hardly moved over the match (marks.ts
 * `scoreStalled`). Open, never blocking, and only on such a match: the games,
 * servers and winners were read from the serve and the last shot, so every
 * game needs checking, not only the marked points.
 */
function scoreStreamCheck(marks: WidgetProps["marks"]): CheckItem[] {
  const stall = marks?.scoreStalled;
  if (!stall) return [];
  const changes =
    stall.gameChanges === 0
      ? "never changed"
      : `changed ${stall.gameChanges === 1 ? "once" : `${stall.gameChanges} times`}`;
  return [
    {
      state: "open",
      title: "Score read off the video",
      detail: `The vendor’s game score ${changes} over ${stall.points} points, so the games, servers and winners here come from the serve and the last shot. Check every game, not only the marked points.`,
    },
  ];
}

/**
 * Every error marked forced or unforced. Open, never blocking: a publish with
 * errors unmarked reports plain Errors. Until the rest is settled it waits, and
 * says so, with a quiet way to start anyway; then it asks.
 */
export function errorsCheck(
  points: readonly LabelPoint[],
  ready: boolean,
  onMarkErrors?: () => void,
): CheckItem {
  const title = "Every error marked";
  const total = points.filter(isMarkableError);
  const left = errorStops(points).length;
  // No stroke to mark: nothing can ask about it, and it holds the split back.
  const unmarkable = unmarkableErrors(points).length;
  const heldBack =
    unmarkable === 1
      ? "1 error has no shots to mark, so this match shows Errors only."
      : `${unmarkable} errors have no shots to mark, so this match shows Errors only.`;
  if (total.length === 0) {
    return unmarkable > 0
      ? { state: "open", title, detail: heldBack }
      : { state: "done", title, detail: "No error to mark." };
  }
  if (left === 0) {
    const forced = total.filter((p) => p.errorKind === "forced").length;
    const counts = `${forced} forced, ${total.length - forced} unforced.`;
    return unmarkable > 0
      ? { state: "open", title, detail: `${counts} ${heldBack}` }
      : { state: "done", title, detail: counts };
  }
  if (!ready) {
    return {
      state: "open",
      title,
      detail: `${left} to mark. It asks once the score is settled.`,
      link: onMarkErrors
        ? { label: "Mark now", onClick: onMarkErrors }
        : undefined,
    };
  }
  const marked = total.length - left;
  return {
    state: "open",
    title,
    detail:
      marked > 0
        ? `${marked} of ${total.length} marked. Publish now and the match reports plain Errors, with your marks kept.`
        : `Forced or unforced, ${left} to mark. Publish without them and the match reports plain Errors.`,
    button: onMarkErrors
      ? {
          label: `Mark ${left} ${left === 1 ? "error" : "errors"}`,
          onClick: onMarkErrors,
        }
      : undefined,
  };
}

const CHECK_WORD: Record<CheckState, string> = {
  done: "Done",
  open: "Open",
  blocking: "Blocks publishing",
};

/** `CHECK_WORD` said to a labeller. */
const LABELLER_CHECK_WORD: Record<CheckState, string> = {
  ...CHECK_WORD,
  blocking: "Blocks submitting",
};

/** A check's state as a mark: a green tick, an empty ring, or an alert. */
function CheckMark({ state, word }: { state: CheckState; word: string }) {
  return (
    <span
      role="img"
      aria-label={word}
      className={cn(
        "mt-px grid size-4 place-items-center rounded-full",
        state === "done" &&
          "text-[var(--success)] shadow-[inset_0_0_0_1.5px_var(--success)]",
        state === "open" && "shadow-[inset_0_0_0_1.5px_var(--ink-300)]",
        state === "blocking" && "text-[var(--warning-text)]",
      )}
    >
      {state === "done" ? (
        <Check className="size-2.5" strokeWidth={2.5} aria-hidden="true" />
      ) : state === "blocking" ? (
        <CircleAlert className="size-4" strokeWidth={1.5} aria-hidden="true" />
      ) : null}
    </span>
  );
}

/** The sentence a published session reads instead of its checklist. */
function Published() {
  return (
    <Card title="Published">
      <Quiet>
        These labels are the match’s points and statistics. Reopen the session
        to change them.
      </Quiet>
    </Card>
  );
}

// ── The admin's page ───────────────────────────────────────────────────────

/**
 * How far the work is, counted in flags, split the way the rail splits it.
 *
 * With a starting count (`startOpenCounts`, the first `open_counts` the
 * console saved) it reads "X of Y flags resolved" over a bar: Y is the start's
 * amber + grey, X is Y less what is open now, floored at 0 since work can raise
 * flags past the start. Without one it reads "N flags left", no bar.
 *
 * What is open now is the console's `openCounts` when it hands them in, not
 * `openFlags` here: the two differ. The console's amber also counts the set
 * that doesn't add up (`sessionScoreMismatch`), one stop `openFlags` never
 * holds, and the start was copied from that pair — so X takes the same source
 * as Y, and so does the split after it. Without a start the "N flags left"
 * line takes the console's `openCounts` too, so it matches the boards (which
 * read the saved `open_counts`); with no `openCounts` it counts `openFlags`.
 */
function FlagsLeft({
  marks,
  reading,
  startOpenCounts,
  openCounts,
}: WidgetProps) {
  const { flagged } = reading;
  const data = flagged.filter((flag) => flag.data).length;
  const score = flagged.length - data;
  const total = startOpenCounts
    ? startOpenCounts.amber + startOpenCounts.grey
    : 0;
  // The console's amber also holds the score that doesn't add up, which the
  // checklist shows as its own "Score adds up" row. Named apart, the "can move
  // the score" figure is the checklist's flags on points, and the total still
  // matches the boards.
  const split = (counts: FlagCounts) => {
    const onPoints = Math.min(counts.amber, score);
    const unbalanced = counts.amber - onPoints;
    return [
      `${onPoints} can move the score`,
      ...(unbalanced > 0 ? ["the score doesn't add up"] : []),
      `${counts.grey} wrong data`,
    ].join(", ");
  };
  // The console's count when it hands one in, so this line and the boards
  // (which read the `open_counts` it saves) give the same number.
  const open = openCounts ?? { amber: score, grey: data };
  const left = open.amber + open.grey;
  // A start of zero has nothing to count from: the line reads as without one.
  if (marks && startOpenCounts && total > 0) {
    const resolved = Math.max(0, total - left);
    return (
      <section
        data-dashboard-card="Progress"
        aria-label="Progress"
        className="flex flex-col gap-2"
      >
        <p data-flags-left="" className="text-body tabular" style={INK[600]}>
          <span className="text-title" style={INK[900]}>
            {`${resolved} of ${total} ${total === 1 ? "flag" : "flags"} resolved`}
          </span>{" "}
          {`${left} left: ${split(open)}`}
        </p>
        <div
          role="progressbar"
          aria-label="Flags resolved"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={resolved}
          className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-subtle)]"
        >
          <div
            className="h-full rounded-full bg-[var(--ink-900)]"
            style={{ width: `${(resolved / total) * 100}%` }}
          />
        </div>
      </section>
    );
  }
  return (
    <section data-dashboard-card="Progress" aria-label="Progress">
      <p data-flags-left="" className="text-body tabular" style={INK[600]}>
        {!marks ? (
          "This session is labelled without marks, so nothing is flagged."
        ) : left === 0 ? (
          <span className="text-title" style={INK[900]}>
            No flags left
          </span>
        ) : (
          <>
            <span className="text-title" style={INK[900]}>
              {`${left} ${left === 1 ? "flag" : "flags"} left:`}
            </span>{" "}
            {split(open)}
          </>
        )}
      </p>
    </section>
  );
}

/**
 * The admin's way into a check: the set, point or game it concerns, named, or
 * the check's own quiet link. The row is not one big link — a check can carry
 * a button of its own.
 */
export function CheckTarget({
  children,
  label,
  onClick,
  onOpen,
  target,
}: {
  children: React.ReactNode;
  label?: string;
  /** The check's own link. */
  onClick?: () => void;
  /** With `target`: full screen, on the target's point. */
  onOpen?: (pointId?: string) => void;
  target?: { label: string; pointId: string };
}) {
  return (
    <button
      type="button"
      data-check-target={target?.label}
      data-check-point={target?.pointId}
      aria-label={label}
      onClick={target ? () => onOpen?.(target.pointId) : onClick}
      className="text-body-sm inline-flex cursor-pointer items-center gap-0.5 rounded-[var(--radius-button)] py-1 pr-1 pl-2 whitespace-nowrap transition-colors duration-[var(--duration-hover)] hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
      style={INK[600]}
    >
      {children}
      <ChevronRight
        className="size-3.5"
        strokeWidth={1.8}
        style={{ color: "var(--ink-400)" }}
        aria-hidden="true"
      />
    </button>
  );
}

/** "Before you publish", as the page's body. */
function AdminChecklist(props: WidgetProps) {
  const { complete, onOpen } = props;
  if (complete) return <Published />;
  const checks = publishChecks(props, true);
  return (
    <Card title="Before you publish">
      <ul className="flex flex-col">
        {checks.map((check) => (
          <li
            key={check.title}
            data-publish-check={check.state}
            data-check-title={check.title}
            className="grid min-h-12 grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-x-3 border-t border-[var(--border-card)] py-2.5 first:border-t-0 first:pt-0 last:pb-0"
          >
            <CheckMark state={check.state} word={CHECK_WORD[check.state]} />
            <div className="flex min-w-0 flex-col">
              <span className="text-body" style={INK[900]}>
                {check.title}
              </span>
              <span className="text-body-sm" style={INK[600]}>
                {check.detail}
              </span>
              {check.button ? (
                <button
                  type="button"
                  data-mark-errors=""
                  onClick={check.button.onClick}
                  className={cn(
                    advButton("primary", "sm"),
                    "mt-2.5 self-start",
                  )}
                >
                  {check.button.label}
                </button>
              ) : null}
            </div>
            {check.target ? (
              <CheckTarget
                target={check.target}
                label={`Open ${check.target.label}: ${check.title}`}
                onOpen={onOpen}
              >
                {check.target.label}
              </CheckTarget>
            ) : check.link ? (
              <CheckTarget onClick={check.link.onClick}>
                {check.link.label}
              </CheckTarget>
            ) : (
              <span />
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Who started on the far side, by name; null when it was not entered. */
function farSide(
  upload: LabelUploadInfo,
  names: Record<LabelSide, string>,
): string | null {
  return upload.topPlayerIsPlayer1 === null
    ? null
    : upload.topPlayerIsPlayer1
      ? names.p1
      : names.p2;
}

/**
 * What was entered at upload, as one row closed by default: its summary names
 * the scoring these labels count by, who starts on the far side and best-of.
 * Opened, it holds the same facts and scoring control the labeller's card does.
 */
function UploadDetails(props: WidgetProps) {
  const { upload, names, adScoring } = props;
  const shell =
    "rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)]";
  const heading = (
    <span className="text-body font-medium" style={INK[900]}>
      Entered at upload
    </span>
  );
  if (!upload) {
    return (
      <section
        data-dashboard-card="Entered at upload"
        className={cn(
          shell,
          "flex min-h-11 flex-wrap items-baseline gap-x-3 gap-y-0.5 px-4 py-2.5",
        )}
      >
        {heading}
        <span className="text-body-sm" style={INK[500]}>
          The upload’s inputs could not be read.
        </span>
      </section>
    );
  }
  const far = farSide(upload, names);
  const summary = [
    adScoring ? "Ad scoring" : "No-ad scoring",
    far ? `${far} starts on the far side` : "Far side not entered",
    upload.bestOf ? `best of ${upload.bestOf}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <details
      data-dashboard-card="Entered at upload"
      data-upload-details=""
      className={cn(shell, "group")}
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-[var(--radius-card)] py-2.5 pr-3 pl-4 focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          {heading}
          <span
            data-upload-summary=""
            className="text-body-sm"
            style={INK[600]}
          >
            {summary}
          </span>
        </span>
        <ChevronDown
          className="size-3.5 shrink-0 transition-transform duration-[var(--duration-hover)] group-open:rotate-180"
          strokeWidth={1.8}
          style={{ color: "var(--ink-400)" }}
          aria-hidden="true"
        />
      </summary>
      <div className="flex flex-col gap-3.5 px-4 pb-4">
        <UploadFacts {...props} upload={upload} />
      </div>
    </details>
  );
}

function PublishCheck(props: WidgetProps) {
  const { complete, onOpen, audience = "admin" } = props;
  const labeller = audience === "labeller";
  const checkWord = labeller ? LABELLER_CHECK_WORD : CHECK_WORD;
  if (complete) return <Published />;
  const checks = publishChecks(props);
  return (
    <Card title="Before you publish">
      <ul className="flex flex-col">
        {checks.map((check) => (
          <li
            key={check.title}
            data-publish-check={check.state}
            className="grid grid-cols-[16px_minmax(0,1fr)] gap-x-2.5 border-t border-[var(--border-card)] py-2 first:border-t-0 first:pt-0 last:pb-0"
          >
            <CheckMark state={check.state} word={checkWord[check.state]} />
            <div className="flex min-w-0 flex-col">
              <span className="text-body" style={INK[900]}>
                {check.title}
              </span>
              <span className="text-body-sm" style={INK[600]}>
                {check.detail}{" "}
                {check.pointId ? (
                  <PointLink
                    onClick={() => onOpen(check.pointId)}
                    label={`Open labelling: ${check.title}`}
                  >
                    Open
                  </PointLink>
                ) : null}
                {check.link ? (
                  <PointLink
                    onClick={check.link.onClick}
                    label={check.link.label}
                  >
                    {check.link.label}
                  </PointLink>
                ) : null}
              </span>
              {check.button ? (
                <button
                  type="button"
                  data-mark-errors=""
                  onClick={check.button.onClick}
                  className={cn(
                    advButton("primary", "sm"),
                    "mt-2.5 self-start",
                  )}
                >
                  {check.button.label}
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ── Entered at upload ──────────────────────────────────────────────────────

const SCORING = [
  { value: "no-ad", label: "No-ad" },
  { value: "ad", label: "Ad" },
] as const;

/**
 * What the uploader told the wizard, which is what the derivation was run
 * with: a grid of facts, two across. A labeller reads it to tell a wrong
 * label from a wrong input — above all who starts on the far side, the one
 * input that credits every stroke to the other player when it is wrong.
 *
 * "Format" keeps saying what was sent to the vendor. "Labels counted as" is
 * the one fact here that can change: a wrong scoring is corrected for the
 * session's scoreboard and its publish, without resubmitting the video.
 */
function UploadInputs(props: WidgetProps) {
  const { upload } = props;
  if (!upload) {
    return (
      <Card title="Entered at upload">
        <Quiet>The upload’s inputs could not be read.</Quiet>
      </Card>
    );
  }
  return (
    <Card title="Entered at upload">
      <UploadFacts {...props} upload={upload} />
    </Card>
  );
}

/** The upload's facts, two across, and who uploaded it. */
function UploadFacts({
  upload,
  names,
  adScoring,
  onAdScoringChange,
}: WidgetProps & { upload: LabelUploadInfo }) {
  const far = farSide(upload, names);
  const window_ =
    upload.trim.start === null && upload.trim.end === null
      ? null
      : `${clock(upload.trim.start) ?? "start"} to ${clock(upload.trim.end) ?? "end"}`;
  const facts: [string, ReactNode][] = [
    [
      "Played",
      [day(upload.playedAt), upload.event, upload.round]
        .filter(Boolean)
        .join(" · ") || null,
    ],
    ["Score", upload.enteredScore],
    [
      "Format",
      [
        upload.bestOf ? `Best of ${upload.bestOf}` : null,
        upload.adScoring === null
          ? null
          : upload.adScoring
            ? "ad scoring"
            : "no-ad scoring",
        upload.playOnLets === null
          ? null
          : upload.playOnLets
            ? "lets played on"
            : "lets replayed",
      ]
        .filter(Boolean)
        .join(", ") || null,
    ],
    [
      "Labels counted as",
      onAdScoringChange ? (
        <MenuSelect
          label="Labels counted as"
          variant="text"
          align="start"
          width={140}
          className="-my-0.5 h-6 text-[13px]"
          value={adScoring ? "ad" : "no-ad"}
          options={SCORING}
          onChange={(next) => onAdScoringChange(next === "ad")}
        />
      ) : adScoring ? (
        "Ad"
      ) : (
        "No-ad"
      ),
    ],
    [
      "Court",
      [upload.courtType, upload.matchType].filter(Boolean).join(" · ") || null,
    ],
    ["Starts on the far side", far],
    [
      "Camera",
      upload.fixedCamera === null
        ? null
        : upload.fixedCamera
          ? "Fixed"
          : "Moves",
    ],
    [names.p1, playerStyle(upload.player1)],
    [names.p2, playerStyle(upload.player2)],
    ["Analysed window", window_],
    ["Vendor confidence", upload.confidence],
  ];
  const by = [upload.uploadedBy, day(upload.submittedAt)]
    .filter(Boolean)
    .join(" on ");
  return (
    <>
      <dl data-upload-inputs="" className="grid grid-cols-2 gap-x-6">
        {facts.map(([label, value]) => (
          <div
            key={label}
            className="flex min-w-0 flex-col gap-0.5 border-t border-[var(--border-card)] py-2"
          >
            <dt className="text-micro truncate" style={INK[500]}>
              {label}
            </dt>
            <dd className="text-body" style={value ? INK[900] : INK[500]}>
              {value ?? "Not entered"}
            </dd>
          </div>
        ))}
      </dl>
      {by ? (
        <p className="text-body-sm" style={INK[600]}>
          Uploaded by {by}
          {upload.program ? ` for ${upload.program}` : ""}.
        </p>
      ) : null}
    </>
  );
}

// ── Statistics ─────────────────────────────────────────────────────────────

const pct = (part: number, whole: number) =>
  whole === 0 ? 0 : Math.round((part / whole) * 100);

/**
 * The rows a publish would write, counted, head to head: each statistic a
 * pair of bars sharing one track, split in proportion, the larger in ink.
 * Errors read as one row until every one is marked (`allErrorsJudged`), as the
 * published report will: a Forced row of zero would read as a fact.
 */
function Statistics({ reading, names, points }: WidgetProps) {
  const { stats } = reading;
  if (!stats || stats.points === 0) {
    return (
      <Card title="Statistics from the labels">
        <Quiet>No counted points yet.</Quiet>
      </Card>
    );
  }
  const { p1, p2 } = stats;
  const errorRows: [string, number, number][] = allErrorsJudged(points)
    ? [
        ["Unforced errors", p1.unforcedErrors, p2.unforcedErrors],
        ["Forced errors", p1.forcedErrors, p2.forcedErrors],
      ]
    : [
        [
          "Errors",
          p1.unforcedErrors + p1.forcedErrors,
          p2.unforcedErrors + p2.forcedErrors,
        ],
      ];
  const rows: [string, number, number, string?][] = [
    ["Points won", p1.pointsWon, p2.pointsWon],
    ["Aces", p1.aces, p2.aces],
    ["Double faults", p1.doubleFaults, p2.doubleFaults],
    ["Service winners", p1.serviceWinners, p2.serviceWinners],
    ["Winners", p1.winners, p2.winners],
    ...errorRows,
    [
      "First serves in",
      pct(p1.firstServesIn, p1.firstServes),
      pct(p2.firstServesIn, p2.firstServes),
      "%",
    ],
  ];
  return (
    <Card
      title="Statistics from the labels"
      aside={`${stats.points} points · ${stats.shots} shots`}
    >
      <div className="flex justify-between gap-4">
        <span className="text-body-sm truncate" style={INK[900]}>
          {names.p1}
        </span>
        <span className="text-body-sm truncate text-right" style={INK[900]}>
          {names.p2}
        </span>
      </div>
      <dl className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-x-3 gap-y-1">
        {rows.map(([label, a, b, unit = ""]) => (
          <StatRow key={label} label={label} a={a} b={b} unit={unit} />
        ))}
      </dl>
      <p className="text-body-sm" style={INK[600]}>
        Break points won: {p1.breakPointsWon} of {p2.breakPointsFaced} and{" "}
        {p2.breakPointsWon} of {p1.breakPointsFaced}.
      </p>
    </Card>
  );
}

function StatRow({
  label,
  a,
  b,
  unit,
}: {
  label: string;
  a: number;
  b: number;
  unit: string;
}) {
  // A zero still gets a sliver, so the track never reads as one-sided data.
  const share = (n: number) => Math.max(n, (a + b) * 0.02, 0.02);
  return (
    <>
      <dt className="text-micro col-span-3 mt-1.5" style={INK[500]}>
        {label}
      </dt>
      <dd className="text-body tabular" style={INK[900]}>
        {a}
        {unit}
      </dd>
      <dd
        role="img"
        aria-label={`${label}: ${a}${unit} to ${b}${unit}`}
        className="flex h-1.5 gap-0.5"
      >
        <span
          className={cn(
            "h-full rounded-full",
            a >= b ? "bg-[var(--ink-900)]" : "bg-[var(--ink-200)]",
          )}
          style={{ flexGrow: share(a), flexBasis: 0 }}
        />
        <span
          className={cn(
            "h-full rounded-full",
            b > a ? "bg-[var(--ink-900)]" : "bg-[var(--ink-200)]",
          )}
          style={{ flexGrow: share(b), flexBasis: 0 }}
        />
      </dd>
      <dd className="text-body tabular text-right" style={INK[900]}>
        {b}
        {unit}
      </dd>
    </>
  );
}

// ── The admin's page, loading ──────────────────────────────────────────────

/** Rows the checklist's skeleton draws: the admin's usual set. */
const PENDING_CHECKS = 5;

/**
 * `/admin/labels/[sessionId]` while it loads (`[sessionId]/loading.tsx`): the
 * page's own bounded column with the way back, the console's header (the
 * avatar pair, title and meta line, the header's buttons) and this overview's
 * body — the "N flags left" line, the "Before you publish" card and the
 * "Entered at upload" bar — as `LabelDashboard` draws them for an admin.
 * Card titles are real; every value, and every button that depends on the
 * session's status, is a bar.
 */
export function LabelSessionPageSkeleton() {
  return (
    <AdminPage className={LABEL_SESSION_PAGE}>
      <AdminBackLink href="/admin/labels" className="shrink-0 self-start">
        Labels
      </AdminBackLink>
      <div className="flex min-h-0 flex-1 flex-col gap-6">
        <PendingRegion
          label="the match"
          className="shrink-0"
          innerClassName="flex items-end justify-between gap-8"
        >
          <div className="flex min-w-0 items-center gap-4">
            <span className="flex shrink-0">
              <PendingBar className="relative size-10 rounded-full" />
              <PendingBar className="-ml-2.5 size-10 rounded-full shadow-[0_0_0_2px_var(--surface-card)]" />
            </span>
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="flex h-9 items-center">
                <PendingBar className="h-6 w-80" />
              </span>
              <span className="flex h-[26px] items-center gap-1.5">
                <PendingBar className="size-[26px] rounded-[var(--radius-element)]" />
                <PendingBar className="h-3 w-64" />
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-5">
            <PendingBar className="h-8 w-[72px] rounded-[var(--radius-button)]" />
            <PendingBar className="h-8 w-28 rounded-[var(--radius-button)]" />
            <PendingBar className="h-3 w-20" />
          </div>
        </PendingRegion>

        <div className="-mr-14 flex min-h-0 flex-1 flex-col overflow-y-auto pr-14 pb-10">
          <div className="flex w-full flex-col gap-7">
            <PendingRegion
              label="flags left"
              innerClassName="flex h-6 items-center"
            >
              <PendingBar className="h-3.5 w-96" />
            </PendingRegion>

            <Card title="Before you publish">
              <PendingRegion label="the publish checklist">
                <ul className="flex flex-col">
                  {Array.from({ length: PENDING_CHECKS }, (_, i) => (
                    <li
                      key={i}
                      className="grid min-h-12 grid-cols-[16px_minmax(0,1fr)_auto] items-center gap-x-3 border-t border-[var(--border-card)] py-2.5 first:border-t-0 first:pt-0 last:pb-0"
                    >
                      <PendingBar className="size-4 rounded-full" />
                      <span className="flex min-w-0 flex-col gap-1.5">
                        <PendingBar className="h-3 w-48" />
                        <PendingBar className="h-3 w-80" />
                      </span>
                      <PendingBar className="h-3 w-14" />
                    </li>
                  ))}
                </ul>
              </PendingRegion>
            </Card>

            <section className="flex min-h-11 items-center justify-between gap-4 rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] py-2.5 pr-3 pl-4">
              <span className="flex min-w-0 items-center gap-x-3">
                <span className="text-body font-medium" style={INK[900]}>
                  Entered at upload
                </span>
                <PendingRegion label="what was entered at upload">
                  <PendingBar className="h-3 w-72" />
                </PendingRegion>
              </span>
              <ChevronDown
                className="size-3.5 shrink-0"
                strokeWidth={1.8}
                style={{ color: "var(--ink-400)" }}
                aria-hidden="true"
              />
            </section>
          </div>
        </div>
      </div>
    </AdminPage>
  );
}
