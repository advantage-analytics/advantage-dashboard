/**
 * The onboarding age gate. Pure — no `react` or `next/*` imports, like
 * `answers.ts` and `steps.ts` — so the client step and the server actions
 * read one rule and an offline spec can pin it.
 *
 * Owner decision (2026-10-25, Terms 2.0 / Privacy 1.4 / Guardian Terms 1.1):
 *
 *   * under 13 never holds an account;
 *   * 13 to 17 may hold their own account ONLY to join a high school, club or
 *     academy team through that team's invitation or join link;
 *   * every other junior uses a guardian-managed account, which only a parent
 *     or legal guardian holds — so the guardian, the coach and the ordinary
 *     player paths all need an adult.
 *
 * The date of birth is written to `users.dob`, which is also what
 * `training_excluded_for()` reads to keep an under-18 account's video out of
 * model training (`20261026061018_match_training_exclusion.sql`).
 */

/** `adult` is 18+, `teen` 13–17, `child` under 13. */
export type AgeBand = "adult" | "teen" | "child";

const DOB_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The earliest year the field accepts — older is a typo, not a player. */
export const DOB_MIN = "1900-01-01";

/** Today as `YYYY-MM-DD`, in UTC — the server's day, so both sides agree. */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Whole years from `dob` to `today`, or null when `dob` is not a real
 * calendar day between `DOB_MIN` and `today`. Both are `YYYY-MM-DD`; the
 * comparison is on the date parts alone, so no time zone moves a birthday.
 */
export function ageOn(dob: unknown, today: string): number | null {
  if (typeof dob !== "string") return null;
  const match = DOB_PATTERN.exec(dob);
  const now = DOB_PATTERN.exec(today);
  if (!match || !now) return null;

  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  // Reject 2010-02-31 and friends: the Date round trip must land on the same day.
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== m - 1 ||
    probe.getUTCDate() !== d
  ) {
    return null;
  }
  if (dob < DOB_MIN || dob > today) return null;

  const [ty, tm, td] = [Number(now[1]), Number(now[2]), Number(now[3])];
  const hadBirthday = tm > m || (tm === m && td >= d);
  return ty - y - (hadBirthday ? 0 : 1);
}

/** The band for a date of birth, or null when it is not a usable date. */
export function ageBand(
  dob: unknown,
  today: string = todayUtc(),
): AgeBand | null {
  const age = ageOn(dob, today);
  if (age === null) return null;
  if (age < 13) return "child";
  if (age < 18) return "teen";
  return "adult";
}

/**
 * Whether a person of `band` may finish the path they are on. `viaTeamLink`
 * is true only on the join-link name step — the one path a 13–17-year-old
 * may take.
 */
export function ageAllows(band: AgeBand, viaTeamLink: boolean): boolean {
  if (band === "adult") return true;
  if (band === "teen") return viaTeamLink;
  return false;
}

/** The refusal each blocked band reads, on the screen and from the server. */
export const AGE_REFUSAL: Record<Exclude<AgeBand, "adult">, string> = {
  child:
    "You need to be 13 or older to have an Advantage account. A parent or legal guardian can create one and manage it for you.",
  teen: "Players under 18 can have their own account only to join their high school, club or academy team through its invitation or join link. Otherwise, a parent or legal guardian can create one and manage it for you.",
};

/** The refusal's heading, for each blocked band — onboarding and joining alike. */
export const AGE_REFUSAL_TITLE: Record<Exclude<AgeBand, "adult">, string> = {
  child: "You need to be 13 or older",
  teen: "Players under 18 join through their team",
};

export const DOB_ERROR = "Enter your date of birth.";
