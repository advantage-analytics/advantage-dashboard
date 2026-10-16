/**
 * Credit packs — the one place the two packs, their prices and their shelf
 * life are written down (docs/plans/2027-player-pricing.md, stage 1).
 *
 * Pure and client-safe: the wizard paywall, Settings › Plan and the checkout
 * route all read it, so the price a player sees and the price they are
 * charged come from the same line.
 */

export type CreditPackId = "1h" | "5h";

export interface CreditPack {
  id: CreditPackId;
  hours: number;
  /** One-time price, US cents. */
  priceCents: number;
}

export const CREDIT_PACKS: readonly CreditPack[] = [
  { id: "1h", hours: 1, priceCents: 1400 },
  { id: "5h", hours: 5, priceCents: 6000 },
];

/** Credits last this long from the moment they are bought. */
export const CREDIT_VALIDITY_MONTHS = 12;

export function isCreditPackId(value: unknown): value is CreditPackId {
  return CREDIT_PACKS.some((pack) => pack.id === value);
}

export function creditPack(id: CreditPackId): CreditPack {
  const pack = CREDIT_PACKS.find((candidate) => candidate.id === id);
  if (!pack) throw new Error(`Unknown credit pack: ${id}`);
  return pack;
}

export function packSeconds(pack: CreditPack): number {
  return pack.hours * 3600;
}

/** `$14` — whole dollars, which both packs are. */
export function formatPackPrice(pack: CreditPack): string {
  return `$${pack.priceCents / 100}`;
}

/** `1 hour`, `5 hours`. */
export function packName(pack: CreditPack): string {
  return `${pack.hours} ${pack.hours === 1 ? "hour" : "hours"}`;
}

/** `$14 an hour`, `$12 an hour`. */
export function packPerHour(pack: CreditPack): string {
  return `$${Math.round(pack.priceCents / 100 / pack.hours)} an hour`;
}

/**
 * The pack the paywall pre-selects: the smallest one that covers a shortfall,
 * or the largest when none does on its own.
 */
export function smallestPackCovering(shortBySeconds: number): CreditPack {
  return (
    CREDIT_PACKS.find((pack) => packSeconds(pack) >= shortBySeconds) ??
    CREDIT_PACKS[CREDIT_PACKS.length - 1]
  );
}

/** When credits bought at `from` expire. UTC calendar months. */
export function creditExpiry(from: Date): Date {
  const expires = new Date(from.getTime());
  expires.setUTCMonth(expires.getUTCMonth() + CREDIT_VALIDITY_MONTHS);
  return expires;
}

/** `Oct 16, 2027` — a credit's expiry or purchase day, in UTC. */
export function formatCreditDate(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
