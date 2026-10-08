import { StatePill } from "@/components/ui/state-pill";
import { PROGRAM_ROLE_LABEL, type ProgramRole } from "@/lib/workspace/types";

/**
 * A member's standing in a program, as a pill — `Owner`, `Coach`, `Staff`,
 * `Player`. The flat half of the Members card's role column: a row the viewer
 * may change carries the `MenuSelect` role trigger instead, and this is what
 * every other row, list and receipt draws.
 *
 * The one way to draw it, the way `YouPill` is for the viewer's marker. Grey,
 * in `StatePill`'s geometry, and the word comes from `PROGRAM_ROLE_LABEL` —
 * never a `capitalize(role)` at the call site, which is how a role came to be
 * spelled by whichever file happened to print it.
 */
export function RolePill({
  role,
  className,
}: {
  role: ProgramRole;
  className?: string;
}) {
  return (
    <StatePill className={className}>{PROGRAM_ROLE_LABEL[role]}</StatePill>
  );
}
