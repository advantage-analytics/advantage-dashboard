import { track, type AnalyticsEvents } from "@/lib/analytics";
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

function askEndedProperties(
  request: AskRequest,
  outcome: AskOutcome,
): AnalyticsEvents["ask_ended"] {
  const refused = outcome.status === "refused";
  return {
    scope: askScope(request),
    status: outcome.status,
    refusal_code: refused ? outcome.code : null,
    http_status: refused ? outcome.httpStatus : null,
  };
}

type Capture = <E extends "ask_submitted" | "ask_ended">(
  event: E,
  properties: AnalyticsEvents[E],
) => void;

/**
 * Track one question from the moment it is sent: `ask_submitted` now,
 * `ask_ended` when `flight` settles. Returns `flight`'s outcome unchanged.
 */
export async function trackAskFlight(
  request: AskRequest,
  flight: Promise<AskOutcome>,
  capture: Capture = track,
): Promise<AskOutcome> {
  capture("ask_submitted", { scope: askScope(request) });
  const outcome = await flight;
  capture("ask_ended", askEndedProperties(request, outcome));
  return outcome;
}
