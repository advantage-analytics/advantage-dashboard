"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  deleteAskConversation,
  pinAskAnswer,
  renameAskConversation,
  setAskConversationPinned,
  unpinAskAnswer,
} from "@/app/dashboard/ask/actions";
import { createSavedView } from "@/app/dashboard/matches/(detail)/[matchId]/saved-views-actions";
import {
  DayZeroOffer,
  MatchOfferActions,
} from "@/components/dashboard/home/day-zero-offer";
import { WIZARD_FROM_ASK_HREF } from "@/lib/matches/new-match-visit";
import type {
  AskConversation,
  AskConversationSummary,
  AskQuota,
} from "@/lib/data/ask-server";
import type { AskTagOptions } from "@/lib/data/ask-tags";
import type { AskFeedback } from "@/lib/services/ask/feedback";
import {
  askActionsFor,
  type AskSavedViewDraft,
} from "@/lib/services/ask/actions";
import {
  askBasePath,
  askScopeProgramId,
  type AskScope,
} from "@/lib/services/ask/scope";
import { askFollowUps, type AskStarter } from "@/lib/services/ask/starters";
import { askTitle } from "@/lib/services/ask/titles";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import {
  AskActionCards,
  type AskPinOutcome,
  type AskSaveViewOutcome,
} from "./ask-actions";
import { AskAnswer } from "./ask-answer";
import { askCopy, askDayZeroCopy } from "./ask-copy";
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
import { isNewQuestionShortcut, readIsMac } from "./ask-shortcut";
import { AskStarters } from "./ask-starters";
import { useAskStream, type AskExchange, type AskTag } from "./use-ask-stream";

/**
 * The Ask page, as a chat: earlier questions in a rail on the left, and
 * beside it a thread with the asker's prompts on the right and the answers on
 * the left.
 *
 * One page for two scopes (`AskScope`). Personal is a player asking about
 * their own matches at `/dashboard/ask`. Team is any member of a program —
 * owner, coach, staff or player — asking about the program's matches at
 * `/dashboard/team/ask`; the answers name players in the third person. The
 * scope decides four things and nothing else: which page the URLs point at
 * (`askBasePath`), whether the request names a program, what can be tagged
 * (a team has players), and the sentences that would otherwise say "your
 * matches" (`ask-copy.ts`). The question limit and the list of earlier
 * questions are the asker's own in both.
 *
 * Three states, decided here and nowhere else:
 *
 * - **no match in scope** — the day-zero offer and nothing to type into. A
 *   composer with nothing to ask about would only ever refuse. No rail
 *   either.
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
 * A first answer also names the conversation: `ask_save_exchange()` titles
 * it after the whole question, and the page renames it to the question's
 * first clause (`askTitle`) without a re-render — the list carries the
 * short title on its next read, and `created` carries it until then.
 *
 * ── Arriving with a tag ─────────────────────────────────────────────────────
 * `?match=`, `?opponent=` and (team) `?player=` — "Ask about this match"
 * from a match page, a profile or an opponent's drawer — arrive as
 * `initialTags`, already checked by the route against what can be tagged,
 * and are put on the composer's draft once, when no thread is open.
 *
 * ── Under an answer ─────────────────────────────────────────────────────────
 * What the answer offers to do next (`askActionsFor`, the catalogue of
 * roadmap 6.4) is drawn as cards under it. The page wires the two that
 * write — pin to Home, save a view — to the server actions; the cards do
 * nothing until clicked. Which answers already have a pin comes with the
 * saved conversation (`AskConversationMessage.pinId`).
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
  /** Whose matches are asked about, and so which page this is. */
  scope: AskScope;
  /**
   * Team scope only: `canUploadForProgram()` for this viewer, so the day-zero
   * offer never shows a button that refuses on the next page. Not read on
   * the personal page, where the viewer can always send their own match.
   */
  canUpload?: boolean;
  /**
   * The active workspace's IANA zone (`Workspace.timeZone`), which the rail
   * dates earlier questions in. A string from the server, so the server's
   * render and the browser's agree; UTC when omitted.
   */
  timeZone?: string;
  /** What can be tagged. No matches here is the page's day zero. */
  tagOptions: AskTagOptions;
  /**
   * Questions to ask with one click, built by the route from the same tag
   * options (`askStarters()`); shown under an empty composer. None when
   * omitted.
   */
  starters?: AskStarter[];
  /** Null when the count could not be read. */
  quota: AskQuota | null;
  /** Saved conversations, most recently used first. */
  conversations: AskConversationSummary[];
  /** The conversation `?c=` names, or null when it names none of the viewer's. */
  conversation: AskConversation | null;
  /**
   * The match the wizard just sent (`?sent=`, from `askReturnHref()`) while
   * it still has no statistics: the intro says it is on its way. Null or
   * omitted otherwise, including once its first answer is in the rail.
   */
  sentMatchId?: string | null;
  /**
   * Tags the route read off the address bar (`?match=`, `?opponent=`,
   * `?player=`), each already one of `tagOptions`'. Put on the composer
   * once, for a page opened with no conversation. None when omitted.
   */
  initialTags?: AskTag[];
}

export function AskPage(props: AskPageProps) {
  if (props.tagOptions.matches.length === 0) {
    return (
      <AskDayZero scope={props.scope} canUpload={props.canUpload ?? false} />
    );
  }
  return <AskThread {...props} />;
}

/**
 * No match in scope yet. The same offer Home and Matches make — one sentence,
 * the way in, the conditions — with this page's own sentence. No composer and
 * no rail: there is nothing to ask about, nothing tagged and no count worth
 * showing, and a dimmed mock-up of a thread would be an invented answer.
 *
 * Personal: the offer's own pair, both to `/dashboard/matches/new` with
 * `?return=ask`, so the wizard's exits come back here and Ask can say the
 * match is on its way (`new-match-visit.ts`).
 *
 * Team: one primary to `/dashboard/team/upload`, for a member who may send
 * video there. No "Import instead" beside it — that route has no source
 * preselect, so a second button would open the same step as the first. A
 * member who may not upload gets no button (`null`, not omitted: the offer's
 * default pair fills in for `undefined` only) and a line saying who does.
 */
function AskDayZero({
  scope,
  canUpload,
}: {
  scope: AskScope;
  canUpload: boolean;
}) {
  const isTeam = scope.kind === "team";
  const { headline, conditions } = askDayZeroCopy(scope, canUpload);
  return (
    <div className="flex w-full flex-1 bg-[var(--surface-card)]">
      <div className="flex min-w-0 flex-1 flex-col px-8 pt-5 pb-6 xl:px-14">
        <h1 className="sr-only">Ask</h1>
        <DayZeroOffer
          headline={headline}
          // The team's sentence is longer; both break once.
          headlineMeasure={isTeam ? "30ch" : "24ch"}
          actions={
            !isTeam ? (
              <MatchOfferActions query="return=ask" />
            ) : canUpload ? (
              <Link
                href="/dashboard/team/upload"
                className={advButton("primary")}
              >
                Send match video
              </Link>
            ) : null
          }
          conditions={conditions}
        />
      </div>
    </div>
  );
}

const NO_ACTIONS: ReturnType<typeof askActionsFor> = [];

function AskThread({
  scope,
  timeZone,
  tagOptions,
  starters = [],
  quota,
  conversations,
  conversation,
  sentMatchId = null,
  initialTags = [],
}: AskPageProps) {
  const router = useRouter();
  const basePath = askBasePath(scope);
  const copy = askCopy(scope);
  // The match the wizard sent, by the same rows the tag menu holds: a
  // `?sent=` that names none of the viewer's matches says nothing.
  const sent = sentMatchId
    ? (tagOptions.matches.find((match) => match.matchId === sentMatchId) ??
      null)
    : null;
  const { state, setDraft, ask, reset, rate } = useAskStream({
    conversationId: conversation?.id ?? null,
    messages: conversation?.messages ?? [],
    programId: askScopeProgramId(scope),
    // The tags the page arrived with (`entry.ts`), onto an empty page only.
    ...(initialTags.length > 0
      ? { initialDraft: { text: "", tags: initialTags } }
      : {}),
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
  // One array per change, not per render: the rail is memoised on it.
  const listed = useMemo(
    () =>
      created &&
      created.against === conversations &&
      !conversations.some((row) => row.id === created.summary.id)
        ? [created.summary, ...conversations]
        : conversations,
    [created, conversations],
  );

  const hasThread = state.exchanges.length > 0;

  // Which saved answers already have a pin on Home, by the answer's id.
  const messages = conversation?.messages;
  const pinByAnswer = useMemo(() => {
    const pins = new Map<string, string>();
    for (const message of messages ?? []) {
      if (message.role === "assistant" && message.pinId) {
        pins.set(message.id, message.pinId);
      }
    }
    return pins;
  }, [messages]);

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

  async function send(question?: AskExchange["question"]) {
    const first = state.conversationId === null;
    const asked = (question ?? state.draft).text.trim();
    const outcome = await ask(question);
    if (outcome?.status !== "done" || !first) return;

    window.history.replaceState(
      null,
      "",
      `${basePath}?c=${encodeURIComponent(outcome.conversationId)}`,
    );
    // The short title, saved without a re-render: the answer is on screen,
    // and the list carries it on its next read. A refusal leaves the
    // question's own text as the title, which is what it was anyway.
    const title = askTitle(asked);
    setCreated({
      summary: {
        id: outcome.conversationId,
        title,
        updatedAt: new Date().toISOString(),
        pinnedAt: null,
      },
      against: conversations,
    });
    void renameAskConversation(outcome.conversationId, title, scope.kind, {
      revalidate: false,
    }).catch(() => undefined);
  }

  // The latest `send` and thread, for the handlers below that keep one
  // identity across renders — every streamed event re-renders this shell,
  // and a new handler would re-render every memoised exchange with it.
  const latest = useRef<{
    send: typeof send;
    exchanges: AskExchange[];
  } | null>(null);
  useEffect(() => {
    latest.current = { send, exchanges: state.exchanges };
  });

  // A starter or a follow-up is a question with its tags, sent as typed.
  const pick = useCallback((starter: AskStarter) => {
    void latest.current?.send({ text: starter.text, tags: starter.tags });
  }, []);

  // A clarifying choice: the latest question again, with the option on it.
  // Only the latest question's choices can still be picked.
  const chooseLatest = useCallback((option: string) => {
    const exchanges = latest.current?.exchanges ?? [];
    const last = exchanges[exchanges.length - 1];
    if (!last) return;
    void latest.current?.send({
      ...last.question,
      text: `${last.question.text} (${option})`,
    });
  }, []);

  // Under the newest answer, once it has settled: what to ask next, from the
  // subject of what was just asked. Never under an error or a question still
  // being answered.
  const newest = state.exchanges[state.exchanges.length - 1];
  const newestText = newest?.question.text;
  const newestDone = newest?.answer.status === "done";
  const followUps = useMemo(
    () =>
      newestText !== undefined && newestDone && !state.inFlight
        ? askFollowUps(newestText, scope)
        : NO_FOLLOW_UPS,
    [newestText, newestDone, state.inFlight, scope],
  );

  const conversationId = state.conversationId;
  const deleteConversation = useCallback(
    async (id: string) => {
      const result = await deleteAskConversation(id, scope.kind);
      if (!result.ok) return false;
      if (id === conversationId) {
        reset();
        router.replace(basePath);
      }
      return true;
    },
    [scope.kind, conversationId, reset, router, basePath],
  );

  const renameConversation = useCallback(
    async (id: string, title: string) => {
      const result = await renameAskConversation(id, title, scope.kind);
      return result.ok;
    },
    [scope.kind],
  );

  const pinConversation = useCallback(
    async (id: string, pinned: boolean) => {
      const result = await setAskConversationPinned(id, pinned, scope.kind);
      return result.ok;
    },
    [scope.kind],
  );

  const pinAnswer = useCallback(
    (answerId: string) => pinAskAnswer(answerId, scope.kind),
    [scope.kind],
  );
  const unpinAnswer = useCallback(
    async (pinId: string) => (await unpinAskAnswer(pinId, scope.kind)).ok,
    [scope.kind],
  );

  // Where the composer is, so "New question" can put the caret in it: with
  // no thread open the button changes nothing else on screen, and a control
  // that visibly does nothing reads as broken.
  const composerBox = useRef<HTMLDivElement>(null);

  const newQuestion = useCallback(() => {
    reset();
    // Already at the bare URL when nothing was saved; a push would only add
    // a history entry that goes nowhere.
    if (window.location.search !== "") router.push(basePath);
    requestAnimationFrame(() =>
      composerBox.current?.querySelector("textarea")?.focus(),
    );
  }, [reset, router, basePath]);

  // ⇧⌘O / Ctrl+Shift+O. The listener is registered once and reads the
  // latest handler and flight state through a ref, so it never acts on a
  // stale thread.
  const shortcut = useRef({ run: newQuestion, inFlight: state.inFlight });
  useEffect(() => {
    shortcut.current = { run: newQuestion, inFlight: state.inFlight };
  });
  useEffect(() => {
    const mac = readIsMac();
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

  const quotaView = useMemo<AskQuotaView | null>(
    () =>
      state.usage
        ? { ...state.usage, resetsOn: quota?.resetsOn ?? null }
        : quota,
    [state.usage, quota],
  );

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
        onSubmit={() => send()}
        tagOptions={tagOptions}
        scope={scope}
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
          scope={scope}
          timeZone={timeZone}
          activeConversationId={state.conversationId}
          onNewQuestion={newQuestion}
          onDeleteConversation={deleteConversation}
          onRenameConversation={renameConversation}
          onPinConversation={pinConversation}
          deleteDisabled={state.inFlight}
        />
      }
    >
      {hasThread ? (
        <>
          <h1 className="sr-only">Ask</h1>
          <div className={cn(ASK_SCROLL, ASK_GUTTER, "pt-7 pb-4")}>
            {/* Exchanges sit further apart (48px) than a question from its
                own answer (24px), so where one ends reads at a glance. */}
            <div className={cn(ASK_COLUMN, "flex flex-col gap-12")}>
              {state.exchanges.map((exchange, index) => {
                const isLatest = index === state.exchanges.length - 1;
                return (
                  <AskExchangeView
                    key={exchange.id}
                    exchange={exchange}
                    scope={scope}
                    onRate={rate}
                    initialPinId={
                      exchange.answer.answerId
                        ? (pinByAnswer.get(exchange.answer.answerId) ?? null)
                        : null
                    }
                    onPinAnswer={pinAnswer}
                    onUnpinAnswer={unpinAnswer}
                    onSaveView={saveView}
                    // Only the latest question's choices can still be picked.
                    onChoose={isLatest ? chooseLatest : undefined}
                    followUps={isLatest ? followUps : NO_FOLLOW_UPS}
                    followUpsLabel={copy.followUps}
                    onPickFollowUp={pick}
                  />
                );
              })}
              <div ref={end} aria-hidden="true" />
            </div>
          </div>
          {/* Outside the scroller, so it holds the foot of the thread area
              while the thread moves above it. */}
          {/* At 200% zoom (a 450px-tall window) every pixel of the foot is
              one the thread loses, so the air under the composer halves. */}
          <div
            className={cn(
              ASK_GUTTER,
              "shrink-0 pt-3 pb-6 [@media(max-height:560px)]:pb-3",
            )}
          >
            <div className={ASK_COLUMN}>{composer}</div>
          </div>
        </>
      ) : (
        <AskIntro lead={<p className="text-body-sm">{copy.lead}</p>}>
          {sent && (
            <p role="status" className="text-body-sm text-[var(--ink-700)]">
              {copy.sentNotice(sent.opponentName)}
            </p>
          )}
          {/* The starters belong to the composer — 12px under it — and the
              hand-off below is a separate thought, the intro's 24px away. */}
          <div className="flex flex-col gap-3">
            {composer}
            <AskStarters
              label={copy.starters}
              starters={starters}
              onPick={pick}
              disabled={state.inFlight}
            />
          </div>
          {/* The hand-off (roadmap 6.2): the wizard, with a way back here.
              Personal only — the team wizard has no return path yet. The
              quietest link on the page, as the day-zero offer's sample
              link is: ink that darkens, never blue, never underlined. */}
          {scope.kind === "personal" && (
            <Link
              href={WIZARD_FROM_ASK_HREF}
              className="text-micro self-start transition-colors duration-[var(--duration-hover)] hover:text-[var(--ink-900)]"
            >
              {copy.sendVideo}
            </Link>
          )}
        </AskIntro>
      )}
    </AskFrame>
  );
}

/** A save-view card's write: the server action, its result reshaped. */
async function saveView(draft: AskSavedViewDraft): Promise<AskSaveViewOutcome> {
  const result = await createSavedView(draft);
  return result.ok
    ? { ok: true, view: result.data }
    : { ok: false, error: result.error };
}

/** One empty list, so an exchange without follow-ups keeps equal props. */
const NO_FOLLOW_UPS: readonly AskStarter[] = [];

/**
 * One exchange: the asker's prompt against the right edge, what came back
 * on the left, and — under a finished answer — the cards for what to do
 * next, then (the newest only) what to ask next. All in the same column, so
 * an answer's left edge is the column's, and all 24px apart, the article's
 * own gap.
 *
 * The pin is this exchange's own state, seeded from the saved conversation
 * and moved by the card's own pin and unpin; the page is not re-read for it.
 *
 * Memoised: a streamed event re-renders the page, and an exchange that is
 * already settled has nothing new to draw. Every prop the page hands it keeps
 * its identity across renders for that reason.
 */
const AskExchangeView = memo(function AskExchangeView({
  exchange,
  scope,
  onChoose,
  onRate,
  initialPinId,
  onPinAnswer,
  onUnpinAnswer,
  onSaveView,
  followUps,
  followUpsLabel,
  onPickFollowUp,
}: {
  exchange: AskExchange;
  scope: AskScope;
  onChoose?: (option: string) => void;
  onRate: (answerId: string, feedback: AskFeedback | null) => Promise<boolean>;
  /** The pin this answer already has on Home, from the saved conversation. */
  initialPinId: string | null;
  onPinAnswer: (answerId: string) => Promise<AskPinOutcome>;
  onUnpinAnswer: (pinId: string) => Promise<boolean>;
  onSaveView: (draft: AskSavedViewDraft) => Promise<AskSaveViewOutcome>;
  /** What to ask next: the newest settled exchange's only. */
  followUps: readonly AskStarter[];
  followUpsLabel: string;
  onPickFollowUp: (starter: AskStarter) => void;
}) {
  const { question, answer } = exchange;
  const { answerId } = answer;
  const [pinId, setPinId] = useState(initialPinId);
  const done = answer.status === "done";
  const actions = useMemo(
    () =>
      done
        ? askActionsFor({
            sources: answer.sources,
            figures: answer.figures,
            visual: answer.visual,
            scope,
            tags: question.tags,
            // A saved answer carries "Show me these points", the film's one
            // door; Watch on video only stands in when there is no Show me.
            showMe: answerId !== null,
          })
        : NO_ACTIONS,
    [
      done,
      answer.sources,
      answer.figures,
      answer.visual,
      scope,
      question.tags,
      answerId,
    ],
  );
  return (
    <article className="flex flex-col gap-6">
      <AskPrompt text={question.text} tags={question.tags} />
      <AskAnswer
        answer={answer}
        scope={scope}
        onChoose={onChoose}
        onRate={answerId ? (feedback) => onRate(answerId, feedback) : undefined}
        actions={
          actions.length > 0 && (
            <AskActionCards
              actions={actions}
              scope={scope}
              pinId={pinId}
              onPin={
                answerId
                  ? async () => {
                      const outcome = await onPinAnswer(answerId);
                      if (outcome.ok) setPinId(outcome.pinId);
                      return outcome;
                    }
                  : undefined
              }
              onUnpin={async (id) => {
                const done = await onUnpinAnswer(id);
                if (done) setPinId(null);
                return done;
              }}
              onSaveView={onSaveView}
            />
          )
        }
      />
      {followUps.length > 0 && (
        <AskStarters
          label={followUpsLabel}
          starters={followUps}
          onPick={onPickFollowUp}
        />
      )}
    </article>
  );
});
