import type { ReactNode } from "react";
import Image from "next/image";
import BrandPanel from "@/components/auth/brand-panel";
import { MARKETING_SITE_URL } from "@/lib/constants";

/**
 * The 50/50 auth split, unchanged from the shipped layout — the v2 set spec
 * keeps it. Surfaces now name the v2 tokens directly (`--surface-page`,
 * `--surface-card`) rather than the legacy `--color-bg-*` aliases, which
 * resolve to the same two hexes.
 *
 * Vertical pane padding is 48px, not the 64px the spec quotes for a resting
 * page. The column is vertically centered, so the gutter is only reachable by
 * the tallest form in the set — sign-up, three fields deep — which is exactly
 * the case the spec drops to 48px for. A flat 48 reproduces both numbers.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh w-full bg-[var(--surface-page)]">
      {/* Brand panel — desktop only */}
      <div className="hidden lg:flex lg:flex-1">
        <BrandPanel />
      </div>

      {/* Form panel */}
      <div className="relative flex h-full w-full flex-1 items-center justify-center overflow-y-auto bg-[var(--surface-card)] px-6 py-10 lg:px-16 lg:py-12">
        {/* Mobile logo */}
        <div className="absolute top-8 left-6 lg:hidden">
          <a
            href={MARKETING_SITE_URL}
            aria-label="Advantage Analytics — Home"
            className="flex items-center"
          >
            <Image
              src="/logos/logo.svg"
              alt="Advantage"
              width={100}
              height={20}
              priority
              className="h-5 w-auto"
            />
          </a>
        </div>

        {children}
      </div>
    </div>
  );
}
