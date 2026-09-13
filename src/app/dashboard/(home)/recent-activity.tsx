"use client";

import {
  loadRecentMatches,
  type EventGroup,
} from "@/lib/data/home-recent-data";
export type { EventGroup, MatchRow } from "@/lib/data/home-recent-data";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { AlertCircle, CheckCircle2, Inbox, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import RecentMatches from "@/components/dashboard/home/recent-matches";
import { CardFooter } from "@/components/dashboard/shared/card-footer";
import { RecentMatchesEmpty } from "@/components/dashboard/home/recent-matches-empty";
import { advButton } from "@/lib/ui/adv-button";
import { createClient } from "@/lib/supabase/client";

type ToastState =
  | { kind: "idle" }
  | { kind: "created"; matchId: string }
  | { kind: "analyzing"; matchId: string }
  | { kind: "ready"; matchId: string };

// How long to wait for the match_stats INSERT before giving up (dropped socket /
// failed processing). Detection is push-based via Supabase Realtime, so this is only
// a safety net, not a poll interval.
const PROCESSING_TIMEOUT_MS = 120000;
const PROCESSING_STORAGE_KEY = "match-processing";

function EventsList({
  events,
  seenEventIdsRef,
}: {
  events: EventGroup[];
  seenEventIdsRef: React.MutableRefObject<Set<string> | null>;
}) {
  // Which event groups arrived since the last commit, so they animate in once.
  //
  // Reads a ref during render (react-hooks/refs) for the same reason as
  // recent-matches.tsx: the value needed is the set as of the PREVIOUS commit,
  // and it must survive into the committed render. Calling a setter during
  // render discards the in-progress output, so the re-render would already see
  // the updated set and nothing would highlight.
  //
  // Safe in practice because seenEventIdsRef only changes when `events`
  // changes (see the effect below), so repeat renders in between are
  // idempotent.
  const newEventIds = new Set<string>();
  if (seenEventIdsRef.current !== null) {
    for (const event of events) {
      // eslint-disable-next-line react-hooks/refs -- see note above
      if (!seenEventIdsRef.current.has(event.id)) {
        newEventIds.add(event.id);
      }
    }
  }

  useEffect(() => {
    const ids = new Set<string>();
    for (const event of events) ids.add(event.id);
    seenEventIdsRef.current = ids;
  }, [events, seenEventIdsRef]);

  return (
    <div className="flex flex-col">
      {events.map((event) => (
        <RecentMatches
          key={event.id}
          event={event}
          isNewEvent={newEventIds.has(event.id)}
        />
      ))}
    </div>
  );
}

export default function RecentActivity({
  userId,
  playerIds,
  hasMatches,
  showEmptyAction = true,
  matchCount,
  wonCount,
  initialEvents,
}: {
  /** Whose uploads this list is scoped to. */
  userId: string;
  /**
   * Which ids mean "me" when a match names a player — the login plus every
   * roster profile the viewer has claimed.
   */
  playerIds: string[];
  /**
   * Whether the account holds any match at all, resolved on the server.
   *
   * The client query below cannot answer this on its own: it returns nothing
   * both for an account with no matches and for one whose matches name someone
   * else, and those are different pages. Day zero gets the ghost rows and the
   * one action; the other gets a list that explains itself.
   */
  hasMatches: boolean;
  /**
   * Whether the day-zero card carries its own "Send a match" band. Off on the
   * day-zero page, where the centred offer above it is the page's one action.
   */
  showEmptyAction?: boolean;
  /**
   * The footer's "M matches · W won", resolved on the server by the same
   * loader that counts the title row — the two numbers on the page that say
   * how many matches there are must come from one place. `matchCount` counts
   * every filed row; `wonCount` only decided, viewer-attributed scores.
   */
  matchCount: number;
  wonCount: number;
  initialEvents: EventGroup[];
}) {
  const [events, setEvents] = useState<EventGroup[]>(initialEvents);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef(0);
  const seenEventIdsRef = useRef<Set<string> | null>(null);
  const [toast, setToast] = useState<ToastState>({ kind: "idle" });
  const [mounted, setMounted] = useState(false);
  const shouldReduceMotion = useReducedMotion();
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    const storedMatchId = sessionStorage.getItem(PROCESSING_STORAGE_KEY);
    if (storedMatchId) {
      setToast({ kind: "analyzing", matchId: storedMatchId });
    }
  }, []);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    const supabase = createClient();
    setRefreshing(true);
    setError(null);
    try {
      const nextEvents = await loadRecentMatches(supabase, userId, playerIds);
      if (requestId !== requestRef.current) return;
      setEvents(nextEvents);
    } catch (e) {
      if (requestId !== requestRef.current) return;
      setError(e instanceof Error ? e.message : "Failed to load matches");
    } finally {
      if (requestId === requestRef.current) setRefreshing(false);
    }
  }, [userId, playerIds]);

  useEffect(() => {
    // Server refreshes supply the latest snapshot without remounting the card.
    ++requestRef.current;
    setEvents(initialEvents);
    setError(null);
    setRefreshing(false);
    return () => {
      ++requestRef.current;
    };
  }, [initialEvents]);

  useEffect(() => {
    let createdTimer: ReturnType<typeof setTimeout> | undefined;
    const handler = (e: Event) => {
      const matchId = (e as CustomEvent<{ matchId: string }>).detail?.matchId;
      if (!matchId) return;
      sessionStorage.setItem(PROCESSING_STORAGE_KEY, matchId);
      setToast({ kind: "created", matchId });
      // Show the newly created match right away — its row (with the score) already
      // exists. Stats fill in later when processing completes (finish() → load()).
      // Without this, the list wouldn't change until processing finished.
      load();
      createdTimer = setTimeout(() => {
        setToast((current) =>
          current.kind === "created"
            ? { kind: "analyzing", matchId: current.matchId }
            : current,
        );
      }, 1200);
    };
    window.addEventListener("match-created", handler);
    return () => {
      window.removeEventListener("match-created", handler);
      if (createdTimer) clearTimeout(createdTimer);
    };
  }, [load]);

  const targetMatchId =
    toast.kind === "created" || toast.kind === "analyzing"
      ? toast.matchId
      : null;

  useEffect(() => {
    if (!targetMatchId) return;
    const supabase = createClient();
    let settled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    // Processing is done once calculate_match_stats writes the match's rows. Detect
    // that via a Realtime INSERT on match_stats rather than polling the heavy
    // percentages view. `settled` guards against the event, the existence-check, and
    // the safety reconcile all firing.
    const finish = () => {
      if (settled) return;
      settled = true;
      sessionStorage.removeItem(PROCESSING_STORAGE_KEY);
      setToast({ kind: "ready", matchId: targetMatchId });
      // HomeContent owns the page refresh for this event. That refresh updates
      // recent matches together with the title, KPIs, activity, and serves, so
      // reloading this card here would issue the same reads twice.
      window.dispatchEvent(new Event("match-processed"));
    };

    const statsExist = async () => {
      // Base table, not the percentages view — we only need existence (lighter).
      const { data } = await supabase
        .from("match_stats")
        .select("id")
        .eq("match_id", targetMatchId)
        .limit(1);
      return Boolean(data && data.length > 0);
    };

    (async () => {
      // Authenticate the realtime socket with the user's JWT BEFORE subscribing.
      // match_stats is RLS-protected, and supabase-js does not proactively push the
      // token to the socket on sign-in (it only stores it), so a channel can join as
      // anon and RLS silently delivers ZERO postgres_changes — the subscription
      // "succeeds" but no INSERT events ever arrive. setAuth() forces the token on.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.access_token) {
        await supabase.realtime.setAuth(session.access_token);
      }
      if (settled) return;

      channel = supabase
        .channel(`match-stats:${targetMatchId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "match_stats",
            filter: `match_id=eq.${targetMatchId}`,
          },
          () => finish(),
        )
        .subscribe(async (status) => {
          // Race guard: processing may have finished before the subscription opened,
          // so the INSERT event would never arrive — reconcile once on connect.
          if (status === "SUBSCRIBED" && !settled && (await statsExist())) {
            finish();
          }
        });
    })();

    // Safety net: if the realtime event never arrives (dropped socket), reconcile by
    // checking directly; only give up if the stats genuinely aren't there yet.
    const timeout = setTimeout(async () => {
      if (settled) return;
      if (await statsExist()) {
        finish();
      } else {
        sessionStorage.removeItem(PROCESSING_STORAGE_KEY);
        setToast({ kind: "idle" });
      }
    }, PROCESSING_TIMEOUT_MS);

    return () => {
      settled = true;
      clearTimeout(timeout);
      if (channel) supabase.removeChannel(channel);
    };
  }, [targetMatchId, load]);

  const dismissToast = useCallback(() => {
    sessionStorage.removeItem(PROCESSING_STORAGE_KEY);
    setToast({ kind: "idle" });
  }, []);

  const handleToastClick = useCallback(() => {
    if (toast.kind === "ready") {
      router.push(`/dashboard/matches/${toast.matchId}`);
      setToast({ kind: "idle" });
    }
  }, [toast, router]);

  return (
    <>
      {/* Content — no padding of its own; the card's bottom padding is the
          whole gap under the footer. */}
      <div>
        {error && (
          <div
            className="flex flex-col items-center justify-center px-4 py-8 text-center"
            role="alert"
          >
            <AlertCircle
              className="mb-2 size-6 text-[var(--danger)]"
              strokeWidth={1.5}
              aria-hidden
            />
            <p className="text-[13px] font-medium text-[var(--ink-900)]">
              Couldn&apos;t update your matches
            </p>
            <p className="text-body-sm mt-1 mb-4">
              Your previous results are still shown. Try the update again.
            </p>
            {/* An outline, not a second blue: the page's one primary is "New
                match" in the title row, and a retry is a repair, not a
                recommendation. */}
            <button
              type="button"
              onClick={load}
              className={advButton("outline", "sm")}
            >
              <RefreshCw className="size-3" strokeWidth={1.5} aria-hidden />
              Try again
            </button>
          </div>
        )}

        {/* Day zero: the shape of a result, and the one action that makes one.
            The card stays on the page in this state rather than giving way to
            a separate empty screen, so the frame a player learns on the first
            visit is the frame they keep. */}
        {!error && events.length === 0 && !hasMatches && (
          <RecentMatchesEmpty showAction={showEmptyAction} />
        )}

        {/* Matches exist on the account but none names the viewer as a player
            — a different page from day zero, so it says what the list holds
            rather than how to upload. */}
        {!error && events.length === 0 && hasMatches && (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <Inbox
              className="mb-4 size-7 text-[var(--ink-300)]"
              strokeWidth={1.5}
              aria-hidden
            />
            <p className="text-[14px] font-medium text-[var(--ink-900)]">
              No matches to show
            </p>
            <p
              className="text-body-sm mt-1.5 max-w-[36ch]"
              style={{ textWrap: "pretty" }}
            >
              Matches you played appear here as soon as they are sent or
              imported.
            </p>
            <Link
              href="/dashboard/matches"
              className="mt-3 text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
            >
              Open all matches
            </Link>
          </div>
        )}

        {events.length > 0 && (
          <>
            <EventsList events={events} seenEventIdsRef={seenEventIdsRef} />
            {/* Pa2's card footer: what the list is a slice of. The left count
                is the rows actually drawn — what the grouping leaves after it
                drops unscored and non-viewer rows and keeps the latest three
                events. The right one is the same number the title row states,
                so the two can never disagree. */}
            <CardFooter
              className="mt-2.5"
              left={
                <>
                  Latest{" "}
                  <span className="tabular">
                    {events.reduce((n, e) => n + e.matches.length, 0)}
                  </span>{" "}
                  shown
                </>
              }
              right={
                <>
                  <span className="tabular">{matchCount}</span>{" "}
                  {matchCount === 1 ? "match" : "matches"} ·{" "}
                  <span className="tabular">{wonCount}</span> won
                </>
              }
            />
          </>
        )}
      </div>

      {/* Floating upload-status pill — confirm → analyzing → ready */}
      {mounted &&
        createPortal(
          <AnimatePresence>
            {toast.kind !== "idle" && (
              <motion.div
                initial={
                  shouldReduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, y: 24, scale: 0.95 }
                }
                animate={
                  shouldReduceMotion
                    ? { opacity: 1 }
                    : { opacity: 1, y: 0, scale: 1 }
                }
                exit={
                  shouldReduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, y: 12, scale: 0.98 }
                }
                transition={{
                  duration: shouldReduceMotion ? 0.15 : 0.35,
                  ease: [0.25, 0.46, 0.45, 0.94],
                }}
                role="status"
                onClick={toast.kind === "ready" ? handleToastClick : undefined}
                className={
                  "fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-[12px] bg-[#0D0D0D] py-3 pr-5 pl-4 shadow-[0px_8px_32px_rgba(0,0,0,0.25),0px_0px_0px_1px_rgba(255,255,255,0.06)_inset] " +
                  (toast.kind === "ready"
                    ? "cursor-pointer transition-colors duration-200 hover:bg-[var(--surface-dark-hover)]"
                    : "")
                }
              >
                {/* Status icon — swaps cleanly across states */}
                <div className="relative flex size-5 shrink-0 items-center justify-center">
                  <AnimatePresence mode="wait" initial={false}>
                    {toast.kind === "created" || toast.kind === "ready" ? (
                      <motion.div
                        key={toast.kind}
                        initial={
                          shouldReduceMotion
                            ? { opacity: 0 }
                            : { opacity: 0, scale: 0.6 }
                        }
                        animate={
                          shouldReduceMotion
                            ? { opacity: 1 }
                            : { opacity: 1, scale: 1 }
                        }
                        exit={
                          shouldReduceMotion
                            ? { opacity: 0 }
                            : { opacity: 0, scale: 0.8 }
                        }
                        transition={{
                          duration: 0.18,
                          ease: [0.25, 0.46, 0.45, 0.94],
                        }}
                        className="absolute inset-0 flex items-center justify-center"
                      >
                        <CheckCircle2
                          className="size-5 text-[#5DB955]"
                          strokeWidth={1.75}
                        />
                      </motion.div>
                    ) : (
                      <motion.div
                        key="analyzing"
                        initial={
                          shouldReduceMotion
                            ? { opacity: 0 }
                            : { opacity: 0, scale: 0.6 }
                        }
                        animate={
                          shouldReduceMotion
                            ? { opacity: 1 }
                            : { opacity: 1, scale: 1 }
                        }
                        exit={
                          shouldReduceMotion
                            ? { opacity: 0 }
                            : { opacity: 0, scale: 0.8 }
                        }
                        transition={{
                          duration: 0.18,
                          ease: [0.25, 0.46, 0.45, 0.94],
                        }}
                        className="absolute inset-0 flex items-center justify-center"
                      >
                        <div
                          className="absolute inset-0 rounded-full border-[1.5px] border-[#3B82F6]/30"
                          aria-hidden
                        />
                        {!shouldReduceMotion && (
                          <motion.div
                            className="absolute inset-0 rounded-full border-[1.5px] border-transparent border-t-[#3B82F6]"
                            animate={{ rotate: 360 }}
                            transition={{
                              duration: 1,
                              ease: "linear",
                              repeat: Infinity,
                            }}
                            aria-hidden
                          />
                        )}
                        <div
                          className="size-1.5 rounded-full bg-[#3B82F6]"
                          aria-hidden
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <div className="flex min-w-[180px] flex-col gap-0.5">
                  <p className="text-[12px] leading-none font-medium text-white">
                    {toast.kind === "created"
                      ? "Match created"
                      : toast.kind === "ready"
                        ? "Stats ready"
                        : "Analyzing match data"}
                  </p>
                  <p className="text-[10px] leading-none font-normal text-[#888888]">
                    {toast.kind === "created"
                      ? "Analyzing your stats…"
                      : toast.kind === "ready"
                        ? "Tap to view your match"
                        : "Stats will refresh automatically"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    dismissToast();
                  }}
                  className="ml-1 rounded-full p-1 text-white/60 transition-colors duration-200 hover:text-white/80 focus-visible:outline-none"
                  aria-label="Dismiss notification"
                >
                  <X className="size-3.5" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
