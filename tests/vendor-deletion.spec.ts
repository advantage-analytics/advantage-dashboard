import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { EmailMessage } from "@/lib/services/email";
import {
  sweepVendorDeletionRequests,
  vendorDeletionRecipients,
} from "@/lib/services/splitstep/vendor-deletion";

test("deletion requests go to the alerts inbox until SplitStep's address is set", () => {
  expect(vendorDeletionRecipients(null, "alerts@x.com")).toEqual({
    to: "alerts@x.com",
  });
  expect(vendorDeletionRecipients("del@vendor.com", "alerts@x.com")).toEqual({
    to: "del@vendor.com",
    cc: ["alerts@x.com"],
  });
});

function fakeAdmin(rows: unknown[], stamped: string[][]) {
  const read = {
    select: () => read,
    is: () => read,
    eq: () => read,
    order: () => read,
    limit: async () => ({ data: rows, error: null }),
  };
  return {
    from: () => ({
      ...read,
      update: () => ({
        in: async (_col: string, ids: string[]) => {
          stamped.push(ids);
          return { error: null };
        },
      }),
    }),
  } as unknown as SupabaseClient;
}

const deps = (sent: EmailMessage[], ok = true) => ({
  send: async (m: EmailMessage) => {
    sent.push(m);
    return ok
      ? ({ ok: true, id: "x" } as const)
      : ({ ok: false, error: "boom" } as const);
  },
  vendorAddress: "del@vendor.com",
  internalAddress: "alerts@x.com",
  now: () => new Date("2026-11-07T15:00:00Z"),
});

test("pending requests are mailed in one email and stamped sent", async () => {
  const sent: EmailMessage[] = [];
  const stamped: string[][] = [];
  const result = await sweepVendorDeletionRequests(
    fakeAdmin(
      [
        { id: "a", vendor_match_id: "m1", vendor_job_id: "j1" },
        { id: "b", vendor_match_id: "m2", vendor_job_id: "j2" },
      ],
      stamped,
    ),
    deps(sent),
  );
  expect(result).toEqual({ pending: 2, sent: 2, outcome: "sent" });
  expect(sent).toHaveLength(1);
  expect(sent[0].to).toBe("del@vendor.com");
  expect(sent[0].text).toContain("m1");
  expect(sent[0].text).toContain("j2");
  expect(stamped).toEqual([["a", "b"]]);
});

test("a failed send stamps nothing, so the next run asks again", async () => {
  const stamped: string[][] = [];
  const result = await sweepVendorDeletionRequests(
    fakeAdmin(
      [{ id: "a", vendor_match_id: "m1", vendor_job_id: "j1" }],
      stamped,
    ),
    deps([], false),
  );
  expect(result.outcome).toBe("send_failed");
  expect(stamped).toEqual([]);
});

test("nothing pending sends nothing", async () => {
  const sent: EmailMessage[] = [];
  const result = await sweepVendorDeletionRequests(
    fakeAdmin([], []),
    deps(sent),
  );
  expect(result.outcome).toBe("nothing_pending");
  expect(sent).toHaveLength(0);
});

test("a same-day batch with more rows gets a different idempotency key", async () => {
  const { vendorDeletionEmail } = await import("@/lib/services/email");
  const one = vendorDeletionEmail({
    to: "a@x.com",
    day: "2026-11-07",
    requests: [{ vendorMatchId: "m1", vendorJobId: "j1" }],
  });
  const two = vendorDeletionEmail({
    to: "a@x.com",
    day: "2026-11-07",
    requests: [
      { vendorMatchId: "m1", vendorJobId: "j1" },
      { vendorMatchId: "m2", vendorJobId: "j2" },
    ],
  });
  expect(one.idempotencyKey).not.toBe(two.idempotencyKey);
});
