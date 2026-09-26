"use client";

import Link from "next/link";
import { Film } from "lucide-react";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { MAX_VIDEO_SIZE_BYTES } from "@/lib/services/splitstep/config";
import { advButton } from "@/lib/ui/adv-button";
import {
  atMatchVideoCap,
  canTakeFilmAction,
  expiredBodyCopy,
  MATCH_VIDEO_USAGE_HREF,
  matchFilmHref,
  matchVideoCountLabel,
  matchVideoWizardHref,
  quotaHolderLabels,
  type MatchFilmEntry,
} from "@/lib/match-video/film-entry";

/**
 * The Video view after its video expired (SwingVision Add video T10, canvas
 * frame Expired): "This video was removed".
 *
 * The same anatomy as {@link FilmEmptyState} — icon, rule, heading, body, one
 * offer, micro line — because it IS an empty state: there is demonstrably no
 * video (`filmEntryView` reaches `expired` only from an established absence),
 * and the one thing worth saying beyond that is why, and that nothing else
 * went with it. Only the heading and body differ.
 *
 * The offer is the empty state's, on the same terms: drawn from
 * `entry.actions` and nothing else, so a teammate gets the sentence and no
 * button. At the cap, "Add video" would open a wizard that refuses at the
 * end, so the at-cap link T6 draws takes its place — the same labels, the
 * same destinations.
 */

const MAX_VIDEO_GB = Math.round(MAX_VIDEO_SIZE_BYTES / 1_000_000_000);

export function FilmExpiredState({ entry }: { entry: MatchFilmEntry }) {
  const { match } = useMatchData();
  const mayAdd = canTakeFilmAction(entry, "add");
  const quota = mayAdd ? entry.quota : null;
  const atCap = atMatchVideoCap(quota);
  const holder = atCap ? (quota?.holder ?? null) : null;
  const holderLabels = holder ? quotaHolderLabels(holder) : null;

  const micro = !quota
    ? `MP4 up to ${MAX_VIDEO_GB} GB · we index the points, you keep the file`
    : atCap
      ? matchVideoCountLabel(quota)
      : `MP4 up to ${MAX_VIDEO_GB} GB · ${matchVideoCountLabel(quota)}`;

  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-4 py-16 pb-[72px] text-center"
      data-testid="film-expired"
    >
      <Film
        className="h-7 w-7 text-[var(--ink-300)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <div className="h-px w-6 bg-[var(--border-medium)]" aria-hidden="true" />

      <div className="flex max-w-[420px] flex-col items-center gap-2">
        <h2 className="text-title" style={{ fontSize: "16px" }}>
          This video was removed
        </h2>
        <p
          className="text-body-sm [text-wrap:pretty]"
          style={{ color: "var(--ink-600)" }}
        >
          {/* `filmEntryView` reaches here only with `expiredAt` set; an
              unparseable one drops the date rather than printing it. */}
          {expiredBodyCopy(entry.expiredAt ?? "")}
        </p>
      </div>

      {mayAdd && (
        <>
          <div className="flex items-center gap-3.5 pt-1">
            {atCap ? (
              <Link
                href={
                  holder
                    ? matchFilmHref(holder.matchId)
                    : MATCH_VIDEO_USAGE_HREF
                }
                className={advButton("primary", "md")}
                data-testid="film-action-at-cap"
              >
                {holderLabels
                  ? `Open ${holderLabels.short}`
                  : "Manage match videos"}
              </Link>
            ) : (
              <Link
                href={matchVideoWizardHref(match.id, "add")}
                className={advButton("primary", "md")}
                data-testid="film-action-add"
              >
                Add video
              </Link>
            )}
          </div>

          <span
            className="text-micro pt-0.5"
            style={{ color: "var(--ink-400)" }}
          >
            {micro}
          </span>
        </>
      )}
    </div>
  );
}
