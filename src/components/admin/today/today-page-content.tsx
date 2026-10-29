"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { markAdminRowSeen } from "@/app/admin/seen-actions";
import {
  reopenTodayItem,
  resolveTodayItem,
  type ResolveResult,
} from "@/app/admin/today-actions";
import { AdminPage } from "@/components/admin/admin-page";
import {
  AdminMatchCell,
  AdminPersonCell,
  AgeText,
  CountPills,
  dayLabel,
  scoredSets,
  timeLabel,
  useIsClient,
} from "@/components/admin/admin-cells";
import { useStartLabelling } from "@/components/admin/labels/start-labelling-button";
import {
  DRAWER_ATTR,
  PeekDrawerFrame,
} from "@/components/dashboard/matches/match-drawer";
import {
  PendingBar,
  PendingRegion,
} from "@/components/dashboard/loading/pending";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import type { TodayItem, TodayPipeline } from "@/lib/data/admin-today-server";

/**
 * Admin › Today (boards Today2 / TodayEmpty2): everything waiting on an
 * admin, oldest first, one table — "Waiting on you" · "Needs" · "Waiting" —
 * and a peek drawer a row opens with one primary action and one link.
 *
 * The selection machine is `requests-page-content.tsx`'s (selected id, drawer
 * id and the 200ms closing state kept apart; ↑ ↓ step, Esc closes), minus the
 * URL mirror: a Today row is a pointer into another page, which owns the deep
 * link (`/admin/requests?id=…`, `/admin/ask?id=…`).
 *
 * No crests on Today — the board says so; a match row's line 2 names its
 * workspace in text.
 */

const CARD =
  "overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]";
const ROW = "flex items-center gap-4";
const COL = {
  item: "min-w-0 flex-1",
  need: "w-[150px] shrink-0",
  age: "w-[120px] shrink-0",
} as const;

const rowDomId = (key: string) => `admin-today-${key.replace(/[^\w-]/g, "-")}`;

type TodayView = "waiting" | "resolved";

export function TodayPageContent({
  items: waiting,
  resolved,
  freshCount,
  pipeline,
}: {
  items: TodayItem[];
  resolved: TodayItem[];
  freshCount: number;
  pipeline: TodayPipeline | null;
}) {
  const [view, setView] = useState<TodayView>("waiting");
  // Rows resolved or reopened here, hidden from the list they left until the
  // refresh that follows the write brings the server's answer.
  const [moved, setMoved] = useState<ReadonlySet<string>>(new Set());
  // The one row that can still be undone, and the line that offers it.
  const [undo, setUndo] = useState<{ key: string; title: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const items = useMemo(
    () =>
      (view === "waiting" ? waiting : resolved).filter(
        (item) => !moved.has(item.key),
      ),
    [view, waiting, resolved, moved],
  );
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [drawerKey, setDrawerKey] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [openedByKeyboard, setOpenedByKeyboard] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const drawerItem = drawerKey
    ? (items.find((item) => item.key === drawerKey) ?? null)
    : null;
  const drawerIndex = drawerItem ? items.indexOf(drawerItem) : -1;

  // A refresh dropped the open row (it was dealt with): close quietly.
  if (drawerKey && !drawerItem) {
    setSelectedKey(null);
    setDrawerKey(null);
    setClosing(false);
  }

  const finishClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setDrawerKey(null);
    setClosing(false);
  }, []);

  const select = useCallback((item: TodayItem, viaKeyboard: boolean) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setClosing(false);
    setSelectedKey(item.key);
    setDrawerKey(item.key);
    setOpenedByKeyboard(viaKeyboard);
    if (item.fresh) {
      setOpened((prev) => new Set(prev).add(item.key));
      void markAdminRowSeen("today", item.key).catch(() => {});
    }
  }, []);

  const close = useCallback(
    (returnFocusTo: string | null) => {
      setSelectedKey(null);
      setClosing(true);
      closeTimer.current = setTimeout(finishClose, 240);
      if (returnFocusTo)
        document.getElementById(rowDomId(returnFocusTo))?.focus();
    },
    [finishClose],
  );

  const step = useCallback(
    (direction: 1 | -1) => {
      if (!selectedKey) return;
      const index = items.findIndex((item) => item.key === selectedKey);
      const next = items[index + direction];
      if (!next) return;
      select(next, true);
      document
        .getElementById(rowDomId(next.key))
        ?.scrollIntoView({ block: "nearest" });
    },
    [items, selectedKey, select],
  );

  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  useEffect(() => {
    if (!selectedKey) return;
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
        close(selectedKey);
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
  }, [selectedKey, close, step]);

  const freshNow = Math.max(
    0,
    freshCount -
      waiting.filter((i) => i.fresh && (opened.has(i.key) || moved.has(i.key)))
        .length,
  );
  const waitingCount = waiting.filter((i) => !moved.has(i.key)).length;
  const resolvedCount = resolved.filter((i) => !moved.has(i.key)).length;

  // A server refresh settles every optimistic move; the list is the truth.
  const [settledFrom, setSettledFrom] = useState({ waiting, resolved });
  if (settledFrom.waiting !== waiting || settledFrom.resolved !== resolved) {
    setSettledFrom({ waiting, resolved });
    setMoved(new Set());
  }

  // The undo line and a failed write's message go away on their own.
  useEffect(() => {
    if (!undo && !actionError) return;
    const timer = setTimeout(() => {
      setUndo(null);
      setActionError(null);
    }, 10_000);
    return () => clearTimeout(timer);
  }, [undo, actionError]);

  // Hide the row at once, run the write, and put it back if the write fails.
  const moveRow = useCallback(
    async (
      key: string,
      write: () => Promise<ResolveResult>,
      failure: string,
    ): Promise<boolean> => {
      setActionError(null);
      setMoved((prev) => new Set(prev).add(key));
      const result = await write().catch((): ResolveResult => ({
        ok: false,
        error: failure,
      }));
      if (!result.ok) {
        setMoved((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        setActionError(result.error);
        return false;
      }
      // No router.refresh(): the action's revalidatePath("/admin") already
      // re-renders this route in its own response.
      return true;
    },
    [],
  );

  const resolve = useCallback(
    async (item: TodayItem, note: string | null) => {
      close(null);
      const ok = await moveRow(
        item.key,
        () => resolveTodayItem(item.key, note),
        "Couldn’t resolve it. Try again.",
      );
      if (ok) setUndo({ key: item.key, title: item.title });
    },
    [close, moveRow],
  );

  const reopen = useCallback(
    async (key: string) => {
      setUndo(null);
      if (drawerKey === key) close(null);
      await moveRow(
        key,
        () => reopenTodayItem(key),
        "Couldn’t reopen it. Try again.",
      );
    },
    [close, drawerKey, moveRow],
  );

  return (
    <AdminPage
      className={cn(drawerItem && "pr-10")}
      rail={
        drawerItem && (
          <TodayDrawer
            item={drawerItem}
            index={drawerIndex}
            total={items.length}
            closing={closing}
            autoFocus={openedByKeyboard}
            onPrev={() => step(-1)}
            onNext={() => step(1)}
            onClose={() => close(drawerItem.key)}
            onClosed={finishClose}
            onResolve={(note) => void resolve(drawerItem, note)}
            onReopen={() => void reopen(drawerItem.key)}
          />
        )
      }
    >
      <h1 className="text-display">Today</h1>
      <p className="text-body-sm mt-[9px]">{lede(waitingCount, freshNow)}</p>

      {resolved.length > 0 || view === "resolved" ? (
        <div className="mt-6">
          <CountPills
            label="Today"
            value={view}
            onChange={(next) => {
              close(null);
              setView(next);
            }}
            options={[
              { value: "waiting", label: "Waiting", count: waitingCount },
              {
                value: "resolved",
                label: "Resolved",
                count: resolvedCount,
              },
            ]}
          />
        </div>
      ) : null}

      {actionError ? (
        <p role="alert" className="mt-4 text-[12px] text-[var(--danger)]">
          {actionError}
        </p>
      ) : null}
      {undo && !actionError ? (
        <p
          role="status"
          className="mt-4 flex flex-wrap items-center gap-x-2.5 text-[12px] text-[var(--ink-700)]"
        >
          {undo ? (
            <>
              <span className="min-w-0 truncate">Resolved “{undo.title}”.</span>
              <button
                type="button"
                onClick={() => void reopen(undo.key)}
                className="cursor-pointer font-medium text-[var(--blue)] hover:text-[var(--blue-hover)]"
              >
                Undo
              </button>
            </>
          ) : null}
        </p>
      ) : null}

      {items.length === 0 ? (
        view === "resolved" ? (
          <p className="mt-6 text-[13px] text-[var(--ink-600)]">
            Nothing resolved in the last 30 days.
          </p>
        ) : (
          <EmptyCard />
        )
      ) : (
        <div className={cn(CARD, "mt-6")}>
          <div className="min-w-[660px] px-6 pt-0.5 pb-1.5">
            <div
              className={cn(
                ROW,
                "border-b border-[var(--border-hairline)] pt-3.5 pb-2.5",
              )}
            >
              <span className={cn(COL.item, "eyebrow-sm")}>
                {view === "waiting" ? "Waiting on you" : "Was waiting on you"}
              </span>
              <span className={cn(COL.need, "eyebrow-sm")}>Needs</span>
              <span className={cn(COL.age, "eyebrow-sm")}>
                {view === "waiting" ? "Waiting" : "Resolved"}
              </span>
            </div>
            {items.map((item) => (
              <TodayRow
                key={item.key}
                item={item}
                fresh={item.fresh && !opened.has(item.key)}
                selected={item.key === selectedKey}
                onSelect={(viaKeyboard) => {
                  if (selectedKey === item.key)
                    close(viaKeyboard ? item.key : null);
                  else select(item, viaKeyboard);
                }}
              />
            ))}
          </div>
        </div>
      )}

      {pipeline ? <PipelineLine pipeline={pipeline} /> : null}
    </AdminPage>
  );
}

function lede(total: number, fresh: number): string {
  if (total === 0) return "You’re all caught up.";
  const head =
    total === 1
      ? "1 thing is waiting on you"
      : `${total} things are waiting on you, oldest first`;
  return fresh > 0
    ? `${head} · ${fresh} new since you last looked.`
    : `${head}.`;
}

function TodayRow({
  item,
  fresh,
  selected,
  onSelect,
}: {
  item: TodayItem;
  fresh: boolean;
  selected: boolean;
  onSelect: (viaKeyboard: boolean) => void;
}) {
  return (
    <div
      id={rowDomId(item.key)}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={(event) => onSelect(event.detail === 0)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(true);
        }
      }}
      className={cn(
        ROW,
        "-mx-4 h-[60px] cursor-pointer rounded-[var(--radius-element)] px-4",
        "transition-colors duration-[var(--duration-fast)] hover:bg-[var(--surface-muted)]",
        "focus-visible:bg-[var(--surface-muted)] focus-visible:outline-none",
        selected && "bg-[var(--surface-muted)]",
      )}
    >
      <span className={cn(COL.item, "flex min-w-0")}>
        <ItemCell item={item} fresh={fresh} />
      </span>
      <span
        className={cn(
          COL.need,
          "truncate text-[12px] font-medium text-[var(--ink-900)]",
        )}
      >
        {item.need}
      </span>
      {item.resolution ? (
        <span
          className={cn(COL.age, "flex min-w-0 flex-col gap-1 tabular-nums")}
        >
          <span className="truncate text-[13px] whitespace-nowrap text-[var(--ink-700)]">
            <AgeText at={item.resolution.at} /> ago
          </span>
          <span className="truncate text-[12px] whitespace-nowrap text-[var(--ink-600)]">
            by {item.resolution.by}
          </span>
        </span>
      ) : (
        <span
          className={cn(COL.age, "flex min-w-0 flex-col gap-1 tabular-nums")}
        >
          <AgeText
            at={item.since}
            className={cn(
              "truncate text-[13px] whitespace-nowrap",
              fresh
                ? "font-medium text-[var(--ink-900)]"
                : "text-[var(--ink-700)]",
            )}
          />
          <span className="truncate text-[12px] whitespace-nowrap text-[var(--ink-600)]">
            <SinceText at={item.since} />
          </span>
        </span>
      )}
    </div>
  );
}

function ItemCell({ item, fresh }: { item: TodayItem; fresh: boolean }) {
  const cell = item.cell;
  if (cell.type === "match") {
    return (
      <AdminMatchCell
        player={cell.player}
        opponent={cell.opponent}
        won={cell.won}
        sets={cell.sets}
        fresh={fresh}
        trailing={
          <>
            {scoredSets(cell.sets).length > 0 ? (
              <span
                aria-hidden="true"
                className="text-[12px] text-[var(--ink-400)]"
              >
                ·
              </span>
            ) : null}
            <span className="truncate text-[12px] text-[var(--ink-600)]">
              {cell.context}
            </span>
          </>
        }
      />
    );
  }
  return (
    <AdminPersonCell
      name={cell.name}
      photoUrl={cell.photoUrl}
      rest={cell.rest ?? undefined}
      sub={cell.sub ?? undefined}
      fresh={fresh}
    />
  );
}

/** "since Oct 25", "since Yesterday, 4:10 pm", "since 9:30 am" — browser zone only. */
function SinceText({ at }: { at: string }) {
  const isClient = useIsClient();
  if (!isClient) return <> </>;
  const date = new Date(at);
  const day = dayLabel(date);
  const label =
    day === "Today"
      ? timeLabel(date)
      : day === "Yesterday"
        ? `Yesterday, ${timeLabel(date)}`
        : day;
  return <>since {label}</>;
}

function TodayDrawer({
  item,
  index,
  total,
  closing,
  autoFocus,
  onPrev,
  onNext,
  onClose,
  onClosed,
  onResolve,
  onReopen,
}: {
  item: TodayItem;
  index: number;
  total: number;
  closing: boolean;
  autoFocus: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onClosed: () => void;
  onResolve: (note: string | null) => void;
  onReopen: () => void;
}) {
  return (
    <PeekDrawerFrame
      kind="Item"
      label={item.title}
      index={index}
      total={total}
      canPrev={index > 0}
      canNext={index < total - 1}
      closing={closing}
      autoFocus={autoFocus}
      focusKey={item.key}
      onPrev={onPrev}
      onNext={onNext}
      onClose={onClose}
      onClosed={onClosed}
      footer={
        <>
          {"href" in item.primary ? (
            <Link
              href={item.primary.href}
              className={cn(advButton("primary", "md"), "w-full")}
            >
              {item.primary.label}
            </Link>
          ) : (
            <StartLabellingButton
              key={item.primary.startLabellingJobId}
              jobId={item.primary.startLabellingJobId}
              label={item.primary.label}
            />
          )}
          {item.link ? (
            <Link
              href={item.link.href}
              className="self-center text-[13px] text-[var(--ink-700)] hover:text-[var(--ink-900)]"
            >
              {item.link.label}
            </Link>
          ) : null}
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-[22px] pt-6 pb-[22px]">
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] text-[var(--ink-600)]">
            {item.need} · waiting <AgeText at={item.since} />
          </span>
          <h2 className="text-title-lg [text-wrap:balance] break-words text-[var(--ink-900)]">
            {item.title}
          </h2>
        </div>
        <p className="text-[13px] leading-[1.55] break-words text-[var(--ink-700)]">
          {item.body}
        </p>
        {item.resolution ? (
          <ResolvedNote resolution={item.resolution} onReopen={onReopen} />
        ) : item.resolvable ? (
          <ResolveForm key={item.key} onResolve={onResolve} />
        ) : null}
      </div>
    </PeekDrawerFrame>
  );
}

/**
 * The hand close for a row that has none of its own (a dead analysis, a
 * flagged match nobody will label, Ask feedback). Quiet on purpose: an
 * outline button under the facts, never a second primary beside the real one.
 */
function ResolveForm({
  onResolve,
}: {
  onResolve: (note: string | null) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <div className="flex flex-col gap-2 border-t border-[var(--border-hairline)] pt-4">
      <label
        htmlFor="today-resolve-note"
        className="text-[12px] text-[var(--ink-600)]"
      >
        Nothing left to do? Resolve it for every admin.
      </label>
      <textarea
        id="today-resolve-note"
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={500}
        rows={2}
        placeholder="Note, optional — “player abandoned the upload”"
        className="w-full resize-none rounded-[var(--radius-element)] border border-[var(--border-hairline)] bg-[var(--surface-card)] px-2.5 py-2 text-[13px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-400)] focus-visible:border-[var(--border-medium)]"
      />
      <button
        type="button"
        onClick={() => onResolve(note.trim() || null)}
        className={cn(advButton("outline", "md"), "self-start")}
      >
        Resolve
      </button>
    </div>
  );
}

function ResolvedNote({
  resolution,
  onReopen,
}: {
  resolution: NonNullable<TodayItem["resolution"]>;
  onReopen: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-[var(--border-hairline)] pt-4">
      <p className="text-[12px] text-[var(--ink-600)]">
        Resolved by {resolution.by} · <AgeText at={resolution.at} /> ago
      </p>
      {resolution.note ? (
        <p className="text-[13px] leading-[1.55] break-words text-[var(--ink-700)]">
          “{resolution.note}”
        </p>
      ) : null}
      <button
        type="button"
        onClick={onReopen}
        className={cn(advButton("outline", "md"), "self-start")}
      >
        Reopen
      </button>
    </div>
  );
}

function StartLabellingButton({
  jobId,
  label,
}: {
  jobId: string;
  label: string;
}) {
  const { start, isPending, error } = useStartLabelling(jobId);
  return (
    <>
      {error ? (
        <p
          role="alert"
          className="text-[12px] leading-[18px] text-[var(--danger)]"
        >
          {error}
        </p>
      ) : null}
      <button
        type="button"
        disabled={isPending}
        onClick={start}
        className={cn(advButton("primary", "md"), "w-full")}
      >
        {isPending ? "Opening…" : label}
      </button>
    </>
  );
}

function EmptyCard() {
  return (
    <div className="mt-6 flex flex-col gap-1.5 rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-card)] px-8 py-10">
      <p className="text-[14px] font-medium text-[var(--ink-900)]">
        Nothing is waiting on you.
      </p>
      <p className="max-w-[520px] text-[13px] text-[var(--ink-600)]">
        Claims and program requests, failed analyses, flagged labels, pilots
        near their hours and thumbs down on Ask show up here when they arrive.
      </p>
    </div>
  );
}

function PipelineLine({ pipeline }: { pipeline: TodayPipeline }) {
  const clauses = [
    pipeline.uploading > 0 ? `${pipeline.uploading} uploading` : null,
    pipeline.analyzing > 0 ? `${pipeline.analyzing} analyzing` : null,
    pipeline.queued > 0 ? `${pipeline.queued} queued` : null,
  ].filter(Boolean);
  return (
    <p className="mt-5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[12px] text-[var(--ink-600)]">
      <i
        aria-hidden="true"
        className="block size-1.5 rounded-full bg-[var(--ink-400)]"
      />
      <span>
        Advantage Intelligence:{" "}
        {clauses.length > 0
          ? clauses.join(" · ")
          : "nothing uploading, analyzing or queued"}
        {pipeline.lastWebhookAt ? (
          <>
            {" "}
            · last webhook <AgeText at={pipeline.lastWebhookAt} /> ago
          </>
        ) : null}
      </span>
      <Link
        href="/admin/matches"
        className="font-medium text-[var(--blue-hover)] hover:text-[var(--blue-hover)]"
      >
        See matches
      </Link>
    </p>
  );
}

/** The route's loading state: the page's own frame with the table pending. */
export function TodayPageSkeleton() {
  return (
    <AdminPage>
      <h1 className="text-display">Today</h1>
      <PendingBar className="mt-[13px] h-3 w-72" />
      <div className={cn(CARD, "mt-6")}>
        <div className="min-w-[660px] px-6 pt-0.5 pb-1.5">
          <div
            className={cn(
              ROW,
              "border-b border-[var(--border-hairline)] pt-3.5 pb-2.5",
            )}
          >
            <span className={cn(COL.item, "eyebrow-sm")}>Waiting on you</span>
            <span className={cn(COL.need, "eyebrow-sm")}>Needs</span>
            <span className={cn(COL.age, "eyebrow-sm")}>Waiting</span>
          </div>
          <PendingRegion label="what is waiting on you">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className={cn(ROW, "h-[60px]")}>
                <span className={cn(COL.item, "flex items-center gap-3")}>
                  <PendingBar className="size-8 rounded-full" />
                  <span className="flex flex-1 flex-col gap-1.5">
                    <PendingBar className="h-3 w-48" />
                    <PendingBar className="h-3 w-32" />
                  </span>
                </span>
                <span className={COL.need}>
                  <PendingBar className="h-3 w-24" />
                </span>
                <span className={cn(COL.age, "flex flex-col gap-1.5")}>
                  <PendingBar className="h-3 w-12" />
                  <PendingBar className="h-3 w-20" />
                </span>
              </div>
            ))}
          </PendingRegion>
        </div>
      </div>
    </AdminPage>
  );
}
