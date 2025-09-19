// app/auth/sign-up/layout.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";

export default function SignUpLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-white">
      {/* Back button (fixed) */}
      <div className="fixed left-6 top-6 md:left-10 md:top-6 z-50">
        <Button
          asChild
          size="sm"
          className="bg-black text-white hover:bg-black/90"
        >
          <Link href="/">Back</Link>
        </Button>
      </div>

      {/* Main content wrapper */}
      <main className="min-h-screen flex items-center justify-center px-6 md:px-10">
        <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-10 md:gap-16">
          {/* Left column — logo */}
          <div className="flex items-center justify-center md:justify-end">
            <Image
              src="/logo.svg"
              alt="Advantage"
              width={200}
              height={56}
              priority
              className="h-14 w-auto"
            />
          </div>

          {/* Vertical divider */}
          <div className="hidden md:block h-[360px] w-px bg-border" />

          {/* Right column — children (signup form) */}
          <section className="w-full max-w-md">{children}</section>
        </div>
      </main>
    </div>
  );
}
