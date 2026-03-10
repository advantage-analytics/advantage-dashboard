"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import AuthNav from "@/app/(auth)/auth-nav";

export default function AuthLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() || "";

  const sizeClass =
    pathname.includes("/login")
      ? "h-[500px] w-[440px]"
      : pathname.includes("/sign-up")
        ? "h-[567px] w-[440px]"
        : "max-w-[440px] w-full";

  return (
    <div className="relative min-h-dvh bg-white text-foreground">
      <AuthNav />

      <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 bg-border md:block h-[320px] w-px" />

      <main className="min-h-dvh flex items-center justify-center px-6 md:px-10 pt-28 pb-10 md:pt-0 md:pb-0">
        <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-8 md:gap-16">
          {/* Left */}
          <div className="relative hidden md:flex items-center justify-center md:justify-end md:pr-[14px]">
            <Image
              src="/logos/logo.svg"
              alt="Advantage"
              width={200}
              height={56}
              priority
              className="h-14 w-auto"
            />
          </div>

          {/* Spacer */}
          <div className="hidden md:block h-[320px] w-px bg-transparent" />

          {/* Right column */}
          <section className="relative flex items-center md:pl-[14px]">
            <div className={cn(sizeClass, "flex flex-col w-full")}>
              {children}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
