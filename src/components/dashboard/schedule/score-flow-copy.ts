/**
 * The score page's fixed chrome, shared by `ScoreOnlyFlow` and its route's
 * loading skeleton (`loading/score-flow-pending.tsx`) so the two cannot drift.
 *
 * Its own module, not an export of `score-only-flow.tsx`: that file is
 * `"use client"`, and a Server Component (`score/loading.tsx`) importing a
 * plain string from a client module receives a client reference, not the
 * string. It would also pull the flow's server actions and hooks into the
 * loading chunk for the sake of two words.
 */

/** The page's `<h1>` — the same on a dual line and a tournament entry. */
export const SCORE_FLOW_TITLE = "The result.";

/** The wizard's own content column, copied so the two pages measure the same. */
export const SCORE_FLOW_CONTENT_CLS = "mx-auto w-full max-w-[832px] px-14";
