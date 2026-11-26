"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Play } from "lucide-react";

import { matchFilmHref } from "@/lib/match-video/film-entry";
import { isRecord, type AskSourceMatch } from "@/lib/services/ask/events";
import {
  readAskShowResponse,
  type AskShowResponse,
} from "@/lib/services/ask/show-response";

import { AskPointList } from "./ask-point-list";
import { ASK_SOURCES_SHOWN, askSourceDate } from "./ask-sources";
import { askMatchPlayers } from "./ask-tag-menu";

/**
 * "Watch the points" under a saved answer (roadmap 6.1): the one way from an
 * answer into the film on the points it counted. The server re-runs the
 * answer's own scope (`POST /api/ask/show`) and the model writes nothing.
 *
 * ── One click ───────────────────────────────────────────────────────────────
 * The points load as soon as the saved answer is on screen, not when it is
 * pressed. It used to be a "Show me these points" button that only fetched:
 * the press drew a clip strip and a link, and a second press on the link
 * opened the film. Loaded ahead, the line can say how many points there are
 * and go straight into the Video tab, so the label says what the click does.
 *
 * Over one match the line is `ask-point-list.tsx`: "Watch the 12 points" into
 * the film with the first point playing and the rest queued, and where they
 * fall beside it. Over several, one line counts the points across the
 * matches and opens a row per match, each into that match's film.
 *
 * While the points load the line holds its place, dimmed, so nothing moves
 * when they arrive. When they cannot be read the answer keeps a retry, and
 * over one match a way into its film ("Open the match's video").
 *
 * `answerId` is the saved answer's (`done.answerId`); an answer that has no
 * id yet, or no sources, has nothing to show and draws nothing.
 *
 * Keep this file's imports clear of `next/navigation`: it is rendered by
 * the Ask answer's offline harness once mounted there.
 */

export const ASK_SHOW_LOADING_LABEL = "Watch these points";
export const ASK_SHOW_FALLBACK = "The points could not be read. Try again.";
export const ASK_SHOW_RETRY_LABEL = "Try again";
export const ASK_SHOW_FILM_LABEL = "Open the match's video";

export type AskShowPost =
  | { ok: true; value: AskShowResponse }
  | { ok: false; message: string; code: string | null };

/** `POST /api/ask/show`. A refusal's own sentence, or the fallback. */
export async function postAskShow(
  answerId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AskShowPost> {
  try {
    const response = await fetchImpl("/api/ask/show", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answerId }),
    });
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    if (!response.ok) {
      const record = isRecord(body) ? body : {};
      return {
        ok: false,
        message:
          typeof record.error === "string" && record.error.trim() !== ""
            ? record.error
            : ASK_SHOW_FALLBACK,
        code: typeof record.code === "string" ? record.code : null,
      };
    }
    const value = readAskShowResponse(body);
    return value
      ? { ok: true, value }
      : { ok: false, message: ASK_SHOW_FALLBACK, code: null };
  } catch {
    return { ok: false, message: ASK_SHOW_FALLBACK, code: null };
  }
}

export interface AskShowMeProps {
  answerId: string;
  /** The answer's sources; none, and there is nothing to show. */
  sources: readonly AskSourceMatch[] | null;
  /** The request, for a harness. */
  post?: (answerId: string) => Promise<AskShowPost>;
}

/** "Watch 34 points across 5 matches": the several-matches line's words. */
export function askShowMatchesLabel(
  matches: Extract<AskShowResponse, { kind: "matches" }>["matches"],
): string {
  const points = matches.reduce((sum, entry) => sum + entry.points, 0);
  const n = matches.length;
  return `Watch ${points} ${points === 1 ? "point" : "points"} across ${n} ${n === 1 ? "match" : "matches"}`;
}

/** Up to this many matches, the Watch list opens with every row. */
export const ASK_SHOW_MATCHES_WHOLE = 3;

type ShowState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "shown"; value: AskShowResponse };

const LINE =
  "inline-flex w-fit items-center gap-1.5 rounded-sm text-[12px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] outline-none hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)]";

export function AskShowMe({
  answerId,
  sources,
  post = postAskShow,
}: AskShowMeProps) {
  const [state, setState] = useState<ShowState>({ status: "loading" });
  // Bumped by "Try again": the effect below re-runs the request.
  const [attempt, setAttempt] = useState(0);
  // Each load re-runs the answer's scope on the server, so a conversation
  // reopened with many answers asks only for the ones coming into view.
  const [near, setNear] = useState(false);
  const regionRef = useRef<HTMLDivElement>(null);
  const hasSources = Boolean(sources && sources.length > 0);

  useEffect(() => {
    const region = regionRef.current;
    if (!hasSources || near || !region) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(region);
    return () => observer.disconnect();
  }, [hasSources, near]);

  useEffect(() => {
    if (!hasSources || !near) return;
    let live = true;
    // Settles on every exit: a post that throws still leaves the retry.
    post(answerId)
      .then((result) => {
        if (!live) return;
        setState(
          result.ok
            ? { status: "shown", value: result.value }
            : { status: "error", message: result.message },
        );
      })
      .catch(() => {
        if (live) setState({ status: "error", message: ASK_SHOW_FALLBACK });
      });
    return () => {
      live = false;
    };
  }, [answerId, hasSources, near, post, attempt]);

  if (!sources || sources.length === 0) return null;
  // Busy only once the request is out: an answer not yet near the viewport
  // is waiting, not loading.
  const loading = near && state.status === "loading";

  return (
    <div
      ref={regionRef}
      data-ask-show=""
      data-ask-show-state={state.status}
      aria-busy={loading || undefined}
      className="flex flex-col gap-3"
    >
      {state.status === "loading" && (
        <>
          <p
            data-ask-show-placeholder=""
            aria-hidden="true"
            className={`${LINE} pointer-events-none opacity-50`}
          >
            <Play className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
            {ASK_SHOW_LOADING_LABEL}
          </p>
          {loading && (
            <p role="status" className="sr-only">
              Finding the points
            </p>
          )}
        </>
      )}
      {state.status === "error" && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p role="alert" className="text-body-sm text-[var(--ink-700)]">
            {state.message}
          </p>
          <button
            type="button"
            onClick={() => {
              setState({ status: "loading" });
              setAttempt((n) => n + 1);
            }}
            className={`${LINE} cursor-pointer text-[11px]`}
          >
            {ASK_SHOW_RETRY_LABEL}
          </button>
          {sources.length === 1 && (
            <Link
              href={matchFilmHref(sources[0].matchId)}
              data-ask-show-film=""
              className={`${LINE} text-[11px]`}
            >
              <Play className="size-3" strokeWidth={1.5} aria-hidden="true" />
              {ASK_SHOW_FILM_LABEL}
            </Link>
          )}
        </div>
      )}
      {state.status === "shown" && state.value.kind === "match" && (
        <AskPointList
          points={state.value.points}
          filters={state.value.filters}
          truncated={state.value.truncated}
          counted={state.value.counted}
          href={state.value.href}
        />
      )}
      {state.status === "shown" && state.value.kind === "matches" && (
        <AskShowMatches matches={state.value.matches} />
      )}
    </div>
  );
}

/**
 * Several matches: one line with the points across them, which opens one row
 * per match, each into that match's film. Capped as the sources are
 * (`ASK_SOURCES_SHOWN`) past `ASK_SHOW_MATCHES_WHOLE`: the first rows show and "All N" opens the rest in
 * place, so a long list never pushes the answer's footer a screen down.
 */
function AskShowMatches({
  matches,
}: {
  matches: Extract<AskShowResponse, { kind: "matches" }>["matches"];
}) {
  const [listOpen, setListOpen] = useState(false);
  const [all, setAll] = useState(false);
  const listId = useId();
  const thisYear = new Date().getFullYear();
  const count = matches.length;
  // A short list shows whole: hiding one row behind "All 3" saves no space
  // and costs a click on the way into that match's film.
  const capped = count > ASK_SHOW_MATCHES_WHOLE;
  const shown = all || !capped ? matches : matches.slice(0, ASK_SOURCES_SHOWN);
  return (
    <section
      data-ask-show-matches=""
      className="flex max-w-[420px] flex-col gap-1"
    >
      <button
        type="button"
        aria-expanded={listOpen}
        aria-controls={listId}
        onClick={() => setListOpen((open) => !open)}
        className={`${LINE} cursor-pointer`}
      >
        <Play className="size-3.5" strokeWidth={1.75} aria-hidden="true" />
        {askShowMatchesLabel(matches)}
      </button>
      <div
        id={listId}
        hidden={!listOpen}
        className="flex flex-col gap-0.5 pt-1"
      >
        <ul className="flex flex-col">
          {shown.map(({ match, points, href }) => {
            const date = askSourceDate(match.playedOn, thisYear);
            return (
              <li key={match.matchId}>
                <Link
                  href={href}
                  className="group -mx-2 flex h-9 items-center gap-2.5 rounded-[var(--radius-element)] px-2 transition-colors duration-[var(--duration-hover)] outline-none hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)]"
                >
                  <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-900)]">
                    {askMatchPlayers(match)}
                    <span className="text-[var(--blue)]">
                      {" "}
                      · Watch {points} {points === 1 ? "point" : "points"}
                    </span>
                  </span>
                  {date && (
                    <span className="mono text-right text-[10px] whitespace-nowrap text-[var(--ink-400)]">
                      {date}
                    </span>
                  )}
                  <Play
                    className="size-[13px] shrink-0 text-[var(--ink-300)] transition-colors duration-[var(--duration-hover)] group-hover:text-[var(--ink-900)]"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
        {capped && (
          <button
            type="button"
            aria-expanded={all}
            onClick={() => setAll((current) => !current)}
            className="w-fit cursor-pointer rounded-sm text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] outline-none hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)]"
          >
            {all ? `First ${ASK_SOURCES_SHOWN}` : `All ${count}`}
          </button>
        )}
      </div>
    </section>
  );
}
