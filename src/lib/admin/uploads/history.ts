import type { AnalysisStatus } from "@/lib/data/match-analysis";
import type { AdminUploadSubmissionKind, AdminUploadItemKind } from "./types";

export type AdminUploadHistoryState =
  AnalysisStatus | "pending" | "saved" | "partial" | "unknown";
export interface AdminUploadHistoryItem {
  itemId: string;
  kind: AdminUploadItemKind;
  /** Admission/save outcome, separate from later processing. */
  saveStatus: string;
  state: AdminUploadHistoryState;
  error: string | null;
  what: string;
  matchId: string | null;
  outcomeId: string | null;
  outcome: { kind: string; side: string; round: string | null } | null;
  /** Only supplied when the current session can read this match. */
  matchHref: string | null;
}
export interface AdminUploadHistoryRow {
  operationId: string;
  date: string;
  team: { id: string; name: string; side: string | null };
  kind: AdminUploadSubmissionKind;
  what: string;
  addedBy: { id: string | null; name: string };
  eventId: string | null;
  state: AdminUploadHistoryState;
  counts: { saved: number; failed: number; pending: number; unknown: number };
  items: AdminUploadHistoryItem[];
}
export type AdminUploadHistoryResult =
  | { ok: true; rows: AdminUploadHistoryRow[]; nextCursor: string | null }
  | {
      ok: false;
      reason:
        | "admin-required"
        | "invalid-cursor"
        | "invalid-page-size"
        | "read-failed";
      message: string;
    };
