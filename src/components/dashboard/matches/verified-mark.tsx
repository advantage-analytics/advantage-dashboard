import Image from "next/image";

/**
 * The product's verified-check, the one mark for Verified by Advantage
 * (`match-verification.ts`): the report's facts line and its popover, the
 * matches table and gallery card, Home's event row. Decorative unless
 * `label` names it — beside the words it is `aria-hidden`; alone (the
 * gallery card) it carries the status as its alt text.
 */
export function VerifiedMark({
  size = 13,
  label,
}: {
  size?: 13 | 14;
  /** The accessible name when the mark stands without the words. */
  label?: string;
}) {
  return (
    <Image
      src="/icons/verified-check-icon.svg"
      width={size}
      height={size}
      alt={label ?? ""}
      title={label}
      aria-hidden={label ? undefined : true}
      className="shrink-0"
    />
  );
}
