"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AdminAvatar, WorkspaceMark } from "@/components/admin/admin-cells";
import { CopyButton } from "@/components/admin/matches/copy-button";
import { ResultMark } from "@/components/dashboard/result-mark";
import { ScoreLine } from "@/components/dashboard/score-line";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import type { AdminMatchWorkspace } from "@/lib/data/admin-matches-server";
import type { ScoreLineSet } from "@/lib/ui/score-format";

const STRIP_LINK =
  "inline-flex h-7 items-center rounded-[var(--radius-element)] px-2.5 text-[12px] font-medium text-[var(--ink-700)] transition-colors duration-200 hover:bg-[var(--surface-card)] hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none";

/** "8f3d21c6…7b31". */
function shortId(id: string): string {
  return id.length > 13 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

/**
 * The grey strip under the admin header on `/admin/matches/[id]`
 * (AdminReport): the way back, whose match this is, that the admin is reading
 * it read-only and uncounted, the match id with Copy, and the two admin-only
 * doors — the label console and the analysis job's id.
 *
 * Esc goes back to Matches, unless something on the page owns Esc right now:
 * a field, a menu, a dialog, the film room in fullscreen.
 */
export function AdminReportStrip({
  matchId,
  player,
  opponent,
  won,
  sets,
  workspace,
  labelHref,
  job,
}: {
  matchId: string;
  player: string;
  opponent: string;
  /** Null when the score does not decide it — no mark is drawn. */
  won: boolean | null;
  sets: ScoreLineSet[];
  workspace: AdminMatchWorkspace;
  labelHref: string | null;
  /** The latest analysis job, when the match has one. */
  job: { id: string; status: string } | null;
}) {
  const router = useRouter();
  const backHref = `/admin/matches?id=${encodeURIComponent(matchId)}`;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      if (document.fullscreenElement) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable=true], [role=dialog], [role=menu], [data-radix-popper-content-wrapper]",
        )
      )
        return;
      if (
        document.querySelector(
          '[role="dialog"][data-state="open"], [role="menu"], [data-radix-popper-content-wrapper]',
        )
      )
        return;
      event.preventDefault();
      router.push(backHref);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, backHref]);

  const workspaceLabel =
    workspace.kind === "team" ? workspace.name : "Personal";

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-y border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-6 py-2">
      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 flex-wrap items-center gap-2 text-[13px]"
      >
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-[var(--ink-700)] transition-colors duration-200 hover:text-[var(--ink-900)]"
        >
          <ChevronLeft className="size-3.5" strokeWidth={1.8} aria-hidden />
          Matches
        </Link>
        <span aria-hidden="true" className="text-[var(--ink-400)]">
          /
        </span>
        <span
          aria-current="page"
          className="inline-flex min-w-0 items-center gap-2"
        >
          <AdminAvatar name={player} size={20} />
          <span className="truncate whitespace-nowrap">
            <span className="font-medium text-[var(--ink-900)]">{player}</span>{" "}
            <span className="text-[var(--ink-600)]">vs {opponent}</span>
          </span>
          {sets.length > 0 && (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--ink-700)] tabular-nums">
              {won !== null && (
                <ResultMark won={won} className="[&_svg]:size-3" />
              )}
              <ScoreLine sets={sets} className="whitespace-nowrap" />
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--ink-600)]">
            <WorkspaceMark workspace={workspace} />
            {workspaceLabel}
          </span>
        </span>
      </nav>

      <span className="text-[12px] text-[var(--ink-600)]">
        Viewing as admin · read-only · your visits are not counted
      </span>

      <span className="flex-1" />

      <span className="inline-flex items-center gap-0.5">
        <code className="mono text-[12px] text-[var(--ink-700)]">
          {shortId(matchId)}
        </code>
        <CopyButton value={matchId} label="Copy match id" />
      </span>

      {labelHref && (
        <Link href={labelHref} className={STRIP_LINK}>
          Open in Labels
        </Link>
      )}

      {job && <JobCopy job={job} />}

      <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--ink-600)]">
        <kbd className="mono inline-flex h-5 items-center rounded-[4px] border border-[var(--border-medium)] bg-[var(--surface-card)] px-1.5 text-[11px] font-medium text-[var(--ink-700)]">
          Esc
        </kbd>
        to go back
      </span>
    </div>
  );
}

/**
 * "Analysis job": there is no admin page for a job, so this is the job's id
 * on the clipboard — what the scripts, the database and the logs key on —
 * with the id and its status in the tooltip.
 */
function JobCopy({ job }: { job: { id: string; status: string } }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <ChromeTooltip
      label={copied ? "Copied" : "Copy analysis job id"}
      detail={`${job.id} · ${job.status}`}
    >
      <button
        type="button"
        className={`${STRIP_LINK} cursor-pointer`}
        onClick={() => {
          navigator.clipboard
            ?.writeText(job.id)
            .then(() => setCopied(true))
            .catch(() => {});
        }}
      >
        Analysis job
      </button>
    </ChromeTooltip>
  );
}
