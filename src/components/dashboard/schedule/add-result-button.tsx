"use client";

import { useState } from "react";
import { AddResultDialog } from "@/components/dashboard/schedule/add-result-dialog";
import { advButton } from "@/lib/ui/adv-button";
import type { EventEntry } from "@/lib/schedule/types";

/**
 * The tournament page's "Add result" primary, and the one piece of it that has
 * to be a client component.
 *
 * A sibling file rather than a `"use client"` at the top of
 * `tournament-detail.tsx`: that directive applies to the whole module, so
 * putting it there would ship the entire page — the table, the rail, both
 * widgets — to the browser to hold one boolean. This island holds the boolean;
 * everything else on that page stays server-rendered.
 *
 * `AddResultDialog` owns the form and the write. Nothing here touches the
 * database, and nothing here decides what a round is.
 */
export function AddResultButton({ entries }: { entries: EventEntry[] }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={advButton("primary", "md")}
      >
        Add result
      </button>
      <AddResultDialog entries={entries} open={open} onOpenChange={setOpen} />
    </>
  );
}
