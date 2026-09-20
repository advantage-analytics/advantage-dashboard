import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { expect, test } from "@playwright/test";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import { usageFraction } from "@/lib/data/usage-format";
import { formatPilotEnd } from "@/lib/services/splitstep/config";
import {
  formatHoursCap,
  formatHoursTenths,
  formatAllowanceSpan,
} from "@/components/dashboard/matches/new-match-wizard/utils";

/**
 * The footer meter when the trimmed window costs more than is left (T4).
 *
 * "0.0 of 8.0 h left after" is what the old readout says for a window that
 * overshoots by an hour, because the remainder is clamped at zero — the
 * reader is handed a true-looking figure for a state that is not true. This
 * file proves the three things about the replacement that a reader cannot
 * check by eye:
 *
 *   1. Over-allowance says how far over, with `formatHoursTenths`' own
 *      arithmetic rather than a literal.
 *   2. The readout and the pending bar segment carry `--error` as an inline
 *      style, which is the only form that survives the unlayered DS type
 *      classes.
 *   3. Nothing else moved: at or under the allowance, and unpriced, the
 *      markup is byte-for-byte what it was.
 *
 * Rendered through `ts.transpileModule` in a VM rather than imported, because
 * Playwright's own transform rewrites JSX to its fixture runtime and a
 * directly imported component cannot be handed to `renderToStaticMarkup` —
 * the same trick as `tests/upload-identity.spec.ts`. The three modules the
 * component formats with are handed in FOR REAL, so an assertion about
 * "Over by 1.0 h" is an assertion about shipped arithmetic.
 */

const WIZARD = "src/components/dashboard/matches/new-match-wizard";

interface MeterProps {
  remainingSeconds: number;
  capSeconds: number;
  selectedSeconds?: number;
  suffix: string;
}

const FooterMeter = (() => {
  const exports: { FooterMeter?: React.ComponentType<MeterProps> } = {};
  const { outputText } = ts.transpileModule(
    readFileSync(resolve(`${WIZARD}/FooterMeter.tsx`), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  );
  runInNewContext(outputText, {
    exports,
    require: (id: string): unknown => {
      if (id === "react/jsx-runtime") return jsx;
      if (id === "react") return React;
      if (id === "@/lib/data/usage-format") return { usageFraction };
      if (id === "@/lib/services/splitstep/config") return { formatPilotEnd };
      if (id === "./utils")
        return { formatHoursCap, formatHoursTenths, formatAllowanceSpan };
      throw new Error(`unexpected import in the meter: ${id}`);
    },
  });
  if (!exports.FooterMeter) throw new Error("FooterMeter did not export");
  return exports.FooterMeter;
})();

const HOUR = 3600;

function render(props: Partial<MeterProps> = {}): string {
  return renderToStaticMarkup(
    React.createElement(FooterMeter, {
      remainingSeconds: 2 * HOUR,
      capSeconds: 8 * HOUR,
      suffix: "resets on the 1st",
      ...props,
    }),
  );
}

/** The mono readout, tags stripped, entities decoded. */
function readout(html: string): string {
  const spans = [
    ...html.matchAll(/<span[^>]*class="mono[^"]*"[^>]*>(.*?)<\/span>/g),
  ];
  expect(spans).toHaveLength(1);
  return spans[0][1]
    .replace(/<[^>]+>/g, "")
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("·", "·")
    .trim();
}

test("over the allowance, the readout names the overage instead of a clamped remainder", () => {
  const html = render({
    remainingSeconds: 2 * HOUR,
    selectedSeconds: 3 * HOUR,
  });
  // The real formatter, not a literal: 3.0 spent against 2.0 left.
  expect(readout(html)).toContain(`Over by ${formatAllowanceSpan(HOUR)}`);
  expect(readout(html)).toContain("Over by 1.0 h");
  expect(readout(html)).toContain("Spends 3.0 h");
  // The clamped sentence is what this replaces, so it must be gone.
  expect(html).not.toContain("left after");
});

test("over the allowance, the readout and the pending segment carry --error inline", () => {
  const html = render({
    remainingSeconds: 2 * HOUR,
    selectedSeconds: 3 * HOUR,
  });
  // Inline, because a DS type class is unlayered and outranks a utility.
  expect(html).toContain("color:var(--error)");
  expect(html).toContain("background-color:var(--error)");
  // Exactly two: the readout's text tone and the pending bar segment.
  expect([...html.matchAll(/var\(--error\)/g)]).toHaveLength(2);
});

test("over the allowance, the bar's label states the overage", () => {
  const html = render({
    remainingSeconds: 2 * HOUR,
    selectedSeconds: 3 * HOUR,
  });
  const label = /aria-label="([^"]*)"/.exec(html)?.[1] ?? "";
  expect(label).toContain("over the allowance by 1.0 hours");
});

test("a window that exactly consumes what is left is not an overage", () => {
  // `quotaRefusal()` allows the exact fit, so the meter must not contradict it.
  const exact = render({
    remainingSeconds: 2 * HOUR,
    selectedSeconds: 2 * HOUR,
  });
  expect(exact).not.toContain("Over by");
  expect(exact).not.toContain("var(--error)");
  expect(readout(exact)).toContain("0.0 of 8.0 h left after");
});

test("at or under the allowance, and unpriced, the markup is unchanged", () => {
  // The three states this task must not touch. Each is asserted whole, so a
  // stray attribute on the untouched path fails here rather than on screen.
  const under = render({ remainingSeconds: 2 * HOUR, selectedSeconds: HOUR });
  expect(under).toContain("Spends 1.0 h · 1.0 of 8.0 h left after");
  expect(under).not.toContain('style="color');
  expect(under).toContain('style="width:12.5%"');

  const unpriced = render({ remainingSeconds: 2 * HOUR });
  expect(readout(unpriced)).toBe(
    `2.0 of 8.0 h left · resets on the 1st · Pilot ends ${formatPilotEnd()}`,
  );
  expect(unpriced).not.toContain("var(--error)");

  // A zero-length selection is unpriced too, and cannot be "over" on a spent
  // allowance — the bar would otherwise turn red before a video was picked.
  const spentButUnpriced = render({ remainingSeconds: 0, selectedSeconds: 0 });
  expect(spentButUnpriced).not.toContain("Over by");
  expect(spentButUnpriced).not.toContain("var(--error)");
});

test("a small overage is said in minutes, never as 0.0 h", () => {
  // Two minutes over: tenths of an hour would round this to nothing.
  const html = render({
    remainingSeconds: HOUR,
    selectedSeconds: HOUR + 120,
  });
  expect(readout(html)).toContain("Over by 2 min");
  expect(readout(html)).not.toContain("0.0 h");
  expect(html).toContain("over the allowance by 2 minutes");
});
