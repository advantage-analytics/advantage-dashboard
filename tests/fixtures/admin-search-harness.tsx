import { createRoot } from "react-dom/client";
import { AdminSearch } from "@/components/admin/admin-search";

/**
 * The admin header's Search in a real browser, with its server action
 * swapped for `admin-search-actions-browser-mock.ts` and the router for
 * `next-navigation-browser-mock.ts` (which records pushes on the window).
 * `tests/admin-search.spec.ts` bundles this and drives it.
 */
const host = window as unknown as {
  routerPushes: string[];
  routerRefreshes: number;
};
host.routerPushes = [];
host.routerRefreshes = 0;

createRoot(document.getElementById("root")!).render(
  <>
    <input aria-label="Another field" />
    <AdminSearch />
  </>,
);
document.documentElement.dataset.hydrated = "true";
