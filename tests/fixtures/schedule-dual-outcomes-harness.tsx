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
  />,
);
document.documentElement.dataset.hydrated = "true";
