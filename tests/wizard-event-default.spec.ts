import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { buildMatchData } from "@/components/dashboard/matches/new-match-wizard/utils";
import { DEFAULT_FORM_DATA } from "@/components/dashboard/matches/new-match-wizard/types";

const winner = { id: "p1", name: "Ace", scores: [6, 6] };
const loser = { id: "p2", name: "Goodman", scores: [4, 4] };
const metadata = {
  userId: "u1",
  sourceProvider: "swingvision",
  analysisMethod: "import",
};

function build(eventName: string) {
  return buildMatchData(
    "m1",
    {
      ...DEFAULT_FORM_DATA,
      playerName: "Ace",
      opponentName: "Goodman",
      eventName,
    },
    winner,
    loser,
    false,
    metadata,
  );
}

test("an empty Event field saves no event, not 'P1 vs P2'", () => {
  expect(build("").tournament_name).toBeNull();
});

test("a preset/attached line's event name is saved as given", () => {
  expect(build("Fall Invitational").tournament_name).toBe("Fall Invitational");
});

test("the wizard hook does not synthesise an event name", () => {
  const src = readFileSync(
    "src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts",
    "utf8",
  );
  expect(src).not.toMatch(/\$\{formData\.playerName\} vs /);
});
