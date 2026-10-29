"use client";

import Link from "next/link";
import { PeekDrawerFrame } from "@/components/dashboard/matches/match-drawer";
import { CopyButton } from "@/components/admin/matches/copy-button";
import { advButton } from "@/lib/ui/adv-button";
import { formatScoreText } from "@/lib/ui/score-format";
import type { AdminMatchRow } from "@/lib/data/admin-matches-server";

/** The workspace's name as the drawer's sub-line says it. */
export function workspaceName(row: Pick<AdminMatchRow, "workspace">): string {
  return row.workspace.kind === "team" ? row.workspace.name : "Personal";
}

/** "Won 6-3, 6-2 · UC Davis Men's Tennis" — or just the workspace, unscored. */
function subLine(row: AdminMatchRow): string {
  const where = workspaceName(row);
  if (row.sets.length === 0) return where;
  const result = row.won === true ? "Won " : row.won === false ? "Lost " : "";
  return `${result}${formatScoreText(row.sets)} · ${where}`;
}

/** The 30-day views sentence; "—" when the count is not measured. */
export function viewsSentence(views: number | null): string {
  if (views === null) return "—";
  if (views === 0) return "No views yet";
  return `${views.toLocaleString("en-US")} ${views === 1 ? "view" : "views"} in the last 30 days · admin views not counted`;
}

/**
 * Admin › Matches peek drawer (Matches2): who played whom, the result and the
 * workspace, the match id with Copy, its 30-day views, and the two ways on —
 * the read-only report and the label console. The shared `PeekDrawerFrame`
 * draws the header (‹ › · counter · X), the width keyframe and focus.
 */
export function MatchPeekDrawer({
  row,
  index,
  total,
  canPrev,
  canNext,
  closing,
  autoFocus,
  onPrev,
  onNext,
  onClose,
  onClosed,
}: {
  row: AdminMatchRow;
  index: number;
  total: number;
  canPrev: boolean;
  canNext: boolean;
  closing: boolean;
  autoFocus: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onClosed: () => void;
}) {
  const title = `${row.player} vs ${row.opponent}`;
  return (
    <PeekDrawerFrame
      kind="Match"
      label={title}
      index={index}
      total={total}
      canPrev={canPrev}
      canNext={canNext}
      closing={closing}
      autoFocus={autoFocus}
      focusKey={row.id}
      onPrev={onPrev}
      onNext={onNext}
      onClose={onClose}
      onClosed={onClosed}
      footer={
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href={`/admin/matches/${row.id}`} className={advButton()}>
            Open report
          </Link>
          {row.labelHref && (
            <Link
              href={row.labelHref}
              className="text-[13px] text-[var(--ink-700)] transition-colors duration-200 hover:text-[var(--ink-900)]"
            >
              Open in Labels
            </Link>
          )}
        </div>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-[22px] pt-5 pb-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="m-0 text-[16px] leading-[1.35] font-medium text-[var(--ink-900)]">
            {title}
          </h2>
          <span className="text-[13px] text-[var(--ink-600)] tabular-nums">
            {subLine(row)}
          </span>
        </div>

        <div className="flex items-center gap-2 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] py-1 pr-1 pl-3">
          <code
            aria-label="Match id"
            className="mono min-w-0 flex-1 text-[12px] break-all text-[var(--ink-900)]"
          >
            {row.id}
          </code>
          <CopyButton value={row.id} label="Copy match id" />
        </div>

        <p className="m-0 text-[13px] text-[var(--ink-700)]">
          {viewsSentence(row.views)}
        </p>
      </div>
    </PeekDrawerFrame>
  );
}
