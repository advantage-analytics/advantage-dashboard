// app/auth/sign-up/page.tsx
"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { SignUpForm } from "@/components/auth/sign-up-form";

export default function Page() {
  return (
    <div className="relative min-h-screen bg-white">
      {/* Back button (fixed, unchanged) */}
      <div className="fixed left-6 top-6 md:left-10 md:top-6 z-50">
        <Button asChild size="sm" className="bg-black text-white hover:bg-black/90">
          <Link href="/">Back</Link>
        </Button>
      </div>

      {/* Centered content */}
      <main className="min-h-screen flex items-center justify-center px-6 md:px-10">
        <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-10 md:gap-16">
          {/* Left column — logo */}
          <div className="flex items-center justify-center md:justify-end">
            <Image
              src="/logo.svg"               // make sure public/logo.svg exists
              alt="Advantage"
              width={180}
              height={48}
              priority
              className="h-12 w-auto"
            />
          </div>

          {/* Vertical divider */}
          <div className="hidden md:block h-[360px] w-px bg-border" />

          {/* Right column — form */}
          <section className="w-full max-w-md">
            <h1 className="text-2xl font-semibold">Create your account</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit.
            </p>

            <div className="mt-6">
              <SignUpForm />
            </div>

            <p className="mt-4 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/auth/login" className="underline">Login</Link>
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
