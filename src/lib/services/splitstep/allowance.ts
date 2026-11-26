/**
 * Which video hours a workspace draws, and over which window — the one
 * resolver every meter and the reservation read, so they name one number.
 *
 * Before `PLANS_BEGIN` (January 1, 2027, UTC) the answer is the beta's:
 * 2 h a calendar month for a player, 10 h for a pilot individual, 75 h for a
 * college or a team an admin put on the pilot. From that instant it is the
 * plan's:
 *
 *  - personal: Free has none; Coach and Coach Pro draw their monthly hours
 *    over the HOURS WINDOW, a month-long slice anchored on the subscription
 *    (`users.plan_period_start` plus whole months), which is the Stripe
 *    period for a monthly subscriber and a fresh month twelve times a year
 *    for a yearly one;
 *  - team: a season plan's hours over the whole season, one pool; else a
 *    running pilot's 75 h a calendar month; else none. Being a college no
 *    longer grants hours.
 *
 * An admin's own allowance (`videoHoursOverride`) and an admin's unlimited
 * personal workspace behave as before on both sides of the date.
 *
 * `windowed` says which ledger read and reserve RPC go with the answer: the
 * month-keyed ones (`billing_month = billingMonth`) before the date, the
 * window-keyed ones (`created_at` in `[windowStart, windowEnd)`) after —
 * `20261126070000_plans_2027_allowances.sql`.
 *
 * Client-safe and pure: no I/O, no server imports. `now` is always a
 * parameter so both sides of the switch can be tested.
 */

import {
  PILOT_LATEST_END,
  planHoursSeconds,
  plansHaveBegun,
  programPlanFor,
} from "@/lib/billing/plans";
import { UNLIMITED_CAP_SECONDS } from "@/lib/data/usage-format";
import { planFor } from "@/lib/user/plan";
import type { Workspace } from "@/lib/workspace/types";
import {
  currentBillingMonth,
  getMonthlyCapSeconds,
  getPilotIndividualCapSeconds,
  type AccountType,
} from "./config";

export type AllowanceKind =
  "beta" | "plan" | "season" | "pilot" | "none" | "unlimited" | "override";

export interface VideoAllowance {
  kind: AllowanceKind;
  /** The cap for the window, in seconds. `UNLIMITED_CAP_SECONDS` for none. */
  capSeconds: number;
  /** First instant of the window, inclusive. */
  windowStart: Date;
  /** First instant after the window. Unused hours do not pass it. */
  windowEnd: Date;
  /**
   * False before `PLANS_BEGIN`: usage is keyed by `billingMonth` and the
   * month-keyed RPCs reserve. True after: usage is what was created inside
   * the window and the window-keyed RPCs reserve.
   */
  windowed: boolean;
  /** `YYYY-MM-01` for `now`, UTC — what a new ledger row is filed under. */
  billingMonth: string;
}

/** The part of an allowance a ledger read or a window-keyed RPC is scoped by. */
export type AllowanceScope = Pick<
  VideoAllowance,
  "windowed" | "billingMonth" | "windowStart" | "windowEnd"
>;

/** The workspace fields the answer depends on. All but `kind` may be absent. */
export type AllowanceWorkspace = Pick<
  Workspace,
  | "kind"
  | "orgType"
  | "individualPilot"
  | "pilotEligible"
  | "pilotEndsOn"
  | "pilotEndedAt"
  | "programPlan"
  | "plan"
  | "planPeriodStart"
  | "unlimitedVideo"
  | "videoHoursOverride"
>;

/**
 * Which monthly FIGURE the beta caps a workspace at — a different question
 * from `accountTypeFor()` in `quota.ts`, which names the ledger (every team
 * workspace files under `account_type = 'program'`, a custom org included).
 *
 * A VERIFIED collegiate program — org_type 'college', entered through the
 * claim flow's review — draws the 75-hour program figure on its own. A
 * self-serve custom org (club / high school / academy / other) has no
 * verification behind it and `create_custom_program` will mint one for any
 * signed-in account, so it starts on the INDIVIDUAL figure and moves to the
 * program figure only when an admin grants `programs.pilot_eligible`
 * (`admin_set_pilot_eligible`, Admin › Teams). `admin_reserve_video_quota`
 * spells the same predicate in SQL.
 *
 * The beta's rule only. From `PLANS_BEGIN`, `allowanceFor()` below reads the
 * plan instead and a college draws nothing for being one.
 */
export function quotaTierFor(
  workspace: Pick<Workspace, "kind" | "orgType" | "pilotEligible">,
): AccountType {
  if (workspace.kind !== "team") return "individual";
  if (workspace.orgType === "college") return "program";
  return workspace.pilotEligible === true ? "program" : "individual";
}

/** The UTC calendar month `now` falls in. */
export function calendarMonthWindow(now: Date): { start: Date; end: Date } {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return {
    start: new Date(Date.UTC(year, month, 1)),
    end: new Date(Date.UTC(year, month + 1, 1)),
  };
}

/**
 * `anchor` plus `months` whole months, UTC, keeping the time of day. A day
 * the target month does not have lands on its last day (the 31st → Feb 28),
 * and every step is taken from the anchor, so the 31st comes back in March
 * rather than drifting to the 28th — what Stripe does with a billing anchor
 * and what Postgres does with `anchor + n * interval '1 month'`.
 */
function addMonthsUtc(anchor: Date, months: number): Date {
  const index = anchor.getUTCFullYear() * 12 + anchor.getUTCMonth() + months;
  const year = Math.floor(index / 12);
  const month = index - year * 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      year,
      month,
      Math.min(anchor.getUTCDate(), lastDay),
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
      anchor.getUTCMilliseconds(),
    ),
  );
}

/**
 * The hours window `now` falls in: `anchor` plus N whole months, for the
 * largest N whose start is not after `now`, to one month later. With no
 * anchor (or an unreadable one) it is the calendar month.
 */
export function hoursWindow(
  anchor: string | null | undefined,
  now: Date,
): { start: Date; end: Date } {
  const from = anchor ? new Date(anchor) : null;
  if (!from || Number.isNaN(from.getTime())) return calendarMonthWindow(now);

  let n =
    (now.getUTCFullYear() - from.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - from.getUTCMonth());
  if (addMonthsUtc(from, n).getTime() > now.getTime()) n -= 1;
  return { start: addMonthsUtc(from, n), end: addMonthsUtc(from, n + 1) };
}

/** `now`'s UTC calendar day, `YYYY-MM-DD`. */
function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Midnight UTC that starts the day after `day` (`YYYY-MM-DD`). */
function dayAfter(day: string): Date {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date;
}

/**
 * Whether a team's pilot is running on `now`'s UTC day: an admin put the team
 * on it, it has an end date that has not passed, and nobody ended it early.
 * `PILOT_LATEST_END` closes every pilot whatever its own date says. A team
 * with no end date read is not on a pilot — the fail-closed direction.
 */
export function pilotIsRunning(
  workspace: Pick<Workspace, "pilotEligible" | "pilotEndsOn" | "pilotEndedAt">,
  now: Date,
): boolean {
  if (workspace.pilotEligible !== true) return false;
  if (!workspace.pilotEndsOn || workspace.pilotEndedAt) return false;
  const today = utcDay(now);
  return today <= workspace.pilotEndsOn && today <= PILOT_LATEST_END;
}

function overrideSeconds(workspace: AllowanceWorkspace): number | null {
  return workspace.kind === "personal" &&
    workspace.videoHoursOverride != null &&
    Number.isFinite(workspace.videoHoursOverride)
    ? Math.round(workspace.videoHoursOverride * 3600)
    : null;
}

/** The beta's answer: a calendar month, and the figures in `config.ts`. */
function betaAllowance(
  workspace: AllowanceWorkspace,
): Pick<VideoAllowance, "kind" | "capSeconds"> {
  // An admin-set allowance wins over every other personal figure — the
  // database (`reserve_personal_quota`) applies the same rule, so the meter
  // and the refusal always name one number.
  const override = overrideSeconds(workspace);
  if (override !== null) return { kind: "override", capSeconds: override };
  if (workspace.kind === "personal" && workspace.unlimitedVideo) {
    return { kind: "unlimited", capSeconds: UNLIMITED_CAP_SECONDS };
  }
  if (workspace.kind === "personal" && workspace.individualPilot) {
    return { kind: "beta", capSeconds: getPilotIndividualCapSeconds() };
  }
  return {
    kind: "beta",
    capSeconds: getMonthlyCapSeconds(quotaTierFor(workspace)),
  };
}

export function allowanceFor(
  workspace: AllowanceWorkspace,
  now: Date = new Date(),
): VideoAllowance {
  const billingMonth = currentBillingMonth(now);
  const month = calendarMonthWindow(now);
  const monthly = { windowStart: month.start, windowEnd: month.end };

  if (!plansHaveBegun(now)) {
    return {
      ...betaAllowance(workspace),
      ...monthly,
      windowed: false,
      billingMonth,
    };
  }

  const base = { windowed: true, billingMonth };

  if (workspace.kind === "personal") {
    // Legacy `pro` and anything unknown read as Free — `planFor()`.
    const plan = planFor(workspace.plan);
    const planSeconds = planHoursSeconds(plan.id);
    // Only a plan that carries hours has a period to anchor on. Everyone
    // else — Free, an override on a Free account, an admin — keeps the
    // calendar month, and so does a paid plan whose period start is missing.
    const slice =
      planSeconds > 0 ? hoursWindow(workspace.planPeriodStart, now) : month;
    const window = { windowStart: slice.start, windowEnd: slice.end };

    const override = overrideSeconds(workspace);
    if (override !== null) {
      return { kind: "override", capSeconds: override, ...window, ...base };
    }
    if (workspace.unlimitedVideo) {
      return {
        kind: "unlimited",
        capSeconds: UNLIMITED_CAP_SECONDS,
        ...window,
        ...base,
      };
    }
    return planSeconds > 0
      ? { kind: "plan", capSeconds: planSeconds, ...window, ...base }
      : { kind: "none", capSeconds: 0, ...window, ...base };
  }

  const today = utcDay(now);
  const season = programPlanFor(workspace);
  if (season && season.startsOn <= today && today <= season.endsOn) {
    return {
      kind: "season",
      capSeconds: season.allowance.hours * 3600,
      windowStart: new Date(`${season.startsOn}T00:00:00Z`),
      windowEnd: dayAfter(season.endsOn),
      ...base,
    };
  }
  if (pilotIsRunning(workspace, now)) {
    return {
      kind: "pilot",
      capSeconds: getMonthlyCapSeconds("program"),
      ...monthly,
      ...base,
    };
  }
  return { kind: "none", capSeconds: 0, ...monthly, ...base };
}

/**
 * The day the window turns over, as `"Feb 1"` (UTC) — the date a surface
 * prints where it says the hours reset. Null when there is nothing to come
 * back: no allowance at all, or no cap. For a season it is the day after the
 * season ends, when its unused hours expire.
 */
export function allowanceResetsOn(allowance: VideoAllowance): string | null {
  if (allowance.kind === "none" || allowance.kind === "unlimited") return null;
  return allowance.windowEnd.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
