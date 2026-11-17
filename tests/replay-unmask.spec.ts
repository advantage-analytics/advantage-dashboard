import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";

import { expect, test } from "@playwright/test";
import { createElement, type FunctionComponent } from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import {
  maskReplayText,
  replayMask,
  replayUnmask,
  type ReplayTextElement,
} from "@/lib/ui/replay-unmask";
import { cn } from "@/lib/utils";

const WIZARD = "src/components/dashboard/matches/new-match-wizard";

/** The real FieldCaption, compiled here: Playwright rewrites JSX it imports. */
function loadFieldCaption(): FunctionComponent<Record<string, unknown>> {
  const exports: Record<string, unknown> = {};
  runInNewContext(
    ts.transpileModule(
      readFileSync(resolve(`${WIZARD}/FieldCaption.tsx`), "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          jsx: ts.JsxEmit.ReactJSX,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    {
      exports,
      require: (dep: string) => {
        if (dep === "react/jsx-runtime") return jsx;
        if (dep === "@/lib/utils") return { cn };
        if (dep === "@/lib/ui/replay-unmask")
          return { replayMask, replayUnmask };
        throw new Error(`unexpected import in the field caption: ${dep}`);
      },
    },
  );
  return exports.FieldCaption as FunctionComponent<Record<string, unknown>>;
}

/**
 * Session replays mask every text node, and only text under a
 * `replayUnmask()` element reads through — the nearest mark winning. A tiny
 * fake tree stands in for the DOM: `closest` walks up the parents and matches
 * the two attribute selectors, `contains` walks up from the other node.
 */

class FakeNode implements ReplayTextElement {
  constructor(
    readonly attrs: Record<string, string> = {},
    readonly parent: FakeNode | null = null,
  ) {}

  child(attrs: Record<string, string> = {}): FakeNode {
    return new FakeNode(attrs, this);
  }

  closest(selector: string): FakeNode | null {
    const attr = selector.match(/^\[([\w-]+)\]$/)?.[1];
    if (!attr) throw new Error(`unsupported selector ${selector}`);
    for (let n: FakeNode | null = this; n; n = n.parent) {
      if (attr in n.attrs) return n;
    }
    return null;
  }

  contains(other: object | null): boolean {
    for (let n = other as FakeNode | null; n; n = n.parent) {
      if (n === this) return true;
    }
    return false;
  }
}

test("unmarked text is masked, its spaces kept", () => {
  const root = new FakeNode();
  expect(maskReplayText("Sam Rivera  won", root.child())).toBe(
    "*** ******  ***",
  );
});

test("text with no element is masked", () => {
  expect(maskReplayText("Step 2 of 4", null)).toBe("**** * ** *");
  expect(maskReplayText("Step 2 of 4")).toBe("**** * ** *");
});

test("text inside an unmask region reads through", () => {
  const button = new FakeNode().child(replayUnmask());
  expect(maskReplayText("Continue", button)).toBe("Continue");
  expect(maskReplayText("1 required left", button.child())).toBe(
    "1 required left",
  );
});

test("a replayMask() value inside an unmask region is masked", () => {
  const caption = new FakeNode().child(replayUnmask());
  const name = caption.child(replayMask());
  expect(maskReplayText("Sam ", name)).toBe("*** ");
  expect(maskReplayText("at the start", caption)).toBe("at the start");
});

test("an unmask region nested inside a mask region reads through", () => {
  const masked = new FakeNode().child(replayMask());
  const label = masked.child().child(replayUnmask());
  expect(maskReplayText("Back", label)).toBe("Back");
  expect(maskReplayText("Sam", masked.child())).toBe("***");
});

test("the marks are bare data attributes", () => {
  expect(replayUnmask()).toEqual({ "data-ph-unmask": "" });
  expect(replayMask()).toEqual({ "data-ph-mask": "" });
});

/**
 * Where the marks sit in the components that carry them. The rule above only
 * holds if a value never lands under `data-ph-unmask` without a
 * `data-ph-mask` between them.
 */
test.describe("marked components", () => {
  test("a field caption reads its label, never its subject or its tag", () => {
    const html = renderToStaticMarkup(
      createElement(loadFieldCaption(), {
        subject: "Sam",
        label: "at the start",
        tag: "· S1",
        required: true,
      }),
    );
    // The label span is the unmasked region, and the name inside it is
    // re-masked; the tag sits beside it, outside.
    expect(html).toMatch(
      /<span data-ph-unmask="" [^>]*><span data-ph-mask="">Sam <\/span>at the start/,
    );
    // Nothing above the tag is unmasked: not the root, not the tag's span.
    expect(html.slice(0, html.indexOf(">"))).not.toContain("data-ph-unmask");
    const tagSpan = html.slice(0, html.indexOf("· S1"));
    expect(tagSpan.slice(tagSpan.lastIndexOf("<span"))).not.toContain(
      "data-ph-unmask",
    );
  });

  test("the wizard shell never unmasks its description", () => {
    const source = readFileSync(resolve(`${WIZARD}/WizardShell.tsx`), "utf8");
    const description = source.slice(
      source.lastIndexOf("<p", source.indexOf("{description}")),
      source.indexOf("{description}"),
    );
    expect(description).toContain("<p");
    expect(description).not.toContain("replayUnmask");
  });
});
