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
  | { remainingSeconds: number; capSeconds: number; bandFull: boolean }
  | "loading"
  | null;

function render(props: { tier?: "beta" | "pilot"; hours: Hours }): string {
  const loader = createLoader({
    stubs: {
      "next/navigation": { usePathname: () => "/dashboard" },
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

test("loaded shows the figure and no skeleton", () => {
  const markup = render({ hours: { ...HOURS, bandFull: false } });
  expect(text(markup)).toBe("Beta 1.5h left");
  expect(markup).not.toContain("aria-busy");
  expect(bars(markup)).toHaveLength(0);
  expect(tip(markup).detail).toBe("1.5 of 2 video hours left");
});

test("a team workspace's pill says Pilot", () => {
  const markup = render({
    tier: "pilot",
    hours: {
      remainingSeconds: 68.5 * 3600,
      capSeconds: 75 * 3600,
      bandFull: false,
    },
  });
  expect(text(markup)).toBe("Pilot 68.5h left");
  expect(tip(markup).label).toBe("Free during the pilot");
  expect(markup).toContain('aria-label="Pilot: 68.5 of 75 video hours left');
});

test("out of hours is one pill; the tooltip says which allowance ran out", () => {
  const own = render({
    hours: { remainingSeconds: 0, capSeconds: 2 * 3600, bandFull: false },
  });
  const band = render({
    hours: { remainingSeconds: 0, capSeconds: 2 * 3600, bandFull: true },
  });
  const team = render({
    tier: "pilot",
    hours: { remainingSeconds: 0, capSeconds: 75 * 3600, bandFull: false },
  });

  for (const markup of [own, band]) {
    expect(text(markup)).toBe("Beta Out of hours");
    expect(markup).toContain(
      'aria-label="Beta: out of video hours until Oct 1"',
    );
  }
  expect(text(team)).toBe("Pilot Out of hours");

  expect(tip(own).detail).toBe(
    "You've used your 2 video hours this month. They reset on Oct 1.",
  );
  expect(tip(band).detail).toBe(
    "Free video hours are used up for everyone this month. Yours reset on Oct 1.",
  );
  expect(tip(team).detail).toBe(
    "Your team has used its 75 video hours this month. They reset on Oct 1.",
  );
});

test("a failed read is the bare tag, never a skeleton or a full ring", () => {
  const markup = render({ hours: null });
  expect(text(markup)).toBe("Beta");
  expect(markup).not.toContain("<svg");
  expect(markup).not.toContain("aria-busy");
  expect(bars(markup)).toHaveLength(0);
  expect(tip(markup).detail).toBe("About the beta");
});
