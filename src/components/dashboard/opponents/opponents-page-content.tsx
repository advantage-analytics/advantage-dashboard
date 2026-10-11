"use client";

import { useState } from "react";
import Link from "next/link";
import type { PersonalOpponentsData } from "@/lib/data/personal-opponents-server";
import { cn } from "@/lib/utils";
import { OpponentsTable } from "./opponents-table";
import {
  OPPONENTS_PAGE_COLUMN,
  OPPONENTS_PAGE_FRAME,
  OPPONENTS_PAGE_GAP,
} from "./opponents-table-layout";
import { OpponentsTitleRow } from "./opponents-title-row";
import { OpponentsToolbarStatic } from "./opponents-toolbar";

/**
 * The populated personal Opponents page: title row, toolbar, the table card
 * and the footer line — the one list-page shape (`reference/tables.md`).
 *
 * A client component because it owns which opponent is selected. Nothing sets
 * that yet — the row click and the drawer it opens arrive together — but the
 * state lives here already so the table reads its selection from one place
 * and the drawer can sit beside the column without the page being re-cut.
 */
export function OpponentsPageContent({
  opponents,
  totals,
}: Pick<PersonalOpponentsData, "opponents" | "totals">) {
  const [selectedKey] = useState<string | null>(null);

  // Every opponent is listed: there is no filter to cut the set yet, so the
  // "shown" figure is the total.
  const shown = opponents.length;

  return (
    <div className={OPPONENTS_PAGE_FRAME}>
      <div className={cn(OPPONENTS_PAGE_COLUMN, OPPONENTS_PAGE_GAP)}>
        <OpponentsTitleRow totals={totals} />
        <OpponentsToolbarStatic />
        <OpponentsTable opponents={opponents} selectedKey={selectedKey} />

        <div className="flex items-center gap-2">
          <span className="text-micro tabular">
            {shown} of {totals.opponents}{" "}
            {totals.opponents === 1 ? "opponent" : "opponents"} ·{" "}
            {totals.analyzed} of {totals.matches}{" "}
            {totals.matches === 1 ? "match" : "matches"} analyzed
          </span>
          <div className="flex-1" />
          <Link
            href="/dashboard/statistics"
            className="rounded-sm text-[11px] font-medium whitespace-nowrap text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            Open Statistics
          </Link>
        </div>
      </div>
    </div>
  );
}
