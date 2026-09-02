/**
 * The one sentence the activity trigger is allowed to count in.
 *
 * The chrome carries no numeric badges — the dot is presence, nothing more —
 * so every number the tray knows has to fit here, in the tooltip's `detail`
 * and, word for word, in the button's `aria-label`. That makes this string the
 * only place a sighted hover and a screen reader can disagree, which is why it
 * is one pure function rather than two format calls at the two call sites.
 *
 * Invitations lead. They are the only row in the tray that asks the reader to
 * decide something; in-flight work resolves on its own whether or not anybody
 * looks. A person who has both wants to read the one with a button first.
 *
 * No React, no Next, no tokens: the whole point is that a spec can assert the
 * exact strings without rendering anything.
 */
export function trayDetail(inviteCount: number, inFlightCount: number): string {
  const parts: string[] = [];

  if (inviteCount > 0) {
    parts.push(
      inviteCount === 1 ? "1 invitation" : `${inviteCount} invitations`
    );
  }

  if (inFlightCount > 0) {
    parts.push(`${inFlightCount} in flight`);
  }

  // "Nothing in flight" is the tray's own empty state, said in the tooltip's
  // voice. Not "Nothing waiting" — the panel below already prints this
  // sentence, and two words for one state is how a chrome starts lying.
  return parts.length === 0 ? "Nothing in flight" : parts.join(" · ");
}
