"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, TriangleAlert } from "lucide-react";
import {
  SettingsCard,
  SettingsCardFootnote,
  SettingsCardRow,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import {
  noteIconCls,
  noteStripCls,
} from "@/components/dashboard/matches/new-match-wizard/styles";
import {
  AddHoursDialog,
  type CreditsAdded,
} from "@/components/dashboard/credits/add-hours-dialog";
import {
  balanceSeverity,
  MeterLegend,
  SEVERITY_FILL,
  TwoBucketMeter,
  type HoursBalance,
} from "@/components/dashboard/credits/two-bucket-meter";
import { formatHoursLong, isUnlimitedCap } from "@/lib/data/usage-format";
import {
  CREDIT_PACKS,
  creditPack,
  formatCreditDate,
  formatPackPrice,
  packName,
  packPerHour,
  type CreditPackId,
} from "@/lib/services/credits/packs";
import type { CreditLot } from "@/lib/data/credits-server";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

/**
 * Settings › Plan in a personal workspace — the page that owns hours and
 * credits (the Credit Packs Mockups (docs/plans/2027-player-pricing.md) A1–A5).
 *
 * One hours card with one meter, free hours then credits (A1, or A4 for a
 * pilot player); the packs as one quiet line while hours remain (A2b), which
 * becomes the full pack card once the balance is low or spent (A2a); credit
 * history (A3); and, after a purchase, a first line saying what was added
 * (A5). No "plans from January" card until stage 2 is decided.
 *
 * Buying opens the same embedded checkout as the wizard's paywall. This page
 * could redirect, but one checkout is one thing to keep right.
 */
export function PersonalPlan({
  freeCapSeconds,
  freeLeftSeconds,
  creditSeconds,
  lots,
  nextCreditExpiresAt,
  pilot,
  resetsOn,
  freeEnds,
  legacyPro,
}: {
  freeCapSeconds: number;
  freeLeftSeconds: number;
  creditSeconds: number;
  lots: CreditLot[];
  /** When the oldest usable credits expire, from the balance read. */
  nextCreditExpiresAt: string | null;
  pilot: boolean;
  /** "Nov 1", or null in December when free hours end rather than reset. */
  resetsOn: string | null;
  /** "Dec 31, 2026". */
  freeEnds: string;
  /** The one account that bought the retired $4.99 Lifetime Pro. */
  legacyPro: boolean;
}) {
  const router = useRouter();
  const [dialogPack, setDialogPack] = useState<CreditPackId | null>(null);
  const [added, setAdded] = useState<CreditsAdded | null>(null);
  // The server's credit figure when the purchase landed. Until the refresh
  // brings a new one, the new hours are counted here; after it, they are in
  // `creditSeconds` already and must not be counted twice.
  const [creditsAtPurchase, setCreditsAtPurchase] = useState<number | null>(
    null,
  );
  const [packsOpen, setPacksOpen] = useState(false);

  const balance: HoursBalance = {
    freeCapSeconds,
    freeLeftSeconds,
    creditSeconds:
      creditSeconds +
      (added && creditsAtPurchase === creditSeconds ? added.seconds : 0),
  };
  const severity = balanceSeverity(balance);
  // Spent oldest-expiring first, so the next to expire is the soonest live
  // one. `nextCreditExpiresAt` is the server's answer to exactly that.
  const nextExpiry = nextCreditExpiresAt ?? undefined;

  return (
    <div className="flex max-w-[640px] flex-col gap-5">
      {added && (
        <div className={noteStripCls} role="status">
          <CheckCircle2
            className={cn(noteIconCls, "text-[var(--ink-400)]")}
            strokeWidth={1.5}
            aria-hidden
          />
          <span>
            <span className="font-medium text-[var(--ink-900)]">
              {packName(creditPack(added.pack))} added.
            </span>{" "}
            They last until {formatCreditDate(added.expiresAt)}. A receipt is on
            its way to your email.
          </span>
        </div>
      )}

      <HoursCard
        balance={balance}
        pilot={pilot}
        resetsOn={resetsOn}
        freeEnds={freeEnds}
        nextExpiry={nextExpiry ?? (added ? added.expiresAt : undefined)}
      />

      {/* An admin's free hours cover every upload, so credits would never
          be spent — no packs to sell. */}
      {isUnlimitedCap(freeCapSeconds) ? null : severity === "ok" &&
        !packsOpen ? (
        <PacksLine onSeePacks={() => setPacksOpen(true)} />
      ) : (
        <PacksCard freeEnds={freeEnds} onBuy={setDialogPack} />
      )}

      <HistoryCard lots={lots} />

      {legacyPro && (
        <p className="text-[11px] leading-[1.5] text-[var(--ink-500)]">
          Your early Pro purchase stays with your account.
        </p>
      )}

      <AddHoursDialog
        open={dialogPack !== null}
        onOpenChange={(open) => {
          if (!open) setDialogPack(null);
        }}
        initialPack={dialogPack ?? undefined}
        freeRemainingSeconds={freeLeftSeconds}
        creditSeconds={balance.creditSeconds}
        resetsOn={resetsOn}
        onCreditsAdded={(result) => {
          setDialogPack(null);
          setCreditsAtPurchase(creditSeconds);
          setAdded(result);
          router.refresh();
        }}
      />
    </div>
  );
}

function HoursCard({
  balance,
  pilot,
  resetsOn,
  freeEnds,
  nextExpiry,
}: {
  balance: HoursBalance;
  pilot: boolean;
  resetsOn: string | null;
  freeEnds: string;
  nextExpiry?: string;
}) {
  const free = balance.freeLeftSeconds;
  const credits = balance.creditSeconds;
  const severity = balanceSeverity(balance);
  const figureColor =
    severity === "ok" ? "var(--ink-900)" : SEVERITY_FILL[severity];

  // An admin's personal workspace — no cap, so no meter and no reset date.
  if (isUnlimitedCap(balance.freeCapSeconds)) {
    return (
      <SettingsCard className="gap-3.5 bg-[var(--surface-card)]">
        <SettingsCardTitle>Video hours</SettingsCardTitle>
        <span className="text-title-lg text-[var(--ink-900)]">Unlimited</span>
        <SettingsCardFootnote>
          Admin accounts have no monthly cap. Credits are never spent
          {credits > 0 ? `; you have ${formatHoursLong(credits)} unused.` : "."}
        </SettingsCardFootnote>
      </SettingsCard>
    );
  }

  return (
    <SettingsCard className="gap-3.5 bg-[var(--surface-card)]">
      <SettingsCardTitle
        trailing={
          <span className="text-[11px] text-[var(--ink-500)]">
            {resetsOn
              ? `Free hours reset ${resetsOn}`
              : `Free hours end ${freeEnds}`}
          </span>
        }
      >
        Video hours
      </SettingsCardTitle>

      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-title-lg" style={{ color: figureColor }}>
          {severity === "spent" ? "0h" : formatHoursLong(free + credits)}
        </span>
        <span className="text-[12px] text-[var(--ink-500)]">left</span>
        {severity !== "ok" && (
          <span
            className="ml-1 flex items-center gap-1.5 text-[11px]"
            style={{ color: SEVERITY_FILL[severity] }}
          >
            <TriangleAlert className="size-3" strokeWidth={1.75} aria-hidden />
            {severity === "low"
              ? "Running low"
              : resetsOn
                ? `Spent — free hours come back ${resetsOn}`
                : "Spent"}
          </span>
        )}
      </div>

      <TwoBucketMeter balance={balance} />

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-[var(--ink-600)]">
        <MeterLegend
          color={severity === "low" ? SEVERITY_FILL.low : "var(--blue)"}
        >
          {`Free: ${formatHoursLong(free)} of ${formatHoursLong(balance.freeCapSeconds)} this month`}
        </MeterLegend>
        <MeterLegend color="var(--viz-you-mid)">
          {credits > 0
            ? `Credits: ${formatHoursLong(credits)}`
            : "Credits: none"}
        </MeterLegend>
      </div>

      <SettingsCardFootnote>
        {pilot
          ? `Pilot: ${formatHoursLong(balance.freeCapSeconds)} free a month`
          : `${formatHoursLong(balance.freeCapSeconds)} free a month`}{" "}
        through {freeEnds}, used first. Credits are used after them, oldest
        first
        {nextExpiry
          ? ` — your next credits expire ${formatCreditDate(nextExpiry)}.`
          : "."}
      </SettingsCardFootnote>
    </SettingsCard>
  );
}

function PacksCard({
  freeEnds,
  onBuy,
}: {
  freeEnds: string;
  onBuy: (pack: CreditPackId) => void;
}) {
  return (
    <SettingsCard className="bg-[var(--surface-card)]">
      <SettingsCardTitle className="mb-3">Buy video hours</SettingsCardTitle>
      {CREDIT_PACKS.map((p) => (
        <SettingsCardRow
          key={p.id}
          label={packName(p)}
          description={`${packPerHour(p)} · Lasts 12 months`}
          control={
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-[var(--ink-900)]">
                {formatPackPrice(p)}
              </span>
              <button
                type="button"
                onClick={() => onBuy(p.id)}
                aria-label={`Buy ${packName(p)} for ${formatPackPrice(p)}`}
                className={advButton("outline", "sm")}
              >
                Buy
              </button>
            </div>
          }
        />
      ))}
      <SettingsCardFootnote className="mt-0 border-t-0 pt-1">
        Credits are used after your free hours. Unused credits carry past{" "}
        {freeEnds}. All sales final.
      </SettingsCardFootnote>
    </SettingsCard>
  );
}

/** A2b: the packs collapsed to one quiet line while hours remain. */
function PacksLine({ onSeePacks }: { onSeePacks: () => void }) {
  return (
    <SettingsCard className="bg-[var(--surface-card)] py-3.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex-1 text-[12px] text-[var(--ink-700)]">
          Need more than your free hours? Credit packs start at $14 an hour.
        </span>
        <button
          type="button"
          onClick={onSeePacks}
          className="inline-flex cursor-pointer items-center gap-1 text-[12px] text-[var(--blue)] hover:text-[var(--blue-hover)]"
        >
          See packs
          <ArrowRight className="size-3" strokeWidth={1.75} aria-hidden />
        </button>
      </div>
    </SettingsCard>
  );
}

function HistoryCard({ lots }: { lots: CreditLot[] }) {
  return (
    <SettingsCard className="bg-[var(--surface-card)]">
      <SettingsCardTitle className="mb-3">Credit history</SettingsCardTitle>
      {lots.length === 0 ? (
        <p className="border-t border-[var(--border-hairline)] pt-3 text-[11px] text-[var(--ink-500)]">
          No credits bought yet.
        </p>
      ) : (
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="eyebrow-sm text-[var(--ink-500)]">
              <th className="pb-2 font-normal">Bought</th>
              <th className="pb-2 font-normal">Pack</th>
              <th className="pb-2 text-right font-normal">Left</th>
              <th className="pb-2 text-right font-normal">Expires</th>
            </tr>
          </thead>
          <tbody>
            {lots.map((lot) => (
              <tr
                key={lot.id}
                className="border-t border-[var(--border-hairline)] text-[var(--ink-900)]"
              >
                <td className="py-2.5">{formatCreditDate(lot.boughtAt)}</td>
                <td className="py-2.5">
                  {lot.pack
                    ? packName(creditPack(lot.pack))
                    : `${formatHoursLong(lot.seconds)} added`}
                </td>
                <td className="tabular py-2.5 text-right">
                  {formatHoursLong(lot.remainingSeconds)}
                </td>
                <td className="py-2.5 text-right text-[var(--ink-600)]">
                  {formatCreditDate(lot.expiresAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </SettingsCard>
  );
}
