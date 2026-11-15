import { FileSpreadsheet, ListOrdered, Trophy, Video } from "lucide-react";

/**
 * The admin upload page's four kind cards, in order: shared by the page
 * (`admin-upload-entry.tsx`) and its skeleton (`admin-upload-skeleton.tsx`),
 * which must not import the page — the page pulls in the whole upload wizard.
 */
export const ADMIN_UPLOAD_CHOICES = [
  {
    kind: "file",
    label: "Match file",
    detail: "SwingVision export, .xlsx",
    icon: FileSpreadsheet,
  },
  {
    kind: "video",
    label: "Match video",
    detail: "Counts against the team’s hours",
    icon: Video,
  },
  {
    kind: "dual",
    label: "Dual result",
    detail: "Team score and every line",
    icon: ListOrdered,
  },
  {
    kind: "tournament",
    label: "Tournament result",
    detail: "Rounds, draws and placings",
    icon: Trophy,
  },
] as const;
