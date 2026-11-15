import {
  advButton,
  type AdvButtonSize,
  type AdvButtonVariant,
} from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

/**
 * A page's button drawn in its skeleton: the label is chrome the page already
 * knows, so it renders as itself — at the real button's size, so nothing
 * moves when the page lands — but as a hidden, unclickable `span`, since
 * nothing behind it is ready to answer yet.
 */
export function InertButton({
  variant = "outline",
  size = "sm",
  className,
  children,
}: {
  variant?: AdvButtonVariant;
  size?: AdvButtonSize;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(advButton(variant, size), "pointer-events-none", className)}
    >
      {children}
    </span>
  );
}
