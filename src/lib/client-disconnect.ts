/**
 * React's server renderer aborts a render with exactly this message when the
 * response socket closes before the page finished streaming: the visitor
 * navigated away, closed the tab or lost the connection mid-load. Next then
 * hands it to `onRequestError` like any render failure. Nothing broke on our
 * side and there is no one left to show an error to, so it is not reported.
 *
 * Matched on the exact text React uses (`createCancelHandler` in
 * react-dom-server), so a real stream failure with any other message is still
 * captured.
 */
const CLIENT_CLOSED_EARLY = "The destination stream closed early.";

/** True when a request error only means the client went away mid-stream. */
export function isClientDisconnect(error: unknown): boolean {
  return error instanceof Error && error.message === CLIENT_CLOSED_EARLY;
}
