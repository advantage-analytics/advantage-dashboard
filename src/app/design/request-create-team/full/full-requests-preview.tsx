"use client";

import { AdminHeader } from "@/components/admin/admin-header";
import { AdminScrollRoot } from "@/components/admin/admin-scroll-root";
import { RequestsPageContent } from "@/components/admin/requests-page-content";
import type { AdminRequestRow } from "@/lib/data/admin-requests-server";
import { OPEN } from "../request-create-team-preview";

/** A second, ordinary row so the queue reads as a queue. */
const INVITE: AdminRequestRow = {
  ...OPEN,
  id: "preview-invite",
  date: "2026-11-20T16:02:00Z",
  team: "Meridian State Women's",
  for: "Invite request",
  from: { name: "Riley Marsh", email: "riley@example.edu" },
  detail: {
    ...OPEN.detail,
    requestId: "preview-invite",
    kind: "invite_request",
    programId: "p",
    schoolName: "Meridian State",
    team: "womens",
    role: "player",
    roleLabel: "Player",
  },
} as AdminRequestRow;

export function FullRequestsPreview() {
  return (
    <AdminScrollRoot className="flex flex-col overflow-x-hidden bg-[var(--surface-card)]">
      <AdminHeader
        nav={{ tabs: {} }}
        viewer={{
          name: "Admin",
          email: "admin@example.com",
          initials: "AD",
          avatarUrl: null,
        }}
      />
      <div className="flex flex-1 shrink-0 items-stretch">
        <RequestsPageContent
          rows={[OPEN, INVITE]}
          view="waiting"
          counts={{ waiting: 2, verifying: 0, live: 0, closed: 0 }}
          freshIds={[OPEN.id]}
          initialSelectedId={OPEN.id}
          emptyTitle="Nothing waiting"
        />
      </div>
    </AdminScrollRoot>
  );
}
