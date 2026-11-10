"use client";

import { useEffect, useState } from "react";
import type { EvidencePart } from "@/lib/ui/insight-evidence";
import type { PlayerInsight } from "@/lib/data/player-insight";
import {
  PendingBar,
  PendingRegion,
} from "@/components/dashboard/loading/pending";
import { InsightMark } from "@/components/dashboard/matches/match-detail/insight-mark";
import { INSIGHT_SURFACE } from "@/components/dashboard/matches/match-detail/report-insight-card";
import { ProfileInsightEmpty } from "@/components/dashboard/team/player-profile/profile-insight-empty";

/**
 * The season Advantage Intelligence card at the top of the profile's
 * Statistics tab (design Q), for a player with analyzed matches, in the match
 * report's insight anatomy (`report-insight-card.tsx`): the surface, the
 * CLAIM at 13px medium ink-900, the DESCRIPTION under it at 11px, the engine
 * credit foot. Both come from `/api/player-insight`, which reads the model's
 * answer whole and fills the description's figures in from the season fold
 * (`resolvePlayerInsight`), so every number on the card is one the fold
 * produced. Until the answer lands — and whenever the description failed the
 * route's checks — the card prints the computed `evidence` line in its place
 * (`buildSeasonEvidence`): it is there from first paint, and true whether or
 * not the model ever writes anything. No fold toggle: the
 * profile has no collapse state, and a toggle would promise one.
 *
 * ── Cache ───────────────────────────────────────────────────────────────────
 * One answer per session per `playerId` + `signature`, in `sessionStorage`,
 * so walking to a match and back does not spend a model call. The signature
 * (`seasonInsightSignature`) changes when a match of theirs is analyzed,
 * re-derived or removed, so a stale answer is never replayed over new
 * figures; the view keys the card on it, so a change remounts rather than
 * resets. The adapter's mock-mode warning is shown but never cached, so
 * configuring a provider heals on the next load.
 *
 * ── Settling ────────────────────────────────────────────────────────────────
 * The skeleton is a promise that an answer is arriving, and it stops
 * promising on every exit: an answer, a 204 (nothing to say), an error. The
 * last two settle to `ProfileInsightEmpty` in its "unavailable" words — the
 * season's figures still stand in the cards below, and the empty state says
 * so — rather than a dead bar or an error banner with nothing under it. An
 * unmount aborts the request.
 */

/** Bump to drop every cached answer written under an older contract. */
const CACHE_KEY = "advantage-player-insight:v2";

/** The adapter's mock stream (no provider configured) carries this marker. */
const MOCK_MARKER = "No LLM provider";

type CardState =
  | { status: "loading" }
  | { status: "unavailable" }
  | { status: "done"; insight: PlayerInsight };

function isEvidencePart(value: unknown): value is EvidencePart {
  if (typeof value !== "object" || value === null) return false;
  const part = value as Record<string, unknown>;
  return (
    typeof part.text === "string" &&
    (part.tabular === undefined || typeof part.tabular === "boolean")
  );
}

/** The route's body (or a cached copy of it), or `null` if it is not one. */
function readInsight(value: unknown): PlayerInsight | null {
  if (typeof value !== "object" || value === null) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.claim !== "string" || body.claim.trim() === "") return null;
  const description = body.description;
  if (description === null) return { claim: body.claim, description: null };
  if (Array.isArray(description) && description.every(isEvidencePart))
    return { claim: body.claim, description };
  return null;
}

/** Figures in ink-900 tabular so the eye lands on them; words in ink-700. */
function Parts({ parts }: { parts: readonly EvidencePart[] }) {
  return parts.map((part, i) =>
    part.tabular ? (
      <span key={i} className="tabular text-[var(--ink-900)]">
        {part.text}
      </span>
    ) : (
      <span key={i}>{part.text}</span>
    ),
  );
}

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
  /** `buildSeasonEvidence(season).parts` — shown when no description passed. */
  evidence: EvidencePart[];
  /** `seasonInsightSignature(season)` — keys the cache with `playerId`. */
  signature: string;
}) {
  const [state, setState] = useState<CardState>({ status: "loading" });

  useEffect(() => {
    const cacheKey = `${CACHE_KEY}:${playerId}:${signature}`;
    let cached: PlayerInsight | null = null;
    try {
      const stored = sessionStorage.getItem(cacheKey);
      cached = stored ? readInsight(JSON.parse(stored)) : null;
    } catch {
      // Storage refused (a private window, a blocked origin) or a copy that
      // no longer parses: fetch anew.
    }
    if (cached) {
      // The replay of an answer this session already fetched: one synchronous
      // set on mount, as `home-ai-insight.tsx` does. The rule is there to
      // catch a cascade, and nothing re-runs this effect but a remount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ status: "done", insight: cached });
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
        if (res.status === 204 || !res.ok) {
          setState({ status: "unavailable" });
          return;
        }

        const insight = readInsight(await res.json());
        if (!insight) {
          setState({ status: "unavailable" });
          return;
        }
        if (!insight.claim.includes(MOCK_MARKER)) {
          try {
            sessionStorage.setItem(cacheKey, JSON.stringify(insight));
          } catch {
            // Not cacheable here; the answer still shows.
          }
        }
        setState({ status: "done", insight });
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setState({ status: "unavailable" });
      }
    }

    load();

    return () => controller.abort();
  }, [playerId, signature]);

  if (state.status === "unavailable") {
    return <ProfileInsightEmpty firstName={firstName} reason="unavailable" />;
  }

  const description =
    state.status === "done" ? state.insight.description : null;

  return (
    <section
      aria-label="Advantage Intelligence summary"
      aria-busy={state.status === "loading"}
      data-testid="insight-card"
      className={INSIGHT_SURFACE}
    >
      <div className="flex flex-col gap-2 p-[16px_20px_12px]">
        {/* The claim is a headline, so it balances. While it is arriving the
            slot holds one bar at the report skeleton's size, so the claim's
            line does not grow when the sentence lands. */}
        {state.status === "done" ? (
          <p
            className="text-body [text-wrap:balance]"
            style={{ color: "var(--ink-900)", fontWeight: 500 }}
          >
            {state.insight.claim}
          </p>
        ) : (
          <PendingRegion label="insight" innerClassName="flex h-5 items-center">
            <PendingBar className="h-3.5 w-[72%]" />
          </PendingRegion>
        )}

        {/* The description once it lands; until then — and whenever it failed
            the route's checks — the computed evidence line, which is true
            from first paint and needs nothing the server did not know. */}
        <p
          className="text-[11px] leading-[1.6] [text-wrap:pretty] text-[var(--ink-700)]"
          data-insight-part={description ? "description" : "evidence"}
        >
          <Parts parts={description ?? evidence} />
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
