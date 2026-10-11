"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteAskConversation } from "@/app/dashboard/ask/actions";
import { DayZeroOffer } from "@/components/dashboard/home/day-zero-offer";
import type {
  AskConversation,
  AskConversationSummary,
  AskQuota,
} from "@/lib/data/ask-server";
import type { AskTagOptions } from "@/lib/data/ask-tags";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import { AskAnswer } from "./ask-answer";
import { AskComposer, type AskQuotaView } from "./ask-composer";
import { ASK_COLUMN, AskFrame } from "./ask-frame";
import { AskRail } from "./ask-rail";
import { useAskStream, type AskExchange } from "./use-ask-stream";

/**
 * The personal Ask page: a thread of questions and answers, the composer, and
 * a right rail.
 *
 * Three states, decided here and nowhere else:
 *
 * - **no personal match** — the day-zero offer and nothing to type into. A
 *   composer on an account with nothing to ask about would only ever refuse.
 * - **matches, nothing asked** — the composer alone under the title.
 * - **a thread** — saved (`?c=<id>`, loaded by the route) or asked in this
 *   visit; the composer drops to the foot of the column and stays in view.
 *
 * The composer, the answer and the rail are their own files and this shell
 * hands them props; it owns the layout, the thread (`useAskStream`) and the
 * URL.
 *
 * ── The URL ─────────────────────────────────────────────────────────────────
 * The route renders this with `key={conversation?.id ?? "new"}`, so opening
 * another conversation from the server's side starts a fresh thread. A first
 * answer writes `?c=<id>` with `history.replaceState`, not a navigation: the
 * answer is already on screen, and a navigation would re-render the route,
 * change that key and rebuild the thread from the saved row under the
 * reader. "New question" is the opposite case — it clears the thread here and
 * then navigates, so the server drops `?c=` and re-reads the list.
 *
 * ── Deleting a conversation ─────────────────────────────────────────────────
 * The rail's row action calls `deleteAskConversation`, which revalidates this
 * route, so the list comes back from the server without the row. That same
 * re-render reads the address bar: after a first answer it says `?c=<id>`
 * while the key is still "new", so the key changes and the thread is rebuilt
 * from the saved row. Harmless once an answer is saved — it is the same
 * answer — and not while one is arriving, so the action is disabled for as
 * long as a stream is in flight. Deleting the conversation that is open
 * clears the thread and leaves for the bare URL: its id no longer names
 * anything, and a follow-up sent to it could not be saved.
 */
export interface AskPageProps {
  /** What can be tagged. No matches here is the page's day zero. */
  tagOptions: AskTagOptions;
  /** Null when the count could not be read. */
  quota: AskQuota | null;
  /** Saved conversations, most recently used first. */
  conversations: AskConversationSummary[];
  /** The conversation `?c=` names, or null when it names none of the viewer's. */
  conversation: AskConversation | null;
}

export function AskPage(props: AskPageProps) {
  if (props.tagOptions.matches.length === 0) return <AskDayZero />;
  return <AskThread {...props} />;
}

/**
 * No personal match yet. The same offer Home and Matches make — one sentence,
 * the pair of ways in (both to `/dashboard/matches/new`), the conditions —
 * with this page's own sentence. No composer and no rail: there is nothing to
 * ask about, nothing tagged and no count worth showing, and a dimmed mock-up
 * of a thread would be an invented answer.
 */
function AskDayZero() {
  return (
    <div className="flex w-full flex-1 bg-[var(--surface-card)]">
      <div className="flex min-w-0 flex-1 flex-col px-14 pt-5 pb-6">
        <h1 className="sr-only">Ask</h1>
        <DayZeroOffer
          headline="Send a match, then ask anything about it."
          headlineMeasure="24ch"
        />
      </div>
    </div>
  );
}

function AskThread({
  tagOptions,
  quota,
  conversations,
  conversation,
}: AskPageProps) {
  const router = useRouter();
  const { state, setDraft, ask, reset } = useAskStream({
    conversationId: conversation?.id ?? null,
    messages: conversation?.messages ?? [],
  });

  // The conversation a first answer just created, for "Earlier questions".
  // The server's list is the truth and this only covers the gap until the
  // route next renders: it is shown while `conversations` is still the very
  // array it was added against, so a later render — after a delete, say —
  // can never bring back a row the server no longer lists.
  const [created, setCreated] = useState<{
    summary: AskConversationSummary;
    against: AskConversationSummary[];
  } | null>(null);
  const listed =
    created &&
    created.against === conversations &&
    !conversations.some((row) => row.id === created.summary.id)
      ? [created.summary, ...conversations]
      : conversations;

  const hasThread = state.exchanges.length > 0;

  // A question that was just sent should be on screen, not below the fold of
  // a long thread. Only on growth: a saved conversation opens at its top.
  const end = useRef<HTMLDivElement>(null);
  const seen = useRef(state.exchanges.length);
  useEffect(() => {
    if (state.exchanges.length > seen.current) {
      end.current?.scrollIntoView({ block: "end" });
    }
    seen.current = state.exchanges.length;
  }, [state.exchanges.length]);

  async function send() {
    const first = state.conversationId === null;
    const title = state.draft.text.trim();
    const outcome = await ask();
    if (outcome?.status !== "done" || !first) return;

    window.history.replaceState(
      null,
      "",
      `/dashboard/ask?c=${encodeURIComponent(outcome.conversationId)}`,
    );
    setCreated({
      summary: {
        id: outcome.conversationId,
        title,
        updatedAt: new Date().toISOString(),
      },
      against: conversations,
    });
  }

  async function deleteConversation(id: string) {
    const result = await deleteAskConversation(id);
    if (!result.ok) return false;
    if (id === state.conversationId) {
      reset();
      router.replace("/dashboard/ask");
    }
    return true;
  }

  function newQuestion() {
    reset();
    // Already at the bare URL when nothing was saved; a push would only add
    // a history entry that goes nowhere.
    if (window.location.search !== "") router.push("/dashboard/ask");
  }

  const quotaView: AskQuotaView | null = state.usage
    ? { ...state.usage, resetsOn: quota?.resetsOn ?? null }
    : quota;

  const title = conversation?.title ?? state.exchanges[0]?.question.text;

  const composer = (
    <div className="flex flex-col gap-2">
      {state.refusal && (
        <p
          role="alert"
          className="rounded-[var(--radius-button)] border border-[var(--danger-border)] bg-[var(--danger-bg)] px-3 py-2 text-[12px] text-[var(--danger-text)]"
        >
          {state.refusal.message}
        </p>
      )}
      <AskComposer
        value={state.draft}
        onChange={setDraft}
        onSubmit={send}
        tagOptions={tagOptions}
        quota={quotaView}
        pending={state.inFlight}
      />
    </div>
  );

  return (
    <AskFrame
      rail={
        <AskRail
          tags={
            state.draft.tags.length > 0
              ? state.draft.tags
              : (state.exchanges.at(-1)?.question.tags ?? [])
          }
          tagOptions={tagOptions}
          quota={quotaView}
          conversations={listed}
          activeConversationId={state.conversationId}
          onDeleteConversation={deleteConversation}
          deleteDisabled={state.inFlight}
        />
      }
    >
      <div className="flex flex-wrap items-end gap-2.5">
        <div className="min-w-0 flex-1">
          <h1 className="text-display">Ask</h1>
          <div className="mt-[9px] flex h-[18px] items-baseline">
            <span className="text-body-sm truncate">
              {hasThread && title
                ? title
                : "Answers are computed from your own matches."}
            </span>
          </div>
        </div>
        {/* Offered once there is a thread to leave; before that it would be a
            button that does nothing. */}
        {hasThread && (
          <button
            type="button"
            onClick={newQuestion}
            className={advButton("ghost")}
          >
            New question
          </button>
        )}
      </div>

      {hasThread ? (
        <>
          <div className={cn(ASK_COLUMN, "flex flex-col gap-7")}>
            {state.exchanges.map((exchange) => (
              <AskExchangeView key={exchange.id} exchange={exchange} />
            ))}
            <div ref={end} aria-hidden="true" />
          </div>
          {/* The composer rides the foot of the scroll area, on the page's own
              white so the thread passes under it cleanly. */}
          <div
            className={cn(
              ASK_COLUMN,
              "sticky bottom-0 mt-auto bg-[var(--surface-card)] pt-3 pb-8",
            )}
          >
            {composer}
          </div>
        </>
      ) : (
        <div className={cn(ASK_COLUMN, "pb-8")}>{composer}</div>
      )}
    </AskFrame>
  );
}

/** One question and what came back. The question is the shell's to draw. */
function AskExchangeView({ exchange }: { exchange: AskExchange }) {
  const { question, answer } = exchange;
  return (
    <article className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {/* `text-data` is unlayered and would beat a `font-medium` utility,
            so the weight is set inline. */}
        <h2
          className="text-data whitespace-pre-wrap"
          style={{ fontWeight: 500 }}
        >
          {question.text}
        </h2>
        {question.tags.length > 0 && (
          <ul aria-label="Tagged" className="flex flex-wrap gap-1.5">
            {question.tags.map((tag) => (
              <li
                key={`${tag.kind}:${tag.id}`}
                className="flex h-[22px] items-center rounded-[var(--radius-button)] bg-[var(--surface-subtle)] px-2 text-[12px] text-[var(--ink-700)]"
              >
                {tag.label}
              </li>
            ))}
          </ul>
        )}
      </div>
      <AskAnswer answer={answer} />
    </article>
  );
}
