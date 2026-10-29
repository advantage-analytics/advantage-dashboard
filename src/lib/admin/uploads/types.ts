/**
 * The admin upload file route's message when its own POST handler throws
 * after `submitAdminMatchFile` may already have stored the blob and called
 * its RPC — the file may have already landed. `useUploadMatchWizard`
 * string-matches this exact sentence to decide whether a failed submit needs
 * a status check before any retry, so the route and the wizard share it
 * rather than keeping two copies in sync by hand. No server-only imports
 * here: the wizard is a client component.
 */
export const SUBMISSION_RESPONSE_INTERRUPTED_MESSAGE =
  "Submission response was interrupted. Check this operation before retrying with the same file.";

/**
 * How a console upload into a player's personal workspace is billed — the
 * administrator's choice, stored on the submission and read back by
 * `admin_reserve_video_quota`, never taken from a later request:
 *
 * - `free`: billed to nobody. The usage lands on the administrator's own
 *   uncapped account, as an admin's own uploads do.
 * - `player`: the player's allowance — free monthly hours first (their
 *   admin-set hours override wins), then credits they bought.
 */
export const ADMIN_UPLOAD_BILLINGS = ["free", "player"] as const;
export type AdminUploadBilling = (typeof ADMIN_UPLOAD_BILLINGS)[number];

/** Durable console provenance; ordinary dashboard writes never create these rows. */
export type AdminUploadSubmissionKind =
  "file" | "video" | "dual" | "tournament" | "analysis_attachment";
export type AdminUploadItemKind = "match" | "outcome" | "analysis_attachment";
export type AdminUploadItemStatus = "pending" | "succeeded" | "failed";
export type AdminUploadJson =
  | string
  | number
  | boolean
  | null
  | AdminUploadJson[]
  | { [key: string]: AdminUploadJson };

export interface DbAdminUploadSubmission {
  operation_id: string;
  /** Null only after account deletion; never accepted from the caller. */
  actor_user_id: string | null;
  /** Null for a personal target: exactly one of this and `personal_user_id`. */
  program_id: string | null;
  /** The player whose personal workspace a console video went into. */
  personal_user_id: string | null;
  /** How a personal upload is billed; null for a team's. */
  billing: AdminUploadBilling | null;
  kind: AdminUploadSubmissionKind;
  event_id: string | null;
  setup_result: { [key: string]: AdminUploadJson };
  origin: "admin_console";
  created_at: string;
}

export interface DbAdminUploadSubmissionItem {
  operation_id: string;
  item_id: string;
  kind: AdminUploadItemKind;
  /** Immutable normalized request: changing it on a retry is rejected. */
  request: { [key: string]: AdminUploadJson };
  status: AdminUploadItemStatus;
  match_id: string | null;
  outcome_id: string | null;
  processing_job_id: string | null;
  match_file_id: string | null;
  result: { [key: string]: AdminUploadJson };
  error_code: string | null;
  audit_id: number | null;
  created_at: string;
  updated_at: string;
}
