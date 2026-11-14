/**
 * The longest note Send back takes. The database's CHECK holds the same.
 * Kept apart from `lib/services/labels/check-session.ts` (server-side) so the
 * dialog can import it too.
 */
export const SEND_BACK_NOTE_MAX = 2000;
