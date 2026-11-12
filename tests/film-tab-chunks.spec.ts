import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const FILM_TAB = resolve(
  "src/components/dashboard/matches/match-detail/film/film-tab.tsx",
);

// The idle warm-up of the fullscreen room is an optimisation: when its chunk
// fetch fails (a mail scanner's sandbox, a flaky network, a retired deploy) the
// rejection must be handled, or PostHog reports it as an unhandled
// ChunkLoadError (issue 01a1cc8b).
test("the fullscreen warm-up handles its own chunk-load failure", () => {
  const source = readFileSync(FILM_TAB, "utf8");
  expect(source).not.toMatch(/void\s+loadFilmFullscreen\(\)/);
  expect(source).toMatch(/loadFilmFullscreen\(\)\s*\.catch\(/);
});
