import type { ReactNode } from "react";

interface FormHeaderProps {
  /** Sentence-case kicker naming the job — "Sign in", "Account recovery". */
  eyebrow: string;
  /** The product's Title Case page title, full stop included. */
  title: string;
  /**
   * Exactly one support line. The set spec allows no second paragraph: the
   * as-built pages ran a 12px description above a 13px subtitle that restated
   * it, which pushed the first field below the fold on a laptop.
   *
   * A node rather than a string so a page can inline a machine value — the
   * check-email line carries a live mono countdown — without splitting the
   * ladder into two paragraphs to do it.
   */
  description: ReactNode;
}

/**
 * The header ladder shared by every auth page: eyebrow → title-lg → one line.
 *
 * Replaces the old 28px/300 heading, which was a size that does not exist on
 * the v2 type scale, and the decorative accent rule above it.
 */
export default function FormHeader({
  eyebrow,
  title,
  description,
}: FormHeaderProps) {
  return (
    <div className="flex flex-col gap-[8px]">
      <span className="eyebrow">{eyebrow}</span>
      <h1 className="text-title-lg pt-[4px]">{title}</h1>
      <p className="text-body max-w-[46ch]">{description}</p>
    </div>
  );
}
