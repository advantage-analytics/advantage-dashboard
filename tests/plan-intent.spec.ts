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
    expect(parsePlanIntent("player", "monthly")).toEqual({
      plan: "player",
      period: "monthly",
    });
    expect(parsePlanIntent("player-pro", "yearly")).toEqual({
      plan: "player-pro",
      period: "yearly",
    });
  });

  test("the ids from before the rename are read as the plans they became", () => {
    // The landing site still links `?plan=coach` until it is updated.
    expect(parsePlanIntent("coach", "monthly")).toEqual({
      plan: "player",
      period: "monthly",
    });
    expect(parsePlanIntent("coach-pro", "yearly")).toEqual({
      plan: "player-pro",
      period: "yearly",
    });
    expect(parsePlanIntent(["coach-pro", "player"], "monthly")).toEqual({
      plan: "player-pro",
      period: "monthly",
    });
    // The href and the cookie written from one carry the new id.
    const intent = parsePlanIntent("coach", "yearly")!;
    expect(planIntentHref(intent)).toBe(
      "/dashboard/settings/plan?plan=player&period=yearly",
    );
    expect(encodePlanIntent(intent)).toBe("player.yearly");
    // A path or cookie made before the rename still opens the checkout.
    expect(
      planIntentFromPath(
        "/dashboard/settings/plan?plan=coach-pro&period=monthly",
      ),
    ).toEqual({ plan: "player-pro", period: "monthly" });
    expect(decodePlanIntent("coach.monthly")).toEqual({
      plan: "player",
      period: "monthly",
    });
    // Only those two spellings: nothing near them.
    for (const plan of ["Coach", "coach_pro", "coachpro", "coach-pro "]) {
      expect(parsePlanIntent(plan, "monthly"), plan).toBeNull();
    }
  });

  test("free lands on Home as it always did", () => {
    expect(parsePlanIntent("free", "monthly")).toBeNull();
    expect(parsePlanIntent("free", undefined)).toBeNull();
  });

  test("anything else is dropped", () => {
    for (const [plan, period] of [
      ["player", undefined],
      ["player", ""],
      ["player", "weekly"],
      ["player", "Monthly"],
      ["Player", "monthly"],
      ["player_pro", "monthly"],
      ["pro", "monthly"],
      ["starter", "monthly"],
      ["elite", "yearly"],
      [undefined, "monthly"],
      [null, null],
      [42, "monthly"],
      ["__proto__", "monthly"],
      ["constructor", "yearly"],
      ["player&period=yearly", "monthly"],
      [{ plan: "player" }, "monthly"],
    ] as const) {
      expect(parsePlanIntent(plan, period), `${plan} / ${period}`).toBeNull();
    }
  });

  test("a repeated query value reads its first", () => {
    expect(parsePlanIntent(["player", "player-pro"], ["yearly"])).toEqual({
      plan: "player",
      period: "yearly",
    });
    expect(parsePlanIntent(["nope", "player"], "monthly")).toBeNull();
  });
});

test.describe("carried as the Plan page's own query", () => {
  test("the href is the Plan page with both values, and survives the next clamp", () => {
    const href = planIntentHref({ plan: "player-pro", period: "yearly" });
    expect(href).toBe("/dashboard/settings/plan?plan=player-pro&period=yearly");
    expect(safeNext(href)).toBe(href);
    expect(planIntentFromPath(href)).toEqual({
      plan: "player-pro",
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
      "/dashboard/settings/plan?plan=player",
      "/dashboard/settings/usage?plan=player&period=monthly",
      "/join/abc?plan=player&period=monthly",
      "https://evil.example/dashboard/settings/plan?plan=player&period=monthly",
      "//evil.example/dashboard/settings/plan?plan=player&period=monthly",
      "",
      null,
      undefined,
    ]) {
      expect(planIntentFromPath(path), String(path)).toBeNull();
    }
  });

  test("the cookie holds a plan name and a period and nothing else", () => {
    const intent = { plan: "player-pro", period: "monthly" } as const;
    expect(encodePlanIntent(intent)).toBe("player-pro.monthly");
    expect(decodePlanIntent("player-pro.monthly")).toEqual(intent);
    expect(decodePlanIntent("player.yearly")).toEqual({
      plan: "player",
      period: "yearly",
    });
    for (const value of [
      "",
      null,
      undefined,
      "player",
      ".monthly",
      "player.",
      "free.monthly",
      "player.monthly.extra",
      "player-pro/monthly",
      "elite.yearly",
    ]) {
      expect(decodePlanIntent(value), String(value)).toBeNull();
    }
  });
});

test.describe("what opens on arrival", () => {
  const playerMonthly = { plan: "player", period: "monthly" } as const;
  const proYearly = { plan: "player-pro", period: "yearly" } as const;

  test("a Free player gets the plan they picked, chosen", () => {
    expect(dialogForIntent(proYearly, "free")).toEqual({
      kind: "choose",
      plan: "player-pro",
      period: "yearly",
    });
  });

  test("Player who picked Player Pro gets the upgrade; nobody is sold the plan they have", () => {
    expect(dialogForIntent(proYearly, "player")).toEqual({ kind: "upgrade" });
    expect(dialogForIntent(playerMonthly, "player")).toBeNull();
    expect(dialogForIntent(playerMonthly, "player-pro")).toBeNull();
    expect(dialogForIntent(proYearly, "player-pro")).toBeNull();
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
