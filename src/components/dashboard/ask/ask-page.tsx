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
import { cn } from "@/lib/utils";
import { AskAnswer } from "./ask-answer";
import { AskComposer, type AskQuotaView } from "./ask-composer";
import {
  ASK_COLUMN,
  ASK_GUTTER,
  ASK_SCROLL,
  AskFrame,
  AskIntro,
} from "./ask-frame";
import { AskPrompt } from "./ask-prompt";
import { AskRail } from "./ask-rail";
import { isMacPlatform, isNewQuestionShortcut } from "./ask-shortcut";
import { useAskStream, type AskExchange } from "./use-ask-stream";

/**
 * The personal Ask page, as a chat: earlier questions in a rail on the left,
 * and beside it a thread with the player's prompts on the right and the
 * answers on the left.
 *
 * Three states, decided here and nowhere else:
 *
 * - **no personal match** — the day-zero offer and nothing to type into. A
 *   composer on an account with nothing to ask about would only ever refuse.
 *   No rail either.
 * - **matches, no thread** — nothing asked yet, or "New question" pressed:
 *   the title, one line, and the composer in the upper part of the page.
 * - **a thread** — saved (`?c=<id>`, loaded by the route) or asked in this
 *   visit; the thread scrolls and the composer stays at its foot. The title
 *   is still the page's one `<h1>`, kept for a screen reader only.
 *
 * The composer, the answer, the prompt and the rail are their own files and
 * this shell hands them props; it owns the layout, the thread
 * (`useAskStream`), the URL and the "New question" shortcut.
 *
 * ── The URL ─────────────────────────────────────────────────────────────────
 * The route renders this with `key={conversation?.id ?? "new"}`, so opening
 * another conversation from the server's side starts a fresh thread. A first
 * answer writes `?c=<id>` with `history.replaceState`, not a navigation: the
 * answer is already on screen, and a navigation would re-render the route,
 * change that key and rebuild the thread from the saved row under the
 * reader. "New question" is the opposite case — it clears the thread here and
 * then navigates, so the server drops `?c=` and re-reads the list. The rail
 * owns its button; ⇧⌘O (Ctrl+Shift+O off a Mac) runs the same handler from
 * anywhere on the page, except while an answer is arriving.
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

  // Where the composer is, so "New question" can put the caret in it: with
  // no thread open the button changes nothing else on screen, and a control
  // that visibly does nothing reads as broken.
  const composerBox = useRef<HTMLDivElement>(null);

  function newQuestion() {
    reset();
    // Already at the bare URL when nothing was saved; a push would only add
    // a history entry that goes nowhere.
    if (window.location.search !== "") router.push("/dashboard/ask");
    requestAnimationFrame(() =>
      composerBox.current?.querySelector("textarea")?.focus(),
    );
  }

  // ⇧⌘O / Ctrl+Shift+O. The listener is registered once and reads the
  // latest handler and flight state through a ref, so it never acts on a
  // stale thread.
  const shortcut = useRef({ run: newQuestion, inFlight: state.inFlight });
  useEffect(() => {
    shortcut.current = { run: newQuestion, inFlight: state.inFlight };
  });
  useEffect(() => {
    const mac = isMacPlatform(navigator.platform || navigator.userAgent);
    function onKeyDown(event: KeyboardEvent) {
      if (event.repeat || !isNewQuestionShortcut(event, mac)) return;
      // Ours either way: the browser's own use of the chord must not fire
      // while this page declines it.
      event.preventDefault();
      if (shortcut.current.inFlight) return;
      shortcut.current.run();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const quotaView: AskQuotaView | null = state.usage
    ? { ...state.usage, resetsOn: quota?.resetsOn ?? null }
    : quota;

  const composer = (
    <div ref={composerBox} className="flex flex-col gap-2">
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
          quota={quotaView}
          conversations={listed}
          activeConversationId={state.conversationId}
          onNewQuestion={newQuestion}
          onDeleteConversation={deleteConversation}
          deleteDisabled={state.inFlight}
        />
      }
    >
      {hasThread ? (
        <>
          <h1 className="sr-only">Ask</h1>
          <div className={cn(ASK_SCROLL, ASK_GUTTER, "pt-7 pb-4")}>
            <div className={cn(ASK_COLUMN, "flex flex-col gap-8")}>
              {state.exchanges.map((exchange) => (
                <AskExchangeView key={exchange.id} exchange={exchange} />
              ))}
              <div ref={end} aria-hidden="true" />
            </div>
          </div>
          {/* Outside the scroller, so it holds the foot of the thread area
              while the thread moves above it. */}
          <div className={cn(ASK_GUTTER, "shrink-0 pt-3 pb-6")}>
            <div className={ASK_COLUMN}>{composer}</div>
          </div>
        </>
      ) : (
        <AskIntro
          lead={
            <p className="text-body-sm">
              Answers are computed from your own matches.
            </p>
          }
        >
          {composer}
        </AskIntro>
      )}
    </AskFrame>
  );
}

/**
 * One exchange: the player's prompt against the right edge, what came back
 * on the left. Both in the same column, so an answer's left edge is the
 * column's.
 */
function AskExchangeView({ exchange }: { exchange: AskExchange }) {
  const { question, answer } = exchange;
  return (
    <article className="flex flex-col gap-8">
      <AskPrompt text={question.text} tags={question.tags} />
      <AskAnswer answer={answer} />
    </article>
  );
}
