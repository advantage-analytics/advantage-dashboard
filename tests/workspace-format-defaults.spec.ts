import { expect, test } from "@playwright/test";

import { createLoader } from "./fixtures/vm-modules";

/**
 * The upload wizard's format defaults per workspace: a college team workspace
 * opens with Scoring = No-Ad and Lets = Play on; every other workspace keeps
 * the empty Scoring and Replay lets from `DEFAULT_FORM_DATA`.
 */

const loader = createLoader();
const { workspaceFormatDefaults, DEFAULT_FORM_DATA } = loader.load(
  "src/components/dashboard/matches/new-match-wizard/types.ts",
) as {
  workspaceFormatDefaults: (workspace: {
    kind: "personal" | "team";
    orgType: string | null;
  }) => { adScoring?: boolean; playOnLets?: boolean };
  DEFAULT_FORM_DATA: { adScoring?: boolean; playOnLets: boolean };
};

test.describe("workspaceFormatDefaults", () => {
  test("a college team workspace pre-selects no-ad and play-on lets", () => {
    expect(
      workspaceFormatDefaults({ kind: "team", orgType: "college" }),
    ).toEqual({ adScoring: false, playOnLets: true });
  });

  for (const orgType of ["club", "high_school", "academy", "other", null]) {
    test(`a ${orgType ?? "null"} team workspace keeps the plain defaults`, () => {
      expect(workspaceFormatDefaults({ kind: "team", orgType })).toEqual({});
    });
  }

  test("a personal workspace keeps the plain defaults", () => {
    expect(
      workspaceFormatDefaults({ kind: "personal", orgType: null }),
    ).toEqual({});
    expect(DEFAULT_FORM_DATA.adScoring).toBeUndefined();
    expect(DEFAULT_FORM_DATA.playOnLets).toBe(false);
  });
});

/**
 * The autosaved form keeps its Scoring and Lets only in the workspace that
 * saved it — a college workspace's pre-selected No-Ad must not reach a
 * personal upload as an answer nobody gave.
 */
test.describe("autosaved format answers stay in their workspace", () => {
  const store = new Map<string, string>();
  const { loadFormDataFromStorage, saveFormDataToStorage } = createLoader({
    globals: {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
        removeItem: (k: string) => void store.delete(k),
      },
    },
  }).load("src/components/dashboard/matches/new-match-wizard/utils.ts") as {
    loadFormDataFromStorage: (key: string) => Record<string, unknown> | null;
    saveFormDataToStorage: (form: unknown, key: string) => void;
  };
  const saved = {
    ...DEFAULT_FORM_DATA,
    adScoring: false,
    playOnLets: true,
    round: "1",
  };

  test.beforeEach(() => store.clear());

  test("the same workspace gets its answers back", () => {
    saveFormDataToStorage(saved, "team:college-a");
    const loaded = loadFormDataFromStorage("team:college-a");
    expect(loaded?.adScoring).toBe(false);
    expect(loaded?.playOnLets).toBe(true);
  });

  test("another workspace gets the rest of the form, minus Scoring and Lets", () => {
    saveFormDataToStorage(saved, "team:college-a");
    const loaded = loadFormDataFromStorage("personal:user-1");
    expect(loaded?.round).toBe("1");
    expect(loaded).not.toHaveProperty("adScoring");
    expect(loaded).not.toHaveProperty("playOnLets");
  });

  test("an untagged save is treated as another workspace's", () => {
    store.set("uploadFormData", JSON.stringify(saved));
    expect(loadFormDataFromStorage("team:college-a")).not.toHaveProperty(
      "adScoring",
    );
  });
});
