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
}
