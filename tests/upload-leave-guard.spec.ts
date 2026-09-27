import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  leaveConfirmLabel,
  shouldAskBeforeLeaving,
} from "../src/components/dashboard/leave-guard";
import { createLoader } from "./fixtures/vm-modules";

/**
 * T10 — the leave-mid-upload guard on the dashboard chrome's links.
 *
 * The decision (`leave-guard.ts`) is pure and imported directly. The dialog
 * renders through `createLoader()` with `ConfirmDialog` stubbed to print the
 * props it was handed, so the copy and the tone are pinned without Radix.
 */

const plain = {
  button: 0,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
};

const ask = (
  overrides: Partial<Parameters<typeof shouldAskBeforeLeaving>[0]>,
) =>
  shouldAskBeforeLeaving({
    armed: true,
    currentPath: "/dashboard/matches/new",
    href: "/dashboard/matches",
    event: plain,
    ...overrides,
  });

test.describe("shouldAskBeforeLeaving", () => {
  test("not armed never asks", () => {
    expect(ask({ armed: false })).toBe(false);
  });

  test("the same pathname does not leave the screen, query string or not", () => {
    expect(ask({ href: "/dashboard/matches/new" })).toBe(false);
    expect(ask({ href: "/dashboard/matches/new?step=2" })).toBe(false);
  });

  test("a meta-click or a middle-click opens a new tab, so it does not ask", () => {
    expect(ask({ event: { ...plain, metaKey: true } })).toBe(false);
    expect(ask({ event: { ...plain, ctrlKey: true } })).toBe(false);
    expect(ask({ event: { ...plain, shiftKey: true } })).toBe(false);
    expect(ask({ event: { ...plain, altKey: true } })).toBe(false);
    expect(ask({ event: { ...plain, button: 1 } })).toBe(false);
  });

  test("an armed plain click to another path asks", () => {
    expect(ask({})).toBe(true);
    expect(ask({ href: "/dashboard/team" })).toBe(true);
  });
});

test.describe("leaveConfirmLabel", () => {
  test("names the destination", () => {
    expect(leaveConfirmLabel("Matches")).toBe("Go to Matches");
  });

  test("a blank or missing label falls back", () => {
    expect(leaveConfirmLabel("  ")).toBe("Leave this page");
    expect(leaveConfirmLabel(undefined)).toBe("Leave this page");
  });
});

test.describe("LeaveUploadDialog", () => {
  function PrintProps(props: Record<string, unknown>) {
    const printable = Object.fromEntries(
      Object.entries(props).filter(([, v]) => typeof v !== "function"),
    );
    return React.createElement(
      "pre",
      { "data-props": "" },
      JSON.stringify(printable),
    );
  }

  const loader = createLoader({
    stubs: {
      "@/components/ui/confirm-dialog": { ConfirmDialog: PrintProps },
      "next/navigation": {
        usePathname: () => "/dashboard/matches/new",
        useRouter: () => ({ push: () => {} }),
      },
    },
  });
  const { LeaveUploadDialog } = loader.load(
    "src/components/dashboard/leave-guard-context.tsx",
  ) as { LeaveUploadDialog: React.ComponentType<Record<string, unknown>> };

  function propsFor(label?: string) {
    const html = renderToStaticMarkup(
      React.createElement(LeaveUploadDialog, {
        open: true,
        label,
        onStay: () => {},
        onLeave: () => {},
      }),
    );
    const json = html
      .replace(/^<pre[^>]*>/, "")
      .replace(/<\/pre>$/, "")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, "&");
    return JSON.parse(json) as Record<string, unknown>;
  }

  test("asks the approved question, in blue", () => {
    const props = propsFor("Team Home");
    expect(props.open).toBe(true);
    expect(props.title).toBe("Leave while your video uploads?");
    expect(props.description).toBe(
      "The upload keeps going as long as this tab stays open, and you can follow it on the match page. Only this screen can cancel it.",
    );
    expect(props.cancelLabel).toBe("Stay here");
    expect(props.confirmLabel).toBe("Go to Team Home");
    expect(props.tone).not.toBe("danger");
  });

  test("without a destination the confirm reads Leave this page", () => {
    expect(propsFor(undefined).confirmLabel).toBe("Leave this page");
  });
});
