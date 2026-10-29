/**
 * Admin › Pilots shapes and pure helpers — client-safe, so the table and the
 * dialogs can import them without pulling the service-role loader
 * (`admin-pilots-server.ts`) into their bundle.
 */
import { isUnlimitedCap } from "@/lib/data/usage-format";
import {
  PILOT_INDIVIDUAL_MAX_PLAYERS,
  PILOT_INDIVIDUAL_MONTHLY_CAP_HOURS,
} from "@/lib/services/splitstep/config";

/** One account's monthly allowance, as every surface on this page says it. */
export interface AccountAllowance {
  /**
   * The personal workspace's cap, in seconds — `monthlyCapSecondsFor()` with
   * the account's own flags and override, so it is the figure
   * `reserve_personal_quota` enforces. `UNLIMITED_CAP_SECONDS` for an admin
   * without an override (`isUnlimitedCap()`).
   */
  capSeconds: number;
  /** `users.video_hours_override` — null when the normal cap applies. */
  overrideHours: number | null;
}

export interface AdminPilotRow extends AccountAllowance {
  /** `users.id` — also their personal workspace's ledger key. */
  id: string;
  /** Display name, falling back to the email's local part. */
  name: string;
  email: string;
  avatarUrl: string | null;
  /** This month's personal-workspace video, in seconds (released rows excluded). */
  usedSeconds: number;
  /**
   * This month's video paid for with credits, in seconds. `processing_usage`
   * holds only the free-hours part of a job; the credit part is in
   * `video_credit_spends`. Vendor-billed time is the two together.
   */
  creditSeconds: number;
  /** Matches in their personal workspace (`created_by`, no program). */
  matchCount: number;
  /**
   * `users.individual_pilot_at` — when they were added to the pilot, stamped
   * by `users_individual_pilot_guard`. Null for pilots added before the
   * column existed (2026-10-28); the cell prints "—".
   */
  addedAt: string | null;
  /** New since this admin last looked, by `addedAt`. */
  fresh: boolean;
}

/** What the email field's live preview shows about an account. */
export interface AccountPreview extends AccountAllowance {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  isPilot: boolean;
  isAdmin: boolean;
  matchCount: number;
  joinedAt: string | null;
}

export type AccountPreviewResult =
  | { status: "found"; account: AccountPreview }
  | { status: "none" }
  | { status: "error"; message: string };

/** The fraction of the cap that counts as "Running low" (and on the nav). */
export const PILOT_LOW_FRACTION = 0.9;

export type PilotUsageState = "ok" | "low" | "spent" | "unlimited";

/**
 * How close an account is to its cap. A 0-hour allowance is "spent" from the
 * start: nothing can be sent, which is the thing the admin needs to see.
 */
export function pilotUsageState(
  usedSeconds: number,
  capSeconds: number,
): PilotUsageState {
  if (isUnlimitedCap(capSeconds)) return "unlimited";
  if (capSeconds <= 0 || usedSeconds >= capSeconds) return "spent";
  if (usedSeconds >= capSeconds * PILOT_LOW_FRACTION) return "low";
  return "ok";
}

/**
 * Hours with up to two decimals, the precision `video_hours_override` keeps —
 * "14", "2.5", "0.75". `formatHoursShort` rounds to a tenth, which would print
 * an allowance of 0.75 h as "0.8": wrong for a figure an admin typed.
 */
export function formatCapHours(seconds: number): string {
  const hours = Math.round((Math.max(0, seconds) / 3600) * 100) / 100;
  return String(hours);
}

/** "14 h", or "Unlimited" for an admin's own workspace. */
export function capLabel(capSeconds: number): string {
  return isUnlimitedCap(capSeconds)
    ? "Unlimited"
    : `${formatCapHours(capSeconds)} h`;
}

/** The header lede and the More menu's sub-line: "4 of 20 places used". */
export function pilotPlacesLabel(count: number): string {
  return `${count} of ${PILOT_INDIVIDUAL_MAX_PLAYERS} places used`;
}

/** The pilot's own figure — what "Add pilot" offers by default. */
export const PILOT_DEFAULT_HOURS = PILOT_INDIVIDUAL_MONTHLY_CAP_HOURS;

/** Largest allowance `admin_set_video_hours` accepts. */
export const MAX_VIDEO_HOURS = 10000;

export type ParsedHours =
  { ok: true; hours: number } | { ok: false; error: string | null };

/**
 * An hours field's text → a number the RPC accepts. `error: null` means
 * "nothing typed yet" — no complaint, just not ready.
 */
export function parseHours(raw: string): ParsedHours {
  const text = raw.trim();
  if (text === "") return { ok: false, error: null };
  if (!/^\d*\.?\d+$/.test(text) && !/^\d+\.$/.test(text)) {
    return { ok: false, error: "Enter hours as a number, like 14 or 2.5." };
  }
  const hours = Number(text);
  if (!Number.isFinite(hours)) {
    return { ok: false, error: "Enter hours as a number, like 14 or 2.5." };
  }
  if (/\.\d{3,}$/.test(text)) {
    return { ok: false, error: "Use at most two decimal places." };
  }
  if (hours > MAX_VIDEO_HOURS) {
    return {
      ok: false,
      error: `That is more than the ${MAX_VIDEO_HOURS.toLocaleString("en-US")} hours an account can hold.`,
    };
  }
  return { ok: true, hours };
}
