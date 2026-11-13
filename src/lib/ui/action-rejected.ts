import {
  unstable_isUnrecognizedActionError,
  unstable_rethrow,
} from "next/navigation";
import posthog from "posthog-js";
import { isPostHogConfigured } from "@/lib/posthog-client";

export const DROPPED_CONNECTION =
  "Couldn't reach the server. Reload the page to see whether the change was saved.";

export const SERVER_FAILED =
  "Something went wrong on our side. Reload the page to see whether the change was saved.";

export const STALE_PAGE = "This page is out of date. Reload it and try again.";

/**
 * True when the request itself failed, rather than the server answering badly.
 *
 * Not a list of each browser's wording: `fetch` rejects with a `TypeError`
 * everywhere, and only the message differs — Safari's `Load failed`, Chrome's
 * `Failed to fetch`. The other case is a response that died part-way through,
 * which React reports as `Connection closed.`, minified to error #412 in a
 * production build. A throw from inside an action never reads as either,
 * because Flight rebuilds it on this side as a plain `Error` with a `digest`,
 * whatever it was on the server.
 */
function isDroppedConnection(error: unknown): boolean {
  return error instanceof TypeError || isClosedResponse(error);
}

/** A response that died part-way through, in dev's words or production's. */
export function isClosedResponse(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.message === "Connection closed." ||
      error.message.includes("React error #412"))
  );
}

/**
 * The `.catch` for a server action called inside a transition.
 *
 * Actions answer refusals as `{ ok: false, error }`, but a call can also
 * reject, and a rejection inside `startTransition` is thrown to the error
 * boundary: the whole page swapped for an error screen over one button.
 * `await action(input).catch(actionRejected)` turns it into one more refusal,
 * so it shows wherever the surface already shows them.
 *
 * - **`redirect()` and `notFound()` keep going.** Both arrive here as
 *   rejections, and swallowing one would strand the admin on a page the server
 *   has already navigated away from.
 * - **A dropped connection is not reported.** It is nothing we can fix, and
 *   the copy sends the reader to a reload rather than a retry because the
 *   request may have landed before the connection went.
 * - **A deploy that retired the action is not reported either.** Every open
 *   tab meets one, and the write definitely did not happen, so it says retry.
 * - **Anything else is a real failure and goes to PostHog.** `capture_exceptions`
 *   only sees what nobody caught, so this is the one chance. The `digest` is
 *   the thread back to the server log, since production strips the message.
 */
export function actionRejected(error: unknown): {
  ok: false;
  error: string;
} {
  unstable_rethrow(error);
  if (isDroppedConnection(error)) {
    return { ok: false, error: DROPPED_CONNECTION };
  }
  if (unstable_isUnrecognizedActionError(error)) {
    return { ok: false, error: STALE_PAGE };
  }
  if (isPostHogConfigured) {
    posthog.captureException(error, {
      source: "server_action",
      digest: (error as { digest?: unknown } | null)?.digest,
    });
  }
  return { ok: false, error: SERVER_FAILED };
}

/** `actionRejected`, for the actions that answer `{ ok, message }`. */
export function actionRejectedMessage(error: unknown): {
  ok: false;
  message: string;
} {
  return { ok: false, message: actionRejected(error).error };
}

/**
 * `actionRejected`, for a call whose failure has its own sentence: a read, where
 * "whether the change was saved" means nothing, or the second half of a write
 * that must say which half landed. Navigation still rethrows and a real failure
 * is still reported.
 *
 * A deploy that retired the action keeps `STALE_PAGE`: the caller's sentence
 * usually says to try again, and no retry from that tab can ever succeed.
 */
export function actionRejectedWith(sentence: string) {
  return (error: unknown): { ok: false; error: string } => {
    const refusal = actionRejected(error);
    return unstable_isUnrecognizedActionError(error)
      ? refusal
      : { ok: false, error: sentence };
  };
}
