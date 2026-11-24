"use client";

import type { ReactNode } from "react";
import Link from "next/link";

interface AuthButtonProps {
  children: ReactNode;
  type?: "button" | "submit";
  disabled?: boolean;
  onClick?: () => void;
  /** For a form with two submits (the OAuth consent page): which one this is. */
  name?: string;
  value?: string;
  /**
   * Draws the action as a link to this path instead of a button — for an
   * action that only goes somewhere ("Continue to Advantage"), so it opens in
   * a new tab like any other link.
   */
  href?: string;
}

const CLASSES =
  "inline-flex h-[44px] w-full items-center justify-center gap-[8px] rounded-[var(--radius-button)] border border-transparent bg-[var(--blue)] px-[20px] text-[13px] font-medium whitespace-nowrap text-white outline-none hover:bg-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 motion-reduce:active:scale-100";

const TRANSITION = {
  transition:
    "background-color var(--duration-hover), color var(--duration-hover), border-color var(--duration-hover), box-shadow var(--duration-hover), transform 80ms ease-out",
};

/**
 * The one full-width filled action each auth page is allowed.
 *
 * Matches the DS v2 `Button` at `size="lg"`, `variant="primary"` — 44px, Signal
 * Blue, 13px medium, 6px radius, 0.97 press — with the two properties the v2
 * audit calls out dropped: the 1px tracked label and the CTA glow. (The DS
 * component still carries both; the audit's "no tracked label, no glow" is the
 * newer decision, and a shadow on a button that sits flat on a card is exactly
 * the unearned elevation the system bans.)
 */
export default function AuthButton({
  children,
  type = "button",
  disabled = false,
  onClick,
  name,
  value,
  href,
}: AuthButtonProps) {
  if (href) {
    return (
      <Link href={href} style={TRANSITION} className={CLASSES}>
        {children}
      </Link>
    );
  }
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      name={name}
      value={value}
      style={TRANSITION}
      className={CLASSES}
    >
      {children}
    </button>
  );
}
