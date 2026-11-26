import { expect, test } from "@playwright/test";

import {
  PLAN_NOTE_MAX,
  isCalendarDay,
  planDraftChanged,
  planDraftFrom,
  planDraftProblem,
  planNoteValue,
  planOptionDescription,
  planOptions,
  savedPlanLabel,
  seasonDatesFor,
  seasonWindowLabel,
  setProgramPlanArgs,
  withTerm,
  type PlanDraft,
  type SavedPlan,
} from "@/lib/billing/plan-draft";
import {
  COLLEGE_PLANS,
  PLAN_TERM_LABELS,
  collegePlan,
  defaultSeasonDates,
  springExtendedEnd,
  usd,
} from "@/lib/billing/plans";

/**
 * `src/lib/billing/plan-draft.ts` — the Admin › Teams Plan card's arithmetic:
 * the dates a term is prefilled with, whether Save has anything to save, and
 * what a draft becomes on its way to `admin_set_program_plan`. Pure — no
 * database, no browser.
 */

const TODAY = "2026-11-25";

const SAVED: SavedPlan = {
  planId: "program",
  term: "spring",
  startsOn: "2027-01-01",
  endsOn: "2027-05-31",
  note: "Stripe inv. 2027-0014",
};

const draftOf = (saved: SavedPlan | null, over: Partial<PlanDraft> = {}) => ({
  ...planDraftFrom(saved, TODAY),
  ...over,
});

test.describe("default dates", () => {
  test("spring is the next spring that has not ended", () => {
    expect(seasonDatesFor("spring", "2026-11-25")).toEqual(
      defaultSeasonDates("spring", 2027),
    );
    expect(seasonDatesFor("spring", "2027-01-01")).toEqual(
      defaultSeasonDates("spring", 2027),
    );
    // The last day is still this spring; the day after is next year's.
    expect(seasonDatesFor("spring", "2027-05-31")).toEqual(
      defaultSeasonDates("spring", 2027),
    );
    expect(seasonDatesFor("spring", "2027-06-01")).toEqual(
      defaultSeasonDates("spring", 2028),
    );
  });

  test("a full year is the August to July window today falls in", () => {
    expect(seasonDatesFor("full_year", "2026-11-25")).toEqual(
      defaultSeasonDates("full_year", 2026),
    );
    expect(seasonDatesFor("full_year", "2027-07-31")).toEqual(
      defaultSeasonDates("full_year", 2026),
    );
    expect(seasonDatesFor("full_year", "2027-08-01")).toEqual(
      defaultSeasonDates("full_year", 2027),
    );
  });

  test("changing the term prefills that term's dates and keeps the rest", () => {
    const draft = draftOf(SAVED, { endsOn: springExtendedEnd(2027) });
    const next = withTerm(draft, "full_year", TODAY);
    expect(next).toEqual({
      ...draft,
      term: "full_year",
      ...defaultSeasonDates("full_year", 2026),
    });
    expect(next.planId).toBe("program");
    expect(next.note).toBe("Stripe inv. 2027-0014");
  });

  test("pressing the term already chosen keeps typed dates", () => {
    const draft = draftOf(SAVED, { endsOn: springExtendedEnd(2027) });
    expect(withTerm(draft, "spring", TODAY)).toBe(draft);
  });
});

test.describe("the opening draft", () => {
  test("no plan: nothing chosen, Spring, the default dates", () => {
    expect(planDraftFrom(null, TODAY)).toEqual({
      planId: null,
      term: "spring",
      ...defaultSeasonDates("spring", 2027),
      note: "",
    });
  });

  test("a saved plan: its own values, a null note as empty text", () => {
    expect(planDraftFrom(SAVED, TODAY)).toEqual({
      planId: "program",
      term: "spring",
      startsOn: "2027-01-01",
      endsOn: "2027-05-31",
      note: "Stripe inv. 2027-0014",
    });
    expect(planDraftFrom({ ...SAVED, note: null }, TODAY).note).toBe("");
  });
});

test.describe("dirty check", () => {
  test("an untouched form has nothing to save, plan or no plan", () => {
    expect(planDraftChanged(draftOf(SAVED), SAVED, TODAY)).toBe(false);
    expect(planDraftChanged(draftOf(null), null, TODAY)).toBe(false);
  });

  test("each field is measured against the saved record", () => {
    const edits: Partial<PlanDraft>[] = [
      { planId: "elite" },
      { term: "full_year" },
      { startsOn: "2027-01-15" },
      { endsOn: springExtendedEnd(2027) },
      { note: "PO 88412" },
      { note: "" },
    ];
    for (const edit of edits) {
      expect(planDraftChanged(draftOf(SAVED, edit), SAVED, TODAY)).toBe(true);
    }
  });

  test("an edit taken back is not a change", () => {
    const there = withTerm(draftOf(SAVED), "full_year", TODAY);
    const back = withTerm(there, "spring", TODAY);
    expect(planDraftChanged(there, SAVED, TODAY)).toBe(true);
    expect(planDraftChanged(back, SAVED, TODAY)).toBe(false);
  });

  test("the note is compared as it would be stored", () => {
    expect(
      planDraftChanged(
        draftOf(SAVED, { note: "  Stripe inv. 2027-0014 " }),
        SAVED,
        TODAY,
      ),
    ).toBe(false);
    const unnoted = { ...SAVED, note: null };
    expect(
      planDraftChanged(draftOf(unnoted, { note: "   " }), unnoted, TODAY),
    ).toBe(false);
  });

  test("with no plan, choosing one is the change", () => {
    expect(
      planDraftChanged(draftOf(null, { planId: "starter" }), null, TODAY),
    ).toBe(true);
  });
});

test.describe("what cannot be saved", () => {
  test("a complete draft has no problem", () => {
    expect(planDraftProblem(draftOf(SAVED))).toBeNull();
  });

  test("no plan chosen, an unknown plan or term", () => {
    expect(planDraftProblem(draftOf(null))).toBe("Choose a plan.");
    expect(planDraftProblem({ ...draftOf(SAVED), planId: "coach" })).toBe(
      "Choose a plan.",
    );
    expect(planDraftProblem({ ...draftOf(SAVED), term: "full-year" })).toBe(
      "Choose Spring or Full year.",
    );
  });

  test("missing, malformed and impossible dates", () => {
    for (const startsOn of ["", "2027-1-1", "2027-02-30", "01/01/2027"]) {
      expect(planDraftProblem(draftOf(SAVED, { startsOn }))).toBe(
        "Enter the plan's start and end dates.",
      );
    }
    expect(isCalendarDay("2028-02-29")).toBe(true);
    expect(isCalendarDay("2027-02-29")).toBe(false);
    expect(isCalendarDay(null)).toBe(false);
  });

  test("an end before the start; the same day is allowed", () => {
    expect(
      planDraftProblem(
        draftOf(SAVED, { startsOn: "2027-06-01", endsOn: "2027-05-31" }),
      ),
    ).toBe("The plan cannot end before it starts.");
    expect(
      planDraftProblem(
        draftOf(SAVED, { startsOn: "2027-05-31", endsOn: "2027-05-31" }),
      ),
    ).toBeNull();
  });

  test("a note past the column's limit, counted after trimming", () => {
    const atLimit = "x".repeat(PLAN_NOTE_MAX);
    expect(
      planDraftProblem(draftOf(SAVED, { note: ` ${atLimit} ` })),
    ).toBeNull();
    expect(planDraftProblem(draftOf(SAVED, { note: `${atLimit}x` }))).toBe(
      `The invoice or PO is limited to ${PLAN_NOTE_MAX} characters.`,
    );
  });
});

test.describe("draft to RPC arguments", () => {
  test("each field lands on admin_set_program_plan's parameter", () => {
    expect(
      setProgramPlanArgs(
        "p1",
        draftOf(SAVED, { planId: "elite", note: "  PO 88412  " }),
      ),
    ).toEqual({
      p_program_id: "p1",
      p_plan_id: "elite",
      p_term: "spring",
      p_starts_on: "2027-01-01",
      p_ends_on: "2027-05-31",
      p_note: "PO 88412",
    });
  });

  test("an empty note is sent as null", () => {
    expect(
      setProgramPlanArgs("p1", draftOf(SAVED, { note: "  " }))?.p_note,
    ).toBeNull();
    expect(planNoteValue(null)).toBeNull();
    expect(planNoteValue(" a ")).toBe("a");
  });

  test("a draft with a problem maps to nothing", () => {
    expect(setProgramPlanArgs("p1", draftOf(null))).toBeNull();
    expect(
      setProgramPlanArgs("p1", draftOf(SAVED, { endsOn: "2026-12-31" })),
    ).toBeNull();
  });
});

test.describe("what the card prints", () => {
  test("every plan's menu line is built from the plan module", () => {
    expect(planOptions().map((option) => option.value)).toEqual(
      COLLEGE_PLANS.map((plan) => plan.id),
    );
    for (const plan of COLLEGE_PLANS) {
      const option = planOptions().find((o) => o.value === plan.id);
      expect(option?.label).toBe(plan.name);
      expect(option?.description).toBe(
        `${PLAN_TERM_LABELS.spring} ${usd(plan.spring.price)} · ${plan.spring.hours} h · ` +
          `${PLAN_TERM_LABELS.full_year} ${usd(plan.fullYear.price)} · ${plan.fullYear.hours} h`,
      );
    }
    // One spelled out, so the shape itself is on record.
    expect(planOptionDescription(collegePlan("program"))).toBe(
      "Spring $7,500 · 200 h · Full year $10,500 · 280 h",
    );
  });

  test("the season window, in UTC, with both years across a new year", () => {
    expect(seasonWindowLabel("2027-01-01", "2027-05-31")).toBe(
      "Jan 1 – May 31, 2027",
    );
    expect(seasonWindowLabel("2026-08-01", "2027-07-31")).toBe(
      "Aug 1, 2026 – Jul 31, 2027",
    );
    expect(seasonWindowLabel("", "2027-05-31")).toBeNull();
  });

  test("the saved plan's trailing line", () => {
    expect(savedPlanLabel(SAVED)).toBe("Program · Spring 2027");
    expect(
      savedPlanLabel({
        ...SAVED,
        planId: "elite",
        term: "full_year",
        ...defaultSeasonDates("full_year", 2026),
      }),
    ).toBe("Elite · Full year 2026–27");
  });
});
