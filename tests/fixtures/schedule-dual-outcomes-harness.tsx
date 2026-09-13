import { createRoot } from "react-dom/client";
import { DualDetail } from "@/components/dashboard/schedule/dual-detail";
import {
  detail,
  NORMAL_ENTRIES,
  OUTCOME_ENTRIES,
} from "./schedule-dual-outcomes-data";

const normal = new URLSearchParams(location.search).has("normal");

createRoot(document.getElementById("root")!).render(
  <DualDetail
    detail={detail(normal ? NORMAL_ENTRIES : OUTCOME_ENTRIES)}
    canEdit
    totals={
      normal
        ? null
        : {
            ours: {
              firstServeInPct: 63,
              firstServeWonPct: 71,
              breakPoints: { converted: 3, opportunities: 5 },
              pointsWonPct: 58,
            },
            theirs: {
              firstServeInPct: 57,
              firstServeWonPct: 49,
              breakPoints: { converted: 1, opportunities: 4 },
              pointsWonPct: 42,
            },
            matchesCounted: 1,
          }
    }
    history={{ played: 0, us: 0, them: 0, lastPlayedOn: null }}
    meetings={[]}
  />,
);
document.documentElement.dataset.hydrated = "true";
