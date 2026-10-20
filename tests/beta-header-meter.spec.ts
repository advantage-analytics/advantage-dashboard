import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader, marker } from "./fixtures/vm-modules";

/**
 * The header's Beta pill (`beta-header-meter.tsx`) in each state it can draw:
 * the skeleton while the first hours read is in flight, the figure, out of
 * hours (own allowance or the shared beta band), a failed read's bare tag,
 * and the Pilot name a team workspace gets.
 *
 * Offline through `fixtures/vm-modules`. The tooltip is stubbed to print its
 * label and detail as attributes, so the words it would show are asserted
 * without mounting Radix.
 */

type Hours =
  | { remainingSeconds: number; capSeconds: number; creditSeconds?: number }
  | "loading"
  | null;

function render(props: { tier?: "beta" | "pilot"; hours: Hours }): string {
  const loader = createLoader({
    stubs: {
      "next/navigation": {
        usePathname: () => "/dashboard",
        useRouter: () => ({ push: () => {} }),
      },
      "@/components/dashboard/workspace-provider": {
        useWorkspace: () => ({ active: { id: "w1", kind: "personal" } }),
      },
      "@/components/dashboard/beta-welcome-dialog": {
        BetaWelcomeDialog: marker("BetaWelcomeDialog"),
        useBetaWelcomeTerms: () => ({ hours: 2 }),
      },
      "@/components/dashboard/shared/chrome-tooltip": {
        ChromeTooltip: ({
          label,
          detail,
          children,
        }: {
          label: string;
          detail: string;
          children: React.ReactNode;
        }) =>
          React.createElement(
            "div",
            { "data-tip-label": label, "data-tip-detail": detail },
            children,
          ),
      },
    },
  });
  const { BetaMeterPill } = loader.load(
    "src/components/dashboard/beta-header-meter.tsx",
  ) as {
    BetaMeterPill: React.ComponentType<
      typeof props & { onClick: () => void; resetsOn: string }
    >;
  };
  return renderToStaticMarkup(
    React.createElement(BetaMeterPill, {
      tier: "beta",
      ...props,
      onClick: () => {},
      resetsOn: "Oct 1",
    }),
  );
}

const text = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const decode = (value: string) =>
  value.replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&");

const tip = (markup: string) => ({
  label: decode(/data-tip-label="([^"]*)"/.exec(markup)![1]),
  detail: decode(/data-tip-detail="([^"]*)"/.exec(markup)![1]),
});

const bars = (markup: string) =>
  markup.match(/<span[^>]*data-pending-bar[^>]*>/g) ?? [];

const HOURS = { remainingSeconds: 1.5 * 3600, capSeconds: 2 * 3600 };

test("loading draws the loaded shape: real tag, bare ring track, one inverse bar", () => {
  const markup = render({ hours: "loading" });
  expect(text(markup)).toBe("Beta");
  expect(markup).toContain('aria-busy="true"');
  expect(markup).toContain('aria-label="Beta: checking video hours left"');
  // The ring's track only — no progress arc promised before the figure.
  expect(markup.match(/<circle/g)).toHaveLength(1);
  const [bar, ...rest] = bars(markup);
  expect(rest).toHaveLength(0);
  expect(bar).toContain("bg-white/30");
  expect(bar).toContain("motion-safe:animate-pulse");
  expect(bar).not.toContain("--surface-skeleton");
  expect(tip(markup)).toEqual({
    label: "Free during the beta",
    detail: "Checking your video hours",
  });
});

test("C1: loaded shows free hours left and points at Plan", () => {
  const markup = render({ hours: HOURS });
  expect(text(markup)).toBe("Beta 1.5h left");
  expect(markup).not.toContain("aria-busy");
  expect(bars(markup)).toHaveLength(0);
  expect(tip(markup)).toEqual({
    label: "Free during the beta",
    detail: "1.5 of 2 free hours left this month. Click for Plan.",
  });
});

test("C2: running low keeps the ring white and says it in the tooltip", () => {
  const markup = render({
    hours: { remainingSeconds: 0.4 * 3600, capSeconds: 2 * 3600 },
  });
  expect(text(markup)).toBe("Beta 0.4h left");
  expect(tip(markup)).toEqual({
    label: "Running low",
    detail:
      "0.4 of 2 free hours left. They reset Oct 1, or add credits on Plan.",
  });
  // White ring only: no amber or red stroke anywhere on the pill.
  expect(markup).not.toMatch(/viz-key|--danger|--error|amber/);
});

test("C3: free hours spent with credits left — the figure is credits", () => {
  const markup = render({
    hours: { remainingSeconds: 0, capSeconds: 2 * 3600, creditSeconds: 13_200 },
  });
  expect(text(markup)).toBe("Beta 3.7h credits");
  expect(tip(markup).label).toBe("Using your credits");
  expect(tip(markup).detail).toContain("3h 40m in credits left.");
});

test("a team workspace's pill says Pilot", () => {
  const markup = render({
    tier: "pilot",
    hours: {
      remainingSeconds: 68.5 * 3600,
      capSeconds: 75 * 3600,
    },
  });
  expect(text(markup)).toBe("Pilot 68.5h left");
  expect(tip(markup).label).toBe("Free during the pilot");
  expect(markup).toContain('aria-label="Pilot: 68.5 of 75 video hours left');
});

test("C4: out of everything, and a team's empty allowance", () => {
  const own = render({
    hours: { remainingSeconds: 0, capSeconds: 2 * 3600, creditSeconds: 0 },
  });
  const team = render({
    tier: "pilot",
    hours: { remainingSeconds: 0, capSeconds: 75 * 3600 },
  });

  expect(text(own)).toBe("Beta Out of hours");
  expect(own).toContain('aria-label="Beta: out of video hours until Oct 1"');
  expect(tip(own)).toEqual({
    label: "Out of video hours",
    detail: "Free hours come back Oct 1. Click to add credits.",
  });

  expect(text(team)).toBe("Pilot Out of hours");
  expect(tip(team).detail).toBe(
    "Your team has used its 75 video hours this month. They reset on Oct 1.",
  );
  // A team never hears about credits — they are personal.
  expect(tip(team).detail).not.toContain("credits");
});

test("a failed read is the bare tag, never a skeleton or a full ring", () => {
  const markup = render({ hours: null });
  expect(text(markup)).toBe("Beta");
  expect(markup).not.toContain("<svg");
  expect(markup).not.toContain("aria-busy");
  expect(bars(markup)).toHaveLength(0);
  expect(tip(markup).detail).toBe("About the beta");
});

test("an admin's uncapped workspace says Unlimited, never a figure", () => {
  const cap = 2_147_483_647;
  const markup = render({
    hours: {
      remainingSeconds: cap - 3 * 3600,
      capSeconds: cap,
      creditSeconds: 0,
    },
  });
  expect(text(markup)).toBe("Beta Unlimited");
  expect(tip(markup)).toEqual({
    label: "Unlimited video hours",
    detail: "Admin accounts have no monthly cap. Click for Plan.",
  });
  expect(markup).not.toMatch(/596\d{3}/);
});
