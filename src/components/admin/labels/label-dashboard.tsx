"use client";

import { useMemo } from "react";
import { ArrowUpRight, Check, CircleAlert } from "lucide-react";
import type { LabelUploadInfo } from "@/lib/data/label-overview-server";
import { buildAppliedRows, expectedStats } from "@/lib/services/labels/apply";
import {
  flagGroups,
  openFlags,
  type FlagGroup,
  type OpenFlag,
} from "@/lib/services/labels/flag-nav";
import type { LabelMarks } from "@/lib/services/labels/marks";
import type { LabelGameBand } from "@/lib/services/labels/score";
import {
  isWithdrawnAdd,
  isWithdrawnPointAdd,
  labelProgress,
  type LabelPoint,
  type LabelSide,
  type MatchScore,
} from "@/lib/services/labels/session";
import {
  enteredScore,
  formatPair,
  labelSetScores,
  type LabelSetScore,
} from "@/lib/services/labels/set-scores";
import { cn } from "@/lib/utils";

/**
 * The label session outside full screen: the match's data, read. Nobody labels
 * here — there is no film, no court and no editable row — so the page answers
 * the questions asked before and after a labelling sitting, one card each:
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
 * `warnings`) for what a publish would refuse, `buildAppliedRows` +
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
  /** `labelScores(points, adScoring).games`, as the console scored them. */
  games: readonly LabelGameBand[];
  adScoring: boolean;
  names: Record<LabelSide, string>;
  finalScore: readonly (readonly number[])[] | null;
  matchScore: MatchScore | null;
  /** `completeWarnings(...)`: what "Mark complete" would list. */
  warnings: readonly string[];
  /** The session is published; nothing is left to do but read. */
  complete: boolean;
  /** What the uploader entered; null when it could not be read. */
  upload: LabelUploadInfo | null;
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
  const { points, marks, games, adScoring, finalScore, matchScore } = props;
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
    sets: useMemo(() => labelSetScores(points, games), [points, games]),
    entered: enteredScore(finalScore, matchScore),
    changes: useMemo(() => changeCounts(points), [points]),
    stats: useMemo(() => {
      try {
        return expectedStats(
          buildAppliedRows({ points, adScoring, bestOf: 3 }).points,
        );
      } catch {
        return null;
      }
    }, [points, adScoring]),
  };
  const widget = { ...props, reading };

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

/** A flag kind shows this many point numbers, then "+N". */
const POINTS_SHOWN = 8;

/**
 * One of the two lists the rail's header carries, laid out as a table: the
 * flag, how many are open, and the points they are on. The dot before the
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
  const count = groups.reduce((sum, group) => sum + group.count, 0);
  const rows = groups.flatMap((group) => group.rows);
  const first = rows[0]?.points[0];
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
  /** Where to go to deal with it. */
  pointId?: string;
}

const REFUSES = "publishing will refuse";

/** The route to publishing, as the things that must be true first. */
function publishChecks({
  points,
  marks,
  warnings,
  reading,
}: WidgetProps): CheckItem[] {
  const { sets, entered, flagged } = reading;
  const { checked, total } = labelProgress(points);
  const live = points.filter((point) => point.status !== "deleted");
  const firstUnchecked = live.find((point) => point.checkedAt === null);
  const amber = flagged.filter((flag) => !flag.data);
  const grey = flagged.length - amber.length;
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
  // What publishing refuses beyond the score: a point it cannot write.
  const refused = warnings.filter(
    (warning) => warning.includes(REFUSES) && !warning.startsWith("Set "),
  );
  const plural = (n: number, one: string, many = `${one}s`) =>
    `${n} ${n === 1 ? one : many}`;

  return [
    entered === null
      ? {
          state: "open",
          title: "Score adds up",
          detail: "No score was entered to check the sets against.",
        }
      : differing.length > 0
        ? {
            // With marks on, a publish refuses a set that disagrees.
            state: marks ? "blocking" : "open",
            title: "Score adds up",
            detail: differing
              .map(
                (d) =>
                  `Set ${d.set.setNumber} is labelled ${d.labelled} against a record of ${d.record}`,
              )
              .join(". "),
            pointId: differing[0].set.lastPointId,
          }
        : {
            state: "done",
            title: "Score adds up",
            detail: "Every labelled set matches the match record.",
          },
    refused.length > 0
      ? {
          state: "blocking",
          title: "Every point can be written",
          detail: refused[0].replace(`, so ${REFUSES}`, ""),
        }
      : {
          state: "done",
          title: "Every point can be written",
          detail: "No point is missing what a publish needs.",
        },
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
        },
    amber.length > 0
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
        },
    openGames > 0
      ? {
          state: "open",
          title: "Every game finished",
          detail: `${plural(openGames, "game")} unfinished or with points past its end.`,
        }
      : {
          state: "done",
          title: "Every game finished",
          detail: "No game is short or runs over.",
        },
  ];
}

const CHECK_WORD: Record<CheckState, string> = {
  done: "Done",
  open: "Open",
  blocking: "Blocks publishing",
};

function PublishCheck(props: WidgetProps) {
  const { complete, onOpen } = props;
  if (complete) {
    return (
      <Card title="Published">
        <Quiet>
          These labels are the match’s points and statistics. Reopen the session
          to change them.
        </Quiet>
      </Card>
    );
  }
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
            <span
              role="img"
              aria-label={CHECK_WORD[check.state]}
              className={cn(
                "mt-px grid size-4 place-items-center rounded-full",
                check.state === "done" &&
                  "text-[var(--success)] shadow-[inset_0_0_0_1.5px_var(--success)]",
                check.state === "open" &&
                  "shadow-[inset_0_0_0_1.5px_var(--ink-300)]",
                check.state === "blocking" && "text-[var(--warning-text)]",
              )}
            >
              {check.state === "done" ? (
                <Check
                  className="size-2.5"
                  strokeWidth={2.5}
                  aria-hidden="true"
                />
              ) : check.state === "blocking" ? (
                <CircleAlert
                  className="size-4"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              ) : null}
            </span>
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
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ── Entered at upload ──────────────────────────────────────────────────────

/**
 * What the uploader told the wizard, which is what the derivation was run
 * with: a grid of facts, two across. A labeller reads it to tell a wrong
 * label from a wrong input — above all who starts on the far side, the one
 * input that credits every stroke to the other player when it is wrong.
 */
function UploadInputs({ upload, names }: WidgetProps) {
  if (!upload) {
    return (
      <Card title="Entered at upload">
        <Quiet>The upload’s inputs could not be read.</Quiet>
      </Card>
    );
  }
  const far =
    upload.topPlayerIsPlayer1 === null
      ? null
      : upload.topPlayerIsPlayer1
        ? names.p1
        : names.p2;
  const window_ =
    upload.trim.start === null && upload.trim.end === null
      ? null
      : `${clock(upload.trim.start) ?? "start"} to ${clock(upload.trim.end) ?? "end"}`;
  const facts: [string, string | null][] = [
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
    <Card title="Entered at upload">
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
    </Card>
  );
}

// ── Statistics ─────────────────────────────────────────────────────────────

const pct = (part: number, whole: number) =>
  whole === 0 ? 0 : Math.round((part / whole) * 100);

/**
 * The rows a publish would write, counted, head to head: each statistic a
 * pair of bars sharing one track, split in proportion, the larger in ink.
 */
function Statistics({ reading, names }: WidgetProps) {
  const { stats } = reading;
  if (!stats || stats.points === 0) {
    return (
      <Card title="Statistics from the labels">
        <Quiet>No counted points yet.</Quiet>
      </Card>
    );
  }
  const { p1, p2 } = stats;
  const rows: [string, number, number, string?][] = [
    ["Points won", p1.pointsWon, p2.pointsWon],
    ["Aces", p1.aces, p2.aces],
    ["Double faults", p1.doubleFaults, p2.doubleFaults],
    ["Service winners", p1.serviceWinners, p2.serviceWinners],
    ["Winners", p1.winners, p2.winners],
    ["Unforced errors", p1.unforcedErrors, p2.unforcedErrors],
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
