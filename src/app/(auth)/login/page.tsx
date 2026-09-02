"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { safeNext } from "@/lib/auth/safe-next";

/**
 * Reads `?next=` once and clamps it before the form ever sees it.
 *
 * An invite link sends a signed-out user here so they can land back on
 * `/join/<token>` afterwards, so the destination is attacker-controlled and
 * has to go through `safeNext`. Only a path travels — never the invitee's
 * email, which would let anyone with the link learn who was invited.
 */
function LoginContent() {
  const searchParams = useSearchParams();
  const next = safeNext(searchParams.get("next"));

  return <LoginForm next={next} />;
}

export default function Page() {
  // `useSearchParams` opts its subtree into client-side rendering, so it needs
  // a Suspense boundary above it or the build fails on this route.
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}
