"use client";

import { useEffect, useState } from "react";
import type { EvidencePart } from "@/lib/ui/insight-evidence";
import {
  PendingBar,
  PendingRegion,
} from "@/components/dashboard/loading/pending";
import { InsightMark } from "@/components/dashboard/matches/match-detail/insight-mark";
import { INSIGHT_SURFACE } from "@/components/dashboard/matches/match-detail/report-insight-card";
import { ProfileInsightEmpty } from "@/components/dashboard/team/player-profile/profile-insight-empty";

/**
 * The season Advantage Intelligence card at the top of the profile's
 * Statistics tab (design Q), for a player with analyzed matches: the match
 * report's insight anatomy (`report-insight-card.tsx` — the surface, the
 * claim at 13px medium ink-900, the evidence under it at 11px, the engine
 * credit foot) with the Focus card's division of labour
 * (`home-ai-insight.tsx`). The CLAIM streams from `/api/player-insight`, one
 * sentence with no digits; the EVIDENCE arrives in props, composed on the
 * server from the season fold (`buildSeasonEvidence`), and renders at once —
 * it needs nothing the server did not already know, and it is true whether
 * or not a claim ever lands. No fold toggle: the profile has no collapse
 * state, and a toggle would promise one.
 *
 * ── Cache ───────────────────────────────────────────────────────────────────
 * One claim per session per `playerId` + `signature`, in `sessionStorage`,
 * so walking to a match and back does not spend a model call. The signature
 * (`seasonInsightSignature`) changes when a match of theirs is analyzed,
 * re-derived or removed, so a stale claim is never replayed over new
 * figures; the view keys the card on it, so a change remounts rather than
 * resets. The adapter's mock-mode warning is shown but never cached, so
 * configuring a provider heals on the next load.
 *
 * ── Settling ────────────────────────────────────────────────────────────────
 * The claim slot's skeleton is a promise that a sentence is arriving, and it
 * stops promising on every exit: a sentence, a 204 (nothing to say), an
 * error, an empty stream. The last three settle to `ProfileInsightEmpty` in
 * its "unavailable" words — the season's figures still stand in the cards
 * below, and the empty state says so — rather than a dead bar or an error
 * banner with nothing under it. An unmount aborts the request.
 */

/** Bump to drop every cached claim written under an older contract. */
const CACHE_KEY = "advantage-player-insight:v1";

/** The adapter's mock stream (no provider configured) carries this marker. */
const MOCK_MARKER = "No LLM provider";

interface CardState {
  /** The sentence so far — `""` until the first chunk or the cache replays. */
  claim: string;
  status: "loading" | "done" | "unavailable";
}

const LOADING: CardState = { claim: "", status: "loading" };

export function ProfileInsightCard({
  playerId,
  firstName,
  evidence,
  signature,
}: {
  /** The roster's own id (`profile.playerId`) — what the route resolves. */
  playerId: string;
  /** For the empty state's sentence when no claim arrives. */
  firstName: string;
  /** `buildSeasonEvidence(season).parts` — never text from the stream. */
  evidence: EvidencePart[];
  /** `seasonInsightSignature(season)` — keys the cache with `playerId`. */
  signature: string;
}) {
  const [state, setState] = useState<CardState>(LOADING);

  useEffect(() => {
    const cacheKey = `${CACHE_KEY}:${playerId}:${signature}`;
    let cached: string | null = null;
    try {
      cached = sessionStorage.getItem(cacheKey);
    } catch {
      // Storage refused (a private window, a blocked origin): fetch anew.
    }
    if (cached) {
      // The replay of a claim this session already wrote: one synchronous set
      // on mount, as `home-ai-insight.tsx` does. The rule is there to catch a
      // cascade, and nothing re-runs this effect but a remount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ claim: cached, status: "done" });
      return;
    }

    const controller = new AbortController();

    async function load() {
      try {
        const res = await fetch("/api/player-insight", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playerId }),
          signal: controller.signal,
        });

        // 204 is "nothing to say"; a refusal or a failure is nothing to say
        // either, as far as this card can tell — both settle the same way.
        if (res.status === 204 || !res.ok || !res.body) {
          setState({ claim: "", status: "unavailable" });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setState({ claim: acc, status: "loading" });
        }
        acc += decoder.decode();

        const text = acc.trim();
        if (!text) {
          setState({ claim: "", status: "unavailable" });
          return;
        }
        if (!text.includes(MOCK_MARKER)) {
          try {
            sessionStorage.setItem(cacheKey, text);
          } catch {
            // Not cacheable here; the claim still shows.
          }
        }
        setState({ claim: text, status: "done" });
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setState({ claim: "", status: "unavailable" });
      }
    }

    load();

    return () => controller.abort();
  }, [playerId, signature]);

  if (state.status === "unavailable") {
    return <ProfileInsightEmpty firstName={firstName} reason="unavailable" />;
  }

  return (
    <section
      aria-label="Advantage Intelligence summary"
      data-testid="insight-card"
      className={INSIGHT_SURFACE}
    >
      <div className="flex flex-col gap-2 p-[16px_20px_12px]">
        {/* The claim is a headline, so it balances. While it is arriving the
            slot holds one bar at the report skeleton's size (`InsightPending`),
            so the card does not grow when the sentence lands. */}
        {state.claim ? (
          <p
            className="text-body [text-wrap:balance]"
            style={{ color: "var(--ink-900)", fontWeight: 500 }}
          >
            {state.claim}
          </p>
        ) : (
          <PendingRegion label="insight" innerClassName="flex h-5 items-center">
            <PendingBar className="h-3.5 w-[72%]" />
          </PendingRegion>
        )}

        {/* Evidence — computed, never invented, and present before the claim
            is. The figures are set tabular in ink-900 so the eye lands on
            them; the words stay in the report's evidence ink. */}
        <p className="text-[11px] leading-[1.6] [text-wrap:pretty] text-[var(--ink-700)]">
          {evidence.map((part, i) =>
            part.tabular ? (
              <span key={i} className="tabular text-[var(--ink-900)]">
                {part.text}
              </span>
            ) : (
              <span key={i}>{part.text}</span>
            ),
          )}
        </p>

        <div className="mt-1 flex h-6 items-center gap-[7px] border-t border-[var(--border-hairline)] pt-2.5">
          <InsightMark />
          {/* `.text-micro` already paints ink-500, which is the credit's colour. */}
          <span className="text-micro">Advantage Intelligence</span>
        </div>
      </div>
    </section>
  );
}
