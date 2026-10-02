/**
 * Count a view of the match's video (SwingVision Add video T8) — the POST the
 * Film tab sends on the first `play` of each loaded source, from either the
 * report player or the fullscreen room.
 *
 * Fire and forget. A view that fails to record costs the video nothing today
 * and at most a retention warning a year from now; it must never surface to
 * someone who is watching. `keepalive` lets a play that is immediately
 * followed by leaving the page still land.
 *
 * Plain `fetch` only — this file is imported by the film subtree, which must
 * stay clear of `next/navigation` for the offline component specs.
 */
export function recordMatchVideoView(matchId: string): void {
  try {
    void fetch(`/api/matches/${encodeURIComponent(matchId)}/video/viewed`, {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => {
      // Deliberately silent; see above.
    });
  } catch {
    // `fetch` itself unavailable (a non-browser render). Nothing to do.
  }
}

/**
 * "Keep this video" (T10): the same POST as a play, awaited this time,
 * because the notice hides only once the clock has actually restarted — a
 * notice that vanished on a failed request would come back on the next visit
 * with a month less to go.
 *
 * Resolves `true` on a 2xx and `false` on anything else, a network failure
 * included; it never throws. `fetchImpl` is the spec's seam.
 */
export async function keepMatchVideo(
  matchId: string,
  fetchImpl?: typeof fetch,
): Promise<boolean> {
  try {
    const response = await (fetchImpl ?? fetch)(
      `/api/matches/${encodeURIComponent(matchId)}/video/viewed`,
      { method: "POST", credentials: "same-origin" },
    );
    return response.ok;
  } catch {
    return false;
  }
}
