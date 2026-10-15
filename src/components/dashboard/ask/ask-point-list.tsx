"use client";

import Link from "next/link";
import { Play } from "lucide-react";

import {
  LIST_TONE,
  ROW_TONE,
} from "@/components/dashboard/matches/match-detail/film/point-list-tone";
import { WorkspaceMark } from "@/components/dashboard/workspace-mark";
import { useOptionalWorkspace } from "@/components/dashboard/workspace-provider";
import { surname } from "@/lib/data/match-utils";
import { matchFilmPointsHref } from "@/lib/match-video/point-set";
import type { AskSourceMatch } from "@/lib/services/ask/events";
import type { AskShowPoint } from "@/lib/services/ask/show-response";
import { cn } from "@/lib/utils";

/**
 * The points behind an answer over ONE match (roadmap 6.1): a row per point
 * — set and game in the header, the result, the score, who won — with a play
 * glyph that opens the film on that point.
 *
 * The rows are the Video tab's point list rows (`film/point-list.tsx`) in
 * their light paint — the same 52px row, the same 30px mark, the same score
 * face, the same game header — taken from `point-list-tone.ts` rather than
 * by mounting `PointList`, which needs a match's providers and a playhead
 * this answer does not have. What differs is deliberate: every row is a LINK
 * (a `next/link` into `?tab=film&pn=<n>`, so a middle-click opens the film
 * in a tab), and the trailing control is a play glyph rather than a
 * bookmark.
 *
 * The mark is the point's WINNER as `ask.points.i_won` says it — the
 * workspace's own mark when the viewer (or, on a team, the program's player)
 * won it, the opponent's initials when they did — the rule the Video tab's
 * rows follow. A point the source never timed has nowhere to seek to and is
 * drawn muted with no link, as the tab draws it.
 *
 * No thumbnail: the seek-lane preview (`use-seek-preview.ts`) draws frames
 * from a second `<video>` seeking the playback credential, which is a video
 * element, a credential fetch and a seek per row — not cheap, so not here.
 *
 * Keep this file's imports clear of `next/navigation` and `next/image`: it
 * is rendered by an offline component harness (`tests/ask-point-list.spec.ts`).
 */

export interface AskPointListProps {
  /** The one match the answer was computed from (`sources[0]`). */
  match: AskSourceMatch;
  /** In match order, as `/api/ask/show` answered them. */
  points: readonly AskShowPoint[];
  /** The measure's cut, serialized for `?f=`, carried on every row's link. */
  filters?: string | null;
  /** The match held more points than the list could carry. */
  truncated?: boolean;
  /** The film on the first point with the rest queued: the header's link. Omitted inside the film room. */
  href?: string;
}

interface Group {
  key: string;
  setNumber: number | null;
  gameNumber: number | null;
  gameScore: string | null;
  points: AskShowPoint[];
}

/** "Marcus Reid" → "MR"; one letter for a one-word name. */
function initialsOf(name: string | null): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

function groupsOf(points: readonly AskShowPoint[]): Group[] {
  const out: Group[] = [];
  let current: Group | undefined;
  for (const point of points) {
    if (
      !current ||
      current.setNumber !== point.setNumber ||
      current.gameNumber !== point.gameNumber
    ) {
      current = {
        key: `${point.setNumber ?? "x"}-${point.gameNumber ?? "x"}-${point.pointNumber}`,
        setNumber: point.setNumber,
        gameNumber: point.gameNumber,
        gameScore: point.gameScore,
        points: [],
      };
      out.push(current);
    }
    current.points.push(point);
  }
  return out;
}

export function AskPointList({
  match,
  points,
  filters = null,
  truncated = false,
  href,
}: AskPointListProps) {
  const workspace = useOptionalWorkspace()?.active ?? null;
  const t = LIST_TONE.light;
  const groups = groupsOf(points);
  const count = points.length;
  // Who the sides are, by name: the program's player on a team answer, the
  // viewer (unnamed to themselves) on a personal one.
  const you = match.playerName ? surname(match.playerName) : "You";
  const opponent = surname(match.opponentName ?? "Opponent");
  const youInitials = initialsOf(match.playerName);
  const opponentInitials = initialsOf(match.opponentName);

  if (count === 0) return null;

  return (
    <section
      data-ask-point-list=""
      aria-label="Points in this match"
      className="flex max-w-[420px] flex-col gap-0.5"
    >
      <div className="flex items-center gap-3 pb-2">
        <h3 className="eyebrow-sm min-w-0 flex-1">
          {count} {count === 1 ? "point" : "points"} in this match
        </h3>
        {href && (
          <Link
            href={href}
            data-ask-point-list-watch=""
            className="rounded-sm text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] outline-none hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)]"
          >
            Watch all
          </Link>
        )}
      </div>

      <div className="surface-card flex flex-col" style={t.rootStyle}>
        {groups.map((group) => (
          <div key={group.key} className="flex flex-col">
            <div className={t.gameHeader}>
              <span className={t.gameLabel}>
                {group.setNumber !== null && group.gameNumber !== null
                  ? `Set ${group.setNumber} · Game ${group.gameNumber}`
                  : "Points"}
              </span>
              <div className="flex-1" />
              {group.gameScore && (
                <span className={t.gameMeta}>{group.gameScore}</span>
              )}
            </div>
            {group.points.map((point) => (
              <AskPointRow
                key={point.pointNumber}
                matchId={match.matchId}
                point={point}
                filters={filters}
                you={you}
                opponent={opponent}
                youInitials={youInitials}
                opponentInitials={opponentInitials}
                workspace={workspace}
              />
            ))}
          </div>
        ))}
      </div>

      {truncated && (
        <p data-ask-point-list-truncated="" className="text-micro pt-1.5">
          Showing the first {count} points.
        </p>
      )}
    </section>
  );
}

function AskPointRow({
  matchId,
  point,
  filters,
  you,
  opponent,
  youInitials,
  opponentInitials,
  workspace,
}: {
  matchId: string;
  point: AskShowPoint;
  filters: string | null;
  you: string;
  opponent: string;
  youInitials: string;
  opponentInitials: string;
  workspace: ReturnType<typeof useOptionalWorkspace> extends infer V
    ? V extends { active: infer A }
      ? A | null
      : null
    : null;
}) {
  const r = ROW_TONE.light;
  const n = point.pointNumber;
  const seekable = point.videoTime !== null;
  const title = point.resultType ?? `Point ${n}`;
  const served =
    point.iServed === true
      ? `${you} served`
      : point.iServed === false
        ? `${opponent} served`
        : null;
  const detail = [`Point ${n}`, served].filter(Boolean).join(" · ");
  const isYou = point.iWon === true;

  const content = (
    <>
      <span
        className="inline-flex shrink-0 basis-[34px] items-center justify-center"
        data-mark={point.iWon === null ? "none" : point.iWon ? "you" : "opp"}
      >
        {isYou && workspace ? (
          <WorkspaceMark
            workspace={workspace}
            className="size-[30px] rounded-[var(--radius-button)] text-[11px] tracking-[0.3px]"
          />
        ) : (
          <span aria-hidden="true" className={r.mark}>
            {point.iWon === null
              ? "—"
              : point.iWon
                ? youInitials
                : opponentInitials}
          </span>
        )}
      </span>

      <span className="flex min-w-0 flex-col gap-px">
        <span className={r.title}>{title}</span>
        <span className={r.detail} style={r.detailStyle}>
          {detail}
        </span>
      </span>

      <div className="flex-1" />

      {point.pointScore && (
        <span className={r.score} style={r.scoreStyle}>
          {point.pointScore}
        </span>
      )}

      <Play
        className={cn(
          "size-3.5 shrink-0 transition-colors duration-[var(--duration-hover)]",
          seekable
            ? "text-[var(--ink-400)] group-hover/row:text-[var(--ink-900)]"
            : "text-[var(--ink-300)]",
        )}
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </>
  );

  if (!seekable) {
    return (
      <div
        data-ask-point={n}
        data-seekable="false"
        className={cn(r.root, "cursor-default opacity-45")}
      >
        {content}
      </div>
    );
  }

  return (
    <Link
      href={matchFilmPointsHref(matchId, [n], filters)}
      data-ask-point={n}
      aria-label={`${title} — watch point ${n}`}
      className={cn(r.root, r.seekable, "no-underline")}
    >
      {content}
    </Link>
  );
}
