"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";


export default function InputDemo() {
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
      const { data, error } = await supabase
        .from('waitlists')
        .insert([
          {
            email: email,
            name: name
          }
        ]);

      if (error) {
        throw error;
      }

      setJoined(true);
    } catch (err) {
      console.error('Error joining waitlist:', err);
      setError(err instanceof Error ? err.message : 'Error: You have already joined the waitlist.');
    } finally {
      setLoading(false);
    }
  }
  
  return (
    <>
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
            <p className="text-sm text-muted-foreground">
              Enter your email address
            </p>
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
            <p className="text-sm text-muted-foreground">
              Enter your full name
            </p>
          </div>

          {/* consent (did some freaky stuff to fix spacing)*/}
          <div className="flex items-start gap-2">
            <Checkbox
              id="consent"
              checked={agree}
              onCheckedChange={(v: boolean) => setAgree(v)}
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

          {/* Error message */}
          {error && (
            <div className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-md p-3">
              {error}
            </div>
          )}

          {/* waitlist button */}
          <Button
            type="submit"
            disabled={!agree || joined || loading}
            className={
              joined
                ? "w-full bg-muted text-muted-foreground hover:bg-muted disabled:opacity-100"
                : "w-full bg-black text-white hover:bg-black/90"
            }
          >
            {loading ? "Joining..." : joined ? "You've joined the waitlist." : "Join the waitlist"}
          </Button>
        </form>
      </section>
    </>
  );
}
