import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  SettingsCard,
  SettingsCardFootnote,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import { TwoBucketMeter } from "@/components/dashboard/credits/two-bucket-meter";
import type { UsageCardView } from "@/lib/billing/plan-copy";
import { formatAnalysisTime } from "@/lib/data/usage-format";

/**
 * Settings › Usage's personal card once plans apply to the player
 * (`plansApplyTo()`): the meter, the plan and extra hours on one line, and
 * "This month" — the matches analysed in the current hours window, one row
 * each in the team card's row form (name, a quiet date, the time; no bars).
 *
 * Every word is `usageCardView()`'s, so the card's states can be read without
 * mounting it. An empty window keeps the section and says so in its heading
 * slot; it never draws sample rows.
 */
export function PersonalUsageCard({ view }: { view: UsageCardView }) {
  return (
    <SettingsCard className="gap-3 py-5">
      <SettingsCardTitle
        trailing={
          <span className="mono text-[11px] text-[var(--ink-500)]">
            {view.trailing}
          </span>
        }
      >
        Your analysis time
      </SettingsCardTitle>

      {view.balance && <TwoBucketMeter balance={view.balance} />}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--ink-500)]">
        <span>{view.line}</span>
        <span className="flex-1" />
        <Link
          href={view.link.href}
          className="inline-flex items-center gap-1 text-[var(--blue)] transition-colors duration-200 hover:text-[var(--blue-hover)]"
        >
          {view.link.label}
          <ArrowRight className="size-3" strokeWidth={1.75} aria-hidden />
        </Link>
      </div>

      <div className="flex flex-col border-t border-[var(--border-hairline)] pt-3">
        <div className="flex items-baseline justify-between pb-1">
          <span className="text-[12px] font-medium text-[var(--ink-900)]">
            This month
          </span>
          <span className="text-[11px] text-[var(--ink-500)]">
            {view.thisMonth.summary}
          </span>
        </div>
        {view.thisMonth.rows.map((row) => (
          <div
            key={row.id}
            className="flex items-center border-b border-[var(--border-hairline)] py-2 last:border-b-0"
          >
            <span className="min-w-0 truncate text-[12px] text-[var(--ink-900)]">
              {row.name}
            </span>
            {row.date && (
              <span className="ml-2 shrink-0 text-[11px] text-[var(--ink-500)]">
                {row.date}
              </span>
            )}
            <span className="mono ml-auto shrink-0 pl-3 text-[11px] text-[var(--ink-700)]">
              {formatAnalysisTime(row.seconds)}
            </span>
          </div>
        ))}
      </div>

      <SettingsCardFootnote>{view.footnote}</SettingsCardFootnote>
    </SettingsCard>
  );
}
