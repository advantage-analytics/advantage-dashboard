"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import { createClient } from "@/lib/supabase/client";
import { verificationFor } from "@/lib/data/match-verification";

/**
 * Keeps an open report honest when Advantage verifies the match under it.
 *
 * The report renders once on the server. A coach who opened it while it was
 * "Verification pending" would otherwise go on reading — and showing — the
 * automatic numbers after the review replaced them. So this asks again when
 * the tab comes back into view and once a minute while it is visible, and on
 * a NEW `verified_at` calls `router.refresh()`: the server re-reads the match,
 * its points and its statistics, and every view redraws from the reviewed
 * data in place (client state — the open view, the filters — is kept).
 *
 * The ask: the reader's own browser client (`matches.verified_at`, under
 * RLS) on the dashboard; `meta.verificationEndpoint` on a share link, whose
 * reader has no session (`GET /api/share/[token]/verification`).
 *
 * A republish takes the badge off while it replaces the points
 * (`unverify_match`) and puts it back once they are in, with a new
 * `verified_at`. A null answer is therefore never acted on — refreshing then
 * could draw half-replaced points — only the next verified one is.
 *
 * Renders nothing. Mounted beside the facts line on the dashboard report and
 * the share page, so every view keeps it. Never on the sample, and only for a
 * match that is pending or verified (`watching`). A failed ask, or a refresh
 * that did not land, is tried again on the next focus or tick.
 */
const POLL_MS = 60_000;

/**
 * How long a refresh is given to land before the same `verified_at` may ask
 * for another. Short of a tick, so focus and visibility firing together ask
 * once; a refresh that failed (`router.refresh()` reports nothing) is asked
 * for again on the next focus or tick instead of leaving the tab stale.
 */
const RETRY_MS = 10_000;

export function VerificationWatch() {
  const { match } = useMatchData();
  const { meta } = useMatchReport();
  const router = useRouter();
  const rendered = match.verification?.verifiedAt ?? null;
  // Only a match whose numbers can still move under the reader: one waiting
  // on review, or a verified one (a republish re-verifies it). A SwingVision
  // import, a hand-scored match or an old match nobody will review never
  // changes status, so nothing polls for it.
  const watching =
    !meta.sample && (rendered !== null || match.verificationPending === true);
  // The `verified_at` a refresh was last asked for, and when.
  const asked = useRef<{ at: number; verifiedAt: string } | null>(null);

  useEffect(() => {
    if (!watching) return;
    let cancelled = false;
    let inFlight = false;

    async function currentVerifiedAt(): Promise<string | null | undefined> {
      if (meta.verificationEndpoint) {
        const response = await fetch(meta.verificationEndpoint, {
          cache: "no-store",
        });
        if (!response.ok) return undefined;
        const body = (await response.json()) as { verifiedAt?: unknown };
        return typeof body.verifiedAt === "string" ? body.verifiedAt : null;
      }
      const { data, error } = await createClient()
        .from("matches")
        .select("verified, verified_at")
        .eq("id", match.id)
        .maybeSingle();
      if (error || !data) return undefined;
      return verificationFor(data)?.verifiedAt ?? null;
    }

    async function check() {
      if (inFlight || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const now = await currentVerifiedAt();
        if (cancelled || !now) return;
        if (now === rendered) return;
        const last = asked.current;
        if (
          last &&
          last.verifiedAt === now &&
          Date.now() - last.at < RETRY_MS
        ) {
          return;
        }
        asked.current = { at: Date.now(), verifiedAt: now };
        markJustVerified(match.id, now);
        router.refresh();
      } catch {
        // The next focus or tick asks again.
      } finally {
        inFlight = false;
      }
    }

    const timer = window.setInterval(check, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [match.id, meta.verificationEndpoint, rendered, router, watching]);

  // Leaving the match (or the report) ends the "just updated" moment; a
  // later visit has nothing new to announce.
  useEffect(() => () => forgetJustVerified(match.id), [match.id]);

  return null;
}

/* ── "Updated after review" ──────────────────────────────────────────────
 * The `verified_at` this tab watched each match arrive at. Module state, not
 * React state: `router.refresh()` keeps the client tree, but the watcher and
 * the Statistics view that says so are far apart in it, and the fact belongs
 * to the tab — a fresh load of an already-verified match has nothing to
 * announce. Kept by VALUE, not as a flag: the note may say the numbers were
 * updated only once the report actually draws that `verified_at`, so a
 * re-verified match whose refresh has not landed (or failed) never claims
 * new numbers over the old ones. */

const justVerified = new Map<string, string>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function markJustVerified(matchId: string, verifiedAt: string) {
  justVerified.set(matchId, verifiedAt);
  notify();
}

function forgetJustVerified(matchId: string) {
  if (justVerified.delete(matchId)) notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Whether the report now draws the `verified_at` this tab watched `matchId`
 * arrive at — the Statistics view's cue to say its numbers were just
 * updated. `renderedVerifiedAt` is the report's own (`match.verification`),
 * so the answer turns true only when the refreshed data is on screen.
 */
export function useJustVerified(
  matchId: string,
  renderedVerifiedAt: string | null,
): boolean {
  return useSyncExternalStore(
    subscribe,
    () =>
      renderedVerifiedAt !== null &&
      justVerified.get(matchId) === renderedVerifiedAt,
    () => false,
  );
}
