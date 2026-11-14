/**
 * A refusal as a labeller may read it. Sentences from the publish and the
 * seed were written for an admin and can name the match (`verify_match`'s
 * "Match … not found", a storage key, a foreign-key `Key (match_id)=(…)`),
 * which a labeller is never shown: every id is struck out.
 */
const UUIDS = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function stripIds(sentence: string): string {
  return sentence.replace(UUIDS, "…");
}
