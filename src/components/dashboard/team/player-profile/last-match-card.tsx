import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import { ResultMark } from "@/components/dashboard/result-mark";
import { RowAction } from "@/components/dashboard/schedule/row-action";
import { InsightStatChip } from "@/components/dashboard/shared/insight-stat-chip";
import { EmptyMark } from "@/components/ui/empty-mark";
import { clipText } from "@/lib/data/player-profile";
import type { ProfileLastMatch } from "@/lib/data/player-profile-server";

/**
 * The most recent match, and what the engine made of it.
 *
 * Three stacked bands, each behind a hairline: the match itself (who, where,
 * which line, the score and the outcome), then Advantage Intelligence's
 * paragraph for this player's side, then the evidence — five computed
 * numbers as `InsightStatChip`s. The two lower bands appear only when there
 * is something in them: a file-imported match has stats and no paragraph, a
 * hand-scored one has neither, and a band drawn around nothing would say the
 * engine had failed rather than that it was never asked.
 *
 * The paragraph is the stored `matches.insights` summary — a fact about the
 * match written once when it was analysed, never re-asked at render. Its
 * first sentence leads in 14px light; the rest follows in body grey.
 */
/**
 * The frame gives the claim one line and the body a line and a half; the
 * engine writes for the report page and can run longer. Both caps are
 * characters at the card's width, cut on a word, and "Why this" beside them
 * is the way to the whole paragraph.
 */
const CLAIM_MAX = 64;
const BODY_MAX = 170;

function splitClaim(summary: string): { claim: string; body: string | null } {
  const match = /^([\s\S]+?[.!?])\s+([\s\S]+)$/.exec(summary.trim());
  if (!match) return { claim: clipText(summary, CLAIM_MAX), body: null };
  return {
    claim: clipText(match[1], CLAIM_MAX),
    body: clipText(match[2], BODY_MAX),
  };
}

export function LastMatchCard({ match }: { match: ProfileLastMatch }) {
  const reportHref = `/dashboard/matches/${match.id}`;
  const insight = match.insight ? splitClaim(match.insight.summary) : null;

  const where = [match.school, match.line, match.date].filter(Boolean);

  return (
    <section
      aria-label="Last match"
      className="surface-card flex flex-col gap-3.5"
      style={{ padding: "18px 20px" }}
    >
      <div className="flex items-center gap-2.5">
        <span className="eyebrow">Last match</span>
        <div className="flex-1" />
        <RowAction href={reportHref}>Full report</RowAction>
      </div>

      <div className="grid grid-cols-[32px_minmax(0,1fr)_15px_auto] items-center gap-3">
        <span
          aria-hidden
          className="flex size-8 items-center justify-center rounded-[var(--radius-button)] bg-[var(--surface-subtle)] text-[12px] font-medium text-[var(--ink-700)]"
        >
          {match.opponentInitial}
        </span>
        <span className="flex min-w-0 flex-col gap-px">
          <span className="truncate text-[14px] text-[var(--ink-900)]">
            {match.opponent}
          </span>
          {where.length > 0 && (
            <span className="truncate text-[11px] text-[var(--ink-500)]">
              {match.school}
              {match.school && (match.line || match.date) ? " · " : ""}
              {(match.line || match.date) && (
                <span className="mono">
                  {[match.line, match.date].filter(Boolean).join(" · ")}
                </span>
              )}
            </span>
          )}
        </span>
        <span className="flex items-center justify-center">
          {match.won === null ? (
            <EmptyMark label="Score not recorded" />
          ) : (
            <ResultMark won={match.won} />
          )}
        </span>
        <span className="tabular text-[16px] font-light whitespace-nowrap text-[var(--ink-900)]">
          {match.score || "—"}
        </span>
      </div>

      {insight && (
        <div className="flex flex-col gap-3 border-t border-[var(--border-hairline)] pt-3.5">
          <div className="flex items-center gap-2">
            <span
              className="flex size-4 shrink-0 items-center justify-center rounded-[3px]"
              style={{ background: "var(--ink-900)" }}
              aria-hidden="true"
            >
              <Image
                src="/logos/logo3.svg"
                alt=""
                width={9}
                height={6}
                className="brightness-0 invert"
                aria-hidden="true"
              />
            </span>
            <span className="text-[12px] text-[var(--ink-700)]">
              Advantage Intelligence
            </span>
            <div className="flex-1" />
            <RowAction href={reportHref} className="gap-1.5">
              Why this
              <ArrowUpRight
                className="size-3"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </RowAction>
          </div>
          <p
            className="text-[14px] leading-[1.4] font-light text-[var(--ink-900)]"
            style={{ textWrap: "pretty" }}
          >
            {insight.claim}
          </p>
          {insight.body && (
            <p
              className="text-[12px] leading-[1.7] text-[var(--ink-600)]"
              style={{ textWrap: "pretty" }}
            >
              {insight.body}
            </p>
          )}
        </div>
      )}

      {match.chips.length > 0 && (
        <div className="flex flex-wrap gap-x-[22px] gap-y-2.5 border-t border-[var(--border-hairline)] pt-3.5">
          {match.chips.map((chip) => (
            <InsightStatChip
              key={chip.label}
              label={chip.label}
              value={chip.value}
            />
          ))}
        </div>
      )}
    </section>
  );
}
