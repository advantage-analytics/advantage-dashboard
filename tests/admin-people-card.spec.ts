import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { AdminTeamInvite } from "@/lib/data/admin-team-server";
import { createLoader } from "./fixtures/vm-modules";

/**
 * Admin › Teams › `#people` — the invitation rows of the People card.
 *
 * An invitation whose link has expired used to keep reading `Invited`, a
 * promise of a seat that is not coming. `expired` is decided by the loader on
 * the server; the card only prints it. Rendered offline through
 * `fixtures/vm-modules` with the router and the server actions stubbed.
 */

type CardProps = {
  programId: string;
  programName: string;
  members: readonly never[];
  invites: readonly AdminTeamInvite[];
  seats: { seats: number; used: number; pending: number };
};

function html(invites: AdminTeamInvite[]): string {
  const loader = createLoader({
    stubs: {
      "next/navigation": { useRouter: () => ({ refresh() {} }) },
      "@/lib/services/programs/admin-team-actions": {
        adminInviteMember: async () => ({ ok: true }),
        adminRevokeInvite: async () => ({ ok: true }),
        adminSetProgramMemberRole: async () => ({ ok: true }),
        adminSetMemberUploadEnabled: async () => ({ ok: true }),
        adminTransferProgramOwnership: async () => ({ ok: true }),
      },
    },
  });
  const { AdminPeopleCard } = loader.load(
    "src/components/admin/admin-people-card.tsx",
  ) as { AdminPeopleCard: React.ComponentType<CardProps> };
  return renderToStaticMarkup(
    React.createElement(AdminPeopleCard, {
      programId: "p1",
      programName: "ZZ Test Program",
      members: [],
      invites,
      seats: { seats: 20, used: 0, pending: invites.length },
    }),
  );
}

function invite(expired: boolean): AdminTeamInvite {
  return {
    id: expired ? "i-old" : "i-live",
    email: expired ? "old@example.com" : "live@example.com",
    role: "player",
    createdAt: "2026-09-01T12:00:00Z",
    invitedBy: null,
    expiresAt: "2026-09-08T12:00:00Z",
    invitedByName: null,
    expired,
  };
}

test.describe("AdminPeopleCard invitation rows", () => {
  test("a live invitation reads Invited and 'expires'", () => {
    const out = html([invite(false)]);
    expect(out).toContain(">Invited<");
    expect(out).not.toContain(">Expired<");
    expect(out).toContain("· expires ");
  });

  test("an expired invitation reads Expired and 'expired'", () => {
    const out = html([invite(true)]);
    expect(out).toContain(">Expired<");
    expect(out).not.toContain(">Invited<");
    expect(out).toContain("· expired ");
  });
});
