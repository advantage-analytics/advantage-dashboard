import { expect, test } from "@playwright/test";

import { ADMIN_MENU_LINKS } from "@/components/admin/admin-account-menu";

/**
 * The admin account menu carries the pages that left the tab row. Offline: no
 * browser, no server, just the exported list.
 */
test("admin account menu links, in order", () => {
  expect(ADMIN_MENU_LINKS.map((l) => [l.label, l.href])).toEqual([
    ["Requests", "/admin/requests"],
    ["Messages", "/admin/messages"],
    ["Ask", "/admin/ask"],
    ["Conferences", "/admin/conferences"],
    ["Pilots", "/admin/pilots"],
    ["Outreach", "/admin/outreach"],
    ["Pay report", "/admin/labels/pay"],
  ]);
});
