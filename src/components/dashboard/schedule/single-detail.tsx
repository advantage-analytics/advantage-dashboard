"use client";

import { useState } from "react";
import Link from "next/link";
import { advButton } from "@/lib/ui/adv-button";
import { Badge } from "@/components/ui/badge";
import { StatusChip } from "@/components/ui/status-chip";
import { EventShell } from "@/components/dashboard/schedule/event-shell";
import { SingleScoreEntry } from "@/components/dashboard/schedule/single-score-entry";
import { matchWon } from "@/lib/schedule/entry-state";
import { formatEventDay, formatScore } from "@/lib/schedule/format";
import { isAnalysisFailed, isAnalysisReady, isInFlight, isWorking } from "@/lib/data/match-analysis";
import type { TeamSingleMatch } from "@/lib/data/single-match-server";

/**
 * 25i and 25j — a single match, empty and finished.
 *
 * One renderer, like the dual: the transition between "nothing recorded" and "a
 * report to read" is the thing being designed, and a separate empty screen
 * would have to be dismissed.
 *
 * Deliberately thin. The full stat surface lives at /dashboard/matches/[id] and
 * this does not duplicate it — the primary action once analysis lands is to go
 * there.
 */
export function SingleDetail({
  match,
  canEdit,
}: {
  match: TeamSingleMatch;
  canEdit: boolean;
}) {
  const [scoring, setScoring] = useState(false);

  const won = matchWon({
    id: match.id,
    round: match.round,
    status: match.status,
    score: match.score,
    opponentLabels: [],
    hasVideo: match.hasVideo,
  });
  const scored = formatScore(match.score?.player1, match.score?.player2);
  const ready = isAnalysisReady(match.status) && match.hasVideo;
  const working = isWorking(match.status);
  const waiting = match.hasVideo && isInFlight(match.status) && !working;
  const failed = isAnalysisFailed(match.status);

  const facts = [match.context, match.surface].filter(Boolean) as string[];

  return (
    <EventShell
      crumb={`${match.playerName} vs ${match.opponentName}`}
      trail={[{ label: "Schedule", href: "/dashboard/team/schedule" }]}
    >
      <div className="flex items-end gap-12">
        <div className="min-w-0 flex-1">
          <span className="eyebrow">
            Single match
            {match.matchType ? ` · ${match.matchType.toLowerCase()}` : ""} ·{" "}
            {formatEventDay(match.date.slice(0, 10))}
            {won !== null ? " · final" : ""}
          </span>

          {/* The page's h1 — the matchup, including the d./f./vs verb, because
              that is what names this page. */}
          <h1 className="mt-2 flex items-baseline gap-3">
            <span
              className="text-[30px] font-light leading-[34px] tracking-[-0.6px]"
              style={{ color: "var(--ink-900)" }}
            >
              {match.playerName}{" "}
              <span style={{ color: "var(--ink-600)" }}>
                {won === null ? "vs" : won ? "d." : "f."}
              </span>{" "}
              {match.opponentName}
            </span>
            {won !== null ? (
              <Badge variant={won ? "win" : "loss"}>{won ? "Won" : "Lost"}</Badge>
            ) : null}
          </h1>

          {facts.length > 0 ? (
            <div className="mt-3 flex items-center gap-2.5">
              {facts.map((fact, index) => (
                <span key={fact} className="flex items-center gap-2.5">
                  {index > 0 ? (
                    <span style={{ color: "var(--ink-300)" }}>·</span>
                  ) : null}
                  <span className="text-[13px]" style={{ color: "var(--ink-700)" }}>
                    {fact}
                  </span>
                </span>
              ))}
            </div>
          ) : null}
        </div>

        {scored ? (
          <div className="flex shrink-0 flex-col items-end gap-2.5">
            <span
              className="tabular text-[40px] font-light leading-[40px]"
              style={{ color: "var(--ink-900)" }}
            >
              {scored}
            </span>
            {ready ? (
              <Link
                href={`/dashboard/matches/${match.id}`}
                className={advButton("primary", "sm")}
              >
                View report
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      {ready || working || waiting || failed ? (
        <div className="mt-[26px] flex items-center gap-2 border-t border-[var(--border-hairline)] pt-3.5">
          {failed ? (
            <StatusChip tone="loss">Analysis failed</StatusChip>
          ) : ready ? (
            // "Analysis ready" and nothing more. 25j says "confidence high",
            // but the five quality scores the vendor returns sit unqueryable in
            // raw_webhook_payload (guardrails 5), so there is no confidence to
            // report — printing one would be the page making it up.
            <StatusChip tone="win">Analysis ready</StatusChip>
          ) : working ? (
            <StatusChip tone="blue" live>
              Analyzing
            </StatusChip>
          ) : (
            <StatusChip tone="blue">In line</StatusChip>
          )}
        </div>
      ) : null}

      {match.summary ? (
        <div className="mt-4 flex max-w-[640px] flex-col gap-2 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-4 py-3.5">
          <span className="eyebrow">From the report</span>
          <span
            className="text-[13px] leading-[1.55]"
            style={{ color: "var(--ink-700)" }}
          >
            {match.summary}
          </span>
        </div>
      ) : null}

      {scored ? null : (
        <div className="mt-7 max-w-[560px]">
          {scoring ? (
            <div className="border-t border-[var(--border-hairline)]">
              <SingleScoreEntry
                matchId={match.id}
                playerName={match.playerName}
                onDone={() => setScoring(false)}
              />
            </div>
          ) : (
            <Row label="Score">
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => setScoring(true)}
                  className="cursor-pointer text-[11px] font-medium text-[var(--blue-text)]"
                >
                  Add score
                </button>
              ) : null}
            </Row>
          )}

          <Row label="Video">
            {match.hasVideo ? (
              <span className="text-micro" style={{ color: "var(--ink-500)" }}>
                sent
              </span>
            ) : canEdit ? (
              <Link
                href={`/dashboard/team/upload?match=${match.id}`}
                className="text-[11px] font-medium text-[var(--blue-text)]"
              >
                Upload video
              </Link>
            ) : null}
          </Row>

          <div className="border-t border-[var(--border-hairline)]" />

          <p className="text-micro mt-3.5" style={{ color: "var(--ink-500)" }}>
            both optional until it&rsquo;s played — the match simply waits
          </p>
        </div>
      )}

      {scored && !match.hasVideo && canEdit ? (
        <div className="mt-6 max-w-[560px]">
          <Row label="Video">
            <Link
              href={`/dashboard/team/upload?match=${match.id}`}
              className="text-[11px] font-medium text-[var(--blue-text)]"
            >
              Upload video
            </Link>
          </Row>
          <div className="border-t border-[var(--border-hairline)]" />
        </div>
      ) : null}

      {ready ? (
        <p className="text-micro mt-4" style={{ color: "var(--ink-500)" }}>
          counts toward {match.playerName}&rsquo;s season alongside dual and
          tournament matches — same report, same trends
        </p>
      ) : null}
    </EventShell>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 border-t border-[var(--border-hairline)] py-3.5">
      <span className="flex-1 text-[13px]" style={{ color: "var(--ink-700)" }}>
        {label}
      </span>
      {children}
    </div>
  );
}
