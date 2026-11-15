import { expect, test } from "@playwright/test";
import { vizFilterChanges } from "@/components/dashboard/matches/match-detail/shots/viz-analytics";
import { controlName } from "@/lib/ui/control-name";

/**
 * `filter_changed` for the Visualizations controls is read off the URL, and
 * the URL is user-editable. These pin what may leave the browser: fixed
 * vocabulary quoted, picks counted, everything else left out.
 */

const changes = (before: string, after: string) =>
  vizFilterChanges(new URLSearchParams(before), new URLSearchParams(after));

test("a changed cut and option are quoted by their URL names", () => {
  expect(
    changes(
      "tab=visualizations",
      "tab=visualizations&cut=errors&verr=unforced",
    ),
  ).toEqual([
    { filter_name: "cut", value: "errors" },
    { filter_name: "verr", value: "unforced" },
  ]);
});

test("an unchanged URL, and a change to a parameter that is not a viz control, send nothing", () => {
  expect(changes("cut=errors", "cut=errors")).toEqual([]);
  expect(changes("cut=errors", "cut=errors&tab=visualizations")).toEqual([]);
});

test("a cleared filter reads as any", () => {
  expect(changes("ball=first", "")).toEqual([
    { filter_name: "ball", value: "any" },
  ]);
});

test("several values of one option are sent sorted and joined", () => {
  expect(changes("", "zone=wide&zone=t")).toEqual([
    { filter_name: "zone", value: "t+wide" },
  ]);
});

test("sets and season matches send how many are picked, never which", () => {
  expect(changes("", "vset=1&vset=3")).toEqual([
    { filter_name: "vset", value: "2" },
  ]);
  expect(
    changes(
      "vm=11111111-1111-4111-8111-111111111111",
      "vm=22222222-2222-4222-8222-222222222222",
    ),
  ).toEqual([{ filter_name: "vm", value: "1" }]);
});

test("saved views, drafts and the advanced filter blob are never sent", () => {
  expect(
    changes("", "view=abc123&draft=1&vfrom=xyz&vf=opponent%3AJane+Doe"),
  ).toEqual([]);
});

test("text typed into a quoted parameter is sent as other, not as written", () => {
  expect(changes("", "cut=Jane%20Doe%20vs%20UGA")).toEqual([
    { filter_name: "cut", value: "other" },
  ]);
});

test("controlName spreads as the one attribute posthog-js reads past the attribute mask", () => {
  expect(controlName("wizard_continue")).toEqual({
    "data-ph-capture-attribute-control": "wizard_continue",
  });
});
