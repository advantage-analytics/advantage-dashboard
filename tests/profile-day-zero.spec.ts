import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader, marker } from "./fixtures/vm-modules";

/**
 * A team player's profile on the day it holds no match, rendered offline
 * through `fixtures/vm-modules`. What is pinned is the composition the DS
 * rule asks for (empty-and-loading.md → Three states): one sentence with at
 * most one inline link, then the page's own frame under ONE continuous
 * grade, `inert`, with nothing actionable and no card-level band inside it
 * — and that the grade is byte-identical to Home's, so the two day zeros
 * read as one product.
 */

/** The one mask both graded day zeros are cut from (`day-zero-shape.tsx`). */
const MASK =
  "linear-gradient(180deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.46) 40%, rgba(0,0,0,0.32) 100%)";

const PROFILE = "src/components/dashboard/team/player-profile/";

/** `next/link` as the anchor it renders to, keeping href, class and children. */
function LinkStub({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  return React.createElement("a", { href, className }, children);
}

function ImageStub(props: Record<string, unknown>) {
  return React.createElement("img", { src: props.src, alt: props.alt });
}

const NEXT_STUBS = {
  "next/link": { __esModule: true, default: LinkStub },
  "next/image": { __esModule: true, default: ImageStub },
  "next/navigation": {
    useRouter: () => ({ push() {}, refresh() {} }),
    usePathname: () => "/dashboard/team/roster/p1",
    useSearchParams: () => new URLSearchParams(),
  },
  "framer-motion": {
    useReducedMotion: () => true,
    motion: new Proxy({}, { get: (_, tag) => String(tag) }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  },
};

function render(
  file: string,
  exportName: string,
  props: Record<string, unknown>,
  stubs: Record<string, unknown> = {},
) {
  // Files under `@/` and `./` load for real; packages other than react
  // become markers (lucide glyphs, radix) so no client runtime is needed.
  const loader = createLoader({
    markUnknown: true,
    stubs: { ...NEXT_STUBS, ...stubs },
  });
  const exports = loader.load(file) as Record<
    string,
    React.ComponentType<Record<string, unknown>>
  >;
  return renderToStaticMarkup(React.createElement(exports[exportName], props));
}

/** The opening tag of every element carrying the `inert` attribute. */
function inertTags(html: string): string[] {
  return html.match(/<[a-z]+[^>]*\binert(?:=""|\s|>)[^>]*>/g) ?? [];
}

test.describe("ProfileDayZero", () => {
  const file = PROFILE + "profile-day-zero.tsx";
  const IMPORT_HREF = "/dashboard/matches/new?player=p1&source=swing-vision";
  const stubs = {
    // A client component reading the viewer's KPI pick; the page-level
    // structure is what is asserted here, so it stands in as a marker.
    "@/components/dashboard/shared/season-kpi-strip": {
      SeasonKpiStrip: marker("SeasonKpiStrip"),
    },
  };
  const self = { isSelf: true, firstName: "Alex" };
  const coachView = { isSelf: false, firstName: "Maya" };

  test("one inert grade, cut from Home's mask", () => {
    const html = render(
      file,
      "ProfileDayZero",
      { subject: self, canUpload: true, importHref: IMPORT_HREF },
      stubs,
    );
    const inert = inertTags(html);
    expect(inert).toHaveLength(1);
    expect(inert[0]).toContain(`mask-image:${MASK}`);
    // The sr-only sentence pairs with the grade and says nothing is real.
    expect(html).toContain(
      "Once your first match is analysed this page fills with",
    );
    expect(html).toContain("Nothing below is real data yet.");
  });

  test("the grade holds the frame and nothing actionable", () => {
    const html = render(
      file,
      "ProfileDayZero",
      { subject: self, canUpload: true, importHref: IMPORT_HREF },
      stubs,
    );
    const grade = html.slice(html.indexOf(inertTags(html)[0]));

    // The five blocks, each under its eyebrow.
    expect(grade).toContain('data-component="SeasonKpiStrip"');
    for (const eyebrow of [
      "Last match",
      "Match history",
      "Line history",
      "Serve placement",
    ])
      expect(grade).toContain(`>${eyebrow}</span>`);
    expect(grade).toContain("lg:grid-cols-[1.9fr_1fr]");
    // The ghosts' own labels survive; only the values are rules.
    expect(grade).toContain(">Score</span>");
    expect(grade).toContain(">Win %</span>");
    expect(grade).toContain("— serves");

    // No primary, no link, no button, no card-level band inside the grade.
    expect(grade).not.toContain("bg-[var(--blue)]");
    expect(grade).not.toContain("<a ");
    expect(grade).not.toContain("<button");
    for (const band of [
      "lands here",
      "newest first",
      "Lines fill in from the schedule",
      "Full report",
      "Placement view",
    ])
      expect(grade).not.toContain(band);
    expect(grade).not.toMatch(/All \d+ match/);
    expect(grade).not.toContain("animate-pulse");
  });

  test("a viewer who can upload gets the sentence with one inline link", () => {
    const html = render(
      file,
      "ProfileDayZero",
      { subject: self, canUpload: true, importHref: IMPORT_HREF },
      stubs,
    );
    const before = html.slice(0, html.indexOf(inertTags(html)[0]));
    expect(before).toContain(
      "Your first match fills this page. Send match video from New match, or ",
    );
    expect(before).toContain(`<a href="${IMPORT_HREF.replace("&", "&amp;")}"`);
    expect(before).toContain(">import a SwingVision export</a>.");
    expect(before.match(/<a /g)).toHaveLength(1);
    // A blue word rests on --blue and hovers to --blue-hover, never to ink.
    expect(before).toContain("text-[var(--blue)]");
    expect(before).toContain("hover:text-[var(--blue-hover)]");
    // No second heading and no second primary above the grade.
    expect(before).not.toMatch(/<h[1-6]/);
    expect(before).not.toContain("bg-[var(--blue)]");
  });

  test("a coach reads it in the third person", () => {
    const html = render(
      file,
      "ProfileDayZero",
      { subject: coachView, canUpload: true, importHref: IMPORT_HREF },
      stubs,
    );
    const before = html.slice(0, html.indexOf(inertTags(html)[0]));
    expect(before).toContain(
      "Maya&#x27;s first match fills this page. Send match video from New match, or ",
    );
    expect(before.match(/<a /g)).toHaveLength(1);
  });

  test("a viewer who cannot upload gets a sentence that ends, with no link", () => {
    for (const subject of [self, coachView]) {
      const html = render(
        file,
        "ProfileDayZero",
        { subject, canUpload: false, importHref: IMPORT_HREF },
        stubs,
      );
      const before = html.slice(0, html.indexOf(inertTags(html)[0]));
      expect(before).not.toContain("<a ");
      expect(before).not.toContain("swing-vision");
      expect(before).toContain("first match fills this page, once");
      expect(inertTags(html)).toHaveLength(1);
    }
  });
});

test.describe("ServePlacementCard with no zone stats", () => {
  const file = PROFILE + "serve-placement-card.tsx";
  const serve = { zoneStats: null, matchCount: 0 };

  test("names whose serve map it is, over two empty tracks", () => {
    const own = render(file, "ServePlacementCard", {
      serve,
      subject: { isSelf: true, firstName: "Alex" },
    });
    expect(own).toContain("Your serve map lands here");
    expect(own.match(/— serves/g)).toHaveLength(2);
    expect(own).toContain(">Serve placement</span>");
    expect(own).not.toContain("animate-pulse");

    const theirs = render(file, "ServePlacementCard", {
      serve,
      subject: { isSelf: false, firstName: "Maya" },
    });
    expect(theirs).toContain("Maya&#x27;s serve map lands here");
    expect(theirs.match(/— serves/g)).toHaveLength(2);
    // No button: the header's New match is the same step one row above.
    expect(theirs).not.toContain("<a ");
  });
});

test.describe("DayZeroHome", () => {
  test("still cuts its tail from the same mask", () => {
    const html = render(
      "src/components/dashboard/home/day-zero-home.tsx",
      "DayZeroHome",
      { kpiStrip: null, children: null },
      {
        "@/components/dashboard/home/day-zero-offer": {
          DayZeroOffer: marker("DayZeroOffer"),
        },
      },
    );
    const inert = inertTags(html);
    expect(inert).toHaveLength(1);
    expect(inert[0]).toContain(`mask-image:${MASK}`);
    expect(html).toContain('data-component="DayZeroOffer"');
  });
});
