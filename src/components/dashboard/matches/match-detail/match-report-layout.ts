/**
 * The report pane's padding (`MatchReportPane`). A plain module, not the
 * `"use client"` one, so a Server Component that needs a bar to run edge to
 * edge across the pane (`SampleBanner`) reads the numbers rather than a
 * client reference.
 */
export const MATCH_REPORT_PANE_PAD = { top: 20, x: 56, bottom: 24 } as const;
