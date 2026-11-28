import { notFound } from "next/navigation";
import { seasonAllowance } from "@/lib/billing/plans";
import { planUsageAlertEmail, usageAlertEmail } from "@/lib/services/email";
import { Plans2027Preview } from "./plans-2027-preview";

export const metadata = { title: "Plans 2027 preview" };

/**
 * The 2027 plan surfaces on fixtures, reachable without a session, a
 * subscription or a video: Settings › Plan for each plan, the one checkout
 * dialog in each of its scenes, the upload wizard's file step with its
 * hours note, and — from stage F — the header pill, Home's usage card,
 * Settings › Usage, a team page's Plan & hours card and the usage emails,
 * each in every plan and team state. Nothing is sent: the emails are only
 * rendered.
 *
 * Everything real is gated on `plansOnSale()` and on the viewer's own plan,
 * so none of it can be opened before January without this. The components
 * are the shipped ones; only their props are fixed (the upgrade's figures
 * come from the real `quoteUpgrade()` on fixed dates). `?state=<id>` picks
 * one surface; with none, the page lists them.
 *
 * Gated like `/design`: a 404 on the production deployment only.
 */
export default async function Plans2027DesignPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  if (process.env.VERCEL_ENV === "production") notFound();
  const { state } = await searchParams;
  return (
    <Plans2027Preview
      state={typeof state === "string" ? state : null}
      emails={previewEmails()}
    />
  );
}

const H = 3600;
/** A Program team's spring pool, as the plan module holds it. */
const SEASON_H = seasonAllowance("program", "spring").hours;

/** The real templates on the plan's own Player example, and a spring season. */
function previewEmails(): Record<string, string> {
  const player = {
    to: "jordan@example.com",
    planId: "player" as const,
    capSeconds: 5 * H,
    resetsAt: new Date("2027-02-14T00:00:00Z"),
  };
  const season = {
    to: "alex@example.com",
    recipientName: "Alex",
    programName: "Northfield University Men's",
    capSeconds: SEASON_H * H,
    billingMonth: "2027-03-01",
    period: "season" as const,
    seasonEndsOn: "2027-05-31",
    programId: "22222222-2222-2222-2222-222222222222",
  };
  return {
    low: planUsageAlertEmail({ ...player, severity: "low", usedSeconds: 4 * H })
      .html,
    spent: planUsageAlertEmail({
      ...player,
      severity: "spent",
      usedSeconds: 5 * H,
    }).html,
    "season-low": usageAlertEmail({
      ...season,
      severity: "low",
      usedSeconds: SEASON_H * 0.8 * H,
    }).html,
    "season-spent": usageAlertEmail({
      ...season,
      severity: "spent",
      usedSeconds: SEASON_H * H,
    }).html,
  };
}
