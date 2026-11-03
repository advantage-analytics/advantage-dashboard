"use client";

import { useEffect, useRef, useState } from "react";
import { RosterDialog } from "@/components/dashboard/team/dialog-shell";
import { PendingBar } from "@/components/dashboard/loading/pending";
import { MenuSelect, type MenuOption } from "@/components/ui/menu-select";
import { DialogProblem } from "@/components/ui/dialog-problem";
import type { SupportMatchOption } from "@/lib/data/support-server";
import {
  STAFF_NAME_FALLBACK,
  browserTimeZone,
  dayHeading,
  foldOlderDays,
  type SupportMessage,
  type SupportThread,
  type SupportTopic,
} from "@/lib/data/support-view";
import { advButton } from "@/lib/ui/adv-button";
import { advField } from "@/lib/ui/adv-field";
import { cn } from "@/lib/utils";

/**
 * "Message Advantage" — the player's one conversation with the people
 * building the product (canvas artboards 3, 6, 7 and 8).
 *
 * Presentational: it is handed what the mount loaded and a `send` callback,
 * and owns only the draft, the About choice, the refusal line and the fold.
 * The mount (`support-dialog-mount.tsx`) owns the URL, the server actions,
 * the mark-read and PostHog — so this file renders offline in
 * `tests/support-dialog.spec.ts` with nothing but its two primitives stubbed.
 *
 * Two bodies under one title. With no thread yet it is a compose form: an
 * optional "About" `MenuSelect` (the viewer's five newest matches, then the
 * fixed topics) over the message. With a thread it is the conversation —
 * days older than yesterday folded behind "Show N earlier" — and a reply box.
 * A refusal (rate limit, a match that is not theirs) prints as its sentence
 * under the textarea and the draft stays where it was.
 */

export const SUPPORT_DIALOG_TITLE = "Message Advantage";
export const SUPPORT_DIALOG_DESCRIPTION =
  "Goes straight to the people building Advantage. We answer here, and you'll see it in Activity.";

/** The About menu's fixed half, in the order the canvas draws it. */
const OTHER_TOPICS: {
  topic: Exclude<SupportTopic, "match">;
  label: string;
  description?: string;
  teamOnly?: boolean;
}[] = [
  {
    topic: "upload",
    label: "Uploading a video",
    description: "A stuck upload, or a question about format",
  },
  {
    topic: "billing",
    label: "Plan and billing",
    description: "Pro, credit packs, receipts",
  },
  { topic: "team", label: "My team", teamOnly: true },
  {
    topic: "idea",
    label: "An idea or request",
    description: "Something you'd like Advantage to do",
  },
  { topic: "other", label: "Something else" },
];

const MATCH_PREFIX = "match:";

/**
 * The About menu's options: group "Your matches" (label, then the day and
 * score as its second line), then group "Something else". "My team" only in
 * a team workspace — a personal one has no team to ask about.
 */
export function supportAboutOptions(
  matches: readonly SupportMatchOption[],
  isTeamWorkspace: boolean,
): MenuOption<string>[] {
  const matchOptions = matches.map((match) => ({
    value: `${MATCH_PREFIX}${match.id}`,
    label: match.label,
    description:
      [match.dayLabel, match.scoreText].filter(Boolean).join(" · ") ||
      undefined,
    group: "Your matches",
  }));
  const others = OTHER_TOPICS.filter(
    (item) => !item.teamOnly || isTeamWorkspace,
  ).map((item) => ({
    value: item.topic,
    label: item.label,
    description: item.description,
    group: "Something else",
  }));
  return [...matchOptions, ...others];
}

/** An About value back to what `sendPlayerMessage` takes. Nothing chosen → no topic. */
export function supportSelection(value: string | undefined): {
  topic: SupportTopic | null;
  matchId: string | null;
} {
  if (!value) return { topic: null, matchId: null };
  if (value.startsWith(MATCH_PREFIX)) {
    return { topic: "match", matchId: value.slice(MATCH_PREFIX.length) };
  }
  const known = OTHER_TOPICS.find((item) => item.topic === value);
  return { topic: known ? known.topic : null, matchId: null };
}

export type SupportDialogState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | {
      status: "ready";
      thread: SupportThread | null;
      messages: SupportMessage[];
      matches: SupportMatchOption[];
    };

export type SupportSendResult = { ok: true } | { ok: false; error: string };

export function SupportThreadDialog({
  open,
  onOpenChange,
  state,
  isTeamWorkspace,
  onSend,
  now,
  timeZone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: SupportDialogState;
  isTeamWorkspace: boolean;
  /** Resolves once the action answered; the dialog clears the draft on `ok`. */
  onSend: (input: {
    body: string;
    topic: SupportTopic | null;
    matchId: string | null;
  }) => Promise<SupportSendResult>;
  /** Today, for the fold. Defaults to the clock; the spec pins it. */
  now?: Date;
  /** The zone days and times print in. Defaults to the browser's. */
  timeZone?: string;
}) {
  const [draft, setDraft] = useState("");
  const [about, setAbout] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [showEarlier, setShowEarlier] = useState(false);

  const hasThread = state.status === "ready" && state.thread !== null;
  const loading = state.status === "loading";

  async function send() {
    if (pending || loading) return;
    if (draft.trim() === "") {
      setError("Write a message before sending.");
      return;
    }
    setPending(true);
    setError(null);
    // A reply carries no topic: the thread already says what it is about.
    const selection = hasThread
      ? { topic: null, matchId: null }
      : supportSelection(about);
    const result = await onSend({ body: draft, ...selection });
    setPending(false);
    if (result.ok) {
      setDraft("");
      setAbout(undefined);
    } else {
      setError(result.error);
    }
  }

  function close(next: boolean) {
    if (!next) {
      // A refusal belongs to the attempt it answered, not to the next visit.
      setError(null);
      setShowEarlier(false);
    }
    onOpenChange(next);
  }

  const textareaId = hasThread ? "support-reply" : "support-message";

  const field = (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={textareaId}
        className={cn(
          "text-[12px] leading-[1.5] text-[var(--ink-700)]",
          hasThread && "sr-only",
        )}
      >
        {hasThread ? "Your reply" : "Message"}
      </label>
      <textarea
        id={textareaId}
        rows={hasThread ? 3 : 4}
        value={draft}
        disabled={loading}
        onChange={(event) => {
          setDraft(event.target.value);
          if (error) setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void send();
          }
        }}
        placeholder={
          hasThread
            ? "Write a reply"
            : "What happened, or what would make Advantage better"
        }
        className={cn(
          advField("boxed", "md"),
          "h-auto w-full resize-none py-2 leading-[1.5]",
        )}
      />
      <DialogProblem message={error} />
    </div>
  );

  return (
    <RosterDialog
      open={open}
      onOpenChange={close}
      title={SUPPORT_DIALOG_TITLE}
      description={SUPPORT_DIALOG_DESCRIPTION}
      width={520}
      footer={
        <>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => close(false)}
            className={advButton("outline", "sm")}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void send()}
            disabled={pending || loading}
            className={advButton("primary", "sm")}
          >
            {pending ? "Sending…" : "Send"}
          </button>
        </>
      }
    >
      {state.status === "loading" ? (
        <ThreadSkeleton />
      ) : hasThread && state.status === "ready" ? (
        <ThreadMessages
          messages={state.messages}
          showEarlier={showEarlier}
          onShowEarlier={() => setShowEarlier(true)}
          now={now}
          timeZone={timeZone}
        />
      ) : (
        <>
          {state.status === "error" ? (
            <DialogProblem message={state.error} />
          ) : null}
          <div className="flex flex-col gap-2">
            <span
              id="support-about-label"
              className="text-[12px] leading-[1.5] text-[var(--ink-700)]"
            >
              About <span className="text-[var(--ink-400)]">· optional</span>
            </span>
            <MenuSelect
              label="About"
              value={about}
              onChange={setAbout}
              options={supportAboutOptions(
                state.status === "ready" ? state.matches : [],
                isTeamWorkspace,
              )}
              placeholder="Choose one"
              variant="pill"
              width="trigger"
              align="start"
              // Five matches and five topics outgrow a laptop window under
              // the dialog; cap it and scroll rather than run off-screen.
              scroll
              className="w-full"
            />
          </div>
        </>
      )}
      {field}
    </RosterDialog>
  );
}

function ThreadSkeleton() {
  return (
    <div
      className="flex flex-col gap-5"
      role="status"
      aria-label="Loading messages"
    >
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-2" aria-hidden="true">
          <PendingBar className="h-3 w-24" />
          <PendingBar className="h-3 w-full" />
          <PendingBar className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

function timeOf(at: string, timeZone: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
}

/**
 * The conversation, oldest first, in a capped scroll well that starts at the
 * newest message. Days and times are the viewer's: the dialog only ever
 * renders after a client-side load, so there is no server render to disagree
 * with.
 */
function ThreadMessages({
  messages,
  showEarlier,
  onShowEarlier,
  now,
  timeZone,
}: {
  messages: SupportMessage[];
  showEarlier: boolean;
  onShowEarlier: () => void;
  now?: Date;
  timeZone?: string;
}) {
  const zone = timeZone ?? browserTimeZone();
  const { earlier, recent } = foldOlderDays(messages, now ?? new Date(), zone);
  const visible = showEarlier ? messages : recent;
  const days = visible.map((message) => dayHeading(message.createdAt, zone));

  const wellRef = useRef<HTMLDivElement>(null);
  const lastId = messages[messages.length - 1]?.id;
  // Land on the newest message, and follow a reply as it arrives. Unfolding
  // the earlier days keeps the reader where they were.
  useEffect(() => {
    const well = wellRef.current;
    if (well) well.scrollTop = well.scrollHeight;
  }, [lastId]);

  return (
    <div
      ref={wellRef}
      className="-mx-6 flex max-h-[min(380px,50vh)] flex-col gap-[18px] overflow-y-auto border-y border-[var(--border-hairline)] px-6 py-[18px]"
    >
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
        const heading = i === 0 || days[i] !== days[i - 1] ? days[i] : null;
        return (
          <div key={message.id} className="contents">
            {heading ? (
              <h3 className="eyebrow-sm mt-1 -mb-2">{heading}</h3>
            ) : null}
            <ThreadMessage message={message} timeZone={zone} />
          </div>
        );
      })}
    </div>
  );
}

function ThreadMessage({
  message,
  timeZone,
}: {
  message: SupportMessage;
  timeZone: string;
}) {
  const time = timeOf(message.createdAt, timeZone);

  if (message.authorRole === "event") {
    return (
      <p className="text-[11px] leading-[1.5] text-[var(--ink-500)]">
        {message.body}
        {time ? ` · ${time}` : ""}
      </p>
    );
  }

  // "Cj at Advantage"; a staff row whose name was never snapshotted reads as
  // the brand alone, not "Advantage at Advantage".
  const staffName = message.authorName?.trim();
  const author =
    message.authorRole === "staff"
      ? staffName
        ? `${staffName} at Advantage`
        : STAFF_NAME_FALLBACK
      : "You";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-w-0 items-baseline gap-1.5">
        <span className="shrink-0 text-[12px] font-medium text-[var(--ink-900)]">
          {author}
        </span>
        <span className="text-[11px] whitespace-nowrap text-[var(--ink-500)] tabular-nums">
          {time}
        </span>
      </div>
      <p className="text-[13px] leading-[1.55] break-words whitespace-pre-wrap text-[var(--ink-900)]">
        {message.body}
      </p>
    </div>
  );
}
