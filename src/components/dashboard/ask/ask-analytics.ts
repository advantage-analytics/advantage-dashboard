import {
  ASK_REFUSAL_CODES,
  track,
  type AnalyticsEvents,
  type AskRefusalCode,
} from "@/lib/analytics";
import type { AskOutcome, AskRequest } from "./use-ask-stream";

/**
 * The browser's half of Ask's analytics, for both pages (`/dashboard/ask` and
 * `/dashboard/team/ask`).
 *
 * The server's `ask_run` (`/api/ask`) is sent only once a question has
 * reached the run: a refusal before it — the month's questions spent, a team
 * with no matches, a sign-in that lapsed — and a question abandoned in flight
 * leave nothing behind, and the replay cannot say which. `ask_submitted` says
 * a question left the page; `ask_ended` says how the page saw it end, with
 * the route's refusal slug where there was one.
 *
 * Scope, outcome and the refusal code only — never the question, its tags or
 * anything else typed.
 */

type AskScope = AnalyticsEvents["ask_submitted"]["scope"];

function askScope(request: AskRequest): AskScope {
  return request.programId ? "team" : "personal";
}

const KNOWN_REFUSAL_CODES: ReadonlySet<string> = new Set(ASK_REFUSAL_CODES);

/** A refusal body's `code`, narrowed to the route's slugs; anything else is `other`. */
function askRefusalCode(code: string | null): AskRefusalCode {
  return code !== null && KNOWN_REFUSAL_CODES.has(code)
    ? (code as AskRefusalCode)
    : "other";
}

function askEndedProperties(
  request: AskRequest,
  outcome: AskOutcome,
): AnalyticsEvents["ask_ended"] {
  if (outcome.status === "refused") {
    return {
      scope: askScope(request),
      status: "refused",
      refusal_code: askRefusalCode(outcome.code),
      http_status: outcome.httpStatus,
    };
  }
  return {
    scope: askScope(request),
    status: outcome.status,
    refusal_code: null,
    http_status: null,
  };
}

type Capture = <E extends "ask_submitted" | "ask_ended">(
  event: E,
  properties: AnalyticsEvents[E],
) => void;

/** Analytics never gets to break a question: a throwing capture is dropped. */
function safely(send: () => void): void {
  try {
    send();
  } catch {
    // Nothing to do — the question carries on without its event.
  }
}

/**
 * Track one question from the moment it is sent: `ask_submitted` now,
 * `ask_ended` when `flight` settles. Returns `flight`'s outcome unchanged; a
 * `flight` that rejects is recorded as `error` and the rejection rethrown,
 * so the question never reads as abandoned.
 */
export async function trackAskFlight(
  request: AskRequest,
  flight: Promise<AskOutcome>,
  capture: Capture = track,
): Promise<AskOutcome> {
  safely(() => capture("ask_submitted", { scope: askScope(request) }));
  let outcome: AskOutcome;
  try {
    outcome = await flight;
  } catch (error) {
    safely(() =>
      capture("ask_ended", askEndedProperties(request, { status: "error" })),
    );
    throw error;
  }
  safely(() => capture("ask_ended", askEndedProperties(request, outcome)));
  return outcome;
}
