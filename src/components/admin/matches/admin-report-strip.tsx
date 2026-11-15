"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { WorkspaceMark } from "@/components/admin/admin-cells";
import { CopyButton } from "@/components/admin/matches/copy-button";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import type { AdminMatchWorkspace } from "@/lib/data/admin-matches-server";

const STRIP_LINK =
  "inline-flex h-7 items-center rounded-[var(--radius-element)] px-2.5 text-[12px] font-medium text-[var(--ink-700)] transition-colors duration-200 hover:bg-[var(--surface-card)] hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none";

/** "8f3d21c6…7b31". */
function shortId(id: string): string {
  return id.length > 13 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

/**
 * The strip under the admin header on `/admin/matches/[id]`: the way back,
 * whose match this is, that it is read-only, the match id with Copy, and the
 * two admin-only doors — the label console and the analysis job's id. One
 * line on a hairline. The score is not repeated here: the rail beneath it
 * leads with the final score.
 *
 * Esc goes back to Matches, unless something on the page owns Esc right now:
 * a field, a menu, a dialog, the film room in fullscreen. The back link says
 * so (`aria-keyshortcuts`, its tooltip) rather than a hint on the strip.
 */
export function AdminReportStrip({
  matchId,
  player,
  opponent,
  workspace,
  labelHref,
  job,
}: {
  matchId: string;
  player: string;
  opponent: string;
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
    <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--border-hairline)] px-6 py-2">
      <nav
        aria-label="Breadcrumb"
        className="flex min-w-0 flex-1 items-center gap-2 text-[13px]"
      >
        <ChromeTooltip label="Back to Matches" detail="Esc">
          <Link
            href={backHref}
            aria-keyshortcuts="Escape"
            className="inline-flex shrink-0 items-center gap-1 text-[var(--ink-600)] transition-colors duration-200 hover:text-[var(--ink-900)]"
          >
            <ChevronLeft className="size-3.5" strokeWidth={1.8} aria-hidden />
            Matches
          </Link>
        </ChromeTooltip>
        <span aria-hidden="true" className="text-[var(--ink-400)]">
          /
        </span>
        <span
          aria-current="page"
          className="min-w-0 truncate whitespace-nowrap"
        >
          <span className="font-medium text-[var(--ink-900)]">{player}</span>{" "}
          <span className="text-[var(--ink-600)]">vs {opponent}</span>
        </span>
        <span className="inline-flex min-w-0 shrink items-center gap-1.5 text-[12px] text-[var(--ink-600)]">
          <WorkspaceMark workspace={workspace} />
          <span className="truncate">{workspaceLabel}</span>
        </span>
      </nav>

      <span className="flex shrink-0 items-center gap-1 text-[12px] text-[var(--ink-600)]">
        <span className="pr-2">Read-only</span>
        <code className="mono text-[12px] text-[var(--ink-600)]">
          {shortId(matchId)}
        </code>
        <CopyButton value={matchId} label="Copy match id" />
        {labelHref && (
          <Link href={labelHref} className={STRIP_LINK}>
            Open in Labels
          </Link>
        )}
        {job && <JobCopy job={job} />}
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
