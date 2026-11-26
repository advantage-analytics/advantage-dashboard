import Link from "next/link";
import { Info } from "lucide-react";
import {
  noteIconCls,
  noteStripCls,
} from "@/components/dashboard/matches/new-match-wizard/styles";

/**
 * Personal Home's December note: the free beta hours end December 31.
 *
 * Grey, because it is a fact and nothing is wrong yet. One line, never
 * wrapped (`reference/primitives.md`, notice strips): `truncate` guards a
 * narrow viewport, the copy itself fits the column. The page shows it only
 * while `plansNoticeShowing()` holds. Copy approved by Cj, 2026-11-26.
 */
export function PlansNoticeStrip() {
  return (
    <div className={noteStripCls} role="note">
      <Info
        className={`${noteIconCls} text-[var(--ink-400)]`}
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1 truncate">
        <b className="font-medium text-[var(--ink-900)]">
          Free beta hours end December 31.
        </b>{" "}
        From January 1, analyzing a match needs a plan or extra hours.
      </span>
      <Link
        href="/dashboard/settings/plan"
        className="shrink-0 font-medium text-[var(--blue)] transition-colors duration-150 hover:text-[var(--blue-hover)]"
      >
        See plans →
      </Link>
    </div>
  );
}
