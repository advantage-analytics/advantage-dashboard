import Link from "next/link";

import { MatchReportTitle } from "@/components/dashboard/matches/match-detail/report-title-row";
import { StatePill } from "@/components/ui/state-pill";
import { advButton } from "@/lib/ui/adv-button";

/**
 * The sample match's page title: the view's name — "Statistics",
 * "Visualizations" or "Video" — with a grey "Sample match" pill beside it,
 * so nobody mistakes the report for their own data.
 *
 * This replaced a sticky bar across the top of the pane ("Anonymised, and
 * not your data." plus a blue "Send your own match" button): the pill on the
 * title names the state where the eye already lands, without a second row of
 * chrome above the report. Grey, because a state is not an action
 * (`StatePill`). The way out moved to `SampleSendOwnMatch`.
 */
export function SampleTitle() {
  return (
    <div data-sample-title="" className="flex items-center gap-2.5">
      <MatchReportTitle />
      <StatePill className="shrink-0">Sample match</StatePill>
    </div>
  );
}

/**
 * The sample's one way out: "Send your own match", at the right end of the
 * title row — the slot a real report gives Ask and More, which the read-only
 * sample leaves empty. Outline, not blue: it should be findable without
 * pulling the eye off the report the reader came to look at.
 */
export function SampleSendOwnMatch() {
  return (
    <Link href="/dashboard/matches/new" className={advButton("outline", "sm")}>
      Send your own match
    </Link>
  );
}
