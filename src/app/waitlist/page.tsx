"use client";

import Image from "next/image";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { X } from "lucide-react";

export default function WaitlistPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  const [joined, setJoined] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!agree) return;

    setLoading(true);
    setError("");

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("waitlists")
        .insert([
          {
            email: email,
            name: name,
          },
        ])
        .single();

      if (error) {
        if (error.code === "23505") {
          throw new Error("This email has already joined the waitlist");
        }
        throw error;
      }

      setJoined(true);
    } catch (err) {
      console.error("Error joining waitlist:", err);
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-dvh bg-white text-foreground px-6 md:px-20">
      {/* Nav */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-sm md:bg-transparent md:backdrop-blur-none">
        <nav className="mx-auto flex flex-row items-center justify-between px-10 py-9 md:px-20">
          {/* Logo */}
          <Link href="/" aria-label="Advantage — Home">
            <Image
              src="/logos/logo.svg"
              alt="Advantage Logo"
              width={120}
              height={22}
              priority
              className="h-6 w-auto md:h-7"
            />
          </Link>

          {/* Close button */}
          <div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-black hover:text-white bg-gray-500/10 hover:bg-black/80"
              onClick={() => router.back()}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </nav>
      </header>

      {/* Centered divider */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 hidden -translate-x-1/2 -translate-y-1/2 bg-border md:block h-[320px] w-px" />

      {/* Split layout */}
      <main className="min-h-dvh flex items-center justify-center md:px-10 pt-28 pb-10 md:pt-0 md:pb-0">
        <div className="w-full max-w-6xl grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-8 md:gap-16">
          {/* Left brand/copy */}
          <section className="relative flex items-center md:justify-end md:pr-[14px]">
            <div className="w-full md:max-w-[347px] text-left">
              {/* Advantage beta logo */}
              <Image
                src="/logos/logo2.svg"
                alt="Advantage Beta"
                width={347}
                height={29}
                priority
                className="h-auto max-w-[280px] md:h-14 md:max-w-full"
              />

              <div className="gap-4 md:gap-16">
                <h2 className="mt-6 md:mt-4 text-lg md:text-xl font-medium">
                  Elevate Your Game
                </h2>
                <p className="mt-2 md:mt-4 text-sm md:text-base">
                  We&apos;re still fine tuning Advantage and would love your
                  feedback.
                </p>
                <p className="mt-2 md:mt-4 text-sm md:text-base">
                  Join our Beta to help us shape the best platform for players.
                </p>
              </div>
            </div>
          </section>

          {/* Spacer */}
          <div className="hidden md:block h-[320px] w-px bg-transparent" />

          {/* Right waitlist form */}
          <section className="relative flex items-center md:justify-start md:pl-[14px]">
            <form
              onSubmit={onSubmit}
              className="w-full max-w-[440px] space-y-5 md:space-y-8"
            >
              {/* Email */}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  className="h-10"
                />
                <p className="text-xs text-muted-foreground">
                  Enter your email address
                </p>
              </div>

              {/* Name */}
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
                  className="h-10"
                />
                <p className="text-xs text-muted-foreground">
                  Enter your full name
                </p>
              </div>

              {/* Consent */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="consent"
                  checked={agree}
                  onCheckedChange={(v: boolean) => setAgree(v)}
                  className="mt-0.5"
                />

                <p className="text-xs font-normal text-muted-foreground">
                  <span className="inline-flex flex-wrap items-baseline gap-0 align-baseline">
                    <span>By joining, you agree to our</span>
                    <Link
                      href="/legal/terms-and-conditions"
                      className="mx-[4px] inline-block font-medium underline underline-offset-2 text-foreground"
                    >
                      Terms
                    </Link>
                    <span>and</span>
                    <Link
                      href="/legal/privacy-policy"
                      className="mx-[4px] inline-block font-medium underline underline-offset-2 text-foreground"
                    >
                      Privacy Policy
                    </Link>
                    <span>.</span>
                  </span>
                </p>
              </div>

              {/* Error message */}
              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                  {error}
                </div>
              )}

              {/* Submit button */}
              <Button
                type="submit"
                disabled={!agree || joined || loading}
                className={
                  joined
                    ? "w-full h-10 bg-muted text-muted-foreground hover:bg-muted disabled:opacity-100"
                    : "w-full h-10 bg-black text-white hover:bg-black/90"
                }
              >
                {loading
                  ? "Joining..."
                  : joined
                    ? "You've joined the waitlist."
                    : "Join the waitlist"}
              </Button>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}
