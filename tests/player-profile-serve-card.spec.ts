import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { PlayerProfile } from "@/lib/data/player-profile-server";
import { createLoader, marker } from "./fixtures/vm-modules";

/**
 * The team player profile's serve card, offline (T20): three states from one
 * `serve` shape. A failed shots read says it could not load — never the
 * "serve map lands here" day-zero band, which would tell a coach a player
 * with a season of matches has no report. `ServePlacementQuietStrip` and
 * `CardEmpty` are markers; the `CardEmpty` marker also prints its band title
 * so the day-zero copy is checkable without the real primitive.
 */

const FILE =
  "src/components/dashboard/team/player-profile/serve-placement-card.tsx";

function render(
  serve: PlayerProfile["serve"],
  subject = { isSelf: false, firstName: "Maya" },
) {
  const loader = createLoader({
    stubs: {
      "@/components/dashboard/home/serve-placement-quiet-strip": {
        ServePlacementQuietStrip: marker("ServePlacementQuietStrip"),
      },
      "@/components/dashboard/home/day-zero-shape": {
        GHOST_OPACITY: [1, 0.6, 0.35],
        GhostRule: marker("GhostRule"),
      },
      "@/components/dashboard/shared/card-empty": {
        CardEmpty: ({ band }: { band: { title: string } }) =>
          React.createElement(
            "span",
            { "data-component": "CardEmpty" },
            band.title,
          ),
      },
    },
  });
  const { ServePlacementCard } = loader.load(FILE) as {
    ServePlacementCard: React.ComponentType<Record<string, unknown>>;
  };
  return renderToStaticMarkup(
    React.createElement(ServePlacementCard, { serve, subject }),
  );
}

const EMPTY = { zoneStats: null, matchCount: 0, serves: 0 } as const;

test("unavailable: the card frame and a couldn't-load notice, not the day-zero band", () => {
  const html = render({ ...EMPTY, unavailable: true });
  expect(html).toContain("surface-card");
  expect(html).toContain("Serve placement</span>");
  expect(html).toContain(
    "Couldn&#x27;t load Maya&#x27;s serves. Reload the page to try again.",
  );
  expect(html).not.toContain("serve map lands here");
  expect(html).not.toContain('data-component="CardEmpty"');
  expect(html).not.toContain('data-component="GhostRule"');
  expect(html).not.toContain('data-component="ServePlacementQuietStrip"');
  expect(html).not.toContain("animate-pulse");
});

test("unavailable, own profile: the notice speaks to the reader", () => {
  const html = render(
    { ...EMPTY, unavailable: true },
    { isSelf: true, firstName: "Maya" },
  );
  expect(html).toContain("Couldn&#x27;t load your serves.");
  expect(html).not.toContain("Maya");
});

test("no matches: the day-zero band, no notice", () => {
  const html = render({ ...EMPTY, unavailable: false });
  expect(html).toContain('data-component="CardEmpty"');
  expect(html).toContain("Maya&#x27;s serve map lands here");
  expect(html).not.toContain("Couldn&#x27;t load");
  expect(html).not.toContain('data-component="ServePlacementQuietStrip"');
});

test("a map: the quiet strip, no band and no notice", () => {
  const zone = { total: 0, in: 0, won: 0 };
  const html = render({
    zoneStats: {
      "deuce-wide": zone,
    } as unknown as PlayerProfile["serve"]["zoneStats"],
    matchCount: 3,
    serves: 40,
    unavailable: false,
  });
  expect(html).toContain('data-component="ServePlacementQuietStrip"');
  expect(html).not.toContain('data-component="CardEmpty"');
  expect(html).not.toContain("Couldn&#x27;t load");
});
