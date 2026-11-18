"use client";

import Link from "next/link";
import { StatePill } from "@/components/ui/state-pill";
import { AnalysisStatusLine } from "@/components/dashboard/shared/analysis-status-line";
import {
  UNTITLED_DRAFT,
  draftTitle,
  stepLabel,
} from "@/lib/wizard/draft-row-fields";
import { formatMatchDayShortYear } from "@/lib/data/match-day";
import { draftHref, type DraftRowData } from "./draft-row";
import { DraftDiscardMenu } from "./draft-discard-menu";
import { matchCardId } from "./match-card-gallery";

/**
 * DraftCard — `DraftRow`'s twin below `lg`, where the table gives way to cards.
 *
 * What the draft has answered and the step it stopped at, in the match card's
 * chrome. The card is the link back into the wizard; the ⋯ in its corner
 * holds Discard (`DraftDiscardMenu`), a sibling of the link rather than a
 * child, so pressing it never follows the link.
 */
export function DraftCard({
  draft,
  scope,
}: {
  draft: DraftRowData;
  scope: "personal" | "team";
}): React.JSX.Element {
  const name = draftTitle(draft, scope);
  const title = name ?? UNTITLED_DRAFT;

  return (
    <div className="relative w-full">
      <Link
        href={draftHref(draft.id, scope)}
        id={matchCardId(draft.id)}
        aria-label={`${title}, draft`}
        className="flex w-full flex-col gap-3 rounded-[14px] border border-[#F3F3F3] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[box-shadow,border-color] duration-200 hover:border-[#E5E5EA] hover:shadow-[0px_6px_20px_0px_rgba(0,0,0,0.10)] focus-visible:outline-none"
      >
        <span className="flex items-center justify-between gap-3">
          <span className="eyebrow min-w-0 truncate">
            {draft.eventLabel ?? "No event yet"}
          </span>
          {draft.matchDate && (
            <span className="text-micro tabular shrink-0">
              {formatMatchDayShortYear(draft.matchDate)}
            </span>
          )}
        </span>
        <span className="flex min-w-0 items-center gap-2">
          <span className="min-w-0 truncate text-[13px] font-medium text-[var(--ink-900)]">
            {title}
          </span>
          <StatePill outline className="shrink-0">
            Draft
          </StatePill>
        </span>
        {/* Clear of the ⋯ in the corner. */}
        <AnalysisStatusLine mark="wait" className="pr-9">
          {stepLabel(draft.step, draft.providerKind)}
        </AnalysisStatusLine>
      </Link>
      <DraftDiscardMenu
        draftId={draft.id}
        matchName={name}
        className="absolute right-3.5 bottom-3.5"
      />
    </div>
  );
}
