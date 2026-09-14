import { StatePill } from "@/components/ui/state-pill";

/**
 * The viewer's own row, marked — "You" straight after their name, on every
 * surface that can show the person reading it: the Members card, the roster,
 * the hours breakdown, a transfer receipt, the wizard's roster menu and player
 * field, a player profile.
 *
 * The one way to draw it. Grey, in `StatePill`'s geometry (design owner's
 * call 2026-09-13, retiring the blue tint of 2026-09-06): blue is for actions
 * and emphasis, and a marker on a card with nothing to click was spending it —
 * "New" is the only blue-tinted pill left. Identity, not standing: it sits
 * beside the name, never in a row's state-pill column, so a row carrying both
 * `You` and a role pill is not two states.
 *
 * No label prop — "You" is the whole vocabulary. A lowercase `you`, `(you)` or
 * a `<StatePill>You</StatePill>` is drift, and `check-design-drift.mjs`
 * counts it.
 */
export function YouPill({ className }: { className?: string }) {
  return <StatePill className={className}>You</StatePill>;
}
