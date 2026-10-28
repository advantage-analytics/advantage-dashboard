"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { markAdminRowSeen } from "@/app/admin/seen-actions";
import { AdminPage } from "@/components/admin/admin-page";
import {
  AdminMatchCell,
  AdminPersonCell,
  AgeText,
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

export function TodayPageContent({
  items,
  freshCount,
  pipeline,
}: {
  items: TodayItem[];
  freshCount: number;
  pipeline: TodayPipeline | null;
}) {
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
    freshCount - items.filter((i) => i.fresh && opened.has(i.key)).length,
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
          />
        )
      }
    >
      <h1 className="text-display">Today</h1>
      <p className="text-body-sm mt-[9px]">{lede(items.length, freshNow)}</p>

      {items.length === 0 ? (
        <EmptyCard />
      ) : (
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
      <span className={cn(COL.age, "flex min-w-0 flex-col gap-1 tabular-nums")}>
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
      </div>
    </PeekDrawerFrame>
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
