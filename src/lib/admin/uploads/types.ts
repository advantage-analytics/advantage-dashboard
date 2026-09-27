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
  program_id: string;
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
