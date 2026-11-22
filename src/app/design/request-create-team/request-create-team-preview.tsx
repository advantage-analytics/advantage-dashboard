"use client";

import { RequestDrawer } from "@/components/admin/request-drawer";
import type { AdminRequestRow } from "@/lib/data/admin-requests-server";

/** The HZCU request as it landed on 2026-11-21, with a stand-in address. */
export const OPEN: AdminRequestRow = {
  id: "preview-open",
  source: "request",
  date: "2026-11-21T10:18:14Z",
  team: "HZCU Men's",
  crestUrl: null,
  for: "Unlisted program",
  from: { name: "coach@example.edu", email: "coach@example.edu" },
  emailCheck: "none",
  status: "open",
  detail: {
    source: "request",
    requestId: "preview-open",
    kind: "unlisted_program",
    programId: null,
    schoolName: "HZCU",
    team: "mens",
    division: null,
    state: null,
    staffPageUrl: null,
    note: null,
    role: null,
    roleLabel: null,
    match: null,
  },
};

/** After Create team: closed, and pointed at the program it became. */
const ADDED: AdminRequestRow = {
  ...OPEN,
  id: "preview-added",
  status: "resolved",
  detail: { ...OPEN.detail, requestId: "preview-added", programId: "p" },
} as AdminRequestRow;

/** After ⋯ › Close without adding — what happened to the real one. */
const CLOSED: AdminRequestRow = {
  ...OPEN,
  id: "preview-closed",
  status: "resolved",
  detail: { ...OPEN.detail, requestId: "preview-closed" },
} as AdminRequestRow;

const STATES: { row: AdminRequestRow; caption: string }[] = [
  {
    row: OPEN,
    caption:
      "Open — Create team is the primary and opens the dialog filled in from the request. ⋯ holds Close without adding.",
  },
  { row: ADDED, caption: "After Create team — closed and linked to the team." },
  {
    row: CLOSED,
    caption: "After Close without adding — says plainly nothing was added.",
  },
];

const noop = () => {};

export function RequestCreateTeamPreview() {
  return (
    <main className="min-h-screen bg-[var(--surface-page)] p-8">
      <h1 className="text-[16px] font-medium text-[var(--ink-900)]">
        Unlisted-program request → Create team
      </h1>
      <p className="mt-1 max-w-[640px] text-[12px] leading-[1.55] text-[var(--ink-600)]">
        The shipped request drawer on fixture rows. Press Create team on the
        first to see the dialog it opens.
      </p>
      <div className="mt-6 flex flex-wrap items-start gap-6">
        {STATES.map(({ row, caption }) => (
          <figure key={row.id} className="m-0 flex w-[340px] flex-col gap-2">
            <div className="flex h-[560px] overflow-hidden rounded-[10px] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)] [&>aside]:!static [&>aside]:!h-full">
              <RequestDrawer
                row={row}
                index={0}
                total={1}
                canPrev={false}
                canNext={false}
                closing={false}
                autoFocus={false}
                onPrev={noop}
                onNext={noop}
                onClose={noop}
                onClosed={noop}
                onChanged={noop}
              />
            </div>
            <figcaption className="text-[11px] leading-[1.5] text-[var(--ink-600)]">
              {caption}
            </figcaption>
          </figure>
        ))}
      </div>
    </main>
  );
}
