/**
 * A refusal as a labeller may read it. Sentences from the publish and the
 * seed were written for an admin and can name the match (`verify_match`'s
 * "Match … not found", a storage key, a foreign-key `Key (match_id)=(…)`)
 * or the schema (a table, a constraint, a column), none of which a labeller
 * is ever shown.
 *
 * So a labeller reads one of two things: a deliberate business refusal (a
 * claim's, the gate's, the publish gate's own "Not published: …"), with
 * every id struck out in case one carries any; or, for anything else, a
 * fixed sentence, with the raw text logged for whoever reads the logs. An
 * admin reads the raw text whole; that choice is the caller's.
 */
const UUIDS = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export function stripIds(sentence: string): string {
  return sentence.replace(UUIDS, "…");
}

/**
 * `sentence` for a labeller: itself, ids struck out, when `isBusiness` says
 * it is a deliberate refusal; else `fallback`, with the raw text logged under
 * `log`.
 */
export function forLabeller(
  sentence: string,
  {
    isBusiness,
    fallback,
    log,
    context,
  }: {
    isBusiness: (sentence: string) => boolean;
    fallback: string;
    log: string;
    context?: Record<string, unknown>;
  },
): string {
  if (isBusiness(sentence)) return stripIds(sentence);
  console.error(`${log} refused a labeler`, { ...context, detail: sentence });
  return fallback;
}
