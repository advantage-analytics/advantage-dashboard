"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { GalleryHorizontalEnd } from "lucide-react";
import { AdminPage } from "@/components/admin/admin-page";
import {
  CountPills,
  FilterDivider,
  FilterMenuPill,
  NewLabel,
  PillSearch,
  WorkspaceCell,
  WorkspaceMark,
  ageLabel,
  dayLabel,
  useIsClient,
  type FilterMenuOption,
} from "@/components/admin/admin-cells";
import {
  MatchPeekDrawer,
  resubmittableJobId,
  videoHoursLabel,
  workspaceName,
} from "@/components/admin/matches/match-peek-drawer";
import { ResubmitButton } from "@/components/admin/matches/resubmit-button";
import { DRAWER_ATTR } from "@/components/dashboard/matches/match-drawer";
import { VerifiedMark } from "@/components/dashboard/matches/verified-mark";
import { AnalysisStatusLine } from "@/components/dashboard/shared/analysis-status-line";
import { TableEmptyBody } from "@/components/dashboard/shared/table-empty-body";
import { markAdminRowSeen } from "@/app/admin/seen-actions";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import {
  ANALYSIS_LABEL,
  UPLOAD_PAUSED_LABEL,
  inFlightMark,
  isInFlight,
  isSubmitStalled,
  isUploadPaused,
  matchListGroup,
  matchListStatusLabel,
} from "@/lib/data/match-analysis";
import { VERIFIED_BY_ADVANTAGE } from "@/lib/data/match-verification";
import type {
  AdminMatchBucket,
  AdminMatchRow,
} from "@/lib/data/admin-matches-server";

/**
 * Admin › Matches (Matches2): every match on Advantage, newest upload first —
 * search, the view pills, the Program menu, the table and the peek drawer a
 * row opens. One line per match (AdminMatches.dc.html): players, workspace,
 * one status mark with its words, video hours, upload time.
 *
 * Everything is filtered here, on the rows the server sent: the page loads
 * every match up to the loader's cap, so the pill counts and the search cover
 * all of them. The table draws `PAGE` rows at a time.
 *
 * The selection machine is `requests-page-content.tsx`'s: `selectedId` (the
 * wash), `drawerId` (what the rail draws) and `closing` (the out keyframe),
 * with `?id=` mirrored by `history.replaceState` so a deep link lands open.
 */

type View = "all" | "uploading" | "analyzing" | "failed";

const PAGE = 50;

const GRID =
  "grid grid-cols-[minmax(220px,1.4fr)_minmax(150px,1fr)_minmax(150px,1.2fr)_64px_96px] items-center gap-4";

const COLUMNS = ["Match", "Workspace", "Status", "Video", "Uploaded"] as const;

const VIEW_MATCH: Record<View, (bucket: AdminMatchBucket) => boolean> = {
  all: () => true,
  uploading: (bucket) => bucket === "uploading",
  analyzing: (bucket) => bucket === "analyzing",
  failed: (bucket) => bucket === "failed",
};

function rowDomId(id: string): string {
  return `admin-match-${id}`;
}

function programKey(row: AdminMatchRow): string {
  return row.workspace.kind === "team" ? row.workspace.programId : "personal";
}

function matchesSearch(row: AdminMatchRow, needle: string): boolean {
  if (!needle) return true;
  return [row.player, row.opponent, row.event ?? "", workspaceName(row), row.id]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

export function MatchesPageContent({
  rows,
  total,
  initialSelectedId,
  initialProgram,
}: {
  rows: AdminMatchRow[];
  /** Every match on Advantage; more than `rows.length` past the loader cap. */
  total: number;
  initialSelectedId: string | null;
  /**
   * `?program=` — a program id or "personal" — the Program filter opens on.
   * One no loaded row carries falls back to every program, so the pill never
   * names a choice its menu does not offer.
   */
  initialProgram: string | null;
}) {
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("all");
  const [program, setProgram] = useState(() =>
    initialProgram && rows.some((row) => programKey(row) === initialProgram)
      ? initialProgram
      : "all",
  );
  const [shown, setShown] = useState(PAGE);
  const [cleared, setCleared] = useState<ReadonlySet<string>>(new Set());

  const needle = query.trim().toLowerCase();

  // Program and search narrow first; the pill counts are counted inside that.
  const scoped = useMemo(
    () =>
      rows.filter(
        (row) =>
          (program === "all" || programKey(row) === program) &&
          matchesSearch(row, needle),
      ),
    [rows, program, needle],
  );
  const visible = useMemo(
    () => scoped.filter((row) => VIEW_MATCH[view](row.bucket)),
    [scoped, view],
  );

  const pillOptions = (
    [
      ["all", "All"],
      ["uploading", "Uploading"],
      ["analyzing", "Analyzing"],
      ["failed", "Failed"],
    ] as const
  ).map(([value, label]) => ({
    value,
    label,
    count: scoped.filter((row) => VIEW_MATCH[value](row.bucket)).length,
  }));

  const programOptions = useMemo(() => {
    const teams = new Map<string, { row: AdminMatchRow; count: number }>();
    let personal = 0;
    for (const row of rows) {
      if (row.workspace.kind === "team") {
        const held = teams.get(row.workspace.programId);
        if (held) held.count += 1;
        else teams.set(row.workspace.programId, { row, count: 1 });
      } else personal += 1;
    }
    const options: FilterMenuOption<string>[] = [
      { value: "all", label: "All programs", count: rows.length },
      ...[...teams.values()]
        .sort((a, b) =>
          workspaceName(a.row).localeCompare(workspaceName(b.row)),
        )
        .map(({ row, count }) => ({
          value: programKey(row),
          label: workspaceName(row),
          count,
          mark: <WorkspaceMark workspace={row.workspace} />,
        })),
    ];
    if (personal > 0) {
      options.push({
        value: "personal",
        label: "Personal matches",
        count: personal,
        mark: <WorkspaceMark workspace={{ kind: "personal" }} />,
      });
    }
    return options;
  }, [rows]);

  // ── Selection (requests-page-content.tsx's machine) ───────────────────────
  const initial =
    initialSelectedId && rows.some((row) => row.id === initialSelectedId)
      ? initialSelectedId
      : null;
  const [selectedId, setSelectedId] = useState<string | null>(initial);
  const [drawerId, setDrawerId] = useState<string | null>(initial);
  const [closing, setClosing] = useState(false);
  const [openedByKeyboard, setOpenedByKeyboard] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stepping walks what is on screen; a deep-linked row outside the current
  // cut still opens, as a list of one.
  const drawerRow = useMemo(
    () => (drawerId ? (rows.find((row) => row.id === drawerId) ?? null) : null),
    [rows, drawerId],
  );
  const stepList = useMemo(
    () => (drawerRow && !visible.includes(drawerRow) ? [drawerRow] : visible),
    [drawerRow, visible],
  );
  const drawerIndex = drawerRow ? stepList.indexOf(drawerRow) : -1;

  const seenOnce = useRef<Set<string>>(new Set());
  const markSeen = useCallback((row: AdminMatchRow) => {
    if (!row.fresh || seenOnce.current.has(row.id)) return;
    seenOnce.current.add(row.id);
    setCleared((prev) => new Set(prev).add(row.id));
    void markAdminRowSeen("matches", `match:${row.id}`).catch(() => {});
  }, []);

  // A deep link opens a row: it counts as opened.
  useEffect(() => {
    if (!initial) return;
    const row = rows.find((candidate) => candidate.id === initial);
    if (row) markSeen(row);
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finishClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setDrawerId(null);
    setClosing(false);
  }, []);

  const select = useCallback(
    (row: AdminMatchRow, viaKeyboard: boolean) => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
      closeTimer.current = null;
      setClosing(false);
      setSelectedId(row.id);
      setDrawerId(row.id);
      setOpenedByKeyboard(viaKeyboard);
      syncUrl(row.id);
      markSeen(row);
    },
    [markSeen],
  );

  const close = useCallback(
    (returnFocusTo: string | null) => {
      setSelectedId(null);
      setClosing(true);
      syncUrl(null);
      closeTimer.current = setTimeout(finishClose, 240);
      if (returnFocusTo) {
        document.getElementById(rowDomId(returnFocusTo))?.focus();
      }
    },
    [finishClose],
  );

  const toggle = useCallback(
    (row: AdminMatchRow, viaKeyboard: boolean) => {
      if (selectedId === row.id) close(viaKeyboard ? row.id : null);
      else select(row, viaKeyboard);
    },
    [selectedId, select, close],
  );

  const step = useCallback(
    (direction: 1 | -1) => {
      if (!selectedId) return;
      const index = stepList.findIndex((row) => row.id === selectedId);
      const next = stepList[index + direction];
      if (!next) return;
      const nextIndex = visible.indexOf(next);
      if (nextIndex >= shown) setShown(nextIndex + 1);
      select(next, true);
      requestAnimationFrame(() =>
        document
          .getElementById(rowDomId(next.id))
          ?.scrollIntoView({ block: "nearest" }),
      );
    },
    [selectedId, stepList, visible, shown, select],
  );

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      const target = event.target as HTMLElement | null;
      if (target) {
        if (target.closest("input, textarea, select, [contenteditable=true]"))
          return;
        if (
          target.closest(
            `[role="dialog"]:not([${DRAWER_ATTR}] [role="dialog"])`,
          )
        )
          return;
        if (target.closest("[data-radix-popper-content-wrapper]")) return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        close(selectedId);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        step(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        step(-1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedId, close, step]);

  // A filter change resets the window, not the open drawer.
  const resetWindow = () => setShown(PAGE);

  const page = visible.slice(0, shown);
  const filtered = view !== "all" || program !== "all" || needle !== "";

  return (
    <AdminPage
      className={cn("gap-0", drawerRow && "pr-10")}
      rail={
        drawerRow && (
          <MatchPeekDrawer
            row={drawerRow}
            index={drawerIndex}
            total={stepList.length}
            canPrev={drawerIndex > 0}
            canNext={drawerIndex < stepList.length - 1}
            closing={closing}
            autoFocus={openedByKeyboard}
            onPrev={() => step(-1)}
            onNext={() => step(1)}
            onClose={() => close(drawerRow.id)}
            onClosed={finishClose}
          />
        )
      }
    >
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-display">Matches</h1>
          <p className="text-body-sm mt-[9px]">
            Every match on Advantage, newest first. Uploads in progress show
            here too.
          </p>
        </div>
        <Link href="/admin/uploads/new" className={advButton()}>
          Upload a match
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <PillSearch
          value={query}
          onChange={(value) => {
            setQuery(value);
            resetWindow();
          }}
          placeholder="Player, team or match id"
          label="Search matches"
          className="w-[260px] max-w-full"
        />
        <CountPills
          options={pillOptions}
          value={view}
          onChange={(value) => {
            setView(value);
            resetWindow();
          }}
        />
        <FilterDivider />
        <FilterMenuPill
          label="Program"
          options={programOptions}
          value={program}
          onChange={(value) => {
            setProgram(value);
            resetWindow();
          }}
          width={280}
        />
      </div>

      <div className="mt-4 overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
        <div className="min-w-[800px] px-6 pt-0.5 pb-1.5">
          <div
            className={cn(
              GRID,
              "border-b border-[var(--border-hairline)] pt-3.5 pb-2.5",
            )}
          >
            {COLUMNS.map((label) => (
              <span key={label} className="eyebrow-sm">
                {label}
              </span>
            ))}
          </div>

          {page.length === 0 ? (
            <TableEmptyBody
              icon={GalleryHorizontalEnd}
              title={
                rows.length === 0
                  ? "No matches on Advantage yet"
                  : "No matches fit this cut"
              }
            />
          ) : (
            page.map((row) => (
              <MatchRow
                key={row.id}
                row={row}
                fresh={row.fresh && !cleared.has(row.id)}
                selected={row.id === selectedId}
                onSelect={() =>
                  toggle(row, document.activeElement?.id === rowDomId(row.id))
                }
              />
            ))
          )}
        </div>
      </div>

      {visible.length > 0 && (
        <p className="mt-3.5 text-[12px] text-[var(--ink-600)] tabular-nums">
          Showing {page.length.toLocaleString("en-US")} of{" "}
          {visible.length.toLocaleString("en-US")}
          {page.length < visible.length && (
            <>
              {" · "}
              <button
                type="button"
                onClick={() => setShown((count) => count + PAGE)}
                className="cursor-pointer font-medium text-[var(--blue)] transition-colors duration-200 hover:text-[var(--blue-hover)]"
              >
                Show more
              </button>
            </>
          )}
          {!filtered && total > rows.length && (
            <>
              {" "}
              · the newest {rows.length.toLocaleString("en-US")} of{" "}
              {total.toLocaleString("en-US")} are loaded
            </>
          )}
        </p>
      )}
    </AdminPage>
  );
}

function MatchRow({
  row,
  fresh,
  selected,
  onSelect,
}: {
  row: AdminMatchRow;
  fresh: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const against = row.opponent.trim();
  const failedJobId = resubmittableJobId(row);
  return (
    <div
      id={rowDomId(row.id)}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${row.player} vs ${row.opponent}`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        GRID,
        "-mx-4 min-h-[44px] cursor-pointer rounded-[var(--radius-element)] px-4 py-1.5",
        "transition-colors duration-[var(--duration-fast)] hover:bg-[var(--surface-muted)]",
        "focus-visible:bg-[var(--surface-muted)] focus-visible:outline-none",
        selected && "bg-[var(--surface-muted)]",
      )}
    >
      <span className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap">
        <span className="shrink-0 truncate text-[13px] font-medium text-[var(--ink-900)]">
          {row.player}
        </span>
        {against ? (
          <span className="truncate text-[13px] text-[var(--ink-600)]">
            vs {against}
          </span>
        ) : null}
        {fresh ? <NewLabel /> : null}
      </span>
      <span className="min-w-0">
        <WorkspaceCell workspace={row.workspace} ownerName={row.player} />
      </span>
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex min-w-0 overflow-hidden">
          <MatchStatus row={row} />
        </span>
        {failedJobId ? <ResubmitButton jobId={failedJobId} /> : null}
      </span>
      <VideoHours seconds={row.videoSeconds} />
      <UploadedAt at={row.uploadedAt} fresh={fresh} />
    </div>
  );
}

/**
 * The row's one status mark and its words — `RowLifecycle`'s vocabulary on a
 * single line: an upload's percentage rides beside the word rather than as a
 * track beneath it, which would make the row two lines.
 */
function MatchStatus({ row }: { row: AdminMatchRow }) {
  const { analysis, verification } = row;
  const { status } = analysis;

  if (isSubmitStalled(analysis)) {
    return <AnalysisStatusLine mark="wait">Not sent</AnalysisStatusLine>;
  }
  if (status === "uploading") {
    const percent = analysis.uploadPercent;
    const paused = isUploadPaused(analysis);
    return (
      <AnalysisStatusLine
        mark={paused ? "wait" : "now"}
        value={
          percent === undefined
            ? undefined
            : `${paused ? Math.floor(percent) : Math.round(percent)}%`
        }
      >
        {paused ? UPLOAD_PAUSED_LABEL : ANALYSIS_LABEL.uploading}
      </AnalysisStatusLine>
    );
  }
  if (isInFlight(status)) {
    return (
      <AnalysisStatusLine mark={inFlightMark(status)}>
        {ANALYSIS_LABEL[status]}
      </AnalysisStatusLine>
    );
  }
  if (matchListGroup(analysis) === "Failed") {
    return <AnalysisStatusLine mark="fail">Failed</AnalysisStatusLine>;
  }
  if (status === "cancelled") {
    return <AnalysisStatusLine mark="stopped">Cancelled</AnalysisStatusLine>;
  }
  if (status === "manual") {
    return <AnalysisStatusLine mark="none">Not analyzed</AnalysisStatusLine>;
  }
  if (verification && analysis.recovery !== "stats_unavailable") {
    return (
      <span className="inline-flex min-w-0 items-center gap-2 text-[11px] leading-none whitespace-nowrap text-[var(--ink-700)]">
        <VerifiedMark size={14} />
        <span className="min-w-0 truncate">{VERIFIED_BY_ADVANTAGE}</span>
      </span>
    );
  }
  return (
    <AnalysisStatusLine
      mark={analysis.recovery === "stats_unavailable" ? "none" : "done"}
    >
      {matchListStatusLabel(analysis)}
    </AnalysisStatusLine>
  );
}

function VideoHours({ seconds }: { seconds: number | null }) {
  const label = videoHoursLabel(seconds);
  return (
    <span
      className={cn(
        "text-[12px] whitespace-nowrap tabular-nums",
        label === "—" ? "text-[var(--ink-400)]" : "text-[var(--ink-600)]",
      )}
    >
      {label}
    </span>
  );
}

/**
 * One upload time: "4 min ago" / "6 h ago" inside a week, then the day
 * ("Oct 27", "Oct 27, 2025"). A moment in the viewer's zone, so it is drawn
 * in the browser only (`useIsClient`, as `TwoLineDate` does).
 */
function UploadedAt({ at, fresh }: { at: string | null; fresh: boolean }) {
  const isClient = useIsClient();
  if (!at) {
    return <span className="text-[12px] text-[var(--ink-400)]">—</span>;
  }
  const date = new Date(at);
  const now = new Date();
  const recent = now.getTime() - date.getTime() < 7 * 24 * 60 * 60 * 1000;
  return (
    <span
      className={cn(
        "truncate text-[12px] whitespace-nowrap tabular-nums",
        fresh ? "font-medium text-[var(--ink-900)]" : "text-[var(--ink-600)]",
      )}
    >
      {isClient
        ? recent
          ? `${ageLabel(date, now)} ago`
          : dayLabel(date, now)
        : " "}
    </span>
  );
}

/** `?id=` without a navigation — `requests-page-content.tsx`'s `syncUrl`. */
function syncUrl(id: string | null) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("id", id);
  else url.searchParams.delete("id");
  window.history.replaceState(window.history.state, "", url);
}
