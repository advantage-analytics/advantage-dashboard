// app/page.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [joined, setJoined] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agree) return;
    // TODO: submit to your backend/Supabase
    setJoined(true);
  }

  return (
    <div className="relative min-h-dvh bg-white text-foreground">
      {/* top-left logo*/}
      <Link
        href="/"
        aria-label="Advantage — Home"
        className="fixed left-[40px] top-[40px] z-50 inline-flex h-[32px] items-center"
      >
        <Image
          src="/logo.svg"
          alt="Advantage Beta"
          width={180}
          height={32}
        />
      </Link>

      {/* Sign In button */}
      <div className="fixed right-[40px] top-[40px] z-50">
        <Button
          asChild
          size="sm"
          className="h-[32px] w-[80px] px-0 rounded-md border bg-black text-white hover:bg-black/90"
        >
          <Link href="/auth/login">Sign In</Link>
        </Button>
      </div>

      {/* centered divider */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 bg-border md:block h-[320px] w-px" />

      {/* Split */}
      <main className="min-h-dvh flex items-center justify-center px-6 md:px-10">
        <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-10 md:gap-16">
          {/* Left brand/copy */}
          <section className="relative flex items-center justify-center md:justify-end md:pr-[14px]">
            <div className="max-w-[520px]">
              {/* advantage beta */}
              <Image
                src="/logo2.svg"
                alt="Advantage Beta"
                width={347}
                height={29}
                priority
                className="md:h-14"
              />

              <h2 className="mt-4 text-xl font-medium">Elevate Your Game</h2>
              {/* line breaks*/}
              <p className="mt-4 text-sm">
                We&apos;re still fine tuning Advantage and
                <span className="block">would love your feedback.</span>
              </p>
              <p className="mt-4 text-sm">
                Join our Beta to help us shape the best
                <span className="block">platform for players.</span>
              </p>
            </div>
          </section>

          {/* Spacer  */}
          <div className="hidden md:block h-[320px] w-px bg-transparent" />

          {/* Right waitlist form  */}
          <section className="relative flex items-center md:pl-[14px]">
            <form onSubmit={onSubmit} className="w-full max-w-[440px] space-y-4">
              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
                <p className="text-sm text-muted-foreground">Enter your email address</p>
              </div>

              {/* name */}
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Enter Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  required
                />
                <p className="text-sm text-muted-foreground">Enter your full name</p>
              </div>

            {/* consent (did some freaky stuff to fix spacing)*/}
              <div className="flex items-start gap-2">
                <Checkbox
                  id="consent"
                  checked={agree}
                  onCheckedChange={(v) => setAgree(Boolean(v))}
                  className="mt-0.5"
                />

                <p className="text-xs font-normal">
                  <span className="inline-flex flex-wrap items-baseline gap-0 align-baseline">
                    <span>By joining the waitlist, you agree to our</span>
                    <Link
                      href="/terms"
                      className="mx-[4px] inline-block font-semibold underline underline-offset-2"
                    >
                      Terms
                    </Link>
                    <span>and</span>
                    <Link
                      href="/privacy"
                      className="mx-[4px] inline-block font-semibold underline underline-offset-2"
                    >
                      Privacy Policy.
                    </Link>
                  </span>
                </p>
              </div>

              {/* waitlist button */}
              <Button
                type="submit"
                disabled={!agree || joined}
                className={
                  joined
                    ? "w-full bg-muted text-muted-foreground hover:bg-muted disabled:opacity-100"
                    : "w-full bg-black text-white hover:bg-black/90"
                }
              >
                {joined ? "You’ve joined the waitlist." : "Join the waitlist"}
              </Button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
