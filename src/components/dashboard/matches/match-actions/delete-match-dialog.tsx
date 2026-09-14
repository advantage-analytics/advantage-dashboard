"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { ConfirmDialog, ConfirmList } from "@/components/ui/confirm-dialog";

interface DeleteMatchDialogProps {
  matchId: string;
  matchLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}

export function DeleteMatchDialog({
  matchId,
  matchLabel,
  open,
  onOpenChange,
  onDeleted,
}: DeleteMatchDialogProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/matches/${matchId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Failed to delete match");
      }
      onOpenChange(false);
      if (onDeleted) {
        onDeleted();
      } else if (pathname?.startsWith(`/dashboard/matches/${matchId}`)) {
        router.replace("/dashboard/matches");
      } else {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete match");
      setLoading(false);
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Delete this match?"
      description={
        <>
          Removes{" "}
          <span className="font-medium text-[var(--ink-900)]">
            {matchLabel}
          </span>{" "}
          for good. This can&apos;t be undone.
        </>
      }
      tone="danger"
      confirmLabel="Delete match"
      pendingLabel="Deleting…"
      pending={loading}
      error={error}
      onConfirm={() => void handleDelete()}
      // Opened from inside clickable match rows and cards, which must not
      // treat a click in the dialog as a click on the row.
      onContentClick={(event) => event.stopPropagation()}
    >
      <ConfirmList
        items={[
          "Its statistics",
          "Every recorded point and shot",
          "The uploaded file",
        ]}
      />
    </ConfirmDialog>
  );
}
