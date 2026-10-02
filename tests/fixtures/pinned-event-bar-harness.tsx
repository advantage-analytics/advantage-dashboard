import { createRoot } from "react-dom/client";
import { PinnedEventBar } from "@/components/dashboard/schedule/static/pinned-event-bar";
import type { EventSite } from "@/lib/schedule/types";

const sites: EventSite[] = ["home", "away", "neutral"];

createRoot(document.getElementById("root")!).render(
  <>
    {sites.map((site) => (
      <section key={site} aria-label={`Pinned ${site} event`}>
        <PinnedEventBar kind="dual" name="Test opponent" site={site} />
      </section>
    ))}
  </>,
);

document.documentElement.dataset.hydrated = "true";
