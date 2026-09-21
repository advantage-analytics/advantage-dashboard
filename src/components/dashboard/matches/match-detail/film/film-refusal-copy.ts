/**
 * The no-film refusals' words, in one place (spec section C).
 *
 * JSX-free on purpose so `film-unavailable-state.tsx`, `film-player.tsx` and
 * the fullscreen room read the same strings. `unknown` is the one row the
 * spec's table does not carry: the saved state could not be read at all, so the
 * page cannot say the recording is attached (a guess) or that it is not (the
 * guess that ends in a duplicate upload).
 *
 * `denied` is a heading and nothing else. The playback hook already writes the
 * sentence under it — it knows which credential was refused and why — and a
 * second sentence here would either contradict it or repeat it. Every host
 * renders `problem.message` under this heading (H2 R10: one copy table, two
 * hosts, and the hook still owns the body).
 */
export const FILM_REFUSAL_COPY = {
  stale: {
    heading: "This video is no longer attached",
    body: "The recording was removed from this match. The statistics and visualizations computed from it are unchanged.",
  },
  unavailable: {
    heading: "The video could not be reached",
    body: "Storage did not answer. Nothing has been lost — the recording is still attached to this match.",
  },
  denied: {
    heading: "You can no longer watch this video",
  },
  unknown: {
    heading: "This match's video could not be checked",
    body: "We could not read whether this match has a video. Reload in a moment — nothing has been lost.",
  },
  loadFailure: {
    heading: "The film stopped loading",
    body: "The stream broke partway through. Your position is kept.",
  },
  buttons: {
    back: "Back to the report",
    retry: "Try again",
  },
} as const;
