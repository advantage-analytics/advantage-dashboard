import type { ReactNode } from "react";
import Image from "next/image";
import BrandPanel from "@/components/auth/brand-panel";
import { MARKETING_SITE_URL } from "@/lib/constants";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh w-full bg-[var(--color-bg-dark)]">
      {/* Brand panel — desktop only */}
      <div className="hidden lg:flex lg:flex-1">
        <BrandPanel />
      </div>

      {/* Form panel */}
      <div className="relative flex h-full w-full flex-1 items-center justify-center overflow-y-auto bg-[var(--color-bg-panel)] px-6 py-10 lg:px-16 lg:py-16">
        {/* Mobile logo */}
        <div className="absolute left-6 top-8 lg:hidden">
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
