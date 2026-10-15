"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { PeekDrawerFrame } from "@/components/dashboard/matches/match-drawer";
import type { AdminAskFeedbackRow } from "@/lib/data/ask-admin-view";
import { shortDate } from "@/lib/data/match-utils";
import { ASK_FEEDBACK_REASON_LABELS } from "@/lib/services/ask/feedback";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

/**
 * The Admin › Ask peek drawer: one thumb, read whole — the question with
 * its tags, the answer's headline and body, the verdict with its reasons and
 * note, the SQL that produced the answer, the asker by name and id, and the
 * way into PostHog.
 *
 * The shell is `PeekDrawerFrame`, the rail every list page's drawer draws:
 * ↑ ↓ stepping, "Feedback n / N", the close. No ⋯ — a thumb is read, not
 * edited; it is the player's own word. The footer holds the two PostHog
 * links as ghost buttons, with one sentence on what they open: no trace id
 * is stored (`ask-admin-view.ts`), so the traces page is filtered to the
 * answer's day and the person page lists the asker's events.
 */
export function AskFeedbackDrawer({
  row,
  index,
  total,
  closing,
  autoFocus,
  onPrev,
  onNext,
  onClose,
  onClosed,
}: {
  row: AdminAskFeedbackRow;
  index: number;
  total: number;
  closing: boolean;
  autoFocus: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onClosed: () => void;
}) {
  const Verdict = row.rating === "down" ? ThumbsDown : ThumbsUp;
  return (
    <PeekDrawerFrame
      kind="Feedback"
      label={row.question.text || "Ask feedback"}
      index={index}
      total={total}
      canPrev={index > 0}
      canNext={index < total - 1}
      closing={closing}
      autoFocus={autoFocus}
      focusKey={row.id}
      onPrev={onPrev}
      onNext={onNext}
      onClose={onClose}
      onClosed={onClosed}
      footer={
        <>
          <a
            href={row.posthog.traces}
            target="_blank"
            rel="noreferrer"
            className={cn(advButton("ghost", "md"), "w-full")}
          >
            LLM traces, that day
          </a>
          <a
            href={row.posthog.person}
            target="_blank"
            rel="noreferrer"
            className={cn(advButton("ghost", "md"), "w-full")}
          >
            The asker in PostHog
          </a>
          <p className="text-[11px] leading-[1.5] text-[var(--ink-500)]">
            No trace id is stored, so the traces open filtered to the
            answer&rsquo;s day; the person page lists this asker&rsquo;s runs.
          </p>
        </>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-[22px] pt-6 pb-[22px]">
        {/* The verdict, first: it is why the row is here. */}
        <section className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Verdict
              className="size-3.5 text-[var(--ink-700)]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span className="text-[13px] font-medium text-[var(--ink-900)]">
              {row.rating === "down" ? "Thumbs down" : "Thumbs up"}
            </span>
            <span className="text-[11px] text-[var(--ink-500)] tabular-nums">
              {shortDate(row.updatedAt)}
            </span>
          </div>
          {row.reasons.length > 0 && (
            <p className="text-[12px] text-[var(--ink-700)]">
              {row.reasons
                .map((reason) => ASK_FEEDBACK_REASON_LABELS[reason])
                .join(" · ")}
            </p>
          )}
          {row.note && (
            <p className="text-[12px] leading-[1.6] whitespace-pre-wrap text-[var(--ink-900)]">
              {row.note}
            </p>
          )}
        </section>

        <Section label="Question">
          <p className="text-[13px] leading-[1.55] whitespace-pre-wrap text-[var(--ink-900)]">
            {row.question.text || "—"}
          </p>
          {row.question.tags.length > 0 && (
            <p className="text-[11px] text-[var(--ink-500)]">
              Tagged:{" "}
              {row.question.tags
                .map((tag) => `${tag.label} (${tag.kind})`)
                .join(", ")}
            </p>
          )}
        </Section>

        <Section label="Answer">
          {row.answer.headline && (
            <p className="text-[13px] font-medium text-[var(--ink-900)]">
              {row.answer.headline}
            </p>
          )}
          {row.answer.body ? (
            <p className="text-[12px] leading-[1.6] whitespace-pre-wrap text-[var(--ink-700)]">
              {row.answer.body}
            </p>
          ) : (
            <p className="text-[12px] text-[var(--ink-500)]">No prose saved.</p>
          )}
          <p className="text-[11px] text-[var(--ink-500)]">
            {[
              row.answer.visualKind ? `${row.answer.visualKind} block` : null,
              row.answer.sourceCount !== null
                ? `${row.answer.sourceCount} ${row.answer.sourceCount === 1 ? "match" : "matches"}`
                : null,
              row.answer.mock ? "mock mode" : null,
            ]
              .filter(Boolean)
              .join(" · ") || "No block"}
          </p>
        </Section>

        <Section label="SQL">
          {row.answer.scopeSql && (
            <Sql label="scope_sql" text={row.answer.scopeSql} />
          )}
          {row.answer.sql ? (
            <Sql label="sql" text={row.answer.sql} />
          ) : (
            <p className="text-[12px] text-[var(--ink-500)]">
              No SQL saved with this answer.
            </p>
          )}
        </Section>

        <Section label="Asker">
          <p className="text-[12px] text-[var(--ink-900)]">{row.asker.name}</p>
          <p className="font-mono text-[11px] break-all text-[var(--ink-500)]">
            {row.asker.id}
          </p>
          <p className="text-[11px] text-[var(--ink-500)]">
            {row.program ? `In ${row.program.name}` : "Personal workspace"}
            {row.messageId === null && " · conversation deleted"}
          </p>
        </Section>
      </div>
    </PeekDrawerFrame>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="eyebrow-sm">{label}</h3>
      {children}
    </section>
  );
}

function Sql({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] text-[var(--ink-400)]">
        {label}
      </span>
      <pre className="max-h-[320px] overflow-auto rounded-[var(--radius-button)] bg-[var(--surface-page)] p-2.5 font-mono text-[11px] leading-[1.5] whitespace-pre-wrap text-[var(--ink-900)]">
        {text}
      </pre>
    </div>
  );
}
