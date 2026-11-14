import { expect, test } from "@playwright/test";

import {
  CLAIM_HOLDING,
  CLAIM_LABELLER_REQUIRED,
  CLAIM_NOT_LABELLER,
  CLAIM_NOT_NEXT,
  CLAIM_TAKEN,
  claimLabelMatch,
  type ClaimDependencies,
  type ClaimQueueEntry,
} from "@/lib/services/labels/claim-session";
import type { AdminClient } from "@/lib/supabase/admin";

/**
 * A labeller's self-claim over fake dependencies (claim-session.ts): who may
 * claim, which jobs, when a session is seeded, and what each answer of
 * `claim_label_session` becomes. Nothing here reaches a database.
 */

const VIEWER_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_ID = "44444444-4444-4444-8444-444444444444";
const job = (n: number) => `0000000${n}-0000-4000-8000-000000000000`;
const session = (n: number) => `1111111${n}-1111-4111-8111-111111111111`;

/** Four waiting jobs, earliest due first, none with a session. */
const fourWaiting = (): ClaimQueueEntry[] =>
  [1, 2, 3, 4].map((n) => ({ id: job(n), session: null }));

function harness(options: {
  viewer?: { id: string } | null;
  entries?: ClaimQueueEntry[];
  holding?: boolean;
  seeded?: Awaited<ReturnType<ClaimDependencies["seed"]>>;
  rpc?: { data: unknown; error: { message: string } | null };
}) {
  const seeds: { jobId: string; labellerId: string }[] = [];
  const rpcs: { fn: string; args: Record<string, unknown> }[] = [];
  const holdingAsked: string[] = [];
  const db = {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcs.push({ fn, args });
      return options.rpc ?? { data: "claimed", error: null };
    },
  } as unknown as AdminClient;
  const deps: ClaimDependencies = {
    requireLabeller: async () =>
      options.viewer === undefined ? { id: VIEWER_ID } : options.viewer,
    createAdminClient: () => db,
    readQueue: async () => options.entries ?? fourWaiting(),
    readHolding: async (_db, userId) => {
      holdingAsked.push(userId);
      return options.holding ?? false;
    },
    seed: async ({ supabase, jobId, labellerId }) => {
      expect(supabase).toBe(db);
      seeds.push({ jobId, labellerId });
      return options.seeded ?? { sessionId: session(9), existing: false };
    },
  };
  return { deps, seeds, rpcs, holdingAsked };
}

test.describe("claimLabelMatch", () => {
  test("a caller who is not a labeller is refused before anything is read", async () => {
    const h = harness({ viewer: null });
    expect(await claimLabelMatch(job(1), h.deps)).toEqual({
      error: CLAIM_LABELLER_REQUIRED,
    });
    expect(h.holdingAsked).toEqual([]);
    expect(h.seeds).toEqual([]);
    expect(h.rpcs).toEqual([]);
  });

  test("a bad job id is refused before any seed", async () => {
    const h = harness({});
    expect(await claimLabelMatch("nope", h.deps)).toEqual({
      error: "Invalid job id.",
    });
    expect(h.seeds).toEqual([]);
    expect(h.rpcs).toEqual([]);
  });

  test("a holding viewer is refused before any seed", async () => {
    const h = harness({ holding: true });
    expect(await claimLabelMatch(job(1), h.deps)).toEqual({
      error: CLAIM_HOLDING,
    });
    expect(h.holdingAsked).toEqual([VIEWER_ID]);
    expect(h.seeds).toEqual([]);
    expect(h.rpcs).toEqual([]);
  });

  test("a fourth-due job is refused before any seed", async () => {
    const h = harness({});
    expect(await claimLabelMatch(job(4), h.deps)).toEqual({
      error: CLAIM_NOT_NEXT,
    });
    expect(h.seeds).toEqual([]);
    expect(h.rpcs).toEqual([]);
  });

  test("a job that is not in the queue is refused before any seed", async () => {
    const h = harness({});
    expect(await claimLabelMatch(job(7), h.deps)).toEqual({
      error: CLAIM_NOT_NEXT,
    });
    expect(h.seeds).toEqual([]);
    expect(h.rpcs).toEqual([]);
  });

  test("a job somebody else holds is refused before any seed", async () => {
    const entries = fourWaiting();
    entries[0].session = {
      id: session(1),
      status: "labelling",
      assignedTo: OTHER_ID,
    };
    const h = harness({ entries });
    expect(await claimLabelMatch(job(1), h.deps)).toEqual({
      error: CLAIM_NOT_NEXT,
    });
    expect(h.seeds).toEqual([]);
    expect(h.rpcs).toEqual([]);
  });

  test("a job with no session is seeded as the viewer, then claimed with the viewer's id", async () => {
    const h = harness({});
    // The id is lowercased before it is looked up or seeded.
    expect(await claimLabelMatch(job(2).toUpperCase(), h.deps)).toEqual({
      sessionId: session(9),
    });
    expect(h.seeds).toEqual([{ jobId: job(2), labellerId: VIEWER_ID }]);
    expect(h.rpcs).toEqual([
      {
        fn: "claim_label_session",
        args: { p_session_id: session(9), p_user_id: VIEWER_ID },
      },
    ]);
  });

  test("an existing unassigned session is claimed without a seed call", async () => {
    const entries = fourWaiting();
    entries[1].session = {
      id: session(2),
      status: "labelling",
      assignedTo: null,
    };
    const h = harness({ entries });
    expect(await claimLabelMatch(job(2), h.deps)).toEqual({
      sessionId: session(2),
    });
    expect(h.seeds).toEqual([]);
    expect(h.rpcs).toEqual([
      {
        fn: "claim_label_session",
        args: { p_session_id: session(2), p_user_id: VIEWER_ID },
      },
    ]);
  });

  test("a 'taken' answer yields its sentence and no sessionId", async () => {
    const h = harness({ rpc: { data: "taken", error: null } });
    const result = await claimLabelMatch(job(1), h.deps);
    expect(result).toEqual({ error: CLAIM_TAKEN });
    expect("sessionId" in result).toBe(false);
    expect(h.rpcs).toHaveLength(1);
  });

  test("'holding' and 'not_labeller' each yield their own sentence", async () => {
    const holding = harness({ rpc: { data: "holding", error: null } });
    expect(await claimLabelMatch(job(1), holding.deps)).toEqual({
      error: CLAIM_HOLDING,
    });
    const demoted = harness({ rpc: { data: "not_labeller", error: null } });
    expect(await claimLabelMatch(job(1), demoted.deps)).toEqual({
      error: CLAIM_NOT_LABELLER,
    });
    expect(
      new Set([CLAIM_HOLDING, CLAIM_TAKEN, CLAIM_NOT_LABELLER, CLAIM_NOT_NEXT])
        .size,
    ).toBe(4);
  });

  test("a failed seed is answered as it is, with no claim", async () => {
    const h = harness({
      seeded: { error: "Job has no readable results file." },
    });
    expect(await claimLabelMatch(job(1), h.deps)).toEqual({
      error: "Job has no readable results file.",
    });
    expect(h.rpcs).toEqual([]);
  });

  test("an RPC error or an unknown answer never yields a sessionId", async () => {
    const failed = harness({ rpc: { data: null, error: { message: "boom" } } });
    expect(await claimLabelMatch(job(1), failed.deps)).toEqual({
      error: "Could not claim the match: boom",
    });
    const odd = harness({ rpc: { data: "something", error: null } });
    expect(await claimLabelMatch(job(1), odd.deps)).toEqual({
      error: "Could not claim the match.",
    });
  });

  test("a viewer holding this very match is still refused, with no seed or claim", async () => {
    const entries = fourWaiting();
    entries[0].session = {
      id: session(1),
      status: "labelling",
      assignedTo: VIEWER_ID,
    };
    // Holding is true exactly because of this session.
    const h = harness({ entries, holding: true });
    expect(await claimLabelMatch(job(1), h.deps)).toEqual({
      error: CLAIM_HOLDING,
    });
    expect(h.seeds).toEqual([]);
    expect(h.rpcs).toEqual([]);
  });

  test("a thrown read is answered as a sentence", async () => {
    const h = harness({});
    h.deps.readQueue = async () => {
      throw new Error("Could not read matches: down");
    };
    expect(await claimLabelMatch(job(1), h.deps)).toEqual({
      error: "Could not claim the match: Could not read matches: down",
    });
    expect(h.seeds).toEqual([]);
  });
});
