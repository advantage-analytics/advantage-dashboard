/**
 * The Admin › Teams Plan card's arithmetic: the draft an admin edits, what
 * the saved record is, whether saving would change anything, and what the
 * draft becomes on its way to `admin_set_program_plan`.
 *
 * Pure and client-safe, like `plans.ts`, so the card, its server action and
 * `tests/admin-plan-draft.spec.ts` all hold the same rules. Every name, price
 * and hour count printed from here is read out of `plans.ts`; this file types
 * no figure of its own.
 */

import {
  COLLEGE_PLANS,
  DEFAULT_ROSTER_SEATS,
  PLAN_TERM_LABELS,
  collegePlan,
  defaultSeasonDates,
  isCollegePlanId,
  isPlanTerm,
  rosterCapLabel,
  seasonAllowance,
  usd,
  type CollegePlan,
  type CollegePlanId,
  type PlanTerm,
} from "./plans";

/** `program_plans_note_length_check`, and the RPC's own refusal. */
export const PLAN_NOTE_MAX = 500;

/** The plan a team is on, as `admin_get_program_plan` returns it. */
export type SavedPlan = {
  planId: CollegePlanId;
  term: PlanTerm;
  /** `YYYY-MM-DD`, inclusive. */
  startsOn: string;
  /** `YYYY-MM-DD`, inclusive. */
  endsOn: string;
  /** The invoice or PO reference; null when none was written. */
  note: string | null;
};

/** What the card's fields hold. `planId` is null until an admin picks one. */
export type PlanDraft = {
  planId: CollegePlanId | null;
  term: PlanTerm;
  /** `YYYY-MM-DD`, or `""` while the field is empty. */
  startsOn: string;
  endsOn: string;
  /** As typed. Trimmed, and emptied to null, only on the way out. */
  note: string;
};

/** `admin_set_program_plan`'s arguments, by name. */
export type SetProgramPlanArgs = {
  p_program_id: string;
  p_plan_id: CollegePlanId;
  p_term: PlanTerm;
  p_starts_on: string;
  p_ends_on: string;
  p_note: string | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `YYYY-MM-DD` naming a real day. Round-tripping through `Date.UTC` is the
 * check: February 30th normalises to March 2nd and no longer matches.
 */
export function isCalendarDay(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/** What the RPC stores: trimmed, and null when nothing is left. */
export function planNoteValue(note: string | null | undefined): string | null {
  const trimmed = (note ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * The dates a term is prefilled with on `today` (`YYYY-MM-DD`): the nearest
 * default season that has not ended yet. Zero-padded ISO days sort as text,
 * so no `Date` is parsed.
 *
 *   spring     this year's January 1 – May 31 until May 31 has passed, then
 *              next year's.
 *   full year  the August 1 – July 31 window `today` falls in.
 *
 * Only a starting point: both fields stay editable, and a Spring plan's end
 * may be moved out (`springExtendedEnd`) for a team still playing.
 */
export function seasonDatesFor(
  term: PlanTerm,
  today: string,
): { startsOn: string; endsOn: string } {
  const year = Number(today.slice(0, 4));
  const first = term === "full_year" ? year - 1 : year;
  const window = defaultSeasonDates(term, first);
  return window.endsOn >= today ? window : defaultSeasonDates(term, first + 1);
}

/** The fields as the card opens: the saved plan, or an unchosen Spring. */
export function planDraftFrom(
  saved: SavedPlan | null,
  today: string,
): PlanDraft {
  if (saved) {
    return {
      planId: saved.planId,
      term: saved.term,
      startsOn: saved.startsOn,
      endsOn: saved.endsOn,
      note: saved.note ?? "",
    };
  }
  return {
    planId: null,
    term: "spring",
    ...seasonDatesFor("spring", today),
    note: "",
  };
}

/**
 * The draft after the term pills move: the new term with its default dates.
 * Pressing the term already chosen changes nothing, so dates an admin typed
 * are not thrown away by a second click on the same pill.
 */
export function withTerm(
  draft: PlanDraft,
  term: PlanTerm,
  today: string,
): PlanDraft {
  if (term === draft.term) return draft;
  return { ...draft, term, ...seasonDatesFor(term, today) };
}

/**
 * Whether the fields differ from what is saved — field by field against the
 * record, never draft against draft, with the note compared as it would be
 * stored (so trailing spaces are not an edit). With no plan saved, the record
 * is the untouched form.
 */
export function planDraftChanged(
  draft: PlanDraft,
  saved: SavedPlan | null,
  today: string,
): boolean {
  const base = planDraftFrom(saved, today);
  return (
    draft.planId !== base.planId ||
    draft.term !== base.term ||
    draft.startsOn !== base.startsOn ||
    draft.endsOn !== base.endsOn ||
    planNoteValue(draft.note) !== planNoteValue(base.note)
  );
}

/**
 * Why this draft cannot be saved, as the sentence to show, or null when it
 * can. The server action runs the same check on what it is sent.
 */
export function planDraftProblem(draft: {
  planId: unknown;
  term: unknown;
  startsOn: unknown;
  endsOn: unknown;
  note?: unknown;
}): string | null {
  if (!isCollegePlanId(draft.planId)) return "Choose a plan.";
  if (!isPlanTerm(draft.term)) return "Choose Spring or Full year.";
  if (!isCalendarDay(draft.startsOn) || !isCalendarDay(draft.endsOn)) {
    return "Enter the plan's start and end dates.";
  }
  if (draft.endsOn < draft.startsOn) {
    return "The plan cannot end before it starts.";
  }
  if (draft.note != null && typeof draft.note !== "string") {
    return "The invoice or PO must be text.";
  }
  if (
    (planNoteValue(draft.note as string | null) ?? "").length > PLAN_NOTE_MAX
  ) {
    return `The invoice or PO is limited to ${PLAN_NOTE_MAX} characters.`;
  }
  return null;
}

/**
 * The draft as `admin_set_program_plan` takes it, or null when
 * `planDraftProblem` has something to say.
 */
export function setProgramPlanArgs(
  programId: string,
  draft: PlanDraft,
): SetProgramPlanArgs | null {
  if (planDraftProblem(draft) !== null || draft.planId === null) return null;
  return {
    p_program_id: programId,
    p_plan_id: draft.planId,
    p_term: draft.term,
    p_starts_on: draft.startsOn,
    p_ends_on: draft.endsOn,
    p_note: planNoteValue(draft.note),
  };
}

/* ---------- What the card prints ---------- */

/**
 * `Spring $7,500 · 225 h · Full year $10,500 · 325 h · 25 people` — a plan's
 * menu line: each term's price and hours, then the roster cap.
 */
export function planOptionDescription(plan: CollegePlan): string {
  const side = (term: PlanTerm) => {
    const allowance = seasonAllowance(plan.id, term);
    return `${PLAN_TERM_LABELS[term]} ${usd(allowance.price)} · ${allowance.hours} h`;
  };
  return `${side("spring")} · ${side("full_year")} · ${rosterCapLabel(plan.rosterCap)}`;
}

/* ---------- The roster cap ---------- */

/**
 * The seats a team holds once `planId` is saved: `admin_set_program_plan`'s
 * rule, held here so the card can say what Save will do before it is pressed.
 *
 * Seats follow the plan unless somebody set them by hand. "By hand" is read
 * off the number: seats that are not the cap of the plan the team is on now
 * (or, with no plan, not the column default) were typed by an admin, and are
 * left alone. `tests/database/plans-2027-roster-caps.test.mjs` proves the SQL
 * side; `tests/billing-plans.spec.ts` holds the two to the same figures.
 */
export function seatsAfterPlan(
  planId: CollegePlanId,
  savedPlanId: CollegePlanId | null,
  seats: number,
): number {
  const before = savedPlanId
    ? collegePlan(savedPlanId).rosterCap
    : DEFAULT_ROSTER_SEATS;
  return seats === before ? collegePlan(planId).rosterCap : seats;
}

/**
 * The Plan card's Roster row for the plan chosen in the menu: `35 people`,
 * or `35 people · this team is set to 40` when the team's seats were set by
 * hand and saving will leave them where they are. `seats` is null when the
 * count could not be read, and the row then says the cap alone.
 */
export function rosterCapValue(
  planId: CollegePlanId,
  savedPlanId: CollegePlanId | null,
  seats: number | null,
): string {
  const cap = collegePlan(planId).rosterCap;
  const label = rosterCapLabel(cap);
  if (seats === null) return label;
  const after = seatsAfterPlan(planId, savedPlanId, seats);
  return after === cap ? label : `${label} · this team is set to ${after}`;
}

/** The plan menu's options, in the order the plans are sold. */
export function planOptions(): {
  value: CollegePlanId;
  label: string;
  description: string;
}[] {
  return COLLEGE_PLANS.map((plan) => ({
    value: plan.id,
    label: plan.name,
    description: planOptionDescription(plan),
  }));
}

function dayParts(day: string): { year: number; label: string } {
  const date = new Date(`${day}T00:00:00Z`);
  return {
    year: date.getUTCFullYear(),
    label: date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }),
  };
}

/**
 * `Jan 1 – May 31, 2027`, or `Aug 1, 2026 – Jul 31, 2027` across a new year.
 * Null while either day is missing or not a real one.
 */
export function seasonWindowLabel(
  startsOn: string,
  endsOn: string,
): string | null {
  if (!isCalendarDay(startsOn) || !isCalendarDay(endsOn)) return null;
  const start = dayParts(startsOn);
  const end = dayParts(endsOn);
  return start.year === end.year
    ? `${start.label} – ${end.label}, ${end.year}`
    : `${start.label}, ${start.year} – ${end.label}, ${end.year}`;
}

/**
 * `Program · Spring 2027`, `Program · Full year 2026–27` — the card's
 * trailing line for a saved plan. The years are the saved window's own.
 */
export function savedPlanLabel(saved: SavedPlan): string {
  const name =
    COLLEGE_PLANS.find((plan) => plan.id === saved.planId)?.name ??
    saved.planId;
  const startYear = saved.startsOn.slice(0, 4);
  const endYear = saved.endsOn.slice(0, 4);
  const years =
    startYear === endYear ? startYear : `${startYear}–${endYear.slice(2)}`;
  return `${name} · ${PLAN_TERM_LABELS[saved.term]} ${years}`;
}
