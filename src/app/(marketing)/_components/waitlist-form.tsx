"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export function WaitlistForm() {
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
    <form onSubmit={onSubmit} className="w-full space-y-5">
      {/* Email */}
      <div className="space-y-2">
        <Label htmlFor="email" className="text-[#1D1D1F]">
          Email
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
          className="h-11 border-gray-200 focus:border-[#007AFF] focus:ring-[#007AFF]/20"
        />
      </div>

      {/* Name */}
      <div className="space-y-2">
        <Label htmlFor="name" className="text-[#1D1D1F]">
          Name
        </Label>
        <Input
          id="name"
          type="text"
          placeholder="Enter your name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
          required
          className="h-11 border-gray-200 focus:border-[#007AFF] focus:ring-[#007AFF]/20"
        />
      </div>

      {/* Consent */}
      <div className="flex items-start gap-3">
        <Checkbox
          id="consent"
          checked={agree}
          onCheckedChange={(v: boolean) => setAgree(v)}
          className="mt-0.5"
        />
        <label
          htmlFor="consent"
          className="text-xs text-[#86868B] leading-relaxed"
        >
          By joining, you agree to our{" "}
          <Link
            href="/legal/terms-and-conditions"
            className="text-[#1D1D1F] underline underline-offset-2"
          >
            Terms
          </Link>{" "}
          and{" "}
          <Link
            href="/legal/privacy-policy"
            className="text-[#1D1D1F] underline underline-offset-2"
          >
            Privacy Policy
          </Link>
          .
        </label>
      </div>

      {/* Error message */}
      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
          {error}
        </div>
      )}

      {/* Submit button */}
      <Button
        type="submit"
        disabled={!agree || joined || loading}
        className={
          joined
            ? "w-full h-11 bg-gray-100 text-gray-500 hover:bg-gray-100 cursor-default"
            : "w-full h-11 bg-[#007AFF] hover:bg-[#0066DD] text-white transition-all hover:scale-[1.02] hover:shadow-lg hover:shadow-blue-500/20"
        }
      >
        {loading
          ? "Joining..."
          : joined
            ? "You've joined the waitlist!"
            : "Join the Waitlist"}
      </Button>
    </form>
  );
}
