"use client";

import { useState } from "react";
import Link from "next/link";
import { Play } from "lucide-react";

import { isRecord, type AskSourceMatch } from "@/lib/services/ask/events";
import {
  readAskShowResponse,
  type AskShowResponse,
} from "@/lib/services/ask/show";

import { ASK_CLIP_STRIP_MAX, AskClipStrip } from "./ask-clip-strip";
import { AskPointList } from "./ask-point-list";
import { askSourceDate } from "./ask-sources";
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

  return (
    <div data-ask-show="" className="flex flex-col gap-3">
      {state.status !== "shown" && (
        <button
          type="button"
          onClick={show}
          disabled={loading}
          aria-busy={loading || undefined}
          className="inline-flex w-fit cursor-pointer items-center gap-1.5 rounded-sm text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] outline-none hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] disabled:cursor-default disabled:opacity-50"
        >
          <Play className="size-3" strokeWidth={1.5} aria-hidden="true" />
          {ASK_SHOW_LABEL}
        </button>
      )}
      {loading && (
        <p role="status" className="text-body-sm">
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
            href={state.value.href}
          />
        </>
      )}
      {state.status === "shown" && state.value.kind === "matches" && (
        <AskShowMatches matches={state.value.matches} />
      )}
    </div>
  );
}

/** Several matches: one row each, as the sources draw a match, with its count. */
function AskShowMatches({
  matches,
}: {
  matches: Extract<AskShowResponse, { kind: "matches" }>["matches"];
}) {
  const thisYear = new Date().getFullYear();
  return (
    <section
      data-ask-show-matches=""
      className="flex max-w-[420px] flex-col gap-0.5"
    >
      <h3 className="eyebrow-sm pb-2">Points in {matches.length} matches</h3>
      <ul className="flex flex-col">
        {matches.map(({ match, points, href }) => {
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
