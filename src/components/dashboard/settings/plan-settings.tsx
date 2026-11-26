"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import {
  SettingsCard,
  SettingsCardRow,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import {
  noteIconCls,
  noteStripCls,
} from "@/components/dashboard/matches/new-match-wizard/styles";
import { PlanCheckoutDialog } from "@/components/dashboard/billing/plan-checkout-dialog";
import { StatePill } from "@/components/ui/state-pill";
import {
  purchaseNote,
  type CheckoutAccount,
  type CheckoutMode,
  type CheckoutResult,
  type PreviewState,
} from "@/lib/billing/checkout-view";
import {
  buildPlanPage,
  type PlanPageAction,
  type PlanPageInput,
} from "@/lib/billing/plan-page-view";
import { PLAN_SETTINGS_PATH } from "@/lib/billing/plan-intent";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

const USAGE_HREF = "/dashboard/settings/usage";

/**
 * Settings › Plan once plans are on sale — the viewer's OWN plan, in a
 * personal workspace and a team one alike (a team's season plan is arranged
 * with us and shown in Admin, not bought here).
 *
 * Two cards for every player: _Video hours_ is one figure and one line (the
 * meter lives on Usage), and _Plan_ is rows — the plan, extra hours and, for
 * a subscriber, billing. What each row says is `buildPlanPage()`'s; every
 * button opens the one checkout dialog, or Stripe's portal for card,
 * receipts and cancelling.
 *
 * `initialDialog` is `?plan=&period=` from the landing site: the dialog opens
 * on it once and the query is dropped from the URL, so a reload does not
 * open it again.
 */
export function PlanSettings({
  initialDialog = null,
  cleanUrl = false,
  preview,
  ...input
}: PlanPageInput & {
  /** The dialog to open on arrival. */
  initialDialog?: CheckoutMode | null;
  /** The URL carried `?plan=` / `?period=`: drop them once read. */
  cleanUrl?: boolean;
  /** Fixed upgrade figures, for the design preview. */
  preview?: PreviewState;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<CheckoutMode | null>(initialDialog);
  const [done, setDone] = useState<CheckoutResult | null>(null);
  const [portal, setPortal] = useState<
    | { state: "idle" }
    | { state: "opening" }
    | { state: "failed"; message: string }
  >({ state: "idle" });
  // The page's own figures are stale between a purchase and the re-read:
  // hold the buttons until it lands, so nobody buys the same plan twice.
  const [refreshing, startRefresh] = useTransition();

  useEffect(() => {
    if (!cleanUrl) return;
    window.history.replaceState(null, "", PLAN_SETTINGS_PATH);
  }, [cleanUrl]);

  const view = buildPlanPage(input);
  const account: CheckoutAccount = {
    plan: input.plan,
    period: input.billing.period,
    planLeftSeconds: input.planLeftSeconds,
    extraSeconds: input.extraSeconds,
    resetsOn: input.allowanceKind === "plan" ? input.resetsOn : null,
    firstMonthEligible: !input.billing.everSubscribed,
  };

  const openPortal = async () => {
    setPortal({ state: "opening" });
    try {
      const response = await fetch("/api/billing/portal", { method: "POST" });
      const body = (await response.json().catch(() => null)) as {
        url?: string;
        error?: string;
      } | null;
      if (response.ok && body?.url) {
        window.location.assign(body.url);
        return;
      }
      setPortal({
        state: "failed",
        message: body?.error ?? "Billing couldn't open. Try again in a moment.",
      });
    } catch {
      setPortal({
        state: "failed",
        message: "Billing couldn't open. Check your connection and try again.",
      });
    }
  };

  const control = (action: PlanPageAction | undefined) => {
    if (!action) return undefined;
    if (action.kind === "portal") {
      return (
        <button
          type="button"
          disabled={portal.state === "opening"}
          onClick={() => void openPortal()}
          className={advButton("outline", "sm")}
        >
          {portal.state === "opening" ? "Opening…" : action.label}
        </button>
      );
    }
    return (
      <button
        type="button"
        disabled={refreshing}
        onClick={() => setDialog(action.mode)}
        className={advButton(action.tone, "sm")}
      >
        {action.label}
      </button>
    );
  };

  const note = done ? purchaseNote(done) : null;

  return (
    <div className="flex max-w-[640px] flex-col gap-5">
      {note && (
        <div className={noteStripCls} role="status">
          <CheckCircle2
            className={cn(noteIconCls, "text-[var(--ink-400)]")}
            strokeWidth={1.5}
            aria-hidden
          />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-medium text-[var(--ink-900)]">
              {note.lead}
            </span>{" "}
            {note.rest}
          </span>
        </div>
      )}

      <SettingsCard className="gap-2 bg-[var(--surface-card)]">
        <SettingsCardTitle
          trailing={
            <Link
              href={USAGE_HREF}
              className="text-[12px] text-[var(--blue)] hover:text-[var(--blue-hover)]"
            >
              See usage ↗
            </Link>
          }
        >
          Video hours
        </SettingsCardTitle>
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-title-lg text-[var(--ink-900)]">
            {view.hours.figure}
          </span>
          {view.hours.unit && (
            <span className="text-[12px] text-[var(--ink-500)]">
              {view.hours.unit}
            </span>
          )}
        </div>
        <span className="text-[12px] text-[var(--ink-600)]">
          {view.hours.line}
        </span>
      </SettingsCard>

      <SettingsCard className="bg-[var(--surface-card)]">
        <SettingsCardTitle className="mb-3">Plan</SettingsCardTitle>
        {view.rows.map((row) => (
          <SettingsCardRow
            key={row.id}
            label={
              row.id === "plan" ? (
                <span className="inline-flex items-center gap-2">
                  <span className="text-[13px] font-medium text-[var(--ink-900)]">
                    {row.label}
                  </span>
                  {row.pill && <StatePill>{row.pill}</StatePill>}
                </span>
              ) : (
                row.label
              )
            }
            description={
              row.id === "billing" && portal.state === "failed" ? (
                <span role="alert" className="text-[var(--danger)]">
                  {portal.message}
                </span>
              ) : (
                row.description
              )
            }
            control={control(row.action)}
          />
        ))}
      </SettingsCard>

      <PlanCheckoutDialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        mode={dialog ?? { kind: "choose" }}
        account={account}
        preview={preview}
        onDone={(result) => {
          setDialog(null);
          setDone(result);
          startRefresh(() => router.refresh());
        }}
      />
    </div>
  );
}
