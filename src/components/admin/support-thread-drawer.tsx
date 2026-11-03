"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import {
  openSupportThread,
  sendStaffMessage,
  type OpenSupportThreadResult,
} from "@/app/admin/messages/actions";
import { timeLabel, useIsClient } from "@/components/admin/admin-cells";
import { firstName } from "@/components/admin/messages-table";
import { PendingBar } from "@/components/dashboard/loading/pending";
import { PeekDrawerFrame } from "@/components/dashboard/matches/match-drawer";
import { Checkbox } from "@/components/ui/checkbox";
import type { AdminSupportThreadRow } from "@/lib/data/support-admin-server";
import {
  STAFF_NAME_FALLBACK,
  SUPPORT_MESSAGE_MAX,
  browserTimeZone,
  dayHeading,
  foldOlderDays,
  topicLabel,
  type AdminSupportMessage,
} from "@/lib/data/support-view";
import { advButton } from "@/lib/ui/adv-button";
import { advField } from "@/lib/ui/adv-field";
import { cn } from "@/lib/utils";

/**
 * The Admin › Messages peek drawer (Player Messaging canvas, artboards 4 and
 * 5): one player's thread, read whole, with the reply composer pinned below.
 *
 * The shell is `PeekDrawerFrame` (kind "Thread"): ↑ ↓ stepping, the counter,
 * the close. Opening a thread calls `openSupportThread`, which reads it and
 * stamps `staff_read_at` in one round trip.
 *
 * The body runs oldest first, grouped under a day label (`eyebrow-sm`). Days
 * before yesterday fold behind "Show N earlier" (`foldOlderDays`, in the
 * viewer's own zone). The player's messages sit flush left; staff replies are
 * set in an inset well, indented, and say "Read" once the player opened the
 * thread after them (`player_read_at ≥ created_at`); event rows are one grey
 * 11px line. A match-linked message carries "Open the match", to the admin
 * match page — the label console is keyed by session, not by match.
 *
 * The footer pins the reply: a boxed textarea, "Also email a copy" (checked
 * by default) and the primary Send, which calls `sendStaffMessage` and
 * appends the reply here without a reload.
 */
export function SupportThreadDrawer({
  row,
  viewerId,
  index,
  total,
  closing,
  autoFocus,
  onPrev,
  onNext,
  onClose,
  onClosed,
  onSent,
}: {
  row: AdminSupportThreadRow;
  /** The signed-in admin: their own replies read "You". */
  viewerId: string;
  index: number;
  total: number;
  closing: boolean;
  autoFocus: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onClosed: () => void;
  /** A reply landed in this thread, at this moment. */
  onSent: (threadId: string, sentAt: string) => void;
}) {
  const threadId = row.threadId;
  const playerFirst = firstName(row.playerName);

  // What the server answered, tagged with the thread it is for, so stepping
  // to the next thread never shows the last one's messages.
  const [loaded, setLoaded] = useState<{
    threadId: string;
    result: OpenSupportThreadResult;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Per-thread composer state, reset when the drawer steps to another thread
  // (the "adjust state while rendering" pattern, not an effect).
  const [forThread, setForThread] = useState(threadId);
  const [draft, setDraft] = useState("");
  const [emailCopy, setEmailCopy] = useState(true);
  const [showEarlier, setShowEarlier] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sentNote, setSentNote] = useState<string | null>(null);
  if (forThread !== threadId) {
    setForThread(threadId);
    setDraft("");
    setEmailCopy(true);
    setShowEarlier(false);
    setSendError(null);
    setSentNote(null);
  }

  useEffect(() => {
    let cancelled = false;
    openSupportThread(threadId)
      .then((result) => {
        if (!cancelled) setLoaded({ threadId, result });
      })
      .catch(() => {
        if (!cancelled) {
          setLoaded({
            threadId,
            result: {
              ok: false,
              error: "This thread didn't load. Please try again.",
            },
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [threadId, attempt]);

  const result = loaded?.threadId === threadId ? loaded.result : null;
  const detail = result?.ok ? result.detail : null;
  const messages = detail?.messages ?? [];

  // Keep the newest message in view as the thread loads and grows.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [threadId, messages.length]);

  async function send() {
    const body = draft.trim();
    if (body === "" || sending) return;
    setSending(true);
    setSendError(null);
    setSentNote(null);
    const forId = threadId;
    try {
      const answer = await sendStaffMessage({
        threadId: forId,
        body,
        emailCopy,
      });
      if (!answer.ok) {
        setSendError(answer.error);
        return;
      }
      const sentAt = new Date().toISOString();
      const message: AdminSupportMessage = {
        id: answer.messageId,
        authorId: viewerId,
        authorRole: "staff",
        authorName: null,
        body,
        topic: null,
        matchId: null,
        emailCopySentAt: answer.emailed ? sentAt : null,
        createdAt: sentAt,
      };
      setLoaded((current) =>
        current?.threadId === forId && current.result.ok
          ? {
              threadId: forId,
              result: {
                ok: true,
                detail: {
                  ...current.result.detail,
                  messages: [...current.result.detail.messages, message],
                },
              },
            }
          : current,
      );
      setDraft("");
      if (emailCopy && !answer.emailed) {
        setSentNote(
          "Sent in the app. The email copy didn't go out, so the player will see it next time they sign in.",
        );
      }
      onSent(forId, sentAt);
    } catch {
      setSendError("Your reply didn't send. Please try again.");
    } finally {
      setSending(false);
    }
  }

  const canSend = draft.trim() !== "" && !sending && detail !== null;

  return (
    <PeekDrawerFrame
      kind="Thread"
      label={`${row.playerName}, messages`}
      index={index}
      total={total}
      canPrev={index > 0}
      canNext={index < total - 1}
      closing={closing}
      autoFocus={autoFocus}
      focusKey={threadId}
      onPrev={onPrev}
      onNext={onNext}
      onClose={onClose}
      onClosed={onClosed}
      footer={
        <>
          <label htmlFor="support-reply" className="sr-only">
            Reply to {playerFirst}
          </label>
          <textarea
            id="support-reply"
            rows={3}
            value={draft}
            maxLength={SUPPORT_MESSAGE_MAX}
            placeholder={`Reply to ${playerFirst}`}
            disabled={detail === null}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                (event.metaKey || event.ctrlKey) &&
                canSend
              ) {
                event.preventDefault();
                void send();
              }
            }}
            className={cn(
              advField("boxed", "md"),
              "h-auto min-h-[84px] resize-none py-2 leading-[1.5]",
            )}
          />
          <div className="flex items-center gap-3">
            <label className="flex flex-1 cursor-pointer items-center gap-2 text-[12px] text-[var(--ink-700)]">
              <Checkbox
                checked={emailCopy}
                onChange={setEmailCopy}
                disabled={sending}
              />
              Also email a copy
            </label>
            <button
              type="button"
              disabled={!canSend}
              onClick={() => void send()}
              className={advButton("primary", "sm")}
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
          {sendError ? (
            <p role="alert" className="text-[11px] text-[var(--danger)]">
              {sendError}
            </p>
          ) : sentNote ? (
            <p role="status" className="text-[11px] text-[var(--ink-600)]">
              {sentNote}
            </p>
          ) : null}
        </>
      }
    >
      <div
        ref={bodyRef}
        className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto border-b border-[var(--border-hairline)] px-[22px] pt-5 pb-[22px]"
      >
        <h2 className="text-[16px] leading-[1.3] font-medium break-words text-[var(--ink-900)]">
          {row.playerName}
        </h2>

        {result === null ? (
          <ThreadSkeleton />
        ) : !result.ok ? (
          <div role="alert" className="flex flex-col items-start gap-2">
            <p className="text-[12px] text-[var(--ink-700)]">{result.error}</p>
            <button
              type="button"
              onClick={() => {
                setLoaded(null);
                setAttempt((n) => n + 1);
              }}
              className={advButton("ghost", "sm")}
            >
              Try again
            </button>
          </div>
        ) : messages.length === 0 ? (
          <p className="text-[12px] text-[var(--ink-600)]">
            No messages yet. Write the first one below.
          </p>
        ) : (
          <ThreadMessages
            messages={messages}
            playerFirst={playerFirst}
            playerReadAt={result.detail.thread.playerReadAt}
            viewerId={viewerId}
            showEarlier={showEarlier}
            onShowEarlier={() => setShowEarlier(true)}
          />
        )}
      </div>
    </PeekDrawerFrame>
  );
}

function ThreadSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <PendingBar className="h-3 w-24" />
          <PendingBar className="h-3 w-full" />
          <PendingBar className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

function ThreadMessages({
  messages,
  playerFirst,
  playerReadAt,
  viewerId,
  showEarlier,
  onShowEarlier,
}: {
  messages: AdminSupportMessage[];
  playerFirst: string;
  playerReadAt: string | null;
  viewerId: string;
  showEarlier: boolean;
  onShowEarlier: () => void;
}) {
  // Days and times are the viewer's own; the server has no zone to agree on,
  // so they print only once the browser has taken over.
  const isClient = useIsClient();
  if (!isClient) return <ThreadSkeleton />;

  const zone = browserTimeZone();
  const { earlier, recent } = foldOlderDays(messages, new Date(), zone);
  const visible = showEarlier ? messages : recent;
  const readMs = playerReadAt ? Date.parse(playerReadAt) : NaN;

  const days = visible.map((message) => dayHeading(message.createdAt, zone));
  return (
    <>
      {!showEarlier && earlier.length > 0 ? (
        <button
          type="button"
          onClick={onShowEarlier}
          className="cursor-pointer self-start text-[12px] text-[var(--ink-600)] transition-colors duration-200 hover:text-[var(--ink-900)]"
        >
          Show {earlier.length} earlier · From{" "}
          {dayHeading(earlier[0].createdAt, zone)}
        </button>
      ) : null}
      {visible.map((message, i) => {
        // A day label over the first message of each day.
        const heading = i === 0 || days[i] !== days[i - 1] ? days[i] : null;
        return (
          <div key={message.id} className="contents">
            {heading ? (
              <h3 className="eyebrow-sm mt-1 -mb-2">{heading}</h3>
            ) : null}
            <ThreadMessage
              message={message}
              playerFirst={playerFirst}
              viewerId={viewerId}
              readMs={readMs}
            />
          </div>
        );
      })}
    </>
  );
}

function ThreadMessage({
  message,
  playerFirst,
  viewerId,
  readMs,
}: {
  message: AdminSupportMessage;
  playerFirst: string;
  viewerId: string;
  readMs: number;
}) {
  const at = new Date(message.createdAt);
  const time = Number.isNaN(at.getTime()) ? "" : timeLabel(at);

  if (message.authorRole === "event") {
    return (
      <p className="flex items-start gap-2 text-[11px] leading-[1.5] text-[var(--ink-500)]">
        <Info
          className="mt-[2px] size-3 shrink-0"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <span className="min-w-0 break-words">
          {message.body}
          {time ? ` · ${time}` : ""}
        </span>
      </p>
    );
  }

  const staff = message.authorRole === "staff";
  const author = staff
    ? message.authorId === viewerId
      ? "You"
      : message.authorName || STAFF_NAME_FALLBACK
    : playerFirst;
  const topic = staff ? null : topicLabel(message.topic);
  const read =
    staff && !Number.isNaN(readMs) && readMs >= at.getTime()
      ? `Read ${timeLabel(new Date(readMs))}`
      : null;
  const meta = [
    staff && message.emailCopySentAt ? "Emailed a copy" : null,
    read,
  ].filter(Boolean);

  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        staff &&
          "ml-6 rounded-[var(--radius-button)] bg-[var(--surface-page)] px-3 py-2.5",
      )}
    >
      <div className="flex min-w-0 items-baseline gap-1.5">
        <span className="shrink-0 text-[12px] font-medium text-[var(--ink-900)]">
          {author}
        </span>
        <span className="text-[11px] whitespace-nowrap text-[var(--ink-500)] tabular-nums">
          {time}
        </span>
        {topic ? (
          <span className="truncate text-[11px] text-[var(--ink-500)]">
            · {topic}
          </span>
        ) : null}
      </div>
      <p className="text-[13px] leading-[1.55] break-words whitespace-pre-wrap text-[var(--ink-900)]">
        {message.body}
      </p>
      {message.matchId ? (
        <Link
          href={`/admin/matches/${message.matchId}`}
          className={cn(advButton("ghost", "sm"), "mt-1 self-start")}
        >
          Open the match
        </Link>
      ) : null}
      {meta.length > 0 ? (
        <span className="text-[11px] text-[var(--ink-500)]">
          {meta.join(" · ")}
        </span>
      ) : null}
    </div>
  );
}
