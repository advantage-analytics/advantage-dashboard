/**
 * Admin › Pilots row shape — client-safe, so the table can import it without
 * pulling the service-role loader (`admin-pilots-server.ts`) into its bundle.
 */
export interface AdminPilotRow {
  /** `users.id` — also their personal workspace's ledger key. */
  id: string;
  /** Display name, falling back to the email's local part. */
  name: string;
  email: string;
  initials: string;
  avatarUrl: string | null;
  /** This month's personal-workspace video, in seconds (released rows excluded). */
  usedSeconds: number;
  /**
   * This month's video paid for with credits, in seconds. `processing_usage`
   * holds only the free-hours part of a job; the credit part is in
   * `video_credit_spends`. Vendor-billed time is the two together.
   */
  creditSeconds: number;
}
