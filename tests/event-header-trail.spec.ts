import { expect, test } from "@playwright/test";

import { eventTrail } from "@/components/dashboard/schedule/event-header-slot";

/**
 * `eventTrail` is the data behind `EventHeaderSlot`, the header trail for
 * everything under one event — the event page, its `/edit` and `/score` flows,
 * and an upload aimed at one of its lines. Pinned as data because the slot is
 * a client component that publishes from an effect, so a wrong crumb renders
 * nothing a server-side spec could read.
 */
test.describe("eventTrail", () => {
  test("a dual with a leaf links Schedule and the event, then names the leaf", () => {
    expect(
      eventTrail({
        eventId: "e1",
        name: "Stanford",
        kind: "dual",
        leaf: "Upload video",
      }),
    ).toEqual([
      { label: "Schedule", href: "/dashboard/team/schedule" },
      { label: "vs Stanford", href: "/dashboard/team/schedule/e1" },
      { label: "Upload video" },
    ]);
  });

  test("a tournament's crumb is its bare name", () => {
    const trail = eventTrail({
      eventId: "t1",
      name: "ITA Fall Regional",
      kind: "tournament",
      leaf: "Upload video",
    });
    expect(trail[1]).toEqual({
      label: "ITA Fall Regional",
      href: "/dashboard/team/schedule/t1",
    });
    expect(trail.map((crumb) => crumb.label)).toEqual([
      "Schedule",
      "ITA Fall Regional",
      "Upload video",
    ]);
  });

  test("with no leaf the event crumb is the page and carries no href", () => {
    const trail = eventTrail({ eventId: "e1", name: "Stanford", kind: "dual" });
    expect(trail).toEqual([
      { label: "Schedule", href: "/dashboard/team/schedule" },
      { label: "vs Stanford" },
    ]);
    expect("href" in trail[1]).toBe(false);
  });
});
