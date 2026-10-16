/**
 * One bar, two buckets — free hours left, then credits left — for Settings ›
 * Plan (A1) and Settings › Usage (E1), drawn as the Credit Packs Mockups (docs/plans/2027-player-pricing.md) drew them.
 *
 * The width is the free allowance plus the credit balance, so a big credit
 * balance does not shrink the free segment to nothing: the free part sits at
 * its own cap's share. Credits are a lighter step of the same blue.
 */

export type BalanceSeverity = "ok" | "low" | "spent";

export interface HoursBalance {
  freeCapSeconds: number;
  freeLeftSeconds: number;
  creditSeconds: number;
}

/**
 * How loudly the balance speaks. Credits count: a player whose free hours are
 * spent but who holds credits is not "low" — they can still upload.
 */
export function balanceSeverity(b: HoursBalance): BalanceSeverity {
  const left = b.freeLeftSeconds + b.creditSeconds;
  if (left <= 0) return "spent";
  if (b.creditSeconds === 0 && left <= b.freeCapSeconds * 0.2) return "low";
  return "ok";
}

export const SEVERITY_FILL: Record<BalanceSeverity, string> = {
  ok: "var(--blue)",
  low: "var(--viz-key)",
  spent: "var(--danger)",
};

export function TwoBucketMeter({ balance }: { balance: HoursBalance }) {
  const free = balance.freeLeftSeconds;
  const credits = balance.creditSeconds;
  const whole = Math.max(1, balance.freeCapSeconds + credits);
  const severity = balanceSeverity(balance);
  const freeFill = severity === "low" ? SEVERITY_FILL.low : "var(--blue)";
  return (
    <div
      role="meter"
      aria-valuemin={0}
      aria-valuemax={whole}
      aria-valuenow={free + credits}
      aria-label="Video hours left"
      className="flex h-1.5 overflow-hidden rounded-[3px]"
      style={{ background: "var(--blue-soft)" }}
    >
      <div
        className="h-full"
        style={{ width: `${(free / whole) * 100}%`, background: freeFill }}
      />
      {credits > 0 && (
        <div
          className="h-full border-l border-white"
          style={{
            width: `${(credits / whole) * 100}%`,
            background: "var(--viz-you-mid)",
          }}
        />
      )}
    </div>
  );
}

export function MeterLegend({
  color,
  children,
}: {
  color: string;
  children: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="size-[7px] rounded-[2px]"
        style={{ background: color }}
        aria-hidden
      />
      {children}
    </span>
  );
}
