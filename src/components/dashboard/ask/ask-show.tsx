"use client";

import { useEffect, useId, useRef, useState, type Ref } from "react";
import Link from "next/link";
import { Play } from "lucide-react";

import { isRecord, type AskSourceMatch } from "@/lib/services/ask/events";
import {
  readAskShowResponse,
  type AskShowResponse,
} from "@/lib/services/ask/show-response";

import { ASK_CLIP_STRIP_MAX, AskClipStrip } from "./ask-clip-strip";
import { AskPointList } from "./ask-point-list";
import { ASK_SOURCES_SHOWN, askSourceDate } from "./ask-sources";
import { askMatchPlayers } from "./ask-tag-menu";

/**
 * "Show me" under a saved answer (roadmap 6.1): a fixed action that opens
 * the film on the points the answer counted. It is the clarification
 * mechanism in reverse — the asker presses it, the server re-runs the
 * answer's own scope (`POST /api/ask/show`), and the model writes nothing.
 *
 * Over one match the answer is the points themselves: the point list
 * (`ask-point-list.tsx`), the inline clip strip for a small set
 * (`ask-clip-strip.tsx`, `ASK_CLIP_STRIP_MAX`), and "Watch all" into the
 * film with the first point playing and the rest queued. Over several it is
 * one row per match with its count, each into that match's film.
 *
 * `answerId` is the saved answer's (`done.answerId`); an answer that has no
 * id yet, or no sources, has nothing to show and draws nothing.
 *
 * Keep this file's imports clear of `next/navigation`: it is rendered by
 * the Ask answer's offline harness once mounted there.
 */

export const ASK_SHOW_LABEL = "Show me these points";
export const ASK_SHOW_FALLBACK = "The points could not be read. Try again.";

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

/**
 * What the one status region says once the points are in: the count over one
 * match, the match count over several.
 */
export function askShowAnnouncement(value: AskShowResponse): string {
  if (value.kind === "matches") {
    const n = value.matches.length;
    return `Points in ${n} ${n === 1 ? "match" : "matches"}`;
  }
  const n = value.points.length;
  return `${n} ${n === 1 ? "point" : "points"} found`;
}

type ShowState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "shown"; value: AskShowResponse };

export function AskShowMe({
  answerId,
  sources,
  post = postAskShow,
}: AskShowMeProps) {
  const [state, setState] = useState<ShowState>({ status: "idle" });
  const resultRef = useRef<HTMLHeadingElement>(null);
  // The button unmounts once the points are shown, taking focus with it:
  // hand focus to the result's heading instead of dropping it on <body>.
  useEffect(() => {
    if (state.status === "shown") resultRef.current?.focus();
  }, [state.status]);
  if (!sources || sources.length === 0) return null;

  async function show() {
    setState({ status: "loading" });
    const result = await post(answerId);
    if (!result.ok) {
      setState({ status: "error", message: result.message });
      return;
    }
    setState({ status: "shown", value: result.value });
  }

  const loading = state.status === "loading";
  // One status region for the component's whole life, its text changed in
  // place — a region mounted already holding text is often not announced.
  // An error is the alert below, so the status falls quiet for it.
  const announcement =
    state.status === "loading"
      ? "Finding the points"
      : state.status === "shown"
        ? askShowAnnouncement(state.value)
        : "";

  return (
    <div
      data-ask-show=""
      aria-busy={loading || undefined}
      className="flex flex-col gap-3"
    >
      <p role="status" data-ask-show-status="" className="sr-only">
        {announcement}
      </p>
      {state.status !== "shown" && (
        <button
          type="button"
          onClick={show}
          disabled={loading}
          className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-sm text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] outline-none hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] disabled:cursor-default disabled:opacity-50"
        >
          <Play className="size-3" strokeWidth={1.5} aria-hidden="true" />
          {ASK_SHOW_LABEL}
        </button>
      )}
      {loading && (
        <p aria-hidden="true" className="text-body-sm">
          Finding the points
        </p>
      )}
      {state.status === "error" && (
        <p role="alert" className="text-body-sm text-[var(--ink-700)]">
          {state.message}
        </p>
      )}
      {state.status === "shown" && state.value.kind === "match" && (
        <>
          {state.value.points.length <= ASK_CLIP_STRIP_MAX && (
            <AskClipStrip
              matchId={state.value.match.matchId}
              points={state.value.points}
              film={state.value.film}
              href={state.value.href}
            />
          )}
          <AskPointList
            match={state.value.match}
            points={state.value.points}
            filters={state.value.filters}
            truncated={state.value.truncated}
            counted={state.value.counted}
            href={state.value.href}
            headingRef={resultRef}
          />
        </>
      )}
      {state.status === "shown" && state.value.kind === "matches" && (
        <AskShowMatches matches={state.value.matches} headingRef={resultRef} />
      )}
    </div>
  );
}

/**
 * Several matches: one row each, as the sources draw a match, with its count.
 * Capped as the sources are (`ASK_SOURCES_SHOWN`): the first rows show and
 * "All N" opens the rest in place, so a long list never pushes the answer's
 * footer a screen down.
 */
function AskShowMatches({
  matches,
  headingRef,
}: {
  matches: Extract<AskShowResponse, { kind: "matches" }>["matches"];
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const thisYear = new Date().getFullYear();
  const count = matches.length;
  const shown = open ? matches : matches.slice(0, ASK_SOURCES_SHOWN);
  return (
    <section
      data-ask-show-matches=""
      className="flex max-w-[420px] flex-col gap-0.5"
    >
      <div className="flex items-center gap-3 pb-2">
        <h3
          ref={headingRef}
          tabIndex={-1}
          className="eyebrow-sm min-w-0 flex-1 outline-none"
        >
          Points in {count} {count === 1 ? "match" : "matches"}
        </h3>
        {count > ASK_SOURCES_SHOWN && (
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((current) => !current)}
            className="cursor-pointer rounded-sm text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] outline-none hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)]"
          >
            {open ? `First ${ASK_SOURCES_SHOWN}` : `All ${count}`}
          </button>
        )}
      </div>
      <ul id={listId} className="flex flex-col">
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
    </section>
  );
}
