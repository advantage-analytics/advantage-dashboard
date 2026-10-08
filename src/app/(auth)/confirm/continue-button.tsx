"use client";

import { useFormStatus } from "react-dom";
import AuthButton from "@/components/auth/auth-button";

/**
 * The one button on `/confirm`, disabled while its form's POST is in flight.
 *
 * A double-tap otherwise sends two POSTs. The first spends the token and
 * signs the person in; the second finds it spent, and its redirect to
 * "That link has expired" is the navigation the browser keeps — the exact
 * screen the page exists to prevent, shown to someone who is in fact signed
 * in. `useFormStatus` needs a client boundary, which is the only reason this
 * is not inline in the page. With JavaScript off the form still posts; only
 * the double-submit guard is lost.
 */
export function ContinueButton() {
  const { pending } = useFormStatus();
  return (
    <AuthButton type="submit" disabled={pending}>
      {pending ? "Signing in..." : "Continue"}
    </AuthButton>
  );
}
