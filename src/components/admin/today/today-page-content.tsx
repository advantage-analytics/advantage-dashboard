"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  useTransition,
} from "react";
import { markAdminRowSeen } from "@/app/admin/seen-actions";
import {
  reopenTodayItem,
  resolveTodayItem,
  type ResolveResult,
} from "@/app/admin/today-actions";
import { AdminPage } from "@/components/admin/admin-page";
import { AgeText } from "@/components/admin/admin-cells";
import { useStartLabelling } from "@/components/admin/labels/start-labelling-button";
import { ResubmitButton } from "@/components/admin/matches/resubmit-button";
import {
  PendingBar,
  PendingRegion,
} from "@/components/dashboard/loading/pending";
import { approveClaim } from "@/lib/services/programs/admin-actions";
import { actionRejected } from "@/lib/ui/action-rejected";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import type {
  TodayAction,
  TodayItem,
  TodayPipeline,
} from "@/lib/data/admin-today-server";

/**
 * Admin › Today (artboard `AdminToday.dc.html`, 2026-11-12 admin strip): one
 * list of what needs an admin, longest wait first — Kind · What · Waiting and
 * a trailing track of the row's own actions (`TodayItem.actions`).
 *
 * No drawer and no filter pills: the title is a link to the item, and each
 * row's buttons do the work in place — Approve a claim, open a label session,
 * Resubmit a failed analysis, Reply, Add hours. The kinds with no natural end (a dead analysis, a flagged
 * match, Ask feedback) keep a "Resolve" that opens the note form under the row,
 * so nothing sits on Today forever. There is no Resolved view; a resolved row
 * simply stops coming back from the loader.
 *
 * The page sits centred in its column, as every stripped admin page does.
 */

const CARD =
  "overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]";
/** Centred, not pushed to the left edge — the artboard's 1040px main less its gutters. */
const COLUMN = "mx-auto w-full max-w-[928px]";
/** Kind · What · Waiting · actions — the header, every row and the skeleton share it. */
const GRID =
  "grid grid-cols-[140px_minmax(0,1fr)_72px_188px] items-center gap-x-4";

export function TodayPageContent({
  items: waiting,
  freshCount,
  pipeline,
}: {
  items: TodayItem[];
  freshCount: number;
  pipeline: TodayPipeline | null;
}) {
  // Rows resolved here, hidden until the refresh that follows the write
  // brings the server's answer.
  const [moved, setMoved] = useState<ReadonlySet<string>>(new Set());
  // The one row that can still be undone, and the line that offers it.
  const [undo, setUndo] = useState<{ key: string; title: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const items = useMemo(
    () => waiting.filter((item) => !moved.has(item.key)),
    [waiting, moved],
  );

  const freshNow = Math.max(
    0,
    freshCount -
      waiting.filter((i) => i.fresh && (opened.has(i.key) || moved.has(i.key)))
        .length,
  );

  // A server refresh settles every optimistic move; the list is the truth.
  const [settledFrom, setSettledFrom] = useState(waiting);
  if (settledFrom !== waiting) {
    setSettledFrom(waiting);
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

  // Touching a row — its title or any of its actions — is a look at it.
  const markOpened = useCallback((item: TodayItem) => {
    if (!item.fresh) return;
    setOpened((prev) => new Set(prev).add(item.key));
    void markAdminRowSeen("today", item.key).catch(() => {});
  }, []);

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
      const ok = await moveRow(
        item.key,
        () => resolveTodayItem(item.key, note),
        "Couldn’t resolve it. Try again.",
      );
      if (ok) setUndo({ key: item.key, title: item.title });
    },
    [moveRow],
  );

  const reopen = useCallback(
    async (key: string) => {
      setUndo(null);
      await moveRow(
        key,
        () => reopenTodayItem(key),
        "Couldn’t reopen it. Try again.",
      );
    },
    [moveRow],
  );

  return (
    <AdminPage>
      <div className={COLUMN}>
        <h1 className="text-display">Today</h1>
        <p className="text-body-sm mt-[9px]">{lede(items.length, freshNow)}</p>

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
            <span className="min-w-0 truncate">Resolved “{undo.title}”.</span>
            <button
              type="button"
              onClick={() => void reopen(undo.key)}
              className="cursor-pointer font-medium text-[var(--blue)] hover:text-[var(--blue-hover)]"
            >
              Undo
            </button>
          </p>
        ) : null}

        {items.length === 0 ? (
          <EmptyCard />
        ) : (
          <div className={cn(CARD, "mt-6")}>
            <div className="min-w-[680px] px-6 pt-0.5 pb-1.5">
              <HeaderRow />
              {items.map((item) => (
                <TodayRow
                  key={item.key}
                  item={item}
                  fresh={item.fresh && !opened.has(item.key)}
                  onTouch={() => markOpened(item)}
                  onResolve={(note) => void resolve(item, note)}
                />
              ))}
            </div>
          </div>
        )}

        {pipeline ? <PipelineLine pipeline={pipeline} /> : null}
      </div>
    </AdminPage>
  );
}

function lede(total: number, fresh: number): string {
  if (total === 0) return "You’re all caught up.";
  const head =
    total === 1
      ? "1 thing is waiting on you"
      : `${total} things are waiting on you, longest wait first`;
  return fresh > 0
    ? `${head} · ${fresh} new since you last looked.`
    : `${head}.`;
}

/** Kind · What · Waiting, and an unlabelled track over the row actions. */
function HeaderRow() {
  return (
    <div
      className={cn(
        GRID,
        "border-b border-[var(--border-hairline)] pt-3.5 pb-2.5",
      )}
    >
      <span className="eyebrow-sm">Kind</span>
      <span className="eyebrow-sm">What</span>
      <span className="eyebrow-sm">Waiting</span>
      <span aria-hidden="true" />
    </div>
  );
}

/** Where the title goes: the item's own link, else the row's first link action. */
function titleHref(item: TodayItem): string | null {
  if (item.link) return item.link.href;
  const first = item.actions.find(
    (a): a is Extract<TodayAction, { type: "link" }> => a.type === "link",
  );
  return first?.href ?? null;
}

function TodayRow({
  item,
  fresh,
  onTouch,
  onResolve,
}: {
  item: TodayItem;
  fresh: boolean;
  onTouch: () => void;
  onResolve: (note: string | null) => void;
}) {
  const [resolving, setResolving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);
  const [approving, startApprove] = useTransition();
  const labelAction = item.actions.find(
    (a): a is Extract<TodayAction, { type: "label" }> => a.type === "label",
  );
  // Called on every row (hooks run unconditionally); only a label row starts it.
  const labelling = useStartLabelling(labelAction?.startLabellingJobId ?? "");
  const rowError = approveError ?? labelling.error;
  const href = titleHref(item);

  const approve = (claimId: string) => {
    onTouch();
    setApproveError(null);
    startApprove(async () => {
      const result = await approveClaim(claimId).catch(actionRejected);
      // On success the action's revalidatePath re-renders Today without it.
      if (!result.ok) setApproveError(result.error);
    });
  };

  const title = (
    <span className="truncate text-[13px] font-medium text-[var(--ink-900)]">
      {item.title}
    </span>
  );

  return (
    <div className="py-2">
      <div className={cn(GRID, "min-h-[44px]")}>
        <span className="truncate text-[12px] text-[var(--ink-600)]">
          {item.need}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-2">
            {href ? (
              <Link
                href={href}
                onClick={onTouch}
                className="min-w-0 truncate rounded-[var(--radius-element)] hover:underline"
              >
                {title}
              </Link>
            ) : (
              title
            )}
            {fresh ? (
              <span
                role="img"
                aria-label="New"
                className="size-[5px] shrink-0 rounded-full bg-[var(--blue)]"
              />
            ) : null}
          </span>
          <span className="truncate text-[12px] text-[var(--ink-600)]">
            {item.body}
          </span>
        </span>
        <AgeText
          at={item.since}
          className={cn(
            "truncate text-[12px] whitespace-nowrap tabular-nums",
            fresh
              ? "font-medium text-[var(--ink-900)]"
              : "text-[var(--ink-600)]",
          )}
        />
        <span className="flex items-start justify-end gap-1.5">
          {item.actions.map((action) => {
            const key = `${action.type}:${action.label}`;
            switch (action.type) {
              case "link":
                return (
                  <Link
                    key={key}
                    href={action.href}
                    onClick={onTouch}
                    className={advButton("outline", "sm")}
                  >
                    {action.label}
                  </Link>
                );
              case "approve":
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={approving}
                    onClick={() => approve(action.claimId)}
                    className={advButton("outline", "sm")}
                  >
                    {approving ? "Approving…" : action.label}
                  </button>
                );
              case "label":
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={labelling.isPending}
                    onClick={() => {
                      onTouch();
                      labelling.start();
                    }}
                    className={advButton("outline", "sm")}
                  >
                    {labelling.isPending ? "Opening…" : action.label}
                  </button>
                );
              case "resubmit":
                // The Matches screen's own button: its pending label, its
                // refusal sentence under it, and the refresh on success.
                return (
                  <span key={key} onClickCapture={onTouch}>
                    <ResubmitButton jobId={action.jobId} align="end" />
                  </span>
                );
              case "resolve":
                return (
                  <button
                    key={key}
                    type="button"
                    aria-expanded={resolving}
                    onClick={() => {
                      onTouch();
                      setResolving((open) => !open);
                    }}
                    className={advButton("outline", "sm")}
                  >
                    {action.label}
                  </button>
                );
            }
          })}
        </span>
      </div>
      {rowError ? (
        <p
          role="alert"
          className="mt-1 ml-[156px] text-[12px] leading-[18px] text-[var(--danger)]"
        >
          {rowError}
        </p>
      ) : null}
      {resolving ? (
        <div className="mt-2 ml-[156px] max-w-[520px] pb-2">
          <ResolveForm
            onResolve={onResolve}
            onCancel={() => setResolving(false)}
          />
        </div>
      ) : null}
    </div>
  );
}

/**
 * The hand close for a row that has none of its own (a dead analysis, a
 * flagged match nobody will label, Ask feedback), opened by the row's
 * "Resolve". Quiet on purpose: outline buttons, never a second primary.
 */
function ResolveForm({
  onResolve,
  onCancel,
}: {
  onResolve: (note: string | null) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");
  const noteId = useId();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={noteId} className="text-[12px] text-[var(--ink-600)]">
        Nothing left to do? Resolve it for every admin.
      </label>
      <textarea
        id={noteId}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={500}
        rows={2}
        autoFocus
        placeholder="Note, optional — “player abandoned the upload”"
        className="w-full resize-none rounded-[var(--radius-element)] border border-[var(--border-hairline)] bg-[var(--surface-card)] px-2.5 py-2 text-[13px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-400)] focus-visible:border-[var(--border-medium)]"
      />
      <span className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onResolve(note.trim() || null)}
          className={advButton("outline", "sm")}
        >
          Resolve
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={advButton("ghost", "sm")}
        >
          Cancel
        </button>
      </span>
    </div>
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
        near their hours, support messages and thumbs down on Ask show up here
        when they arrive.
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
      <div className={COLUMN}>
        <h1 className="text-display">Today</h1>
        <PendingBar className="mt-[13px] h-3 w-72" />
        <div className={cn(CARD, "mt-6")}>
          <div className="min-w-[680px] px-6 pt-0.5 pb-1.5">
            <HeaderRow />
            <PendingRegion label="what is waiting on you">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className={cn(GRID, "min-h-[44px] py-2")}>
                  <PendingBar className="h-3 w-20" />
                  <span className="flex flex-col gap-1.5">
                    <PendingBar className="h-3 w-48" />
                    <PendingBar className="h-3 w-64" />
                  </span>
                  <PendingBar className="h-3 w-10" />
                  <span className="flex justify-end gap-1.5">
                    <PendingBar className="h-8 w-16 rounded-[var(--radius-element)]" />
                  </span>
                </div>
              ))}
            </PendingRegion>
          </div>
        </div>
      </div>
    </AdminPage>
  );
}
