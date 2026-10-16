/**
 * Fixed account states for `/design/credits`.
 *
 * Every figure is literal so the page reads the same on any day. "Now" is
 * mid-October 2026: free hours reset Nov 1 and end Dec 31, and a pack bought
 * today expires Oct 16, 2027.
 */

export interface CreditPack {
  id: "1h" | "5h";
  hours: number;
  priceUsd: number;
}

export const PACKS: readonly CreditPack[] = [
  { id: "1h", hours: 1, priceUsd: 14 },
  { id: "5h", hours: 5, priceUsd: 60 },
];

/** One purchase. Spent oldest-expiring first. */
export interface CreditLot {
  boughtOn: string;
  pack: CreditPack["id"];
  remainingSeconds: number;
  expiresOn: string;
}

export interface AccountState {
  id: string;
  label: string;
  freeCapSeconds: number;
  freeUsedSeconds: number;
  credits: readonly CreditLot[];
}

export const MONTH = "October";
export const RESETS_ON = "Nov 1";
export const FREE_ENDS = "Dec 31";
export const NEW_PACK_EXPIRES = "Oct 16, 2027";

const H = 3600;
const M = 60;

export const STATES = {
  fresh: {
    id: "fresh",
    label: "Fresh month — 2h free, no credits",
    freeCapSeconds: 2 * H,
    freeUsedSeconds: 0,
    credits: [],
  },
  low: {
    id: "low",
    label: "Running low — 24m free left, no credits",
    freeCapSeconds: 2 * H,
    freeUsedSeconds: 1 * H + 36 * M,
    credits: [],
  },
  carried: {
    id: "carried",
    label: "Free hours spent, credits carry it — 3h 40m in credits",
    freeCapSeconds: 2 * H,
    freeUsedSeconds: 2 * H,
    credits: [
      {
        boughtOn: "Oct 4, 2026",
        pack: "5h",
        remainingSeconds: 3 * H + 40 * M,
        expiresOn: "Oct 4, 2027",
      },
    ],
  },
  spent: {
    id: "spent",
    label: "All spent — no free hours, no credits",
    freeCapSeconds: 2 * H,
    freeUsedSeconds: 2 * H,
    credits: [],
  },
  pilot: {
    id: "pilot",
    label: "Pilot player — 10h free, 1h in credits",
    freeCapSeconds: 10 * H,
    freeUsedSeconds: 6 * H + 15 * M,
    credits: [
      {
        boughtOn: "Oct 12, 2026",
        pack: "1h",
        remainingSeconds: 1 * H,
        expiresOn: "Oct 12, 2027",
      },
    ],
  },
  expiring: {
    id: "expiring",
    label: "Two packs — the older one is spent first",
    freeCapSeconds: 2 * H,
    freeUsedSeconds: 2 * H,
    credits: [
      {
        boughtOn: "Nov 2, 2026",
        pack: "1h",
        remainingSeconds: 25 * M,
        expiresOn: "Nov 2, 2027",
      },
      {
        boughtOn: "Mar 9, 2027",
        pack: "5h",
        remainingSeconds: 5 * H,
        expiresOn: "Mar 9, 2028",
      },
    ],
  },
} as const satisfies Record<string, AccountState>;

export function freeLeft(s: AccountState): number {
  return Math.max(0, s.freeCapSeconds - s.freeUsedSeconds);
}

export function creditsLeft(s: AccountState): number {
  return s.credits.reduce((sum, lot) => sum + lot.remainingSeconds, 0);
}

export function totalLeft(s: AccountState): number {
  return freeLeft(s) + creditsLeft(s);
}

/** Wizard video lengths, in seconds. */
export const VIDEO = {
  /** Fits inside a fresh month's 2h. */
  short: 1 * H + 4 * M,
  /** Needs 1h 12m: more than 24m free, so it spills or is refused. */
  long: 1 * H + 12 * M,
};
