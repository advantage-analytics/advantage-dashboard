import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  NO_PLAN_WINDOW,
  PROGRAM_PLAN_REF_COLUMNS,
  PROGRAM_PLAN_REF_COLUMNS_WITH_HOURS_FROM,
  readPlanWindow,
  readProgramPlanRef,
  readProgramPlanRefs,
  toProgramPlanRef,
} from "@/lib/billing/plan-fields";

/**
 * The tolerant reads a video allowance hangs off, against a fake PostgREST.
 *
 * `program_plans.hours_from` arrives with a later migration than the table,
 * and a select that names a missing column fails whole (42703): each reader
 * asks with the column and, on exactly that error, again without it. And a
 * player's `plan_status` rides the same read as their period start.
 */

const realError = console.error;
let logged: unknown[][] = [];
test.beforeEach(() => {
  logged = [];
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };
});
test.afterEach(() => {
  console.error = realError;
});

const ROW = {
  program_id: "p1",
  plan_id: "program",
  plan_term: "spring",
  starts_on: "2027-01-01",
  ends_on: "2027-05-31",
};
const SAVED = "2027-02-10T15:30:00+00:00";

type Answer = {
  data: unknown;
  error: { code?: string; message: string } | null;
};

/** A client whose `program_plans` / `users` selects answer by column list. */
function fake(answer: (table: string, columns: string) => Answer) {
  const selects: [string, string][] = [];
  const client = {
    from: (table: string) => ({
      select: (columns: string) => {
        selects.push([table, columns]);
        const result = answer(table, columns);
        const builder = {
          eq: () => builder,
          in: () => builder,
          maybeSingle: () =>
            Promise.resolve({
              ...result,
              data: Array.isArray(result.data)
                ? (result.data[0] ?? null)
                : result.data,
            }),
          then: (resolve: (value: Answer) => unknown) =>
            Promise.resolve(result).then(resolve),
        };
        return builder;
      },
    }),
  } as unknown as SupabaseClient;
  return { client, selects };
}

const MISSING_COLUMN = {
  code: "42703",
  message: "column program_plans.hours_from does not exist",
};

test.describe("a team's plan row", () => {
  test("with the column: the plan and the moment it was first saved", async () => {
    const { client, selects } = fake(() => ({
      data: [{ ...ROW, hours_from: SAVED }],
      error: null,
    }));
    expect(await readProgramPlanRef(client, "p1")).toEqual({
      id: "program",
      term: "spring",
      startsOn: "2027-01-01",
      endsOn: "2027-05-31",
      hoursFrom: SAVED,
    });
    // One read, asking for the column.
    expect(selects).toEqual([
      ["program_plans", PROGRAM_PLAN_REF_COLUMNS_WITH_HOURS_FROM],
    ]);
  });

  test("without the column: asked again without it, and nothing is logged", async () => {
    const { client, selects } = fake((_table, columns) =>
      columns.includes("hours_from")
        ? { data: null, error: MISSING_COLUMN }
        : { data: [ROW], error: null },
    );
    const ref = await readProgramPlanRef(client, "p1");
    // The plan is still read; it counts from its first day.
    expect(ref).toEqual({
      id: "program",
      term: "spring",
      startsOn: "2027-01-01",
      endsOn: "2027-05-31",
    });
    expect(ref && "hoursFrom" in ref).toBe(false);
    expect(selects.map(([, columns]) => columns)).toEqual([
      PROGRAM_PLAN_REF_COLUMNS_WITH_HOURS_FROM,
      PROGRAM_PLAN_REF_COLUMNS,
    ]);
    expect(logged).toEqual([]);
  });

  test("the list read tolerates it the same way", async () => {
    const { client, selects } = fake((_table, columns) =>
      columns.includes("hours_from")
        ? { data: null, error: MISSING_COLUMN }
        : {
            data: [ROW, { ...ROW, program_id: "p2", plan_id: "elite" }],
            error: null,
          },
    );
    const plans = await readProgramPlanRefs(client, ["p1", "p2"]);
    expect([...plans.keys()]).toEqual(["p1", "p2"]);
    expect(plans.get("p2")?.id).toBe("elite");
    expect(selects).toHaveLength(2);
  });

  test("any other failure is not retried: no plan, and it is logged", async () => {
    const { client, selects } = fake(() => ({
      data: null,
      error: { code: "57014", message: "canceling statement" },
    }));
    expect(await readProgramPlanRef(client, "p1")).toBeNull();
    expect(selects).toHaveLength(1);
    expect(logged).toHaveLength(1);
  });

  test("no table yet reads as no plan, quietly", async () => {
    const { client } = fake(() => ({
      data: null,
      error: { code: "42P01", message: "relation does not exist" },
    }));
    expect(await readProgramPlanRef(client, "p1")).toBeNull();
    expect((await readProgramPlanRefs(client, ["p1"])).size).toBe(0);
    expect(logged).toEqual([]);
  });

  test("a null or missing stamp is left off the ref", () => {
    expect(toProgramPlanRef({ ...ROW, hours_from: null })).not.toHaveProperty(
      "hoursFrom",
    );
    expect(toProgramPlanRef(ROW)).not.toHaveProperty("hoursFrom");
    expect(toProgramPlanRef({ ...ROW, plan_id: "platinum" })).toBeNull();
  });
});

test.describe("a player's hours window", () => {
  test("the period start and the status come from one read", async () => {
    const { client, selects } = fake(() => ({
      data: {
        plan_period_start: "2027-01-14T00:00:00+00:00",
        plan_status: "past_due",
      },
      error: null,
    }));
    expect(await readPlanWindow(client, "u1")).toEqual({
      periodStart: "2027-01-14T00:00:00+00:00",
      status: "past_due",
    });
    expect(selects).toEqual([["users", "plan_period_start, plan_status"]]);
  });

  test("no row, or a database without the columns, reads as never subscribed", async () => {
    expect(
      await readPlanWindow(
        fake(() => ({ data: null, error: null })).client,
        "u1",
      ),
    ).toEqual(NO_PLAN_WINDOW);
    expect(
      await readPlanWindow(
        fake(() => ({
          data: null,
          error: { code: "42703", message: "column does not exist" },
        })).client,
        "u1",
      ),
    ).toEqual(NO_PLAN_WINDOW);
    expect(logged).toEqual([]);
  });

  test("a failed read is logged and answers the same, never throwing", async () => {
    expect(
      await readPlanWindow(
        fake(() => ({ data: null, error: { message: "timeout" } })).client,
        "u1",
      ),
    ).toEqual(NO_PLAN_WINDOW);
    expect(logged).toHaveLength(1);
  });
});
