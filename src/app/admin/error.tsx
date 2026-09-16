"use client";

import { useEffect } from "react";
import { AlertCircle } from "lucide-react";

import { AdminPage } from "@/components/admin/admin-page";
import { advButton } from "@/lib/ui/adv-button";

/**
 * The admin area's error boundary.
 *
 * It sits beside `admin/layout.tsx`, so it wraps each page but not the layout:
 * the header stays and this fills the page column. The loaders beneath throw
 * on a failed read (see `listAdminConferences`) precisely so the page lands
 * here — the alternative is an empty table that reads as "there are none".
 *
 * `retry`, not `reset`: the failure is in a Server Component's fetch, and only
 * `retry()` re-fetches the segment. `reset()` re-renders the same failed
 * payload.
 */
export default function AdminError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[admin] page error", error);
  }, [error]);

  return (
    <AdminPage>
      <div
        role="alert"
        className="flex flex-col items-center justify-center px-6 py-24 text-center"
      >
        <AlertCircle
          className="size-6 text-[var(--ink-400)]"
          strokeWidth={1.5}
          aria-hidden
        />
        <h1 className="text-title-lg mt-4">This page couldn&apos;t load</h1>
        <p className="mt-1.5 max-w-[360px] text-[12px] text-[var(--ink-500)]">
          Something went wrong reading the data behind it. Try again — if it
          keeps happening, share the error ID below.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className={`mt-6 ${advButton("primary")}`}
        >
          Try again
        </button>
        {error.digest ? (
          <p className="mt-4 text-[11px] text-[var(--ink-400)] tabular-nums">
            Error ID {error.digest}
          </p>
        ) : null}
      </div>
    </AdminPage>
  );
}
