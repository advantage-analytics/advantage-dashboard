import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SettingsCard } from "@/components/dashboard/settings/settings-card";
import { StatePill } from "@/components/ui/state-pill";
import { ProgramCrest } from "@/components/dashboard/settings/teams/program-crest";
import type { TeamListRow } from "@/lib/data/teams-server";
import { teamLabel } from "@/lib/workspace/types";
import { capitalize } from "@/lib/utils";

/**
 * Settings › Teams — every program the viewer belongs to, one row each.
 *
 * One titled card, rows inside it. A row says who (crest, name), which squad
 * and how big, and what you are there — nothing about hours, which belong to
 * the program's own page. The role pill is the one thing that tells the two
 * squads of one school apart at a glance, which is why it stays on the row.
 *
 * Rows are links, not buttons: each is a destination with its own URL.
 */
export function TeamsList({
  rows,
}: {
  rows: readonly (TeamListRow & { crestUrl: string | null })[];
}) {
  return (
    <SettingsCard className="max-w-[640px] gap-0 pt-[18px] pb-2">
      <div className="flex items-baseline gap-2.5 pb-1.5">
        <span className="text-[13px] font-medium text-[var(--ink-900)]">
          Your teams
        </span>
        <span className="text-[11px] text-[var(--ink-500)]">
          {rows.length} {rows.length === 1 ? "program" : "programs"}
        </span>
      </div>

      {rows.map((row) => {
        const squad = teamLabel(row.team);
        const meta = [
          squad ? `${squad} tennis` : null,
          `${row.playerCount} ${row.playerCount === 1 ? "player" : "players"}`,
        ]
          .filter(Boolean)
          .join(" · ");

        return (
          <Link
            key={row.id}
            href={`/dashboard/settings/teams/${row.id}`}
            className={[
              "relative -mx-2.5 flex items-center gap-3.5 rounded-[8px] px-2.5 py-[13px] transition-colors duration-150",
              "hover:bg-[var(--surface-subtle)] focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-none",
              // A hairline between rows that steps aside for the hover wash,
              // so the hovered row reads as one block rather than a stripe.
              // Drawn as its own straight 1px box, inset to the card's content
              // edge: an inset shadow on the row followed its 8px corners and
              // curled up at both ends. Every row gets the positioned
              // pseudo-element and only rows after the first colour it —
              // Tailwind's `before:` variant emits `content`, so a hover rule
              // on the first row would otherwise conjure an in-flow ::before
              // and push its crest 14px right by the flex gap.
              "before:pointer-events-none before:absolute before:inset-x-2.5 before:top-0 before:h-px before:content-['']",
              "[&+&]:before:bg-[var(--border-hairline)]",
              "hover:before:opacity-0 focus-visible:before:opacity-0 [&:focus-visible+&]:before:opacity-0 [&:hover+&]:before:opacity-0",
            ].join(" ")}
          >
            <ProgramCrest name={row.name} crestUrl={row.crestUrl} />
            <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className="truncate text-[13px] font-medium text-[var(--ink-900)]">
                {row.name}
              </span>
              <span className="text-[11px] text-[var(--ink-500)]">{meta}</span>
            </span>
            <StatePill>{capitalize(row.role)}</StatePill>
            <ChevronRight
              className="size-4 shrink-0 text-[var(--ink-300)]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </Link>
        );
      })}
    </SettingsCard>
  );
}
