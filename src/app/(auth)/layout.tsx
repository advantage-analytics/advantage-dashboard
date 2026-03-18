"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import BrandPanel from "@/components/auth/brand-panel";

export default function AuthLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";
  const variant = pathname.includes("/request-access")
    ? "request-access"
    : "default";

  return (
    <div className="flex h-dvh w-full bg-[var(--color-bg-dark)]">
      {/* Brand panel — desktop only */}
      <div className="hidden lg:flex lg:flex-1">
        <BrandPanel variant={variant} />
      </div>

      {/* Form panel */}
      <div className="relative flex h-full w-full flex-1 items-center justify-center overflow-y-auto bg-[var(--color-bg-panel)] px-6 py-10 lg:px-16 lg:py-16">
        {/* Mobile logo */}
        <div className="absolute left-6 top-8 lg:hidden">
          <Image
            src="/logos/logo.svg"
            alt="Advantage"
            width={100}
            height={20}
            priority
            className="h-5 w-auto"
          />
        </div>

        {children}
      </div>
    </div>
  );
}
