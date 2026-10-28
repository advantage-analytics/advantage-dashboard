import { createRoot } from "react-dom/client";
import { AdminSearch } from "@/components/admin/admin-search";

/**
 * The admin header's team search in a real browser, with its server action
 * swapped for `admin-search-actions-browser-mock.ts`.
 * `tests/admin-search.spec.ts` bundles this and drives it.
 */
createRoot(document.getElementById("root")!).render(<AdminSearch />);
document.documentElement.dataset.hydrated = "true";
