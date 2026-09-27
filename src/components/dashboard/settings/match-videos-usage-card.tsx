"use client";

import { useId, useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  SettingsCard,
  SettingsCardFootnote,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import { WorkspaceMark } from "@/components/dashboard/workspace-mark";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatePill } from "@/components/ui/state-pill";
import { YouPill } from "@/components/ui/you-pill";
import type {
  MatchVideoUsage,
  MatchVideoUsageRow,
} from "@/lib/data/match-video-usage-server";
import { matchVideoExpiry } from "@/lib/match-video/expiry";
import { usageFraction } from "@/lib/data/usage-format";
import { cn } from "@/lib/utils";
import { teamLabel, type Workspace } from "@/lib/workspace/types";

/**
 * Settings › Usage & quota's third card: the ACTIVE workspace's SwingVision
 * match videos against their cap (SwingVision Add video T7).
 *
 * Same anatomy as `ProgramUsageCard` — title (crest on a team), meter,
 * one row per person, footnote — but the rows unfold: a person's row lists
 * the matches they added video to, each with its own Remove where the viewer
 * may use one. Remove mirrors `authorizeMatchVideoRemoval`: your own uploads
 * always; every row when you are a team owner or coach. Staff and players
 * remove only their own. The server re-checks; this only decides what to draw.
 *
 * Client only for the disclosures and the removal. The list is rendered on
 * the server and handed in, and `now` comes with it so the expiry pill reads
 * the same on the server and after hydration.
 */

export const MATCH_VIDEOS_FOOTNOTE =
  "Film added to SwingVision matches, for playback only: it isn't analysed and uses no hours. A video nobody watches for a year is removed; the match and its statistics stay.";

export type RemoveMatchVideo = (
  matchId: string,
  attachmentId: string,
) => Promise<{ ok: true } | { ok: false; message: string }>;

/** T5's `DELETE /api/matches/[matchId]/video`, with `{ attachmentId }`. */
export const removeMatchVideo: RemoveMatchVideo = async (
  matchId,
  attachmentId,
) => {
  try {
    const response = await fetch(
      `/api/matches/${encodeURIComponent(matchId)}/video`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attachmentId }),
      },
    );
    if (response.ok) return { ok: true };
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    return {
      ok: false,
      message: body?.error ?? "The video could not be removed. Try again.",
    };
  } catch {
    return {
      ok: false,
      message: "The video could not be removed. Check your connection.",
    };
  }
};

/* ------------------------------------------------------------ formatting */

function formatDate(iso: string | Date, timeZone: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone,
  });
}

function formatShortDate(date: Date, timeZone: string): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone,
  });
}

/** Total size in GB to one decimal; a small non-zero total never reads 0. */
export function formatVideoGigabytes(bytes: number): string {
  const gb = bytes / 1e9;
  if (bytes > 0 && gb < 0.05) return "<0.1 GB";
  return `${gb.toFixed(1)} GB`;
}

/** The last word of a player name — "Reid" from "Sam Reid". */
function surname(name: string | null): string {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  return parts.at(-1) ?? "Unknown";
}

/* -------------------------------------------------------------- grouping */

export interface MatchVideoUploaderGroup {
  /** `null` when the uploader's account was deleted. */
  uploadedBy: string | null;
  name: string;
  rows: MatchVideoUsageRow[];
  bytes: number;
  /** Videos inside the 30-day expiry window, and the soonest date among them. */
  expiring: { count: number; soonest: Date } | null;
}

/**
 * One group per uploader, most videos first (then most bytes, then name), so
 * the order is stable whatever order the rows arrived in.
 */
export function groupMatchVideosByUploader(
  rows: readonly MatchVideoUsageRow[],
  names: Readonly<Record<string, string>>,
  now: Date,
): MatchVideoUploaderGroup[] {
  const groups = new Map<string, MatchVideoUploaderGroup>();
  for (const row of rows) {
    const key = row.uploadedBy ?? "";
    let group = groups.get(key);
    if (!group) {
      group = {
        uploadedBy: row.uploadedBy,
        name: row.uploadedBy
          ? (names[row.uploadedBy] ?? "Unnamed member")
          : "Former member",
        rows: [],
        bytes: 0,
        expiring: null,
      };
      groups.set(key, group);
    }
    group.rows.push(row);
    group.bytes += row.verifiedSizeBytes ?? 0;

    if (row.activatedAt) {
      const expiry = matchVideoExpiry(
        { activatedAt: row.activatedAt, lastViewedAt: row.lastViewedAt },
        now,
      );
      if (expiry.warning) {
        group.expiring = group.expiring
          ? {
              count: group.expiring.count + 1,
              soonest:
                expiry.expiresAt < group.expiring.soonest
                  ? expiry.expiresAt
                  : group.expiring.soonest,
            }
          : { count: 1, soonest: expiry.expiresAt };
      }
    }
  }
  return [...groups.values()].sort(
    (a, b) =>
      b.rows.length - a.rows.length ||
      b.bytes - a.bytes ||
      a.name.localeCompare(b.name),
  );
}

/* ------------------------------------------------------------------ card */

export function MatchVideosUsageCard({
  workspace,
  viewerId,
  initial,
  names,
  now,
  remove = removeMatchVideo,
}: {
  /** The ACTIVE workspace — name, squad, crest, and the viewer's role in it. */
  workspace: Pick<
    Workspace,
    "id" | "kind" | "name" | "mark" | "iconUrl" | "team" | "role" | "timeZone"
  >;
  viewerId: string;
  initial: MatchVideoUsage;
  /** Uploader id → display name, resolved on the server. */
  names: Readonly<Record<string, string>>;
  /** ISO 8601 — the server's clock at render, for the expiry window. */
  now: string;
  remove?: RemoveMatchVideo;
}) {
  const [rows, setRows] = useState(initial.rows);
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(new Set());
  const [pendingRemoval, setPendingRemoval] =
    useState<MatchVideoUsageRow | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removalError, setRemovalError] = useState<string | null>(null);
  const listId = useId();

  const used = rows.length;
  const cap = initial.cap;
  const fraction = usageFraction(used, cap);
  const isTeam = workspace.kind === "team";
  const managesAll =
    isTeam && (workspace.role === "owner" || workspace.role === "coach");
  const canRemove = (row: MatchVideoUsageRow) =>
    managesAll || (row.uploadedBy !== null && row.uploadedBy === viewerId);

  const groups = groupMatchVideosByUploader(rows, names, new Date(now));
  const squad = teamLabel(workspace.team);
  const tz = workspace.timeZone;

  const toggle = (key: string) =>
    setOpenIds((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const confirmRemoval = async () => {
    if (!pendingRemoval) return;
    setRemoving(true);
    setRemovalError(null);
    const result = await remove(
      pendingRemoval.matchId,
      pendingRemoval.attachmentId,
    );
    setRemoving(false);
    if (!result.ok) {
      setRemovalError(result.message);
      return;
    }
    const removedId = pendingRemoval.attachmentId;
    setRows((current) =>
      current.filter((row) => row.attachmentId !== removedId),
    );
    setPendingRemoval(null);
  };

  return (
    <SettingsCard className="gap-3">
      <SettingsCardTitle>
        {isTeam ? (
          <span className="flex min-w-0 items-center gap-3">
            <WorkspaceMark
              workspace={workspace}
              className="size-8 rounded-[8px] text-[13px]"
            />
            <span className="truncate text-[13px] font-medium text-[var(--ink-900)]">
              {squad
                ? `${workspace.name} · ${squad} · match videos`
                : `${workspace.name} · match videos`}
            </span>
          </span>
        ) : (
          "Your match videos"
        )}
      </SettingsCardTitle>

      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-[var(--ink-100)]">
          <div
            className="h-1.5 rounded-[3px] bg-[var(--blue)] transition-[width] duration-300"
            style={{ width: `${fraction * 100}%` }}
          />
        </div>
        <span className="mono text-[11px] text-[var(--ink-700)]">
          {used} / {cap}
        </span>
      </div>

      <div className="mt-0.5 flex flex-col">
        {groups.length === 0 ? (
          <p className="py-2 text-[12px] text-[var(--ink-500)]">
            {isTeam
              ? "No match videos yet. Film added to a SwingVision match shows here."
              : "No match video yet. Film added to a SwingVision match shows here."}
          </p>
        ) : (
          groups.map((group, index) => {
            const key = group.uploadedBy ?? "former";
            const open = openIds.has(key);
            const panelId = `${listId}-${index}`;
            const count = group.rows.length;
            return (
              <div
                key={key}
                className="border-b border-[var(--border-hairline)] last:border-b-0"
              >
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() => toggle(key)}
                  className="flex w-full items-center gap-2 py-2 text-left"
                >
                  <ChevronRight
                    aria-hidden="true"
                    className={cn(
                      "size-3 shrink-0 text-[var(--ink-500)] transition-transform",
                      open && "rotate-90",
                    )}
                    strokeWidth={1.5}
                  />
                  <span className="text-[12px] text-[var(--ink-900)]">
                    {group.name}
                  </span>
                  {group.uploadedBy !== null &&
                    group.uploadedBy === viewerId && <YouPill />}
                  <span className="text-[11px] text-[var(--ink-500)]">
                    · {count} {count === 1 ? "video" : "videos"} ·{" "}
                    <span className="mono text-[var(--ink-700)]">
                      {formatVideoGigabytes(group.bytes)}
                    </span>
                  </span>
                  {group.expiring && (
                    <StatePill className="ml-auto">
                      {group.expiring.count}{" "}
                      {group.expiring.count === 1 ? "expires" : "expire"}{" "}
                      {formatShortDate(group.expiring.soonest, tz)}
                    </StatePill>
                  )}
                </button>

                {/* Always in the tree, hidden while closed, so `aria-controls`
                    names an element that exists. */}
                <ul
                  id={panelId}
                  hidden={!open}
                  className="flex-col pb-2 pl-5 [&:not([hidden])]:flex"
                >
                  {group.rows.map((row) => (
                    <li
                      key={row.attachmentId}
                      className="flex items-center gap-1 py-1 text-[11px] text-[var(--ink-600)]"
                    >
                      <span className="text-[var(--ink-900)]">
                        {surname(row.player1Name)} vs {surname(row.player2Name)}
                      </span>
                      {row.matchDate && (
                        <span>· {formatDate(row.matchDate, "UTC")}</span>
                      )}
                      {row.lastViewedAt ? (
                        <span>
                          · Watched {formatDate(row.lastViewedAt, tz)}
                        </span>
                      ) : row.activatedAt ? (
                        <span>· Added {formatDate(row.activatedAt, tz)}</span>
                      ) : null}
                      {canRemove(row) && (
                        <>
                          <span aria-hidden="true">·</span>
                          <button
                            type="button"
                            aria-label={`Remove video: ${surname(row.player1Name)} vs ${surname(row.player2Name)}`}
                            onClick={() => {
                              setRemovalError(null);
                              setPendingRemoval(row);
                            }}
                            className="rounded-[6px] text-[11px] text-[var(--blue)] hover:text-[var(--blue-hover)]"
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </div>

      <SettingsCardFootnote>{MATCH_VIDEOS_FOOTNOTE}</SettingsCardFootnote>

      <ConfirmDialog
        open={pendingRemoval !== null}
        onOpenChange={(next) => {
          if (!next && !removing) {
            setPendingRemoval(null);
            setRemovalError(null);
          }
        }}
        title="Remove this match video?"
        description="The film is deleted for everyone on this workspace. The match and its statistics stay."
        confirmLabel="Remove video"
        pendingLabel="Removing…"
        tone="danger"
        pending={removing}
        error={removalError}
        onConfirm={confirmRemoval}
      />
    </SettingsCard>
  );
}
