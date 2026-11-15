"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Copy, MoreHorizontal } from "lucide-react";
import { MENU_ROW_ICON } from "@/components/admin/request-drawer";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { FloatMenu, FloatMenuItem } from "@/components/ui/float-menu";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import { copyFeedback, copyText, type CopyResult } from "./admin-report-copy";

/** The page's bounded box: the strip on top, the report filling the rest. */
export const ADMIN_REPORT_BOX =
  "flex h-[calc(100dvh-var(--header-h))] w-full flex-col overflow-hidden bg-[var(--surface-card)]";

/** The way back from a match's report: the Matches list, row highlighted. */
export function reportBackHref(matchId: string): string {
  return `/admin/matches?id=${encodeURIComponent(matchId)}`;
}

/** The rail's closing line: an admin sees the report read-only. */
export function ReadOnlyRailNote() {
  return (
    <p className="m-0 border-t border-[var(--border-hairline)] px-5 py-4 text-[12px] text-[var(--ink-600)]">
      Share and Ask are hidden while viewing as admin.
    </p>
  );
}

/** "8f3d21c6…7b31". */
function shortId(id: string): string {
  return id.length > 13 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

/**
 * The strip under the admin header on `/admin/matches/[id]`, cut to what an
 * admin needs: the way back, which match this is, and what they can do. The
 * one action is the label console; the two ids the scripts and logs key on
 * (the match's, the analysis job's) sit behind the "⋯" menu, copied on
 * select. The rail beneath carries the score; the team, read-only state and
 * raw id are not repeated here.
 *
 * Esc goes back to Matches, unless something on the page owns Esc right now:
 * a field, a menu, a dialog, the film room in fullscreen. The back link says
 * so (`aria-keyshortcuts`, its tooltip).
 */
export function AdminReportStrip({
  matchId,
  player,
  opponent,
  labelHref,
  job,
}: {
  matchId: string;
  player: string;
  opponent: string;
  labelHref: string | null;
  /** The latest analysis job, when the match has one. */
  job: { id: string; status: string } | null;
}) {
  const router = useRouter();
  const backHref = reportBackHref(matchId);
  const [menuOpen, setMenuOpen] = useState(false);
  // What the last copy did, said quietly beside the ⋯ button for a moment.
  const [copied, setCopied] = useState<CopyResult | null>(null);
  const [feedback] = useState(() => copyFeedback(setCopied));

  useEffect(() => feedback.dispose, [feedback]);

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

  function copy(value: string) {
    setMenuOpen(false);
    void copyText(navigator.clipboard, value).then(feedback.say);
  }

  const copyIcon = (
    <Copy className={MENU_ROW_ICON} strokeWidth={1.5} aria-hidden />
  );

  return (
    <div className="flex shrink-0 items-center gap-4 border-b border-[var(--border-hairline)] px-6 py-1.5">
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
      </nav>

      <span className="flex shrink-0 items-center gap-2">
        {labelHref && (
          <Link href={labelHref} className={advButton("outline", "sm")}>
            Open in Labels
          </Link>
        )}
        {/* Always mounted, so the polite region exists before its text does
            and a screen reader announces the change; empty, it takes back the
            gap it would add. */}
        <span
          role="status"
          aria-live="polite"
          className="min-w-0 text-[12px] whitespace-nowrap text-[var(--ink-600)] empty:-ml-2"
        >
          {copied}
        </span>
        <FloatMenu
          open={menuOpen}
          onOpenChange={setMenuOpen}
          width={244}
          label="Match ids"
          trigger={
            <button
              type="button"
              aria-label="Match ids"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className={cn(advButton("outline", "sm"), "size-8 p-0")}
            >
              <MoreHorizontal
                className="size-[15px]"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </button>
          }
        >
          <FloatMenuItem
            label="Copy match id"
            description={shortId(matchId)}
            icon={copyIcon}
            onSelect={() => copy(matchId)}
          />
          {job ? (
            <FloatMenuItem
              label="Copy analysis job id"
              description={`${shortId(job.id)} · ${job.status}`}
              icon={copyIcon}
              onSelect={() => copy(job.id)}
            />
          ) : null}
        </FloatMenu>
      </span>
    </div>
  );
}
