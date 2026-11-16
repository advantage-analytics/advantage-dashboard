import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The product's verified-check, the one mark for Verified by Advantage
 * (`match-verification.ts`): the report's facts line and its popover, the
 * matches table and gallery card, Home's event row. Decorative unless
 * `label` names it — beside the words it is `aria-hidden`; alone (the
 * gallery card) it carries the status as its alt text.
 *
 * `pending` draws the same mark greyed and faded while verification is
 * pending (`PendingFact`): the check that is coming, not one already made.
 */
export function VerifiedMark({
  size = 13,
  label,
  pending = false,
}: {
  size?: 13 | 14;
  /** The accessible name when the mark stands without the words. */
  label?: string;
  /** Greyscale at reduced opacity — the match is waiting on a check. */
  pending?: boolean;
}) {
  return (
    <Image
      src="/icons/verified-check-icon.svg"
      width={size}
      height={size}
      alt={label ?? ""}
      title={label}
      aria-hidden={label ? undefined : true}
      className={cn("shrink-0", pending && "opacity-55 grayscale")}
    />
  );
}
