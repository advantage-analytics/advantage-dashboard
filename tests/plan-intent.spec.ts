import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

import {
  PLAN_SETTINGS_PATH,
  decodePlanIntent,
  encodePlanIntent,
  parsePlanIntent,
  planIntentFromPath,
  planIntentHref,
} from "@/lib/billing/plan-intent";
import { dialogForIntent } from "@/lib/billing/plan-page-view";
import { safeNext } from "@/lib/auth/safe-next";
import { PLAN_HREF } from "@/lib/services/credits/packs";

/**
 * `/sign-up?plan=<id>&period=<p>` from the landing site: the two values are
 * checked against the plan module wherever they are read, carried to
 * Settings › Plan, and open the checkout dialog there. Anything else is
 * dropped silently.
 */

test.describe("the two values", () => {
  test("a paid plan and a period are an intent", () => {
    expect(parsePlanIntent("coach", "monthly")).toEqual({
      plan: "coach",
      period: "monthly",
    });
    expect(parsePlanIntent("coach-pro", "yearly")).toEqual({
      plan: "coach-pro",
      period: "yearly",
    });
  });

  test("free lands on Home as it always did", () => {
    expect(parsePlanIntent("free", "monthly")).toBeNull();
    expect(parsePlanIntent("free", undefined)).toBeNull();
  });

  test("anything else is dropped", () => {
    for (const [plan, period] of [
      ["coach", undefined],
      ["coach", ""],
      ["coach", "weekly"],
      ["coach", "Monthly"],
      ["Coach", "monthly"],
      ["coach_pro", "monthly"],
      ["pro", "monthly"],
      ["starter", "monthly"],
      ["elite", "yearly"],
      [undefined, "monthly"],
      [null, null],
      [42, "monthly"],
      ["__proto__", "monthly"],
      ["constructor", "yearly"],
      ["coach&period=yearly", "monthly"],
      [{ plan: "coach" }, "monthly"],
    ] as const) {
      expect(parsePlanIntent(plan, period), `${plan} / ${period}`).toBeNull();
    }
  });

  test("a repeated query value reads its first", () => {
    expect(parsePlanIntent(["coach", "coach-pro"], ["yearly"])).toEqual({
      plan: "coach",
      period: "yearly",
    });
    expect(parsePlanIntent(["nope", "coach"], "monthly")).toBeNull();
  });
});

test.describe("carried as the Plan page's own query", () => {
  test("the href is the Plan page with both values, and survives the next clamp", () => {
    const href = planIntentHref({ plan: "coach-pro", period: "yearly" });
    expect(href).toBe("/dashboard/settings/plan?plan=coach-pro&period=yearly");
    expect(safeNext(href)).toBe(href);
    expect(planIntentFromPath(href)).toEqual({
      plan: "coach-pro",
      period: "yearly",
    });
    // One path for the page, wherever it is spelled.
    expect(PLAN_SETTINGS_PATH).toBe(PLAN_HREF);
  });

  test("only the Plan page's path carries one", () => {
    for (const path of [
      "/dashboard",
      "/dashboard/settings/plan",
      "/dashboard/settings/plan?plan=free&period=monthly",
      "/dashboard/settings/plan?plan=coach",
      "/dashboard/settings/usage?plan=coach&period=monthly",
      "/join/abc?plan=coach&period=monthly",
      "https://evil.example/dashboard/settings/plan?plan=coach&period=monthly",
      "//evil.example/dashboard/settings/plan?plan=coach&period=monthly",
      "",
      null,
      undefined,
    ]) {
      expect(planIntentFromPath(path), String(path)).toBeNull();
    }
  });

  test("the cookie holds a plan name and a period and nothing else", () => {
    const intent = { plan: "coach-pro", period: "monthly" } as const;
    expect(encodePlanIntent(intent)).toBe("coach-pro.monthly");
    expect(decodePlanIntent("coach-pro.monthly")).toEqual(intent);
    expect(decodePlanIntent("coach.yearly")).toEqual({
      plan: "coach",
      period: "yearly",
    });
    for (const value of [
      "",
      null,
      undefined,
      "coach",
      ".monthly",
      "coach.",
      "free.monthly",
      "coach.monthly.extra",
      "coach-pro/monthly",
      "elite.yearly",
    ]) {
      expect(decodePlanIntent(value), String(value)).toBeNull();
    }
  });
});

test.describe("what opens on arrival", () => {
  const coachMonthly = { plan: "coach", period: "monthly" } as const;
  const proYearly = { plan: "coach-pro", period: "yearly" } as const;

  test("a Free player gets the plan they picked, chosen", () => {
    expect(dialogForIntent(proYearly, "free")).toEqual({
      kind: "choose",
      plan: "coach-pro",
      period: "yearly",
    });
  });

  test("Coach who picked Coach Pro gets the upgrade; nobody is sold the plan they have", () => {
    expect(dialogForIntent(proYearly, "coach")).toEqual({ kind: "upgrade" });
    expect(dialogForIntent(coachMonthly, "coach")).toBeNull();
    expect(dialogForIntent(coachMonthly, "coach-pro")).toBeNull();
    expect(dialogForIntent(proYearly, "coach-pro")).toBeNull();
    expect(dialogForIntent(null, "free")).toBeNull();
  });
});

test.describe("wiring", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  test("sign-up turns the two values into next only once plans are on sale, and a join link wins", () => {
    const page = read("src/app/(auth)/sign-up/page.tsx");
    expect(page).toContain(
      "requested === null && plansOnSale() ? parsePlanIntent(plan, period) : null",
    );
    expect(page).toContain(
      "safeNext(intent ? planIntentHref(intent) : requested)",
    );
  });

  test("the sign-in after the email remembers it, and both onboarding exits take it back", () => {
    expect(read("src/app/(auth)/confirm/actions.ts")).toContain(
      "await rememberPlanIntent(link.next);",
    );
    expect(read("src/app/(auth)/callback/route.ts")).toContain(
      "await rememberPlanIntent(next);",
    );
    const onboarding = read("src/app/onboarding/actions.ts");
    expect(onboarding.match(/await takePlanIntentHref\(\)/g)).toHaveLength(2);

    const server = read("src/lib/billing/plan-intent-server.ts");
    // Read once, cleared either way, and nothing before plans are on sale.
    expect(server).toContain(
      'store.set(PLAN_INTENT_COOKIE, "", { path: "/", maxAge: 0 });',
    );
    expect(server).toContain(
      "intent && plansOnSale() ? planIntentHref(intent) : null",
    );
  });

  test("the Plan page validates the query itself and drops it from the URL", () => {
    const page = read("src/app/dashboard/settings/plan/page.tsx");
    expect(page).toContain("parsePlanIntent(query.plan, query.period)");
    expect(page).toContain("dialogForIntent(intent, plan)");
    // On sale, or the viewer already holds a paid plan.
    expect(page).toContain("plansOnSale() || isPaidPlan(context.viewer.plan)");
    expect(
      read("src/components/dashboard/settings/plan-settings.tsx"),
    ).toContain('window.history.replaceState(null, "", PLAN_SETTINGS_PATH);');
  });
});
