import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  planAlignment,
  summarizeSourceTiming,
  type SourcePoint,
  type SourceShot,
} from "@/lib/match-video/alignment";

import {
  ANON_KEY,
  HAVE_ENV,
  INSUFFICIENT_PRIVILEGE,
  SKIP_REASON,
  SUPABASE_URL,
  type Session,
  createAdminClient,
  createLogins,
  deleteAuthUsers,
  runMarker,
} from "./fixtures/live-db";

/**
 * `20260919045208_create_match_video_attachments.sql`, proven against the
 * live database rather than the migration's own claims (T2 of the
 * SwingVision video attachment plan — table and privilege boundary; the
 * reservation RPCs (T3) are the second describe block below, and the
 * activation / alignment RPCs are T4).
 *
 *  1. Privilege boundary: an anonymous client and a signed-in session are
 *     both refused every direct table operation with `42501`. Nothing in a
 *     browser can read a storage key or forge an attachment row.
 *  2. Lifecycle constraints, via the service-role client (the only role that
 *     may touch the table): one pending attempt per match per uploader, one
 *     active attachment per match, one attempt per (uploader, client request
 *     id), a key that looks like a URL or carries a query string is refused,
 *     an active row must carry server-verified metadata, and a retired row
 *     can never come back.
 *  3. Retention: deleting the match nulls `match_id`, deleting the uploader's
 *     auth user succeeds (the FK never pins an account), and in both cases
 *     the row and its blob keys survive for the cleanup worker.
 *
 * Every attachment's filename and the fixture match's tournament name start
 * with the run mark, so no real row is ever touched.
 *
 * Run on demand:  npx playwright test match-video-attachments-db
 */

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const RAISE_EXCEPTION = "P0001";

const TABLE = "match_video_attachments";

/** A crashed run is findable by hand:
 *  `select * from match_video_attachments where filename like 'mva-%'`. */
const { mark: MARK, password: PASSWORD } = runMarker("mva");

type AttachmentRow = Record<string, unknown>;

test.describe("match_video_attachments table + privilege boundary (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient; // service role
  let creator: Session; // owns the fixture match
  let uploader: Session; // reserves attempts; its account is deleted at the end

  const authUserIds: string[] = [];
  let matchId: string;

  /** Rows this run inserted, by id, for the assertions that follow deletion. */
  let pendingByUploader: string;
  let activeRow: string;

  /** A pending row with fresh, unique, non-URL keys; overrides win. */
  const pendingRow = (overrides: AttachmentRow = {}): AttachmentRow => {
    const id = randomUUID();
    return {
      match_id: matchId,
      uploaded_by: uploader.userId,
      state: "pending",
      filename: `${MARK}-${id.slice(0, 8)}.mp4`,
      declared_size_bytes: 1_000_000,
      declared_content_type: "video/mp4",
      staged_blob_key: `${MARK}/staged/${id}.mp4`,
      final_blob_key: `${MARK}/final/${id}.mp4`,
      client_request_id: randomUUID(),
      upload_sas_expires_at: new Date(Date.now() + 6 * 3_600_000).toISOString(),
      ...overrides,
    };
  };

  /** Everything activation (T4) must have filled in before a row goes active. */
  const activeFields = (): AttachmentRow => ({
    state: "active",
    verified_size_bytes: 1_000_000,
    verified_content_type: "video/mp4",
    verified_duration_seconds: 5400.5,
    confirmed_video_time_seconds: 12.345,
    offset_seconds: -12.345,
    activated_at: new Date().toISOString(),
  });

  const insert = (row: AttachmentRow) =>
    admin.from(TABLE).insert(row).select("id").single();

  const readRow = async (id: string) => {
    const result = await admin
      .from(TABLE)
      .select(
        "id, match_id, uploaded_by, state, staged_blob_key, final_blob_key",
      )
      .eq("id", id)
      .single();
    expect(result.error).toBeNull();
    return result.data!;
  };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    admin = createAdminClient();

    [creator, uploader] = await createLogins(admin, ["creator", "uploader"], {
      mark: MARK,
      password: PASSWORD,
      authUserIds,
    });

    // The match belongs to `creator`, never `uploader`: `matches.created_by`
    // has no ON DELETE action, so a match of the uploader's own would be
    // what blocks the account deletion — and this spec is proving that the
    // attachment FK is not what blocks it.
    const match = await admin
      .from("matches")
      .insert({
        created_by: creator.userId,
        player1_id: creator.userId,
        player1_name: "Attachment Creator",
        player2_name: "Attachment Opponent",
        date: new Date().toISOString(),
        tournament_name: `${MARK}-match`,
        source_provider: "swing-vision",
      })
      .select("id")
      .single();
    if (match.error) throw new Error(`match: ${match.error.message}`);
    matchId = match.data.id;
  });

  test.afterAll(async () => {
    if (!admin) return;
    await admin.from(TABLE).delete().like("filename", `${MARK}%`);
    if (matchId) {
      await admin.from("matches").delete().eq("id", matchId);
    }
    await deleteAuthUsers(admin, authUserIds);
  });

  // ── 1. Privilege boundary ─────────────────────────────────────────────────

  test("an anonymous client and a signed-in session are refused every table operation", async () => {
    const anon = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    for (const [label, client] of [
      ["anon", anon],
      ["authenticated", creator.client],
    ] as const) {
      const selected = await client.from(TABLE).select("id").limit(1);
      expect(selected.error?.code, `${label} select`).toBe(
        INSUFFICIENT_PRIVILEGE,
      );

      const inserted = await client.from(TABLE).insert(pendingRow());
      expect(inserted.error?.code, `${label} insert`).toBe(
        INSUFFICIENT_PRIVILEGE,
      );

      const updated = await client
        .from(TABLE)
        .update({ state: "retired", retired_at: new Date().toISOString() })
        .eq("match_id", matchId);
      expect(updated.error?.code, `${label} update`).toBe(
        INSUFFICIENT_PRIVILEGE,
      );

      const deleted = await client.from(TABLE).delete().eq("match_id", matchId);
      expect(deleted.error?.code, `${label} delete`).toBe(
        INSUFFICIENT_PRIVILEGE,
      );
    }

    // Nothing leaked through: the table is still empty for this match.
    const rows = await admin.from(TABLE).select("id").eq("match_id", matchId);
    expect(rows.error).toBeNull();
    expect(rows.data).toEqual([]);
  });

  // ── 2. Lifecycle constraints ──────────────────────────────────────────────

  test("one pending attempt per match per uploader; another uploader may still reserve", async () => {
    const first = await insert(pendingRow());
    expect(first.error).toBeNull();
    pendingByUploader = first.data!.id;

    const second = await insert(pendingRow());
    expect(second.error?.code).toBe(UNIQUE_VIOLATION);

    const byCreator = await insert(pendingRow({ uploaded_by: creator.userId }));
    expect(byCreator.error).toBeNull();
  });

  test("the same uploader cannot reuse a client request id, even for a different match", async () => {
    const requestId = randomUUID();
    const original = await insert(
      pendingRow({ match_id: null, client_request_id: requestId }),
    );
    expect(original.error).toBeNull();

    const replay = await insert(
      pendingRow({ match_id: null, client_request_id: requestId }),
    );
    expect(replay.error?.code).toBe(UNIQUE_VIOLATION);
  });

  test("at most one active attachment per match", async () => {
    const first = await insert(
      pendingRow({ uploaded_by: creator.userId, ...activeFields() }),
    );
    expect(first.error).toBeNull();
    activeRow = first.data!.id;

    const second = await insert(
      pendingRow({ uploaded_by: creator.userId, ...activeFields() }),
    );
    expect(second.error?.code).toBe(UNIQUE_VIOLATION);
  });

  test("a bearer URL, a query string, an unknown state and an unverified active row are all refused", async () => {
    const cases: [string, AttachmentRow][] = [
      [
        "https:// key",
        pendingRow({
          uploaded_by: null,
          staged_blob_key: `https://example.blob.core.windows.net/${MARK}/x.mp4`,
        }),
      ],
      [
        "query string",
        pendingRow({
          uploaded_by: null,
          final_blob_key: `${MARK}/final/x.mp4?sv=2024&sig=secret`,
        }),
      ],
      ["unknown state", pendingRow({ uploaded_by: null, state: "published" })],
      [
        "active without verification",
        pendingRow({ uploaded_by: null, match_id: null, state: "active" }),
      ],
      [
        "expected id without version",
        pendingRow({ uploaded_by: null, expected_active_id: randomUUID() }),
      ],
      [
        "over the byte cap",
        pendingRow({ uploaded_by: null, declared_size_bytes: 8_000_000_000 }),
      ],
    ];

    for (const [label, row] of cases) {
      const result = await insert(row);
      expect(result.error?.code, label).toBe(CHECK_VIOLATION);
    }
  });

  test("a retired row never comes back, an active row never returns to pending, and keys are immutable", async () => {
    const retire = await admin
      .from(TABLE)
      .update({ state: "retired", retired_at: new Date().toISOString() })
      .eq("id", pendingByUploader);
    expect(retire.error).toBeNull();

    for (const state of ["pending", "active"]) {
      const revive = await admin
        .from(TABLE)
        .update({ state, retired_at: null })
        .eq("id", pendingByUploader);
      expect(revive.error?.code, `retired → ${state}`).toBe(RAISE_EXCEPTION);
    }

    const demote = await admin
      .from(TABLE)
      .update({ state: "pending" })
      .eq("id", activeRow);
    expect(demote.error?.code, "active → pending").toBe(RAISE_EXCEPTION);

    const swapKey = await admin
      .from(TABLE)
      .update({ final_blob_key: `${MARK}/final/swapped.mp4` })
      .eq("id", activeRow);
    expect(swapKey.error?.code, "key swap").toBe(RAISE_EXCEPTION);

    expect(await readRow(pendingByUploader)).toMatchObject({
      state: "retired",
    });
  });

  // ── 3. Retention across FK nulling ────────────────────────────────────────

  test("deleting the match nulls match_id and keeps every row and its keys", async () => {
    const before = await readRow(activeRow);
    const beforeRetired = await readRow(pendingByUploader);

    const gone = await admin.from("matches").delete().eq("id", matchId);
    expect(gone.error).toBeNull();

    const after = await readRow(activeRow);
    expect(after).toEqual({ ...before, match_id: null });

    const afterRetired = await readRow(pendingByUploader);
    expect(afterRetired).toEqual({ ...beforeRetired, match_id: null });

    matchId = "";
  });

  test("deleting the uploader's account succeeds and the row keeps its keys", async () => {
    const before = await readRow(pendingByUploader);
    expect(before.uploaded_by).toBe(uploader.userId);

    // Straight through the admin API, so a refusal is an assertion failure
    // rather than something the fixture's cleanup would swallow.
    const removed = await admin.auth.admin.deleteUser(uploader.userId);
    expect(removed.error).toBeNull();
    authUserIds.splice(authUserIds.indexOf(uploader.userId), 1);

    const after = await readRow(pendingByUploader);
    expect(after).toEqual({ ...before, uploaded_by: null });
  });
});

/**
 * `20260919050413_match_video_attachment_reservations.sql` (T3) — the
 * reservation, renewal and cancellation RPCs, proven against the live
 * database with throwaway users, matches and a throwaway program.
 *
 *  1. Privilege boundary: anon and authenticated sessions cannot execute any
 *     of the four functions (`42501`), whatever arguments they send.
 *  2. Authorization inside SQL: creator, SwingVision provenance, the exact
 *     workspace (personal = the creator's own; team = that program plus a
 *     current membership row), and an unknown match — each refused with the
 *     `MatchVideoErrorCode` as the message, and nothing inserted.
 *  3. Reservation: server-minted keys, expected-active identity/version and
 *     the client request id are stored with the SAS expiry; an identical
 *     retry is the same attempt, changed metadata under the same request id
 *     conflicts, and other pending work conflicts.
 *  4. Renewal and cancellation: renewal records the later expiry only for
 *     the uploader's own pending attempt outside a finalization lease;
 *     cancellation retires idempotently and never retires an active asset;
 *     retired work can neither renew nor return to pending.
 *  5. Optimistic concurrency and races: a stale belief about the active
 *     attachment is refused; concurrent identical retries converge on one
 *     row and concurrent distinct reservations leave exactly one pending.
 */

const RPC_NOT_FOUND = "P0002";
const RPC_STATE_CONFLICT = "55000";

type RpcResult = {
  data: unknown;
  error: {
    code: string;
    message: string;
    details: string | null;
  } | null;
};

const firstRow = (result: RpcResult) => {
  expect(result.error).toBeNull();
  const rows = result.data as Record<string, unknown>[];
  expect(rows).toHaveLength(1);
  return rows[0];
};

const expectRefused = (
  result: RpcResult,
  code: string,
  message: string,
  details: string,
  label = message,
) => {
  expect(result.error?.code, `${label} code`).toBe(code);
  expect(result.error?.message, `${label} message`).toBe(message);
  expect(result.error?.details, `${label} detail`).toBe(details);
};

const { mark: RPC_MARK, password: RPC_PASSWORD } = runMarker("mvr");

test.describe("match_video_attachments reservation RPCs (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient;
  let owner: Session; // creates the personal matches
  let member: Session; // creates the team match and belongs to the program
  let outsider: Session; // signed in, owns nothing here

  const authUserIds: string[] = [];
  let programId: string;
  let personalMatch: string;
  let teamMatch: string;
  let raceMatch: string;
  let vendorMatch: string; // not a SwingVision import

  const hoursFromNow = (hours: number) =>
    new Date(Date.now() + hours * 3_600_000).toISOString();

  /** The full argument set for a reserve; overrides win. */
  const reserveArgs = (overrides: Record<string, unknown> = {}) => ({
    p_actor_id: owner.userId,
    p_workspace_kind: "personal",
    p_workspace_id: owner.userId,
    p_match_id: personalMatch,
    p_filename: `${RPC_MARK}-a.mp4`,
    p_declared_size_bytes: 2_000_000,
    p_declared_content_type: "video/mp4",
    p_client_request_id: randomUUID(),
    p_expected_active_id: null,
    p_expected_active_version: null,
    p_upload_sas_expires_at: hoursFromNow(6),
    ...overrides,
  });

  const reserve = (overrides: Record<string, unknown> = {}) =>
    admin.rpc(
      "match_video_reserve_upload",
      reserveArgs(overrides),
    ) as unknown as Promise<RpcResult>;

  const renew = (
    actor: Session,
    attachmentId: string,
    expiresAt: string,
    overrides: Record<string, unknown> = {},
  ) =>
    admin.rpc("match_video_renew_upload", {
      p_actor_id: actor.userId,
      p_workspace_kind: "personal",
      p_workspace_id: actor.userId,
      p_match_id: personalMatch,
      p_attachment_id: attachmentId,
      p_upload_sas_expires_at: expiresAt,
      ...overrides,
    }) as unknown as Promise<RpcResult>;

  const cancel = (
    actor: Session,
    attachmentId: string,
    overrides: Record<string, unknown> = {},
  ) =>
    admin.rpc("match_video_cancel_upload", {
      p_actor_id: actor.userId,
      p_workspace_kind: "personal",
      p_workspace_id: actor.userId,
      p_match_id: personalMatch,
      p_attachment_id: attachmentId,
      ...overrides,
    }) as unknown as Promise<RpcResult>;

  const rowsFor = async (matchId: string) => {
    const result = await admin
      .from(TABLE)
      .select(
        "id, state, uploaded_by, client_request_id, expected_active_id, expected_active_version, staged_blob_key, final_blob_key, upload_sas_expires_at, retired_at, cleanup_next_attempt_at, finalize_lease_until",
      )
      .eq("match_id", matchId)
      .order("created_at");
    expect(result.error).toBeNull();
    return result.data!;
  };

  const insertMatch = async (
    createdBy: string,
    extra: Record<string, unknown> = {},
  ) => {
    const match = await admin
      .from("matches")
      .insert({
        created_by: createdBy,
        player1_id: createdBy,
        player1_name: "Reservation Player",
        player2_name: "Reservation Opponent",
        date: new Date().toISOString(),
        tournament_name: `${RPC_MARK}-match`,
        source_provider: "swing-vision",
        ...extra,
      })
      .select("id")
      .single();
    if (match.error) throw new Error(`match: ${match.error.message}`);
    return match.data.id as string;
  };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    admin = createAdminClient();

    [owner, member, outsider] = await createLogins(
      admin,
      ["owner", "member", "outsider"],
      { mark: RPC_MARK, password: RPC_PASSWORD, authUserIds },
    );

    const program = await admin
      .from("programs")
      .insert({
        org_type: "club",
        school_name: `${RPC_MARK} Club`,
        status: "active",
        owner_user_id: member.userId,
      })
      .select("id")
      .single();
    if (program.error) throw new Error(`program: ${program.error.message}`);
    programId = program.data.id;

    const membership = await admin.from("program_members").insert({
      program_id: programId,
      user_id: member.userId,
      role: "owner",
    });
    if (membership.error) {
      throw new Error(`membership: ${membership.error.message}`);
    }

    personalMatch = await insertMatch(owner.userId);
    raceMatch = await insertMatch(owner.userId);
    vendorMatch = await insertMatch(owner.userId, {
      source_provider: "splitstep",
    });
    teamMatch = await insertMatch(member.userId, { program_id: programId });
  });

  test.afterAll(async () => {
    if (!admin) return;
    await admin.from(TABLE).delete().like("filename", `${RPC_MARK}%`);
    await admin
      .from("matches")
      .delete()
      .like("tournament_name", `${RPC_MARK}%`);
    if (programId) {
      await admin.from("program_members").delete().eq("program_id", programId);
      await admin.from("programs").delete().eq("id", programId);
    }
    await deleteAuthUsers(admin, authUserIds);
  });

  // ── 1. Privilege boundary ─────────────────────────────────────────────────

  test("anon and authenticated sessions cannot execute any reservation RPC", async () => {
    const anon = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const calls: [string, Record<string, unknown>][] = [
      [
        "match_video_authorize_match",
        {
          p_actor_id: owner.userId,
          p_workspace_kind: "personal",
          p_workspace_id: owner.userId,
          p_match_id: personalMatch,
        },
      ],
      ["match_video_reserve_upload", reserveArgs()],
      [
        "match_video_renew_upload",
        {
          p_actor_id: owner.userId,
          p_workspace_kind: "personal",
          p_workspace_id: owner.userId,
          p_match_id: personalMatch,
          p_attachment_id: randomUUID(),
          p_upload_sas_expires_at: hoursFromNow(1),
        },
      ],
      [
        "match_video_cancel_upload",
        {
          p_actor_id: owner.userId,
          p_workspace_kind: "personal",
          p_workspace_id: owner.userId,
          p_match_id: personalMatch,
          p_attachment_id: randomUUID(),
        },
      ],
    ];

    for (const [label, client] of [
      ["anon", anon],
      ["authenticated (owner)", owner.client],
      ["authenticated (outsider)", outsider.client],
    ] as const) {
      for (const [fn, args] of calls) {
        const result = (await client.rpc(fn, args)) as unknown as RpcResult;
        expect(result.error?.code, `${label} ${fn}`).toBe(
          INSUFFICIENT_PRIVILEGE,
        );
      }
    }

    expect(await rowsFor(personalMatch)).toEqual([]);
  });

  // ── 2. Authorization rechecked in SQL ─────────────────────────────────────

  test("creator, provenance, exact workspace and membership are all rechecked before any row is written", async () => {
    expectRefused(
      await reserve({ p_match_id: randomUUID() }),
      RPC_NOT_FOUND,
      "match_not_found",
      "no_such_match",
    );
    expectRefused(
      await reserve({
        p_actor_id: outsider.userId,
        p_workspace_id: outsider.userId,
      }),
      INSUFFICIENT_PRIVILEGE,
      "forbidden",
      "not_creator",
    );
    expectRefused(
      await reserve({ p_match_id: vendorMatch }),
      INSUFFICIENT_PRIVILEGE,
      "forbidden",
      "not_swingvision",
    );
    expectRefused(
      await reserve({ p_workspace_kind: "team", p_workspace_id: programId }),
      INSUFFICIENT_PRIVILEGE,
      "workspace_mismatch",
      "personal_match_in_team_workspace",
    );
    expectRefused(
      await reserve({ p_workspace_id: outsider.userId }),
      INSUFFICIENT_PRIVILEGE,
      "workspace_mismatch",
      "personal_workspace_not_actor",
    );

    // Team match: the creator is a member, but only that program counts.
    const teamArgs = {
      p_actor_id: member.userId,
      p_match_id: teamMatch,
      p_workspace_kind: "team",
      p_workspace_id: programId,
    };
    expectRefused(
      await reserve({
        ...teamArgs,
        p_workspace_kind: "personal",
        p_workspace_id: member.userId,
      }),
      INSUFFICIENT_PRIVILEGE,
      "workspace_mismatch",
      "team_match_in_personal_workspace",
    );
    expectRefused(
      await reserve({ ...teamArgs, p_workspace_id: randomUUID() }),
      INSUFFICIENT_PRIVILEGE,
      "workspace_mismatch",
      "match_in_other_program",
    );

    // Membership is the program_members table: remove the row and the same
    // call is refused, restore it and it passes.
    const removed = await admin
      .from("program_members")
      .delete()
      .eq("program_id", programId)
      .eq("user_id", member.userId);
    expect(removed.error).toBeNull();
    expectRefused(
      await reserve(teamArgs),
      INSUFFICIENT_PRIVILEGE,
      "workspace_mismatch",
      "not_a_member",
    );
    const restored = await admin.from("program_members").insert({
      program_id: programId,
      user_id: member.userId,
      role: "owner",
    });
    expect(restored.error).toBeNull();

    expect(await rowsFor(personalMatch)).toEqual([]);
    expect(await rowsFor(teamMatch)).toEqual([]);

    const team = firstRow(await reserve(teamArgs));
    expect(team.reused).toBe(false);
    expect(await rowsFor(teamMatch)).toMatchObject([
      { id: team.attachment_id, state: "pending", uploaded_by: member.userId },
    ]);
  });

  // ── 3. Reservation ────────────────────────────────────────────────────────

  let attemptA: string;
  let requestA: string;
  let expiryA: string;

  test("a reservation stores server-minted keys, the expected active identity and the client request id with the SAS expiry", async () => {
    requestA = randomUUID();
    expiryA = hoursFromNow(6);
    const row = firstRow(
      await reserve({
        p_client_request_id: requestA,
        p_upload_sas_expires_at: expiryA,
      }),
    );
    attemptA = row.attachment_id as string;

    expect(row.reused).toBe(false);
    expect(row.staged_blob_key).toBe(
      `match-video/${personalMatch}/${attemptA}/staged.mp4`,
    );
    expect(row.final_blob_key).toBe(
      `match-video/${personalMatch}/${attemptA}/final.mp4`,
    );
    expect(new Date(row.upload_sas_expires_at as string).toISOString()).toBe(
      expiryA,
    );

    const [stored] = await rowsFor(personalMatch);
    expect(stored).toMatchObject({
      id: attemptA,
      state: "pending",
      uploaded_by: owner.userId,
      client_request_id: requestA,
      expected_active_id: null,
      expected_active_version: null,
      staged_blob_key: row.staged_blob_key,
      final_blob_key: row.final_blob_key,
    });
    expect(new Date(stored.upload_sas_expires_at).toISOString()).toBe(expiryA);
  });

  test("an identical retry reuses the attempt; changed metadata or other pending work under this uploader conflicts", async () => {
    const later = hoursFromNow(7);
    const retry = firstRow(
      await reserve({
        p_client_request_id: requestA,
        p_upload_sas_expires_at: later,
      }),
    );
    expect(retry.attachment_id).toBe(attemptA);
    expect(retry.reused).toBe(true);
    expect(new Date(retry.upload_sas_expires_at as string).toISOString()).toBe(
      later,
    );
    expiryA = later;

    expectRefused(
      await reserve({
        p_client_request_id: requestA,
        p_filename: `${RPC_MARK}-renamed.mp4`,
      }),
      RPC_STATE_CONFLICT,
      "pending_attempt_conflict",
      "request_id_metadata_changed",
      "changed filename",
    );
    expectRefused(
      await reserve({
        p_client_request_id: requestA,
        p_declared_size_bytes: 2_000_001,
      }),
      RPC_STATE_CONFLICT,
      "pending_attempt_conflict",
      "request_id_metadata_changed",
      "changed size",
    );
    // A changed belief about the active attachment is checked against
    // reality BEFORE the request id is looked up, so it reads as stale.
    expectRefused(
      await reserve({
        p_client_request_id: requestA,
        p_expected_active_id: randomUUID(),
        p_expected_active_version: 0,
      }),
      RPC_STATE_CONFLICT,
      "stale_attachment",
      "no_active_attachment",
      "changed expected active",
    );
    expectRefused(
      await reserve(),
      RPC_STATE_CONFLICT,
      "pending_attempt_conflict",
      "other_pending_attempt",
      "second attempt",
    );

    expect(await rowsFor(personalMatch)).toHaveLength(1);
  });

  // ── 4. Renewal and cancellation ───────────────────────────────────────────

  test("renewal records the latest expiry for the uploader's own pending attempt, and not under a finalization lease", async () => {
    const later = hoursFromNow(9);
    const renewed = firstRow(await renew(owner, attemptA, later));
    expect(renewed.attachment_id).toBe(attemptA);
    expect(renewed.staged_blob_key).toBe(
      `match-video/${personalMatch}/${attemptA}/staged.mp4`,
    );
    expect(
      new Date(renewed.upload_sas_expires_at as string).toISOString(),
    ).toBe(later);
    expiryA = later;

    // An earlier expiry never rolls the recorded one back: a credential with
    // the later expiry is still out there.
    const earlier = firstRow(await renew(owner, attemptA, hoursFromNow(1)));
    expect(
      new Date(earlier.upload_sas_expires_at as string).toISOString(),
    ).toBe(later);

    expectRefused(
      await renew(outsider, attemptA, hoursFromNow(9)),
      INSUFFICIENT_PRIVILEGE,
      "forbidden",
      "not_creator",
      "outsider renew",
    );
    expectRefused(
      await renew(owner, randomUUID(), hoursFromNow(9)),
      RPC_NOT_FOUND,
      "match_not_found",
      "no_such_attachment",
      "unknown attachment",
    );

    const leased = await admin
      .from(TABLE)
      .update({
        finalize_lease_token: randomUUID(),
        finalize_lease_until: new Date(Date.now() + 5 * 60_000).toISOString(),
      })
      .eq("id", attemptA);
    expect(leased.error).toBeNull();
    expectRefused(
      await renew(owner, attemptA, hoursFromNow(9)),
      RPC_STATE_CONFLICT,
      "pending_attempt_conflict",
      "finalizing",
      "renew while finalizing",
    );
    expectRefused(
      await cancel(owner, attemptA),
      RPC_STATE_CONFLICT,
      "pending_attempt_conflict",
      "finalizing",
      "cancel while finalizing",
    );
    const released = await admin
      .from(TABLE)
      .update({ finalize_lease_token: null, finalize_lease_until: null })
      .eq("id", attemptA);
    expect(released.error).toBeNull();

    const [stored] = await rowsFor(personalMatch);
    expect(stored.state).toBe("pending");
    expect(new Date(stored.upload_sas_expires_at).toISOString()).toBe(later);
  });

  test("cancellation retires pending work idempotently; retired work cannot renew, be re-reserved or return to pending", async () => {
    expectRefused(
      await cancel(outsider, attemptA),
      INSUFFICIENT_PRIVILEGE,
      "forbidden",
      "not_creator",
      "outsider cancel",
    );

    const first = firstRow(await cancel(owner, attemptA));
    expect(first).toEqual({ attachment_id: attemptA, state: "retired" });

    const [stored] = await rowsFor(personalMatch);
    expect(stored.state).toBe("retired");
    expect(stored.retired_at).not.toBeNull();
    // Cleanup waits for the last issued credential to lapse.
    expect(new Date(stored.cleanup_next_attempt_at).getTime()).toBe(
      new Date(expiryA).getTime(),
    );

    const again = firstRow(await cancel(owner, attemptA));
    expect(again).toEqual({ attachment_id: attemptA, state: "retired" });

    expectRefused(
      await renew(owner, attemptA, hoursFromNow(9)),
      RPC_STATE_CONFLICT,
      "mode_conflict",
      "attempt_retired",
      "renew retired",
    );
    expectRefused(
      await reserve({ p_client_request_id: requestA }),
      RPC_STATE_CONFLICT,
      "pending_attempt_conflict",
      "request_id_retired",
      "reserve retired request id",
    );

    const revive = await admin
      .from(TABLE)
      .update({ state: "pending", retired_at: null })
      .eq("id", attemptA);
    expect(revive.error?.code).toBe(RAISE_EXCEPTION);
  });

  // ── 5. Optimistic concurrency and races ───────────────────────────────────

  test("a stale belief about the active attachment is refused, and an active asset can be neither cancelled nor renewed", async () => {
    expectRefused(
      await reserve({
        p_expected_active_id: randomUUID(),
        p_expected_active_version: 0,
      }),
      RPC_STATE_CONFLICT,
      "stale_attachment",
      "no_active_attachment",
    );

    // An active attachment appears (T4's job; inserted directly here).
    const activeId = randomUUID();
    const active = await admin.from(TABLE).insert({
      id: activeId,
      match_id: personalMatch,
      uploaded_by: owner.userId,
      state: "active",
      version: 3,
      filename: `${RPC_MARK}-active.mp4`,
      declared_size_bytes: 1_000_000,
      declared_content_type: "video/mp4",
      staged_blob_key: `${RPC_MARK}/staged/${activeId}.mp4`,
      final_blob_key: `${RPC_MARK}/final/${activeId}.mp4`,
      client_request_id: randomUUID(),
      verified_size_bytes: 1_000_000,
      verified_content_type: "video/mp4",
      verified_duration_seconds: 5400.5,
      confirmed_video_time_seconds: 12.345,
      offset_seconds: -12.345,
      activated_at: new Date().toISOString(),
    });
    expect(active.error).toBeNull();

    expectRefused(
      await reserve(),
      RPC_STATE_CONFLICT,
      "stale_attachment",
      "attachment_now_active",
      "believed none",
    );
    expectRefused(
      await reserve({
        p_expected_active_id: activeId,
        p_expected_active_version: 2,
      }),
      RPC_STATE_CONFLICT,
      "stale_attachment",
      "active_version_changed",
      "old version",
    );
    expectRefused(
      await reserve({
        p_expected_active_id: randomUUID(),
        p_expected_active_version: 3,
      }),
      RPC_STATE_CONFLICT,
      "stale_attachment",
      "active_attachment_replaced",
      "other id",
    );

    const replacement = firstRow(
      await reserve({
        p_expected_active_id: activeId,
        p_expected_active_version: 3,
      }),
    );
    expect(replacement.reused).toBe(false);
    const rows = await rowsFor(personalMatch);
    expect(
      rows.find((row) => row.id === replacement.attachment_id),
    ).toMatchObject({
      state: "pending",
      expected_active_id: activeId,
      expected_active_version: 3,
    });

    expectRefused(
      await cancel(owner, activeId),
      RPC_STATE_CONFLICT,
      "mode_conflict",
      "attachment_active",
      "cancel active",
    );
    expectRefused(
      await renew(owner, activeId, hoursFromNow(1)),
      RPC_STATE_CONFLICT,
      "mode_conflict",
      "attempt_active",
      "renew active",
    );
    expect(
      (await rowsFor(personalMatch)).find((row) => row.id === activeId)?.state,
    ).toBe("active");
  });

  test("concurrent identical retries converge on one attempt, and concurrent distinct reservations leave exactly one pending", async () => {
    const requestId = randomUUID();
    const identical = await Promise.all(
      Array.from({ length: 5 }, () =>
        reserve({ p_match_id: raceMatch, p_client_request_id: requestId }),
      ),
    );
    const ids = new Set(identical.map((r) => firstRow(r).attachment_id));
    expect(ids.size).toBe(1);
    expect(identical.filter((r) => firstRow(r).reused === false)).toHaveLength(
      1,
    );

    const [winner] = ids;
    const cancelled = firstRow(
      await cancel(owner, winner as string, { p_match_id: raceMatch }),
    );
    expect(cancelled.state).toBe("retired");

    const distinct = await Promise.all(
      Array.from({ length: 5 }, () => reserve({ p_match_id: raceMatch })),
    );
    const won = distinct.filter((r) => r.error === null);
    const lost = distinct.filter((r) => r.error !== null);
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(4);
    for (const r of lost) {
      expectRefused(
        r,
        RPC_STATE_CONFLICT,
        "pending_attempt_conflict",
        "other_pending_attempt",
        "losing reservation",
      );
    }

    const pending = (await rowsFor(raceMatch)).filter(
      (row) => row.state === "pending",
    );
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(firstRow(won[0]).attachment_id);
  });
});

/**
 * `20260919052002_match_video_attachment_activation.sql` (T4) — the
 * finalization lease, atomic activation and alignment correction, proven
 * against the live database with throwaway users and matches.
 *
 *  1. Privilege boundary: anon and authenticated sessions cannot execute any
 *     of the six new functions (`42501`).
 *  2. SQL/TypeScript timing parity: `match_video_source_timing` and
 *     `match_video_plan_alignment` are driven over the SAME fixture rows as
 *     `summarizeSourceTiming()` / `planAlignment()` and must return the same
 *     numbers (exact `toBe`, no tolerance) and the same refusal slugs —
 *     including the MAX-over-every-known-bound rule, a shot before the anchor,
 *     and coverage at the 0.1 s tolerance edge on both sides.
 *  3. Lease: begin freezes the confirmed time, refuses another token, refuses
 *     a changed input under the same live lease, blocks renew/cancel, and
 *     release lets a failed completion retry.
 *  4. Activation: needs the lease, server-verified metadata and coverage;
 *     retires the previous active row and activates the new one atomically;
 *     a replay is success only while that row is still active; a retired
 *     attempt never publishes; concurrent replays converge on one commit.
 *  5. Correction: version CAS, no-op leaves the version alone, saved duration
 *     is what coverage is checked against, concurrent corrections leave one
 *     winner.
 *  6. Races: cancel vs. begin, and match deletion during activation.
 *  7. Imported data: `matches`, `points`, `shots` and `match_stats` rows are
 *     deep-equal before and after every activation and correction.
 */

const DATA_EXCEPTION = "22000";

/**
 * A double as the database RENDERS it.
 *
 * The SQL stores and compares the same IEEE double the TypeScript computes
 * (12.345 − 10 = 2.3450000000000006 on both sides — the tolerance-edge cases
 * below would flip otherwise). But this project runs Postgres with
 * `extra_float_digits = 0`, so every float8 leaves the database printed to 15
 * significant digits: 2.3450000000000006 arrives as 2.345 — from this RPC and
 * from a plain read of `offset_seconds` alike, which is the only offset the
 * application will ever see. Parity is therefore asserted on the exact value
 * after that one rendering step, never with a tolerance. If the setting ever
 * changes to shortest-round-trip output, this helper is what to delete.
 */
const rendered = (value: number): number => Number(value.toPrecision(15));

const { mark: ACT_MARK, password: ACT_PASSWORD } = runMarker("mva4");

type SourceRows = { points: SourcePoint[]; shots: SourceShot[] };

test.describe("match_video_attachments activation + alignment RPCs (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient;
  let owner: Session; // creator and uploader
  let outsider: Session;

  const authUserIds: string[] = [];
  let alignMatch: string; // full timing fixture; activation/correction target
  let emptyMatch: string; // no points at all
  let deleteMatch: string; // deleted while an activation is in flight

  /** `points.id` by point_number on alignMatch, for the fault mutations. */
  const pointIds: Record<number, string> = {};
  let anchorShotId: string;

  const VERIFIED_DURATION = 200;
  const CONFIRMED = 10;

  const hoursFromNow = (hours: number) =>
    new Date(Date.now() + hours * 3_600_000).toISOString();

  const actor = (session: Session, matchId: string) => ({
    p_actor_id: session.userId,
    p_workspace_kind: "personal",
    p_workspace_id: session.userId,
    p_match_id: matchId,
  });

  const rpc = (fn: string, args: Record<string, unknown>) =>
    admin.rpc(fn, args) as unknown as Promise<RpcResult>;

  const reserve = (
    matchId: string,
    expected: { id: string; version: number } | null,
    overrides: Record<string, unknown> = {},
  ) =>
    rpc("match_video_reserve_upload", {
      ...actor(owner, matchId),
      p_filename: `${ACT_MARK}-a.mp4`,
      p_declared_size_bytes: 2_000_000,
      p_declared_content_type: "video/mp4",
      p_client_request_id: randomUUID(),
      p_expected_active_id: expected?.id ?? null,
      p_expected_active_version: expected?.version ?? null,
      p_upload_sas_expires_at: hoursFromNow(6),
      ...overrides,
    });

  const begin = (
    matchId: string,
    attachmentId: string,
    token: string,
    expected: { id: string; version: number } | null,
    overrides: Record<string, unknown> = {},
  ) =>
    rpc("match_video_begin_finalization", {
      ...actor(owner, matchId),
      p_attachment_id: attachmentId,
      p_lease_token: token,
      p_lease_seconds: 300,
      p_confirmed_video_time_seconds: CONFIRMED,
      p_expected_active_id: expected?.id ?? null,
      p_expected_active_version: expected?.version ?? null,
      ...overrides,
    });

  const release = (matchId: string, attachmentId: string, token: string) =>
    rpc("match_video_release_finalization", {
      ...actor(owner, matchId),
      p_attachment_id: attachmentId,
      p_lease_token: token,
    });

  const activate = (
    matchId: string,
    attachmentId: string,
    token: string,
    overrides: Record<string, unknown> = {},
  ) =>
    rpc("match_video_activate_attachment", {
      ...actor(owner, matchId),
      p_attachment_id: attachmentId,
      p_lease_token: token,
      p_confirmed_video_time_seconds: CONFIRMED,
      p_verified_size_bytes: 1_999_000,
      p_verified_content_type: "video/mp4",
      p_verified_duration_seconds: VERIFIED_DURATION,
      ...overrides,
    });

  const correct = (
    attachmentId: string,
    expectedVersion: number,
    confirmed: number,
    overrides: Record<string, unknown> = {},
  ) =>
    rpc("match_video_correct_alignment", {
      ...actor(owner, alignMatch),
      p_attachment_id: attachmentId,
      p_expected_version: expectedVersion,
      p_confirmed_video_time_seconds: confirmed,
      ...overrides,
    });

  const cancel = (matchId: string, attachmentId: string) =>
    rpc("match_video_cancel_upload", {
      ...actor(owner, matchId),
      p_attachment_id: attachmentId,
    });

  const renew = (matchId: string, attachmentId: string) =>
    rpc("match_video_renew_upload", {
      ...actor(owner, matchId),
      p_attachment_id: attachmentId,
      p_upload_sas_expires_at: hoursFromNow(8),
    });

  const attachment = async (id: string) => {
    const result = await admin.from(TABLE).select("*").eq("id", id).single();
    expect(result.error).toBeNull();
    return result.data as Record<string, unknown>;
  };

  const insertMatch = async (label: string) => {
    const match = await admin
      .from("matches")
      .insert({
        created_by: owner.userId,
        player1_id: owner.userId,
        player1_name: "Activation Player",
        player2_name: "Activation Opponent",
        date: new Date().toISOString(),
        tournament_name: `${ACT_MARK}-${label}`,
        source_provider: "swing-vision",
      })
      .select("id")
      .single();
    if (match.error) throw new Error(`match: ${match.error.message}`);
    return match.data.id as string;
  };

  const insertPoint = async (
    matchId: string,
    pointNumber: number,
    videoTime: number | null,
    duration: number | null,
  ) => {
    const point = await admin
      .from("points")
      .insert({
        match_id: matchId,
        point_number: pointNumber,
        set_number: 1,
        game_number: 1,
        server_is_player1: true,
        won_by_player1: pointNumber % 2 === 0,
        video_time: videoTime,
        duration,
      })
      .select("id")
      .single();
    if (point.error) throw new Error(`point: ${point.error.message}`);
    return point.data.id as string;
  };

  const insertShot = async (
    pointId: string,
    shotNumber: number,
    videoTime: number | null,
  ) => {
    const shot = await admin
      .from("shots")
      .insert({
        point_id: pointId,
        shot_number: shotNumber,
        is_player1: true,
        video_time: videoTime,
        // Imported rows never carry a bounce; only the derivation path writes one.
        bounce_video_time: null,
      })
      .select("id")
      .single();
    if (shot.error) throw new Error(`shot: ${shot.error.message}`);
    return shot.data.id as string;
  };

  /**
   * The source rows exactly as the application would read them — through
   * PostgREST, so a `real` arrives as the shortest round-trip text parsed
   * into a double. This is the input the TypeScript side of the parity
   * check gets; the SQL side reads the same rows through `::text`.
   */
  const sourceRows = async (matchId: string): Promise<SourceRows> => {
    const points = await admin
      .from("points")
      .select("id, point_number, video_time, duration")
      .eq("match_id", matchId)
      .order("point_number");
    expect(points.error).toBeNull();
    const ids = points.data!.map((p) => p.id as string);
    const shots =
      ids.length === 0
        ? { data: [], error: null }
        : await admin
            .from("shots")
            .select("video_time")
            .in("point_id", ids)
            .order("id");
    expect(shots.error).toBeNull();
    return {
      points: points.data!.map((p) => ({
        pointNumber: p.point_number as number,
        videoTime: p.video_time as number | null,
        duration: p.duration as number | null,
      })),
      shots: (shots.data ?? []).map((s) => ({
        videoTime: s.video_time as number | null,
      })),
    };
  };

  /** Everything imported for a match, in a stable order, for the byte-equal check. */
  const importedSnapshot = async (matchId: string) => {
    const match = await admin.from("matches").select("*").eq("id", matchId);
    const points = await admin
      .from("points")
      .select("*")
      .eq("match_id", matchId)
      .order("point_number");
    const shots = await admin
      .from("shots")
      .select("*")
      .in(
        "point_id",
        (points.data ?? []).map((p) => p.id as string),
      )
      .order("id");
    const stats = await admin
      .from("match_stats")
      .select("*")
      .eq("match_id", matchId)
      .order("is_player1");
    for (const r of [match, points, shots, stats]) expect(r.error).toBeNull();
    return {
      match: match.data,
      points: points.data,
      shots: shots.data,
      stats: stats.data,
    };
  };

  /**
   * Run the TypeScript contract and the SQL twin over the same rows and
   * demand the same answer: every number exactly equal on success, the same
   * code and detail slug on refusal.
   */
  const expectTimingParity = async (matchId: string, label: string) => {
    const rows = await sourceRows(matchId);
    const ts = summarizeSourceTiming(rows.points, rows.shots);
    const sql = await rpc("match_video_source_timing", { p_match_id: matchId });

    if (ts.ok) {
      const row = firstRow(sql);
      expect(row, label).toEqual({
        anchor_point_number: ts.value.anchorPointNumber,
        anchor_source_seconds: rendered(ts.value.anchorSourceSeconds),
        final_point_number: ts.value.finalPointNumber,
        required_source_end_seconds: rendered(
          ts.value.requiredSourceEndSeconds,
        ),
        earliest_source_seconds: rendered(ts.value.earliestSourceSeconds),
        untimed_point_count: ts.value.untimedPointCount,
        untimed_shot_count: ts.value.untimedShotCount,
      });
    } else {
      expectRefused(
        sql,
        DATA_EXCEPTION,
        ts.error.code,
        ts.error.detail,
        `${label} (timing)`,
      );
    }
    return ts;
  };

  const expectAlignmentParity = async (
    matchId: string,
    confirmed: number,
    duration: number,
    label: string,
  ) => {
    const rows = await sourceRows(matchId);
    const ts = planAlignment({
      points: rows.points,
      shots: rows.shots,
      confirmedVideoTime: confirmed,
      videoDurationSeconds: duration,
    });
    const sql = await rpc("match_video_plan_alignment", {
      p_match_id: matchId,
      p_confirmed_video_time_seconds: confirmed,
      p_video_duration_seconds: duration,
    });

    if (ts.ok) {
      const row = firstRow(sql);
      expect(row, label).toEqual({
        offset_seconds: rendered(ts.value.offsetSeconds),
        confirmed_video_time_seconds: ts.value.confirmedVideoTimeSeconds,
        required_video_start_seconds: rendered(
          ts.value.coverage.requiredVideoStartSeconds,
        ),
        required_video_end_seconds: rendered(
          ts.value.coverage.requiredVideoEndSeconds,
        ),
        video_duration_seconds: rendered(
          ts.value.coverage.videoDurationSeconds,
        ),
        tolerance_seconds: rendered(ts.value.coverage.toleranceSeconds),
        anchor_point_number: ts.value.timing.anchorPointNumber,
        anchor_source_seconds: rendered(ts.value.timing.anchorSourceSeconds),
        final_point_number: ts.value.timing.finalPointNumber,
        required_source_end_seconds: rendered(
          ts.value.timing.requiredSourceEndSeconds,
        ),
        earliest_source_seconds: rendered(
          ts.value.timing.earliestSourceSeconds,
        ),
        untimed_point_count: ts.value.timing.untimedPointCount,
        untimed_shot_count: ts.value.timing.untimedShotCount,
      });
    } else {
      expectRefused(
        sql,
        DATA_EXCEPTION,
        ts.error.code,
        ts.error.detail,
        `${label} (alignment)`,
      );
    }
    return ts;
  };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    admin = createAdminClient();

    [owner, outsider] = await createLogins(admin, ["owner", "outsider"], {
      mark: ACT_MARK,
      password: ACT_PASSWORD,
      authUserIds,
    });

    alignMatch = await insertMatch("align");
    emptyMatch = await insertMatch("empty");
    deleteMatch = await insertMatch("delete");

    // The timing fixture. Anchor is point 1 at 12.345 s. The final point (6)
    // ends at 131.0, but point 4 — an interior point with a long duration —
    // ends at 150.125 and a shot on point 6 lands at 140.6, so the REQUIRED
    // end is 150.125, not the final point's end. A shot on point 1 at 5.5 is
    // earlier than the anchor. Point 3 is untimed; point 5 has a zero
    // ("unknown") duration; one shot is untimed.
    const spec: [number, number | null, number | null][] = [
      [1, 12.345, 8.5],
      [2, 30.25, null],
      [3, null, null],
      [4, 60.125, 90],
      [5, 100.5, 0],
      [6, 120.75, 10.25],
    ];
    for (const [n, t, d] of spec) {
      pointIds[n] = await insertPoint(alignMatch, n, t, d);
    }
    anchorShotId = await insertShot(pointIds[1], 1, 12.345);
    await insertShot(pointIds[1], 0, 5.5);
    await insertShot(pointIds[2], 1, 31.5);
    await insertShot(pointIds[4], 1, null);
    await insertShot(pointIds[6], 1, 140.6);

    // Statistics rows, so the "imported data is untouched" check covers them.
    const stats = await admin.from("match_stats").insert([
      { match_id: alignMatch, is_player1: true, aces: 3, winners: 11 },
      { match_id: alignMatch, is_player1: false, aces: 1, winners: 7 },
    ]);
    if (stats.error) throw new Error(`match_stats: ${stats.error.message}`);

    // A minimal alignable timeline on the match that gets deleted mid-flight.
    await insertPoint(deleteMatch, 1, 12.345, 8.5);
    await insertPoint(deleteMatch, 2, 20, 5);
  });

  test.afterAll(async () => {
    if (!admin) return;
    await admin.from(TABLE).delete().like("filename", `${ACT_MARK}%`);
    // points, shots and match_stats cascade from the match.
    await admin
      .from("matches")
      .delete()
      .like("tournament_name", `${ACT_MARK}%`);
    await deleteAuthUsers(admin, authUserIds);
  });

  // ── 1. Privilege boundary ─────────────────────────────────────────────────

  test("anon and authenticated sessions cannot execute any activation, alignment or lease RPC", async () => {
    const anon = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = randomUUID();
    const attachmentId = randomUUID();
    const calls: [string, Record<string, unknown>][] = [
      ["match_video_source_timing", { p_match_id: alignMatch }],
      [
        "match_video_plan_alignment",
        {
          p_match_id: alignMatch,
          p_confirmed_video_time_seconds: CONFIRMED,
          p_video_duration_seconds: VERIFIED_DURATION,
        },
      ],
      [
        "match_video_begin_finalization",
        {
          ...actor(owner, alignMatch),
          p_attachment_id: attachmentId,
          p_lease_token: token,
          p_lease_seconds: 300,
          p_confirmed_video_time_seconds: CONFIRMED,
          p_expected_active_id: null,
          p_expected_active_version: null,
        },
      ],
      [
        "match_video_release_finalization",
        {
          ...actor(owner, alignMatch),
          p_attachment_id: attachmentId,
          p_lease_token: token,
        },
      ],
      [
        "match_video_activate_attachment",
        {
          ...actor(owner, alignMatch),
          p_attachment_id: attachmentId,
          p_lease_token: token,
          p_confirmed_video_time_seconds: CONFIRMED,
          p_verified_size_bytes: 1,
          p_verified_content_type: "video/mp4",
          p_verified_duration_seconds: VERIFIED_DURATION,
        },
      ],
      [
        "match_video_correct_alignment",
        {
          ...actor(owner, alignMatch),
          p_attachment_id: attachmentId,
          p_expected_version: 0,
          p_confirmed_video_time_seconds: CONFIRMED,
        },
      ],
    ];

    for (const [label, client] of [
      ["anon", anon],
      ["authenticated (owner)", owner.client],
      ["authenticated (outsider)", outsider.client],
    ] as const) {
      for (const [fn, args] of calls) {
        const result = (await client.rpc(fn, args)) as unknown as RpcResult;
        expect(result.error?.code, `${label} ${fn}`).toBe(
          INSUFFICIENT_PRIVILEGE,
        );
      }
    }
  });

  // ── 2. SQL / TypeScript timing parity ────────────────────────────────────

  test("source timing: SQL and TypeScript agree on the anchor, the MAX-over-all-bounds end, the earliest shot and the untimed counts", async () => {
    const ts = await expectTimingParity(alignMatch, "full fixture");
    expect(ts.ok).toBe(true);
    if (!ts.ok) return;
    // The numbers themselves, so a bug that breaks both sides the same way
    // cannot hide behind parity.
    expect(ts.value).toEqual({
      anchorPointNumber: 1,
      anchorSourceSeconds: 12.345,
      finalPointNumber: 6,
      requiredSourceEndSeconds: 150.125,
      earliestSourceSeconds: 5.5,
      untimedPointCount: 1,
      untimedShotCount: 1,
    });
  });

  test("alignment: SQL and TypeScript agree on offset and coverage, including both tolerance edges", async () => {
    // start = confirmed − 6.845 ; end = confirmed + 137.78 (for this fixture)
    const cases: [number, number, string, string | null][] = [
      [CONFIRMED, VERIFIED_DURATION, "comfortably inside", null],
      // A shot sits 6.845 s before the anchor, so zero cannot cover it.
      [0, VERIFIED_DURATION, "confirmed at zero", "coverage_before_start"],
      [6.75, VERIFIED_DURATION, "start −0.095: inside tolerance", null],
      [
        6.7,
        VERIFIED_DURATION,
        "start −0.145: before start",
        "coverage_before_start",
      ],
      [CONFIRMED, 147.7, "end at the tolerance edge", null],
      [CONFIRMED, 147.6, "end 0.18 past: too short", "coverage_past_end"],
      [
        300,
        VERIFIED_DURATION,
        "confirmed past the end",
        "confirmed_time_past_end",
      ],
      [CONFIRMED, 0, "zero duration", "video_duration_unusable"],
      [-1, VERIFIED_DURATION, "negative confirmed", "confirmed_time_negative"],
      [12.345, VERIFIED_DURATION, "confirmed equals anchor (offset 0)", null],
    ];
    for (const [confirmed, duration, label, refusal] of cases) {
      const ts = await expectAlignmentParity(
        alignMatch,
        confirmed,
        duration,
        label,
      );
      expect(ts.ok, label).toBe(refusal === null);
      if (!ts.ok) expect(ts.error.detail, label).toBe(refusal);
    }

    // The SQL side accepts only what parseConfirmedVideoTime() already
    // produced — millisecond precision — and refuses to round a second time
    // by a rule of its own. (The TypeScript parser rounds a raw number, so
    // this input is outside the parity contract on purpose.)
    expectRefused(
      await rpc("match_video_plan_alignment", {
        p_match_id: alignMatch,
        p_confirmed_video_time_seconds: 1.2345,
        p_video_duration_seconds: VERIFIED_DURATION,
      }),
      DATA_EXCEPTION,
      "invalid_alignment",
      "confirmed_time_not_milliseconds",
    );
  });

  test("source timing refusals: every missing-data and corrupt-data slug matches between SQL and TypeScript", async () => {
    const setPoint = async (n: number, patch: Record<string, unknown>) => {
      const r = await admin.from("points").update(patch).eq("id", pointIds[n]);
      expect(r.error).toBeNull();
    };
    const setShot = async (patch: Record<string, unknown>) => {
      const r = await admin.from("shots").update(patch).eq("id", anchorShotId);
      expect(r.error).toBeNull();
    };
    const refusal = async (matchId: string, label: string, detail: string) => {
      const ts = await expectTimingParity(matchId, label);
      expect(ts.ok, label).toBe(false);
      if (!ts.ok) {
        expect(ts.error.code, label).toBe("missing_source_timing");
        expect(ts.error.detail, label).toBe(detail);
      }
    };

    await refusal(emptyMatch, "no points", "no_points");

    await setPoint(6, { duration: null });
    await refusal(
      alignMatch,
      "final duration null",
      "missing_final_point_duration",
    );
    await setPoint(6, { duration: 0 });
    await refusal(
      alignMatch,
      "final duration zero",
      "missing_final_point_duration",
    );
    await setPoint(6, { video_time: null, duration: 10.25 });
    await refusal(alignMatch, "final time null", "missing_final_point_time");
    await setPoint(6, { video_time: 120.75 });

    await setPoint(1, { video_time: null });
    await refusal(alignMatch, "anchor time null", "missing_first_point_time");
    await setPoint(1, { video_time: 12.345 });

    await setPoint(2, { video_time: -1 });
    await refusal(alignMatch, "negative point time", "point_time_invalid");
    await setPoint(2, { video_time: 30.25, duration: -1 });
    await refusal(
      alignMatch,
      "negative point duration",
      "point_duration_invalid",
    );
    await setPoint(2, { duration: null });

    await setShot({ video_time: -3 });
    await refusal(alignMatch, "negative shot time", "shot_time_invalid");
    await setShot({ video_time: 12.345 });

    // A duplicate point_number is ambiguous order, not a tie to break.
    const duplicate = await insertPoint(alignMatch, 6, 200, 1);
    await refusal(
      alignMatch,
      "duplicate point number",
      "ambiguous_point_order",
    );
    const removed = await admin.from("points").delete().eq("id", duplicate);
    expect(removed.error).toBeNull();

    // Back to the pristine fixture.
    const ts = await expectTimingParity(alignMatch, "restored");
    expect(ts.ok).toBe(true);
  });

  // ── 3–4. Lease and activation ─────────────────────────────────────────────

  let snapshotBefore: Awaited<ReturnType<typeof importedSnapshot>>;
  let attachmentA: string;
  let tokenA: string;
  let attachmentB: string;
  let expectedOffset: number;

  test("begin_finalization freezes the confirmed time, holds the row against renew/cancel/other tokens, and release lets a retry start over", async () => {
    snapshotBefore = await importedSnapshot(alignMatch);

    attachmentA = firstRow(await reserve(alignMatch, null))
      .attachment_id as string;
    tokenA = randomUUID();

    expectRefused(
      await begin(alignMatch, attachmentA, tokenA, null, {
        p_actor_id: outsider.userId,
        p_workspace_id: outsider.userId,
      }),
      INSUFFICIENT_PRIVILEGE,
      "forbidden",
      "not_creator",
      "outsider begin",
    );
    expectRefused(
      await begin(alignMatch, randomUUID(), tokenA, null),
      RPC_NOT_FOUND,
      "match_not_found",
      "no_such_attachment",
      "unknown attachment",
    );
    expectRefused(
      await begin(alignMatch, attachmentA, tokenA, {
        id: randomUUID(),
        version: 0,
      }),
      RPC_STATE_CONFLICT,
      "stale_attachment",
      "expected_active_changed",
      "disagrees with its own reservation",
    );
    expectRefused(
      await begin(alignMatch, attachmentA, tokenA, null, {
        p_confirmed_video_time_seconds: 1.2345,
      }),
      DATA_EXCEPTION,
      "invalid_alignment",
      "confirmed_time_not_milliseconds",
      "sub-millisecond confirmed time",
    );

    const leased = firstRow(await begin(alignMatch, attachmentA, tokenA, null));
    expect(leased).toMatchObject({
      attachment_id: attachmentA,
      state: "pending",
      staged_blob_key: `match-video/${alignMatch}/${attachmentA}/staged.mp4`,
      final_blob_key: `match-video/${alignMatch}/${attachmentA}/final.mp4`,
      confirmed_video_time_seconds: CONFIRMED,
    });
    const until = new Date(leased.finalize_lease_until as string).getTime();
    expect(until).toBeGreaterThan(Date.now() + 240_000);

    // Held: no renewal, no cancellation, no other completion.
    expectRefused(
      await renew(alignMatch, attachmentA),
      RPC_STATE_CONFLICT,
      "pending_attempt_conflict",
      "finalizing",
      "renew under lease",
    );
    expectRefused(
      await cancel(alignMatch, attachmentA),
      RPC_STATE_CONFLICT,
      "pending_attempt_conflict",
      "finalizing",
      "cancel under lease",
    );
    expectRefused(
      await begin(alignMatch, attachmentA, randomUUID(), null),
      RPC_STATE_CONFLICT,
      "pending_attempt_conflict",
      "finalizing",
      "another token",
    );
    // Frozen: the same lease may not change its confirmed time between polls.
    expectRefused(
      await begin(alignMatch, attachmentA, tokenA, null, {
        p_confirmed_video_time_seconds: 11,
      }),
      RPC_STATE_CONFLICT,
      "pending_attempt_conflict",
      "finalization_inputs_changed",
      "changed confirmed time",
    );
    // Same token, same inputs: extend.
    const extended = firstRow(
      await begin(alignMatch, attachmentA, tokenA, null),
    );
    expect(
      new Date(extended.finalize_lease_until as string).getTime(),
    ).toBeGreaterThanOrEqual(until);

    // Release: only the holder, only once it matters.
    expect(
      firstRow(await release(alignMatch, attachmentA, randomUUID())),
    ).toEqual({
      attachment_id: attachmentA,
      state: "pending",
      released: false,
    });
    expect(firstRow(await release(alignMatch, attachmentA, tokenA))).toEqual({
      attachment_id: attachmentA,
      state: "pending",
      released: true,
    });
    expectRefused(
      await activate(alignMatch, attachmentA, tokenA),
      RPC_STATE_CONFLICT,
      "pending_attempt_conflict",
      "lease_not_held",
      "activate without lease",
    );
    // A released lease can change its inputs; the frozen value follows.
    const retaken = firstRow(
      await begin(alignMatch, attachmentA, tokenA, null, {
        p_confirmed_video_time_seconds: 11,
      }),
    );
    expect(retaken.confirmed_video_time_seconds).toBe(11);
    firstRow(await release(alignMatch, attachmentA, tokenA));
    firstRow(await begin(alignMatch, attachmentA, tokenA, null));

    expect(await attachment(attachmentA)).toMatchObject({
      state: "pending",
      confirmed_video_time_seconds: CONFIRMED,
      finalize_lease_token: tokenA,
      offset_seconds: null,
      activated_at: null,
    });
  });

  test("activation refuses a wrong token, changed inputs, unverified metadata, a too-short file and a non-creator — and leaves the row pending", async () => {
    const refusals: [
      Record<string, unknown>,
      string,
      string,
      string,
      string,
    ][] = [
      [
        { p_lease_token: randomUUID() },
        RPC_STATE_CONFLICT,
        "pending_attempt_conflict",
        "finalizing",
        "wrong token",
      ],
      [
        { p_confirmed_video_time_seconds: 11 },
        RPC_STATE_CONFLICT,
        "pending_attempt_conflict",
        "finalization_inputs_changed",
        "not the frozen time",
      ],
      [
        { p_verified_size_bytes: 0 },
        DATA_EXCEPTION,
        "empty_file",
        "verified_size_not_positive",
        "zero bytes",
      ],
      [
        { p_verified_size_bytes: 8_000_000_000 },
        DATA_EXCEPTION,
        "file_too_large",
        "verified_size_over_limit",
        "over the cap",
      ],
      [
        { p_verified_content_type: null },
        DATA_EXCEPTION,
        "unsupported_media",
        "verified_content_type_missing",
        "no content type",
      ],
      [
        { p_verified_duration_seconds: 0 },
        DATA_EXCEPTION,
        "unsupported_media",
        "video_duration_unusable",
        "no duration",
      ],
      [
        { p_verified_duration_seconds: 100 },
        DATA_EXCEPTION,
        "insufficient_coverage",
        "coverage_past_end",
        "too short",
      ],
      [
        { p_actor_id: outsider.userId, p_workspace_id: outsider.userId },
        INSUFFICIENT_PRIVILEGE,
        "forbidden",
        "not_creator",
        "outsider",
      ],
      [
        { p_attachment_id: randomUUID() },
        RPC_NOT_FOUND,
        "match_not_found",
        "no_such_attachment",
        "unknown attachment",
      ],
    ];
    for (const [overrides, code, message, detail, label] of refusals) {
      expectRefused(
        await activate(alignMatch, attachmentA, tokenA, overrides),
        code,
        message,
        detail,
        label,
      );
    }
    expect(await attachment(attachmentA)).toMatchObject({
      state: "pending",
      finalize_lease_token: tokenA,
      verified_duration_seconds: null,
      offset_seconds: null,
    });
  });

  test("activation publishes the row with server-verified metadata and the recomputed offset, clears the lease, and is idempotent only for the same time", async () => {
    const rows = await sourceRows(alignMatch);
    const plan = planAlignment({
      points: rows.points,
      shots: rows.shots,
      confirmedVideoTime: CONFIRMED,
      videoDurationSeconds: VERIFIED_DURATION,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expectedOffset = rendered(plan.value.offsetSeconds);

    const first = firstRow(await activate(alignMatch, attachmentA, tokenA));
    expect(first).toEqual({
      attachment_id: attachmentA,
      version: 0,
      offset_seconds: expectedOffset,
      confirmed_video_time_seconds: CONFIRMED,
      duration_seconds: VERIFIED_DURATION,
      content_type: "video/mp4",
      filename: `${ACT_MARK}-a.mp4`,
      previous_active_id: null,
      reused: false,
    });

    const stored = await attachment(attachmentA);
    expect(stored).toMatchObject({
      state: "active",
      version: 0,
      verified_size_bytes: 1_999_000,
      verified_content_type: "video/mp4",
      verified_duration_seconds: VERIFIED_DURATION,
      confirmed_video_time_seconds: CONFIRMED,
      offset_seconds: expectedOffset,
      finalize_lease_token: null,
      finalize_lease_until: null,
      retired_at: null,
    });
    expect(stored.activated_at).not.toBeNull();

    // No renewal after finalization.
    expectRefused(
      await renew(alignMatch, attachmentA),
      RPC_STATE_CONFLICT,
      "mode_conflict",
      "attempt_active",
      "renew after activation",
    );

    // Lost-response replay: same answer, nothing rewritten.
    const replay = firstRow(await activate(alignMatch, attachmentA, tokenA));
    expect(replay).toEqual({ ...first, reused: true });
    expect(await attachment(attachmentA)).toEqual(stored);

    expectRefused(
      await activate(alignMatch, attachmentA, tokenA, {
        p_confirmed_video_time_seconds: 11,
      }),
      RPC_STATE_CONFLICT,
      "mode_conflict",
      "attachment_active_other_time",
      "replay with another time",
    );
    // begin on a published row is a read: the caller learns it is active.
    expect(
      firstRow(await begin(alignMatch, attachmentA, randomUUID(), null)),
    ).toMatchObject({ attachment_id: attachmentA, state: "active" });
    expect(await attachment(attachmentA)).toEqual(stored);
  });

  test("replacement: concurrent activations of the same attempt converge on one commit, the old row is retired atomically, and a replay of the retired one is refused", async () => {
    // Reserving against the wrong belief is stopped at the door (T3);
    // reserving against the right one records it for activation to recheck.
    expectRefused(
      await reserve(alignMatch, null),
      RPC_STATE_CONFLICT,
      "stale_attachment",
      "attachment_now_active",
    );
    attachmentB = firstRow(
      await reserve(alignMatch, { id: attachmentA, version: 0 }),
    ).attachment_id as string;
    const tokenB = randomUUID();
    firstRow(
      await begin(alignMatch, attachmentB, tokenB, {
        id: attachmentA,
        version: 0,
      }),
    );

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        activate(alignMatch, attachmentB, tokenB),
      ),
    );
    const rows = results.map((r) => firstRow(r));
    expect(rows.filter((r) => r.reused === false)).toHaveLength(1);
    expect(rows.filter((r) => r.reused === true)).toHaveLength(4);
    expect(rows.find((r) => r.reused === false)!.previous_active_id).toBe(
      attachmentA,
    );

    const retired = await attachment(attachmentA);
    expect(retired.state).toBe("retired");
    expect(retired.retired_at).not.toBeNull();
    expect(retired.cleanup_next_attempt_at).not.toBeNull();
    // Keys survive for the cleanup worker.
    expect(retired.final_blob_key).toBe(
      `match-video/${alignMatch}/${attachmentA}/final.mp4`,
    );
    expect(await attachment(attachmentB)).toMatchObject({
      state: "active",
      version: 0,
      offset_seconds: expectedOffset,
    });

    const active = await admin
      .from(TABLE)
      .select("id")
      .eq("match_id", alignMatch)
      .eq("state", "active");
    expect(active.data).toEqual([{ id: attachmentB }]);

    // The lost-response replay of A's completion now lands AFTER a
    // replacement: a conflict, never a reactivation.
    expectRefused(
      await activate(alignMatch, attachmentA, tokenA),
      RPC_STATE_CONFLICT,
      "mode_conflict",
      "attempt_retired",
      "replay after replacement",
    );
    expectRefused(
      await begin(alignMatch, attachmentA, tokenA, null),
      RPC_STATE_CONFLICT,
      "mode_conflict",
      "attempt_retired",
      "begin on retired",
    );
    expectRefused(
      await cancel(alignMatch, attachmentB),
      RPC_STATE_CONFLICT,
      "mode_conflict",
      "attachment_active",
      "cancel the new active",
    );
  });

  // ── 5. Correction ─────────────────────────────────────────────────────────

  test("correction recomputes from the source rows and the SAVED duration under a version CAS; a no-op leaves the version alone", async () => {
    const rows = await sourceRows(alignMatch);
    const plan12 = planAlignment({
      points: rows.points,
      shots: rows.shots,
      confirmedVideoTime: 12,
      videoDurationSeconds: VERIFIED_DURATION,
    });
    expect(plan12.ok).toBe(true);
    if (!plan12.ok) return;

    const corrected = firstRow(await correct(attachmentB, 0, 12));
    expect(corrected).toEqual({
      attachment_id: attachmentB,
      version: 1,
      offset_seconds: rendered(plan12.value.offsetSeconds),
      confirmed_video_time_seconds: 12,
      duration_seconds: VERIFIED_DURATION,
      content_type: "video/mp4",
      filename: `${ACT_MARK}-a.mp4`,
      changed: true,
    });
    const stored = await attachment(attachmentB);
    expect(stored).toMatchObject({
      state: "active",
      version: 1,
      confirmed_video_time_seconds: 12,
      offset_seconds: rendered(plan12.value.offsetSeconds),
      verified_duration_seconds: VERIFIED_DURATION,
    });

    // No-op: same time, same offset, same version.
    expect(firstRow(await correct(attachmentB, 1, 12))).toEqual({
      ...corrected,
      changed: false,
    });
    expect(await attachment(attachmentB)).toEqual(stored);

    const refusals: [
      Record<string, unknown>,
      string,
      string,
      string,
      string,
    ][] = [
      [
        { p_expected_version: 0 },
        RPC_STATE_CONFLICT,
        "stale_attachment",
        "active_version_changed",
        "stale version",
      ],
      [
        { p_attachment_id: attachmentA },
        RPC_STATE_CONFLICT,
        "mode_conflict",
        "attachment_retired",
        "retired row",
      ],
      [
        { p_confirmed_video_time_seconds: 6.7 },
        DATA_EXCEPTION,
        "insufficient_coverage",
        "coverage_before_start",
        "before start",
      ],
      // Coverage is checked against the SAVED verified duration (200 s).
      [
        { p_confirmed_video_time_seconds: 62.4 },
        DATA_EXCEPTION,
        "insufficient_coverage",
        "coverage_past_end",
        "past the saved duration",
      ],
      [
        { p_confirmed_video_time_seconds: 300 },
        DATA_EXCEPTION,
        "invalid_alignment",
        "confirmed_time_past_end",
        "past the end",
      ],
      [
        { p_confirmed_video_time_seconds: 1.2345 },
        DATA_EXCEPTION,
        "invalid_alignment",
        "confirmed_time_not_milliseconds",
        "sub-millisecond",
      ],
      [
        { p_actor_id: outsider.userId, p_workspace_id: outsider.userId },
        INSUFFICIENT_PRIVILEGE,
        "forbidden",
        "not_creator",
        "outsider",
      ],
    ];
    for (const [overrides, code, message, detail, label] of refusals) {
      expectRefused(
        await correct(attachmentB, 1, 12, overrides),
        code,
        message,
        detail,
        label,
      );
    }
    expect(await attachment(attachmentB)).toEqual(stored);
  });

  test("concurrent corrections with the same expected version leave exactly one winner", async () => {
    const results = await Promise.all(
      [13, 14, 15, 16, 17].map((t) => correct(attachmentB, 1, t)),
    );
    const won = results.filter((r) => r.error === null);
    const lost = results.filter((r) => r.error !== null);
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(4);
    for (const r of lost) {
      expectRefused(
        r,
        RPC_STATE_CONFLICT,
        "stale_attachment",
        "active_version_changed",
        "losing correction",
      );
    }
    const winner = firstRow(won[0]);
    expect(winner.version).toBe(2);
    expect(await attachment(attachmentB)).toMatchObject({
      version: 2,
      confirmed_video_time_seconds: winner.confirmed_video_time_seconds,
      offset_seconds: winner.offset_seconds,
    });
  });

  test("a reservation whose belief went stale after a correction cannot begin finalization", async () => {
    // Reserved against version 2, then the version moves on.
    const stale = firstRow(
      await reserve(alignMatch, { id: attachmentB, version: 2 }),
    ).attachment_id as string;
    firstRow(await correct(attachmentB, 2, 12));
    expectRefused(
      await begin(alignMatch, stale, randomUUID(), {
        id: attachmentB,
        version: 2,
      }),
      RPC_STATE_CONFLICT,
      "stale_attachment",
      "active_version_changed",
    );
    expect(firstRow(await cancel(alignMatch, stale)).state).toBe("retired");
  });

  // ── 6. Races ──────────────────────────────────────────────────────────────

  test("cancel racing begin_finalization: exactly one wins", async () => {
    const version = (await attachment(attachmentB)).version as number;
    const attempt = firstRow(
      await reserve(alignMatch, { id: attachmentB, version }),
    ).attachment_id as string;
    const token = randomUUID();

    const [began, cancelled] = await Promise.all([
      begin(alignMatch, attempt, token, { id: attachmentB, version }),
      cancel(alignMatch, attempt),
    ]);
    const beganOk = began.error === null;
    const cancelledOk = cancelled.error === null;
    expect(beganOk !== cancelledOk, "exactly one wins").toBe(true);
    if (beganOk) {
      expectRefused(
        cancelled,
        RPC_STATE_CONFLICT,
        "pending_attempt_conflict",
        "finalizing",
        "cancel lost",
      );
      firstRow(await release(alignMatch, attempt, token));
      expect(firstRow(await cancel(alignMatch, attempt)).state).toBe("retired");
    } else {
      expectRefused(
        began,
        RPC_STATE_CONFLICT,
        "mode_conflict",
        "attempt_retired",
        "begin lost",
      );
    }
    expect((await attachment(attempt)).state).toBe("retired");
  });

  test("match deleted during activation: either the activation commits first and the row is orphaned with its keys, or it finds no match", async () => {
    const attempt = firstRow(await reserve(deleteMatch, null))
      .attachment_id as string;
    const token = randomUUID();
    firstRow(await begin(deleteMatch, attempt, token, null));

    const [activated, deleted] = await Promise.all([
      activate(deleteMatch, attempt, token),
      admin.from("matches").delete().eq("id", deleteMatch),
    ]);
    expect(deleted.error).toBeNull();

    const row = await attachment(attempt);
    expect(row.match_id).toBeNull();
    expect(row.final_blob_key).toBe(
      `match-video/${deleteMatch}/${attempt}/final.mp4`,
    );
    if (activated.error === null) {
      expect(firstRow(activated).reused).toBe(false);
      expect(row.state).toBe("active");
    } else {
      expectRefused(
        activated,
        RPC_NOT_FOUND,
        "match_not_found",
        "no_such_match",
        "deleted first",
      );
      expect(row.state).toBe("pending");
    }
    deleteMatch = "";
  });

  // ── 7. Imported data is never rewritten ──────────────────────────────────

  test("matches, points, shots and match_stats are unchanged after every activation and correction", async () => {
    expect(snapshotBefore.points).toHaveLength(6);
    expect(snapshotBefore.shots).toHaveLength(5);
    expect(snapshotBefore.stats).toHaveLength(2);
    expect(await importedSnapshot(alignMatch)).toEqual(snapshotBefore);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * T13 · cleanup claim + fencing RPCs
 * `20260919080217_match_video_attachment_cleanup.sql`
 *
 *  1. Privilege boundary: anon and a signed-in session are refused every
 *     cleanup RPC; malformed arguments are 22023.
 *  2. Eligibility: retired on schedule, orphans, pending idle 24 h, active
 *     staged-only — and every "not yet" (fresh, SAS still live, SAS expired
 *     under five minutes, backoff, live finalization lease, already parked).
 *  3. The retained-team-asset rule: an active team attachment whose uploader
 *     account was DELETED sheds only its staged key. Its final key is never
 *     collectible while the match stands; an orphan (match deleted) is.
 *  4. The fence: a claimed pending row cannot be renewed, finalized,
 *     activated, re-reserved or flipped back by a direct update.
 *  5. Competing cleanup / finalization / renewal: exactly one wins, and the
 *     loser sees the winner.
 *  6. Stale leases and versions are outcomes that record nothing.
 *  7. A failed delete retains keys, counts, backs off and retries to
 *     completion; a retirement between claim and confirm reschedules.
 *  8. At most 50 per claim; concurrent sweeps never share a row.
 *
 * The claim is a global sweep, so a batch may contain rows from other
 * describe blocks or a crashed run; every assertion here filters to this
 * run's mark and loops the claim while batches come back full.
 * ────────────────────────────────────────────────────────────────────────── */

const INVALID_PARAMETER = "22023";

const { mark: CLN_MARK, password: CLN_PASSWORD } = runMarker("mva13");

test.describe("match_video_attachments cleanup claim + fencing RPCs (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient;
  let owner: Session; // creator + uploader of the personal matches
  let member: Session; // creates the team match, belongs to the program
  let leaver: Session; // uploads to the team match; account deleted in test 3
  let outsider: Session; // signed in, owns nothing here

  const authUserIds: string[] = [];
  let programId: string;

  const minutes = (n: number) =>
    new Date(Date.now() + n * 60_000).toISOString();
  const ago = (min: number) => minutes(-min);
  const HOURS = 60;

  const rpc = (fn: string, args: Record<string, unknown>) =>
    admin.rpc(fn, args) as unknown as Promise<RpcResult>;

  const claim = (token: string, limit = 50, leaseSeconds = 300) =>
    rpc("match_video_claim_cleanup", {
      p_worker_token: token,
      p_lease_seconds: leaseSeconds,
      p_limit: limit,
    });

  type Claimed = Record<string, unknown>;

  /**
   * Every row of THIS run the sweep hands out for `token`, looping while a
   * batch comes back full so foreign rows cannot hide ours behind the cap.
   * Asserts the cap on every batch.
   */
  const claimMine = async (token: string): Promise<Claimed[]> => {
    const mine: Claimed[] = [];
    for (let i = 0; i < 6; i += 1) {
      const rows = firstRows(await claim(token));
      expect(rows.length).toBeLessThanOrEqual(50);
      mine.push(
        ...rows.filter((r) =>
          (r.staged_blob_key as string).startsWith(`${CLN_MARK}/`),
        ),
      );
      if (rows.length < 50) break;
    }
    return mine;
  };

  const firstRows = (result: RpcResult) => {
    expect(result.error).toBeNull();
    return result.data as Claimed[];
  };

  const confirm = (
    id: string,
    token: string,
    version: number,
    collectedFinal: boolean,
  ) =>
    rpc("match_video_confirm_cleanup", {
      p_attachment_id: id,
      p_lease_token: token,
      p_expected_version: version,
      p_collected_final: collectedFinal,
    });

  const fail = (
    id: string,
    token: string,
    error: string | null,
    retryAfterSeconds: number | null,
  ) =>
    rpc("match_video_fail_cleanup", {
      p_attachment_id: id,
      p_lease_token: token,
      p_error: error,
      p_retry_after_seconds: retryAfterSeconds,
    });

  const row = async (id: string) => {
    const result = await admin.from(TABLE).select("*").eq("id", id).single();
    expect(result.error).toBeNull();
    return result.data as Record<string, unknown>;
  };

  const setRow = async (id: string, patch: Record<string, unknown>) => {
    const result = await admin.from(TABLE).update(patch).eq("id", id);
    expect(result.error).toBeNull();
  };

  const insertMatch = async (
    createdBy: string,
    label: string,
    extra: Record<string, unknown> = {},
  ) => {
    const match = await admin
      .from("matches")
      .insert({
        created_by: createdBy,
        player1_id: createdBy,
        player1_name: "Cleanup Player",
        player2_name: "Cleanup Opponent",
        date: new Date().toISOString(),
        tournament_name: `${CLN_MARK}-${label}`,
        source_provider: "swing-vision",
        ...extra,
      })
      .select("id")
      .single();
    if (match.error) throw new Error(`match: ${match.error.message}`);
    return match.data.id as string;
  };

  const activeFields = (): Record<string, unknown> => ({
    state: "active",
    verified_size_bytes: 1_000_000,
    verified_content_type: "video/mp4",
    verified_duration_seconds: 5400.5,
    confirmed_video_time_seconds: 12.345,
    offset_seconds: -12.345,
    activated_at: ago(2 * HOURS),
  });

  const retiredFields = (): Record<string, unknown> => ({
    state: "retired",
    retired_at: ago(HOURS),
    cleanup_next_attempt_at: ago(HOURS),
  });

  /**
   * A row as the service role would find it. Defaults are the plainest
   * collectible shape: the last upload SAS died an hour ago and the row
   * has never been claimed. `match_id` must be given (null = orphan).
   */
  const insertRow = async (
    overrides: Record<string, unknown> & { match_id: string | null },
  ) => {
    const id = randomUUID();
    const result = await admin
      .from(TABLE)
      .insert({
        id,
        uploaded_by: owner.userId,
        state: "pending",
        filename: `${CLN_MARK}-${id.slice(0, 8)}.mp4`,
        declared_size_bytes: 1_000_000,
        declared_content_type: "video/mp4",
        staged_blob_key: `${CLN_MARK}/staged/${id}.mp4`,
        final_blob_key: `${CLN_MARK}/final/${id}.mp4`,
        client_request_id: randomUUID(),
        upload_sas_expires_at: ago(HOURS),
        last_attempt_at: new Date().toISOString(),
        ...overrides,
      })
      .select("id")
      .single();
    if (result.error) throw new Error(`insert: ${result.error.message}`);
    return id;
  };

  const actor = (session: Session, matchId: string) => ({
    p_actor_id: session.userId,
    p_workspace_kind: "personal",
    p_workspace_id: session.userId,
    p_match_id: matchId,
  });

  const begin = (matchId: string, attachmentId: string, token: string) =>
    rpc("match_video_begin_finalization", {
      ...actor(owner, matchId),
      p_attachment_id: attachmentId,
      p_lease_token: token,
      p_lease_seconds: 300,
      p_confirmed_video_time_seconds: 10,
      p_expected_active_id: null,
      p_expected_active_version: null,
    });

  const renew = (matchId: string, attachmentId: string) =>
    rpc("match_video_renew_upload", {
      ...actor(owner, matchId),
      p_attachment_id: attachmentId,
      p_upload_sas_expires_at: minutes(6 * HOURS),
    });

  const ids = (rows: Claimed[]) => rows.map((r) => r.attachment_id as string);
  const find = (rows: Claimed[], id: string) =>
    rows.find((r) => r.attachment_id === id);

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    admin = createAdminClient();

    [owner, member, leaver, outsider] = await createLogins(
      admin,
      ["owner", "member", "leaver", "outsider"],
      { mark: CLN_MARK, password: CLN_PASSWORD, authUserIds },
    );

    const program = await admin
      .from("programs")
      .insert({
        org_type: "club",
        school_name: `${CLN_MARK} Club`,
        status: "active",
        owner_user_id: member.userId,
      })
      .select("id")
      .single();
    if (program.error) throw new Error(`program: ${program.error.message}`);
    programId = program.data.id;

    const membership = await admin.from("program_members").insert([
      { program_id: programId, user_id: member.userId, role: "owner" },
      { program_id: programId, user_id: leaver.userId, role: "player" },
    ]);
    if (membership.error) {
      throw new Error(`membership: ${membership.error.message}`);
    }
  });

  test.afterAll(async () => {
    if (!admin) return;
    await admin.from(TABLE).delete().like("filename", `${CLN_MARK}%`);
    await admin
      .from("matches")
      .delete()
      .like("tournament_name", `${CLN_MARK}%`);
    if (programId) {
      await admin.from("program_members").delete().eq("program_id", programId);
      await admin.from("programs").delete().eq("id", programId);
    }
    await deleteAuthUsers(admin, authUserIds);
  });

  // ── 1. Privilege boundary + arguments ─────────────────────────────────────

  test("anon and authenticated sessions cannot execute any cleanup RPC; malformed arguments are refused", async () => {
    const anon = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = randomUUID();
    const id = randomUUID();
    const calls: [string, Record<string, unknown>][] = [
      [
        "match_video_claim_cleanup",
        { p_worker_token: token, p_lease_seconds: 60, p_limit: 10 },
      ],
      [
        "match_video_confirm_cleanup",
        {
          p_attachment_id: id,
          p_lease_token: token,
          p_expected_version: 0,
          p_collected_final: true,
        },
      ],
      [
        "match_video_fail_cleanup",
        {
          p_attachment_id: id,
          p_lease_token: token,
          p_error: "x",
          p_retry_after_seconds: null,
        },
      ],
    ];
    for (const [fn, args] of calls) {
      for (const [label, client] of [
        ["anon", anon],
        ["authenticated", outsider.client],
      ] as const) {
        const result = (await client.rpc(fn, args)) as unknown as RpcResult;
        expect(result.error?.code, `${label} ${fn}`).toBe(
          INSUFFICIENT_PRIVILEGE,
        );
      }
    }

    expectRefused(
      await claim(token, 0),
      INVALID_PARAMETER,
      "limit must be 1–50",
      "bad_limit",
      "limit 0",
    );
    expectRefused(
      await claim(token, 51),
      INVALID_PARAMETER,
      "limit must be 1–50",
      "bad_limit",
      "limit 51",
    );
    expectRefused(
      await claim(token, 10, 0),
      INVALID_PARAMETER,
      "lease must be 1–3600 seconds",
      "bad_lease_seconds",
    );
    expectRefused(
      await rpc("match_video_claim_cleanup", {
        p_worker_token: null,
        p_lease_seconds: 60,
        p_limit: 10,
      }),
      INVALID_PARAMETER,
      "worker token is required",
      "missing_worker_token",
    );
    expectRefused(
      await fail(id, token, "x", 0),
      INVALID_PARAMETER,
      "retry_after must be 1 second to 7 days",
      "bad_retry_after",
    );
    expectRefused(
      await confirm(randomUUID(), token, 0, true),
      RPC_NOT_FOUND,
      "match_not_found",
      "no_such_attachment",
    );
  });

  // ── 2. Eligibility ────────────────────────────────────────────────────────

  test("eligibility: retired on schedule, orphans and day-idle pending work are claimed and retired; active rows shed staging only; everything still live or parked is left alone", async () => {
    const retiredMatch = await insertMatch(owner.userId, "retired");
    const [m1, m2, m3, m4, mA, mB] = await Promise.all(
      ["p1", "p2", "p3", "p4", "a1", "a2"].map((l) =>
        insertMatch(owner.userId, l),
      ),
    );

    // Retired rows.
    const rDue = await insertRow({
      match_id: retiredMatch,
      ...retiredFields(),
    });
    const rSasLive = await insertRow({
      match_id: retiredMatch,
      ...retiredFields(),
      upload_sas_expires_at: minutes(HOURS),
    });
    const rSasJustExpired = await insertRow({
      match_id: retiredMatch,
      ...retiredFields(),
      upload_sas_expires_at: ago(2),
    });
    const rBackoff = await insertRow({
      match_id: retiredMatch,
      ...retiredFields(),
      cleanup_next_attempt_at: minutes(30),
    });
    const rDone = await insertRow({
      match_id: retiredMatch,
      ...retiredFields(),
      cleaned_up_at: ago(10),
    });
    // A cancel seeds cleanup_next_attempt_at = SAS expiry without the five
    // minutes; the claim must still add them.
    const rSasSixMinutes = await insertRow({
      match_id: retiredMatch,
      ...retiredFields(),
      upload_sas_expires_at: ago(6),
      cleanup_next_attempt_at: ago(6),
    });

    // Pending rows, one per match (one pending per match per uploader).
    const pIdle = await insertRow({
      match_id: m1,
      last_attempt_at: ago(25 * HOURS),
    });
    const pRecent = await insertRow({
      match_id: m2,
      last_attempt_at: ago(23 * HOURS),
    });
    const pFinalizing = await insertRow({
      match_id: m3,
      last_attempt_at: ago(25 * HOURS),
      finalize_lease_token: randomUUID(),
      finalize_lease_until: minutes(5),
    });
    const pSasLive = await insertRow({
      match_id: m4,
      last_attempt_at: ago(25 * HOURS),
      upload_sas_expires_at: minutes(HOURS),
    });

    // Active rows.
    const aShed = await insertRow({ match_id: mA, ...activeFields() });
    const aParked = await insertRow({
      match_id: mB,
      ...activeFields(),
      cleanup_next_attempt_at: "infinity",
    });

    // Orphans: the match is gone.
    const oPending = await insertRow({ match_id: null });
    const oActive = await insertRow({ match_id: null, ...activeFields() });

    const token = randomUUID();
    const claimed = await claimMine(token);
    const got = ids(claimed);

    expect(new Set(got)).toEqual(
      new Set([rDue, rSasSixMinutes, pIdle, aShed, oPending, oActive]),
    );
    for (const id of [
      rSasLive,
      rSasJustExpired,
      rBackoff,
      rDone,
      pRecent,
      pFinalizing,
      pSasLive,
      aParked,
    ]) {
      expect((await row(id)).cleanup_lease_token, id).toBeNull();
    }

    // What each claim says, and what it did to the row.
    for (const id of [rDue, rSasSixMinutes, pIdle, oPending, oActive]) {
      const c = find(claimed, id)!;
      expect(c.state, id).toBe("retired");
      expect(c.collect_staged, id).toBe(true);
      expect(c.collect_final, id).toBe(true);
      const r = await row(id);
      expect(r.state).toBe("retired");
      expect(r.retired_at).not.toBeNull();
      expect(r.cleanup_lease_token).toBe(token);
      expect(Date.parse(r.cleanup_lease_until as string)).toBeGreaterThan(
        Date.now() + 200_000,
      );
      expect(r.finalize_lease_until).toBeNull();
    }
    const shed = find(claimed, aShed)!;
    expect(shed.state).toBe("active");
    expect(shed.collect_staged).toBe(true);
    expect(shed.collect_final).toBe(false);
    expect((await row(aShed)).state).toBe("active");

    // The claim carries what the worker needs, and only keys.
    expect(shed.staged_blob_key).toBe(`${CLN_MARK}/staged/${aShed}.mp4`);
    expect(shed.final_blob_key).toBe(`${CLN_MARK}/final/${aShed}.mp4`);
    expect(shed).toHaveProperty("copy_id");
    expect(shed).toHaveProperty("copy_status");
    expect(shed).toHaveProperty("version");

    // Claimed rows are under lease: a second sweep leaves them alone.
    expect(await claimMine(randomUUID())).toHaveLength(0);
  });

  test("an abandoned publication is handed over with its copy identity so the worker can abort it", async () => {
    const m = await insertMatch(owner.userId, "copy");
    const id = await insertRow({
      match_id: m,
      last_attempt_at: ago(30 * HOURS),
      source_etag: '"0x8DC"',
      copy_id: "copy-abc",
      copy_status: "pending",
      copy_started_at: ago(30 * HOURS),
    });
    const claimed = find(await claimMine(randomUUID()), id)!;
    expect(claimed.copy_id).toBe("copy-abc");
    expect(claimed.copy_status).toBe("pending");
    expect(claimed.state).toBe("retired");
    expect(claimed.collect_final).toBe(true);
  });

  // ── 3. The retained-team-asset rule ───────────────────────────────────────

  test("an active team attachment whose uploader account was deleted sheds only its staged key; its final key is never collectible, while an orphan's is", async () => {
    const teamMatch = await insertMatch(member.userId, "team", {
      program_id: programId,
    });
    const retained = await insertRow({
      match_id: teamMatch,
      uploaded_by: leaver.userId,
      ...activeFields(),
    });
    const orphan = await insertRow({
      match_id: null,
      uploaded_by: owner.userId,
      ...activeFields(),
    });

    // The uploader leaves. The FK nulls; the match and its row stay.
    await deleteAuthUsers(admin, [leaver.userId]);
    authUserIds.splice(authUserIds.indexOf(leaver.userId), 1);
    const afterLeaving = await row(retained);
    expect(afterLeaving.uploaded_by).toBeNull();
    expect(afterLeaving.match_id).toBe(teamMatch);
    expect(afterLeaving.state).toBe("active");

    const token = randomUUID();
    const claimed = await claimMine(token);

    const keep = find(claimed, retained)!;
    expect(keep, "null uploader: claimed for staging only").toBeDefined();
    expect(keep.state).toBe("active");
    expect(keep.collect_staged).toBe(true);
    expect(keep.collect_final).toBe(false);

    const gone = find(claimed, orphan)!;
    expect(gone, "null match: fully collectible").toBeDefined();
    expect(gone.state).toBe("retired");
    expect(gone.collect_final).toBe(true);
    expect((await row(orphan)).state).toBe("retired");

    // A worker that reports the final key of an active row collected is
    // refused — and the row is untouched by the refusal.
    expectRefused(
      await confirm(retained, token, 0, true),
      INVALID_PARAMETER,
      "an active attachment's final key must never be collected",
      "active_final_collected",
    );

    const shed = firstRow(await confirm(retained, token, 0, false));
    expect(shed.outcome).toBe("staged_shed");
    const after = await row(retained);
    expect(after.state).toBe("active");
    expect(after.uploaded_by).toBeNull();
    expect(after.final_blob_key).toBe(`${CLN_MARK}/final/${retained}.mp4`);
    expect(after.cleaned_up_at).toBeNull();
    expect(after.cleanup_next_attempt_at).toBe("infinity");
    expect(after.cleanup_lease_token).toBeNull();

    // Parked: no sweep touches it again while it stays active.
    expect(find(await claimMine(randomUUID()), retained)).toBeUndefined();

    // Until a replacement retires it (activation writes exactly this), at
    // which point the final key is scheduled like any other.
    await setRow(retained, {
      state: "retired",
      retired_at: new Date().toISOString(),
      cleanup_next_attempt_at: new Date().toISOString(),
    });
    const later = find(await claimMine(randomUUID()), retained)!;
    expect(later.state).toBe("retired");
    expect(later.collect_final).toBe(true);
  });

  // ── 4. The fence ──────────────────────────────────────────────────────────

  test("a claimed pending attempt can no longer be renewed, finalized, activated, re-reserved or flipped back", async () => {
    const m = await insertMatch(owner.userId, "fence");
    const requestId = randomUUID();
    const id = await insertRow({
      match_id: m,
      last_attempt_at: ago(25 * HOURS),
      client_request_id: requestId,
    });

    const token = randomUUID();
    const claimed = find(await claimMine(token), id)!;
    expect(claimed.state).toBe("retired");

    expectRefused(
      await renew(m, id),
      RPC_STATE_CONFLICT,
      "mode_conflict",
      "attempt_retired",
      "renew",
    );
    expectRefused(
      await begin(m, id, randomUUID()),
      RPC_STATE_CONFLICT,
      "mode_conflict",
      "attempt_retired",
      "begin_finalization",
    );
    expectRefused(
      await rpc("match_video_activate_attachment", {
        ...actor(owner, m),
        p_attachment_id: id,
        p_lease_token: randomUUID(),
        p_confirmed_video_time_seconds: 10,
        p_verified_size_bytes: 999_000,
        p_verified_content_type: "video/mp4",
        p_verified_duration_seconds: 200,
      }),
      RPC_STATE_CONFLICT,
      "mode_conflict",
      "attempt_retired",
      "activate",
    );
    expectRefused(
      await rpc("match_video_reserve_upload", {
        ...actor(owner, m),
        p_filename: `${CLN_MARK}-${id.slice(0, 8)}.mp4`,
        p_declared_size_bytes: 1_000_000,
        p_declared_content_type: "video/mp4",
        p_client_request_id: requestId,
        p_expected_active_id: null,
        p_expected_active_version: null,
        p_upload_sas_expires_at: minutes(6 * HOURS),
      }),
      RPC_STATE_CONFLICT,
      "pending_attempt_conflict",
      "request_id_retired",
      "reserve replay",
    );
    const flipped = await admin.from(TABLE).update(activeFields()).eq("id", id);
    expect(flipped.error?.code).toBe(RAISE_EXCEPTION);

    const after = await row(id);
    expect(after.state).toBe("retired");
    expect(after.staged_blob_key).toBe(`${CLN_MARK}/staged/${id}.mp4`);
    expect(after.final_blob_key).toBe(`${CLN_MARK}/final/${id}.mp4`);

    // The worker finishes; the row is closed and never offered again.
    expect(firstRow(await confirm(id, token, 0, true)).outcome).toBe(
      "cleaned_up",
    );
    expect((await row(id)).cleaned_up_at).not.toBeNull();
    expect(find(await claimMine(randomUUID()), id)).toBeUndefined();
  });

  // ── 5. Competing transactions ─────────────────────────────────────────────

  test("claim racing begin_finalization on idle pending work: exactly one wins, and the loser sees the winner", async () => {
    const m = await insertMatch(owner.userId, "race-begin");
    const id = await insertRow({
      match_id: m,
      last_attempt_at: ago(25 * HOURS),
    });
    const token = randomUUID();
    const leaseToken = randomUUID();

    const [claimed, began] = await Promise.all([
      claim(token),
      begin(m, id, leaseToken),
    ]);
    const claimedIt = ids(firstRows(claimed)).includes(id);
    const beganOk = began.error === null;
    expect(claimedIt !== beganOk, "exactly one wins").toBe(true);

    const after = await row(id);
    if (claimedIt) {
      expectRefused(
        began,
        RPC_STATE_CONFLICT,
        "mode_conflict",
        "attempt_retired",
        "begin lost",
      );
      expect(after.state).toBe("retired");
      expect(after.finalize_lease_token).toBeNull();
    } else {
      expect(after.state).toBe("pending");
      expect(after.finalize_lease_token).toBe(leaseToken);
      // Under a live finalization lease the row is not collectible.
      expect(find(await claimMine(randomUUID()), id)).toBeUndefined();
    }
  });

  test("claim racing renewal on idle pending work: exactly one wins, and a renewed attempt is no longer idle", async () => {
    const m = await insertMatch(owner.userId, "race-renew");
    const id = await insertRow({
      match_id: m,
      last_attempt_at: ago(25 * HOURS),
    });
    const token = randomUUID();

    const [claimed, renewed] = await Promise.all([claim(token), renew(m, id)]);
    const claimedIt = ids(firstRows(claimed)).includes(id);
    const renewedOk = renewed.error === null;
    expect(claimedIt !== renewedOk, "exactly one wins").toBe(true);

    const after = await row(id);
    if (claimedIt) {
      expectRefused(
        renewed,
        RPC_STATE_CONFLICT,
        "mode_conflict",
        "attempt_retired",
        "renew lost",
      );
      expect(after.state).toBe("retired");
    } else {
      expect(after.state).toBe("pending");
      // Renewal bumped last_attempt_at and issued a live SAS: not collectible.
      expect(find(await claimMine(randomUUID()), id)).toBeUndefined();
    }
  });

  // ── 6. Stale leases and versions ──────────────────────────────────────────

  test("an expired lease, another worker's lease and a changed version all record nothing; only the live holder with the right version settles", async () => {
    const m = await insertMatch(owner.userId, "stale");
    const id = await insertRow({ match_id: m, ...retiredFields() });

    const t1 = randomUUID();
    expect(find(await claimMine(t1), id)).toBeDefined();

    // Lease expired underneath the worker.
    await setRow(id, { cleanup_lease_until: ago(1) });
    expect(firstRow(await confirm(id, t1, 0, true)).outcome).toBe("lease_lost");
    expect(firstRow(await fail(id, t1, "late", null)).outcome).toBe(
      "lease_lost",
    );
    let r = await row(id);
    expect(r.cleaned_up_at).toBeNull();
    expect(r.cleanup_attempts).toBe(0);

    // Another worker takes it; the first token is now someone else's.
    const t2 = randomUUID();
    expect(find(await claimMine(t2), id)).toBeDefined();
    expect(firstRow(await confirm(id, t1, 0, true)).outcome).toBe("lease_lost");
    r = await row(id);
    expect(r.cleanup_lease_token).toBe(t2);
    expect(r.cleaned_up_at).toBeNull();

    // Right holder, wrong version: nothing recorded, lease released.
    expect(firstRow(await confirm(id, t2, 99, true)).outcome).toBe(
      "version_changed",
    );
    r = await row(id);
    expect(r.cleanup_lease_token).toBeNull();
    expect(r.cleaned_up_at).toBeNull();

    // A fresh claim re-evaluates; the right holder closes it.
    const t3 = randomUUID();
    const again = find(await claimMine(t3), id)!;
    expect(again.version).toBe(0);
    const done = firstRow(await confirm(id, t3, 0, true));
    expect(done.outcome).toBe("cleaned_up");
    expect(done.cleaned_up_at).not.toBeNull();
  });

  test("an active row corrected under the worker is version_changed; the next sweep offers the new version", async () => {
    const m = await insertMatch(owner.userId, "version");
    const id = await insertRow({ match_id: m, ...activeFields() });

    const t1 = randomUUID();
    const first = find(await claimMine(t1), id)!;
    expect(first.version).toBe(0);
    expect(first.collect_final).toBe(false);

    // A correction lands (correct_alignment bumps version).
    await setRow(id, { version: 1 });
    expect(firstRow(await confirm(id, t1, 0, false)).outcome).toBe(
      "version_changed",
    );
    let r = await row(id);
    expect(r.state).toBe("active");
    expect(r.cleanup_next_attempt_at).toBeNull();

    const t2 = randomUUID();
    const second = find(await claimMine(t2), id)!;
    expect(second.version).toBe(1);
    expect(firstRow(await confirm(id, t2, 1, false)).outcome).toBe(
      "staged_shed",
    );
    r = await row(id);
    expect(r.state).toBe("active");
    expect(r.cleanup_next_attempt_at).toBe("infinity");
  });

  // ── 7. Retries ────────────────────────────────────────────────────────────

  test("a failed delete retains the keys, counts the failure and backs off; the retry closes the row only when the final key is confirmed gone", async () => {
    const m = await insertMatch(owner.userId, "retry");
    const id = await insertRow({ match_id: m, ...retiredFields() });

    const t1 = randomUUID();
    expect(find(await claimMine(t1), id)).toBeDefined();

    const failed = firstRow(await fail(id, t1, "storage 503", null));
    expect(failed.outcome).toBe("failed");
    expect(failed.cleanup_attempts).toBe(1);
    expect(failed.cleanup_last_error).toBe("storage 503");
    let r = await row(id);
    expect(r.state).toBe("retired");
    expect(r.cleaned_up_at).toBeNull();
    expect(r.cleanup_lease_token).toBeNull();
    expect(r.staged_blob_key).toBe(`${CLN_MARK}/staged/${id}.mp4`);
    expect(r.final_blob_key).toBe(`${CLN_MARK}/final/${id}.mp4`);
    const next = Date.parse(r.cleanup_next_attempt_at as string);
    expect(next).toBeGreaterThan(Date.now() + 9 * 60_000);
    expect(next).toBeLessThan(Date.now() + 11 * 60_000);

    // Backing off: not offered until the schedule says so.
    expect(find(await claimMine(randomUUID()), id)).toBeUndefined();
    await setRow(id, { cleanup_next_attempt_at: ago(1) });

    const t2 = randomUUID();
    const retry = find(await claimMine(t2), id)!;
    expect(retry.cleanup_attempts).toBe(1);
    expect(retry.collect_final).toBe(true);

    const done = firstRow(await confirm(id, t2, 0, true));
    expect(done.outcome).toBe("cleaned_up");
    r = await row(id);
    expect(r.cleaned_up_at).not.toBeNull();
    expect(r.cleanup_last_error).toBeNull();
    expect(r.cleanup_attempts).toBe(1);
    expect(r.final_blob_key).toBe(`${CLN_MARK}/final/${id}.mp4`);
    expect(find(await claimMine(randomUUID()), id)).toBeUndefined();

    // A worker may name its own retry interval.
    const other = await insertRow({ match_id: m, ...retiredFields() });
    const t3 = randomUUID();
    expect(find(await claimMine(t3), other)).toBeDefined();
    const explicit = firstRow(await fail(other, t3, "", 3600));
    expect(explicit.cleanup_last_error).toBe("unknown");
    const at = Date.parse(explicit.cleanup_next_attempt_at as string);
    expect(at).toBeGreaterThan(Date.now() + 59 * 60_000);
    expect(at).toBeLessThan(Date.now() + 61 * 60_000);
  });

  test("a row retired between a staged-only claim and its confirm is rescheduled, not closed", async () => {
    const m = await insertMatch(owner.userId, "mid-sweep");
    const id = await insertRow({ match_id: m, ...activeFields() });

    const t1 = randomUUID();
    const first = find(await claimMine(t1), id)!;
    expect(first.collect_final).toBe(false);

    // A replacement retires it while the worker is deleting staging.
    await setRow(id, {
      state: "retired",
      retired_at: new Date().toISOString(),
      cleanup_next_attempt_at: new Date().toISOString(),
    });
    const settled = firstRow(await confirm(id, t1, 0, false));
    expect(settled.outcome).toBe("rescheduled");
    let r = await row(id);
    expect(r.cleaned_up_at).toBeNull();
    expect(r.cleanup_lease_token).toBeNull();

    const t2 = randomUUID();
    const second = find(await claimMine(t2), id)!;
    expect(second.collect_final).toBe(true);
    expect(firstRow(await confirm(id, t2, 0, true)).outcome).toBe("cleaned_up");
    r = await row(id);
    expect(r.cleaned_up_at).not.toBeNull();
  });

  // ── 8. Batch size and concurrent sweeps ───────────────────────────────────

  test("at most 50 rows per claim, and two concurrent sweeps never share a row", async () => {
    const batch = Array.from({ length: 55 }, () => {
      const id = randomUUID();
      return {
        id,
        match_id: null,
        uploaded_by: owner.userId,
        filename: `${CLN_MARK}-${id.slice(0, 8)}.mp4`,
        declared_size_bytes: 1_000_000,
        declared_content_type: "video/mp4",
        staged_blob_key: `${CLN_MARK}/staged/${id}.mp4`,
        final_blob_key: `${CLN_MARK}/final/${id}.mp4`,
        client_request_id: randomUUID(),
        upload_sas_expires_at: ago(HOURS),
        ...retiredFields(),
      };
    });
    const inserted = await admin.from(TABLE).insert(batch);
    expect(inserted.error).toBeNull();
    const mine = new Set<string>(batch.map((b) => b.id));

    const [a, b] = await Promise.all([
      claim(randomUUID()),
      claim(randomUUID()),
    ]);
    const aIds = ids(firstRows(a));
    const bIds = ids(firstRows(b));
    expect(aIds.length).toBeLessThanOrEqual(50);
    expect(bIds.length).toBeLessThanOrEqual(50);
    expect(aIds.filter((id) => bIds.includes(id))).toEqual([]);

    // Between the two sweeps and any follow-ups, every row of ours is
    // handed out exactly once.
    const seen = [...aIds, ...bIds].filter((id) => mine.has(id));
    for (let i = 0; i < 4 && seen.length < mine.size; i += 1) {
      seen.push(
        ...ids(await claimMine(randomUUID())).filter((id) => mine.has(id)),
      );
    }
    expect(new Set(seen).size).toBe(mine.size);
    expect(seen).toHaveLength(mine.size);
    expect(Math.max(aIds.length, bIds.length)).toBe(50);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * SwingVision Add video T4 · the per-workspace cap + workspace usage
 * `20260924120000_match_video_attachment_cap.sql`
 *
 *  1. Privilege boundary: anon and a signed-in session cannot execute
 *     `match_video_workspace_usage`; nobody through the API — service role
 *     included — can execute the two internal helpers.
 *  2. Reserve: an ADD at the limit is attachment_limit_reached before any row
 *     is written; a REPLACE is never counted; a team counts its program's
 *     matches, a personal workspace its creator's program-less matches, and
 *     neither counts the other's. The limit is a parameter — a null limit is
 *     the pre-cap behaviour, a negative one is malformed.
 *  3. Activate: rechecks adds under the workspace lock. Two pending adds that
 *     both reserved while there was room cannot both go active — sequential
 *     or concurrent, on different matches of one workspace.
 *  4. Usage: one row per active attachment with its match's players and
 *     date, visible to any member, refused to a non-member.
 *
 * The limits used here are small numbers chosen per case: what is under test
 * is that SQL honours whatever `p_active_limit` it is handed, not the values
 * in `MATCH_VIDEO_ACTIVE_LIMIT` (the handler specs pin those).
 * ────────────────────────────────────────────────────────────────────────── */

const { mark: CAP_MARK, password: CAP_PASSWORD } = runMarker("mvcap");

test.describe("match_video_attachments workspace cap + usage RPCs (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient;
  let owner: Session; // personal workspace; also belongs to the program
  let coach: Session; // creates the team matches; program owner
  let player: Session; // program member who uploads nothing
  let outsider: Session; // signed in, member of nothing here

  const authUserIds: string[] = [];
  let programId: string;

  // Personal matches (owner) and team matches (coach, in the program).
  let personalA: string;
  let personalB: string;
  let ownerTeamMatch: string; // owner's upload in the team: never personal
  const teamMatches: string[] = [];

  const CONFIRMED = 10;
  const DURATION = 200;

  const hoursFromNow = (hours: number) =>
    new Date(Date.now() + hours * 3_600_000).toISOString();

  const rpc = (fn: string, args: Record<string, unknown>) =>
    admin.rpc(fn, args) as unknown as Promise<RpcResult>;

  type Scope = { actor: Session; kind: "personal" | "team"; id: string };
  const personalOf = (actor: Session): Scope => ({
    actor,
    kind: "personal",
    id: actor.userId,
  });
  const teamOf = (actor: Session): Scope => ({
    actor,
    kind: "team",
    id: programId,
  });

  const who = (scope: Scope, matchId: string) => ({
    p_actor_id: scope.actor.userId,
    p_workspace_kind: scope.kind,
    p_workspace_id: scope.id,
    p_match_id: matchId,
  });

  const reserve = (
    scope: Scope,
    matchId: string,
    limit: number | null | undefined,
    expected: { id: string; version: number } | null = null,
  ) =>
    rpc("match_video_reserve_upload", {
      ...who(scope, matchId),
      p_filename: `${CAP_MARK}-v.mp4`,
      p_declared_size_bytes: 2_000_000,
      p_declared_content_type: "video/mp4",
      p_client_request_id: randomUUID(),
      p_expected_active_id: expected?.id ?? null,
      p_expected_active_version: expected?.version ?? null,
      p_upload_sas_expires_at: hoursFromNow(6),
      // `undefined` leaves the parameter out entirely: the pre-cap caller.
      ...(limit === undefined ? {} : { p_active_limit: limit }),
    });

  const begin = (
    scope: Scope,
    matchId: string,
    attachmentId: string,
    token: string,
    expected: { id: string; version: number } | null = null,
  ) =>
    rpc("match_video_begin_finalization", {
      ...who(scope, matchId),
      p_attachment_id: attachmentId,
      p_lease_token: token,
      p_lease_seconds: 300,
      p_confirmed_video_time_seconds: CONFIRMED,
      p_expected_active_id: expected?.id ?? null,
      p_expected_active_version: expected?.version ?? null,
    });

  const activate = (
    scope: Scope,
    matchId: string,
    attachmentId: string,
    token: string,
    limit: number | null | undefined,
  ) =>
    rpc("match_video_activate_attachment", {
      ...who(scope, matchId),
      p_attachment_id: attachmentId,
      p_lease_token: token,
      p_confirmed_video_time_seconds: CONFIRMED,
      p_verified_size_bytes: 1_999_000,
      p_verified_content_type: "video/mp4",
      p_verified_duration_seconds: DURATION,
      ...(limit === undefined ? {} : { p_active_limit: limit }),
    });

  /** Reserve and lease an attempt, ready to activate. */
  const prepared = async (
    scope: Scope,
    matchId: string,
    limit: number | null | undefined,
    expected: { id: string; version: number } | null = null,
  ) => {
    const id = firstRow(await reserve(scope, matchId, limit, expected))
      .attachment_id as string;
    const token = randomUUID();
    firstRow(await begin(scope, matchId, id, token, expected));
    return { id, token };
  };

  /** Reserve → lease → activate: the whole add (or replace). */
  const publish = async (
    scope: Scope,
    matchId: string,
    limit: number | null | undefined,
    expected: { id: string; version: number } | null = null,
  ) => {
    const { id, token } = await prepared(scope, matchId, limit, expected);
    firstRow(await activate(scope, matchId, id, token, limit));
    return id;
  };

  const stateOf = async (id: string) => {
    const result = await admin
      .from(TABLE)
      .select("state")
      .eq("id", id)
      .single();
    expect(result.error).toBeNull();
    return result.data!.state as string;
  };

  const rowsOn = async (matchId: string) => {
    const result = await admin
      .from(TABLE)
      .select("id, state")
      .eq("match_id", matchId);
    expect(result.error).toBeNull();
    return result.data!;
  };

  const usage = (actor: Session, kind: "personal" | "team", id: string) =>
    rpc("match_video_workspace_usage", {
      p_actor_id: actor.userId,
      p_workspace_kind: kind,
      p_workspace_id: id,
    });

  const usageRows = async (scope: Scope) => {
    const result = await usage(scope.actor, scope.kind, scope.id);
    expect(result.error).toBeNull();
    return result.data as Record<string, unknown>[];
  };

  const insertMatch = async (
    createdBy: string,
    label: string,
    extra: Record<string, unknown> = {},
  ) => {
    const match = await admin
      .from("matches")
      .insert({
        created_by: createdBy,
        player1_id: createdBy,
        player1_name: `Cap Player ${label}`,
        player2_name: `Cap Opponent ${label}`,
        date: new Date(Date.UTC(2026, 8, 1 + teamMatches.length)).toISOString(),
        tournament_name: `${CAP_MARK}-${label}`,
        source_provider: "swing-vision",
        ...extra,
      })
      .select("id")
      .single();
    if (match.error) throw new Error(`match: ${match.error.message}`);
    const id = match.data.id as string;

    // A minimal alignable timeline, so activation's plan_alignment passes.
    const points = await admin.from("points").insert([
      {
        match_id: id,
        point_number: 1,
        set_number: 1,
        game_number: 1,
        server_is_player1: true,
        won_by_player1: true,
        video_time: 12.345,
        duration: 8.5,
      },
      {
        match_id: id,
        point_number: 2,
        set_number: 1,
        game_number: 1,
        server_is_player1: true,
        won_by_player1: false,
        video_time: 20,
        duration: 5,
      },
    ]);
    if (points.error) throw new Error(`points: ${points.error.message}`);
    return id;
  };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    admin = createAdminClient();

    [owner, coach, player, outsider] = await createLogins(
      admin,
      ["owner", "coach", "player", "outsider"],
      { mark: CAP_MARK, password: CAP_PASSWORD, authUserIds },
    );

    const program = await admin
      .from("programs")
      .insert({
        org_type: "club",
        school_name: `${CAP_MARK} Club`,
        status: "active",
        owner_user_id: coach.userId,
      })
      .select("id")
      .single();
    if (program.error) throw new Error(`program: ${program.error.message}`);
    programId = program.data.id;

    const members = await admin.from("program_members").insert([
      { program_id: programId, user_id: coach.userId, role: "owner" },
      { program_id: programId, user_id: player.userId, role: "player" },
      { program_id: programId, user_id: owner.userId, role: "player" },
    ]);
    if (members.error) throw new Error(`members: ${members.error.message}`);

    personalA = await insertMatch(owner.userId, "personal-a");
    personalB = await insertMatch(owner.userId, "personal-b");
    ownerTeamMatch = await insertMatch(owner.userId, "owner-team", {
      program_id: programId,
    });
    for (let i = 0; i < 4; i++) {
      teamMatches.push(
        await insertMatch(coach.userId, `team-${i}`, {
          program_id: programId,
        }),
      );
    }
  });

  test.afterAll(async () => {
    if (!admin) return;
    await admin.from(TABLE).delete().like("filename", `${CAP_MARK}%`);
    // points cascade from the match.
    await admin
      .from("matches")
      .delete()
      .like("tournament_name", `${CAP_MARK}%`);
    if (programId) {
      await admin.from("program_members").delete().eq("program_id", programId);
      await admin.from("programs").delete().eq("id", programId);
    }
    await deleteAuthUsers(admin, authUserIds);
  });

  // ── 1. Privilege boundary ─────────────────────────────────────────────────

  test("usage is service-role only, and the internal helpers are executable by no API role", async () => {
    const anon = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const usageArgs = {
      p_actor_id: owner.userId,
      p_workspace_kind: "personal",
      p_workspace_id: owner.userId,
    };
    for (const [label, client] of [
      ["anon", anon],
      ["authenticated (owner)", owner.client],
      ["authenticated (outsider)", outsider.client],
    ] as const) {
      const result = (await client.rpc(
        "match_video_workspace_usage",
        usageArgs,
      )) as unknown as RpcResult;
      expect(result.error?.code, `${label} usage`).toBe(INSUFFICIENT_PRIVILEGE);
    }

    const helpers: [string, Record<string, unknown>][] = [
      [
        "match_video_workspace_active_attachments",
        { p_workspace_kind: "personal", p_workspace_id: owner.userId },
      ],
      [
        "match_video_enforce_active_limit",
        {
          p_workspace_kind: "personal",
          p_workspace_id: owner.userId,
          p_active_limit: 1,
          p_lock: false,
        },
      ],
    ];
    for (const [label, client] of [
      ["anon", anon],
      ["authenticated (owner)", owner.client],
      ["service role", admin],
    ] as const) {
      for (const [fn, args] of helpers) {
        const result = (await client.rpc(fn, args)) as unknown as RpcResult;
        expect(result.error?.code, `${label} ${fn}`).toBe(
          INSUFFICIENT_PRIVILEGE,
        );
      }
    }
  });

  // ── 2. Reserve ────────────────────────────────────────────────────────────

  let personalActive: string;

  test("personal: an add at the limit is refused before any row is written; a replace is never counted", async () => {
    const me = personalOf(owner);
    personalActive = await publish(me, personalA, 1);

    expectRefused(
      await reserve(me, personalB, 1),
      RPC_STATE_CONFLICT,
      "attachment_limit_reached",
      "workspace_at_limit",
    );
    expect(await rowsOn(personalB)).toEqual([]);

    // A limit of 2 is a different answer from the same SQL — nothing in it
    // hard-codes the number.
    const roomy = firstRow(await reserve(me, personalB, 2));
    expect(roomy.reused).toBe(false);
    firstRow(
      await rpc("match_video_cancel_upload", {
        ...who(me, personalB),
        p_attachment_id: roomy.attachment_id,
      }),
    );

    // Replace on the match that holds the one video: reserve, lease and
    // activate all pass at limit 1, and the count stays 1.
    const replaced = await publish(me, personalA, 1, {
      id: personalActive,
      version: 0,
    });
    expect(await stateOf(personalActive)).toBe("retired");
    expect(await stateOf(replaced)).toBe("active");
    personalActive = replaced;
    expect(await usageRows(me)).toHaveLength(1);
  });

  test("a team counts its program's matches, a personal workspace its creator's program-less ones — never each other's", async () => {
    // The owner's upload inside the team counts for the TEAM only: with it
    // active, the owner's personal workspace still holds exactly one video
    // (from above) and the team holds one.
    const ownerInTeam = teamOf(owner);
    await publish(ownerInTeam, ownerTeamMatch, 5);
    expect(await usageRows(personalOf(owner))).toHaveLength(1);
    expect(await usageRows(teamOf(coach))).toHaveLength(1);

    // The coach's personal workspace is empty however full the team gets,
    // and the owner's personal video does not count against the team.
    expect(await usageRows(personalOf(coach))).toEqual([]);

    // Team at 1 with limit 1: a coach add is refused; limit 2 lets it in.
    const team = teamOf(coach);
    expectRefused(
      await reserve(team, teamMatches[0], 1),
      RPC_STATE_CONFLICT,
      "attachment_limit_reached",
      "workspace_at_limit",
    );
    expect(await rowsOn(teamMatches[0])).toEqual([]);
    await publish(team, teamMatches[0], 2);
    expect(await usageRows(team)).toHaveLength(2);
  });

  test("a null or omitted limit is the pre-cap behaviour; a negative one is malformed", async () => {
    const team = teamOf(coach);
    // Team is at 2. An omitted parameter (a caller deployed before the cap)
    // and an explicit null both reserve.
    const omitted = firstRow(await reserve(team, teamMatches[1], undefined));
    firstRow(
      await rpc("match_video_cancel_upload", {
        ...who(team, teamMatches[1]),
        p_attachment_id: omitted.attachment_id,
      }),
    );
    const explicitNull = firstRow(await reserve(team, teamMatches[1], null));
    firstRow(
      await rpc("match_video_cancel_upload", {
        ...who(team, teamMatches[1]),
        p_attachment_id: explicitNull.attachment_id,
      }),
    );

    expectRefused(
      await reserve(team, teamMatches[1], -1),
      INVALID_PARAMETER,
      "active limit must not be negative",
      "bad_active_limit",
    );
  });

  // ── 3. Activate rechecks under the workspace lock ─────────────────────────

  test("two pending adds that both reserved with room cannot both go active — sequentially", async () => {
    const team = teamOf(coach);
    // Team at 2, limit 3: both adds reserve (the soft gate sees 2 < 3).
    const first = await prepared(team, teamMatches[1], 3);
    const second = await prepared(team, teamMatches[2], 3);

    firstRow(await activate(team, teamMatches[1], first.id, first.token, 3));
    expectRefused(
      await activate(team, teamMatches[2], second.id, second.token, 3),
      RPC_STATE_CONFLICT,
      "attachment_limit_reached",
      "workspace_at_limit",
    );
    expect(await stateOf(second.id)).toBe("pending");
    expect(await usageRows(team)).toHaveLength(3);

    // A replay of the committed add is never counted, even at the limit.
    const replay = firstRow(
      await activate(team, teamMatches[1], first.id, first.token, 3),
    );
    expect(replay.reused).toBe(true);

    // The refused add still holds its lease; let it go, then cancel.
    firstRow(
      await rpc("match_video_release_finalization", {
        ...who(team, teamMatches[2]),
        p_attachment_id: second.id,
        p_lease_token: second.token,
      }),
    );
    firstRow(
      await rpc("match_video_cancel_upload", {
        ...who(team, teamMatches[2]),
        p_attachment_id: second.id,
      }),
    );
  });

  test("two pending adds on different matches activating at once: exactly one wins", async () => {
    const team = teamOf(coach);
    // Team at 3, limit 4: one seat left, two contenders on different matches
    // — the match lock alone would let both through.
    const a = await prepared(team, teamMatches[2], 4);
    const b = await prepared(team, teamMatches[3], 4);

    const [ra, rb] = await Promise.all([
      activate(team, teamMatches[2], a.id, a.token, 4),
      activate(team, teamMatches[3], b.id, b.token, 4),
    ]);
    const outcomes = [ra, rb];
    expect(outcomes.filter((r) => r.error === null)).toHaveLength(1);
    const loser = outcomes.find((r) => r.error !== null)!;
    expectRefused(
      loser,
      RPC_STATE_CONFLICT,
      "attachment_limit_reached",
      "workspace_at_limit",
      "concurrent loser",
    );
    const states = [await stateOf(a.id), await stateOf(b.id)].sort();
    expect(states).toEqual(["active", "pending"]);
    expect(await usageRows(team)).toHaveLength(4);

    // Replacing at the limit is still allowed.
    const winnerId = ra.error === null ? a.id : b.id;
    const winnerMatch = ra.error === null ? teamMatches[2] : teamMatches[3];
    await publish(team, winnerMatch, 4, { id: winnerId, version: 0 });
    expect(await stateOf(winnerId)).toBe("retired");
    expect(await usageRows(team)).toHaveLength(4);
  });

  // ── 4. Usage ──────────────────────────────────────────────────────────────

  test("usage lists every active attachment with its match's players and date, for any member and no one else", async () => {
    const personal = await usageRows(personalOf(owner));
    expect(personal).toHaveLength(1);
    const match = await admin
      .from("matches")
      .select("player1_name, player2_name, date")
      .eq("id", personalA)
      .single();
    expect(match.error).toBeNull();
    expect(personal[0]).toMatchObject({
      attachment_id: personalActive,
      match_id: personalA,
      uploaded_by: owner.userId,
      verified_size_bytes: 1_999_000,
      player1_name: match.data!.player1_name,
      player2_name: match.data!.player2_name,
    });
    expect(new Date(personal[0].match_date as string).getTime()).toBe(
      new Date(match.data!.date as string).getTime(),
    );
    expect(personal[0].activated_at).not.toBeNull();
    expect(Object.keys(personal[0]).sort()).toEqual([
      "activated_at",
      "attachment_id",
      "match_date",
      "match_id",
      "player1_name",
      "player2_name",
      "uploaded_by",
      "verified_size_bytes",
    ]);

    // Every member sees the same team list — a player who uploaded nothing
    // included — newest activation first.
    const byCoach = await usageRows(teamOf(coach));
    const byPlayer = await usageRows(teamOf(player));
    expect(byPlayer).toEqual(byCoach);
    expect(byCoach).toHaveLength(4);
    const activatedAt = byCoach.map((r) =>
      new Date(r.activated_at as string).getTime(),
    );
    expect(activatedAt).toEqual([...activatedAt].sort((x, y) => y - x));
    expect(new Set(byCoach.map((r) => r.uploaded_by))).toEqual(
      new Set([coach.userId, owner.userId]),
    );

    expectRefused(
      await usage(outsider, "team", programId),
      INSUFFICIENT_PRIVILEGE,
      "workspace_mismatch",
      "not_a_member",
    );
    expectRefused(
      await usage(outsider, "personal", owner.userId),
      INSUFFICIENT_PRIVILEGE,
      "workspace_mismatch",
      "personal_workspace_not_actor",
    );

    // Membership is the program_members row: remove it and the same call is
    // refused.
    const removed = await admin
      .from("program_members")
      .delete()
      .eq("program_id", programId)
      .eq("user_id", player.userId);
    expect(removed.error).toBeNull();
    expectRefused(
      await usage(player, "team", programId),
      INSUFFICIENT_PRIVILEGE,
      "workspace_mismatch",
      "not_a_member",
    );
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * SwingVision Add video T5 · removing an active video
 * `20260924130000_match_video_remove_attachment.sql`
 *
 *  1. Privilege boundary: anon and a signed-in session cannot execute
 *     `match_video_remove_attachment`; `retired_reason` is checked.
 *  2. Who: the row's uploader, or an owner / coach of the match's program.
 *     Staff and players are refused rows they did not upload; a coach of
 *     another program and a stranger are refused; a personal match has no
 *     program lead. None of this goes through the creator-only gate.
 *  3. What: an ACTIVE row is retired with retired_reason = 'removed',
 *     retired_at and cleanup_next_attempt_at = now(); a repeat changes
 *     nothing; a pending attempt is mode_conflict; an attachment on another
 *     match is not found. The freed seat shows in usage.
 *  4. Never the source: the match row, its points (count and content),
 *     shots and match_stats are byte-for-byte what they were.
 * ────────────────────────────────────────────────────────────────────────── */

const { mark: RM_MARK, password: RM_PASSWORD } = runMarker("mvrm");

test.describe("match_video_attachments removal RPC (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient;
  let owner: Session; // program owner
  let coach: Session; // program coach
  let staff: Session; // program staff; uploads to their own match
  let player: Session; // program player; uploads to their own matches
  let teammate: Session; // program player; uploads to their own match
  let otherCoach: Session; // coach of a different program
  let stranger: Session; // member of nothing

  const authUserIds: string[] = [];
  let programId: string;
  let otherProgramId: string;

  let playerMatch: string;
  let playerMatch2: string;
  let teammateMatch: string;
  let staffMatch: string;
  let personalMatch: string; // player's, no program

  const rpc = (fn: string, args: Record<string, unknown>) =>
    admin.rpc(fn, args) as unknown as Promise<RpcResult>;

  type Scope = { actor: Session; kind: "personal" | "team"; id: string };
  const teamOf = (actor: Session): Scope => ({
    actor,
    kind: "team",
    id: programId,
  });
  const personalOf = (actor: Session): Scope => ({
    actor,
    kind: "personal",
    id: actor.userId,
  });
  const who = (scope: Scope, matchId: string) => ({
    p_actor_id: scope.actor.userId,
    p_workspace_kind: scope.kind,
    p_workspace_id: scope.id,
    p_match_id: matchId,
  });

  const CONFIRMED = 10;

  /** Reserve → lease → activate as the match's creator. Returns the row id. */
  const publish = async (scope: Scope, matchId: string) => {
    const reserved = firstRow(
      await rpc("match_video_reserve_upload", {
        ...who(scope, matchId),
        p_filename: `${RM_MARK}-v.mp4`,
        p_declared_size_bytes: 2_000_000,
        p_declared_content_type: "video/mp4",
        p_client_request_id: randomUUID(),
        p_expected_active_id: null,
        p_expected_active_version: null,
        p_upload_sas_expires_at: new Date(
          Date.now() + 6 * 3_600_000,
        ).toISOString(),
      }),
    );
    const id = reserved.attachment_id as string;
    const token = randomUUID();
    firstRow(
      await rpc("match_video_begin_finalization", {
        ...who(scope, matchId),
        p_attachment_id: id,
        p_lease_token: token,
        p_lease_seconds: 300,
        p_confirmed_video_time_seconds: CONFIRMED,
        p_expected_active_id: null,
        p_expected_active_version: null,
      }),
    );
    firstRow(
      await rpc("match_video_activate_attachment", {
        ...who(scope, matchId),
        p_attachment_id: id,
        p_lease_token: token,
        p_confirmed_video_time_seconds: CONFIRMED,
        p_verified_size_bytes: 1_999_000,
        p_verified_content_type: "video/mp4",
        p_verified_duration_seconds: 200,
      }),
    );
    return id;
  };

  const removeAs = (actor: Session, matchId: string, attachmentId: string) =>
    rpc("match_video_remove_attachment", {
      p_actor_id: actor.userId,
      p_match_id: matchId,
      p_attachment_id: attachmentId,
    });

  const rowOf = async (id: string) => {
    const result = await admin
      .from(TABLE)
      .select(
        "state, retired_reason, retired_at, cleanup_next_attempt_at, cleaned_up_at, final_blob_key, staged_blob_key",
      )
      .eq("id", id)
      .single();
    expect(result.error).toBeNull();
    return result.data!;
  };

  const pointCount = async (matchId: string) => {
    const result = await admin
      .from("points")
      .select("id", { count: "exact", head: true })
      .eq("match_id", matchId);
    expect(result.error).toBeNull();
    return result.count;
  };

  /** The imported rows of a match, in a stable order, for a byte-equal check. */
  const importedSnapshot = async (matchId: string) => {
    const match = await admin.from("matches").select("*").eq("id", matchId);
    const points = await admin
      .from("points")
      .select("*")
      .eq("match_id", matchId)
      .order("point_number");
    const shots = await admin
      .from("shots")
      .select("*")
      .in(
        "point_id",
        (points.data ?? []).map((p) => p.id as string),
      )
      .order("id");
    const stats = await admin
      .from("match_stats")
      .select("*")
      .eq("match_id", matchId)
      .order("is_player1");
    for (const r of [match, points, shots, stats]) expect(r.error).toBeNull();
    return {
      match: match.data,
      points: points.data,
      shots: shots.data,
      stats: stats.data,
    };
  };

  const insertMatch = async (
    createdBy: string,
    label: string,
    extra: Record<string, unknown> = {},
  ) => {
    const match = await admin
      .from("matches")
      .insert({
        created_by: createdBy,
        player1_id: createdBy,
        player1_name: `Removal Player ${label}`,
        player2_name: `Removal Opponent ${label}`,
        date: new Date().toISOString(),
        tournament_name: `${RM_MARK}-${label}`,
        source_provider: "swing-vision",
        ...extra,
      })
      .select("id")
      .single();
    if (match.error) throw new Error(`match: ${match.error.message}`);
    const id = match.data.id as string;

    const points = await admin
      .from("points")
      .insert([
        {
          match_id: id,
          point_number: 1,
          set_number: 1,
          game_number: 1,
          server_is_player1: true,
          won_by_player1: true,
          video_time: 12.345,
          duration: 8.5,
        },
        {
          match_id: id,
          point_number: 2,
          set_number: 1,
          game_number: 1,
          server_is_player1: true,
          won_by_player1: false,
          video_time: 20,
          duration: 5,
        },
      ])
      .select("id");
    if (points.error) throw new Error(`points: ${points.error.message}`);

    const shots = await admin.from("shots").insert(
      points.data.map((p, i) => ({
        point_id: p.id,
        shot_number: 1,
        is_player1: true,
        video_time: i === 0 ? 12.5 : 20.2,
        bounce_video_time: null,
      })),
    );
    if (shots.error) throw new Error(`shots: ${shots.error.message}`);
    return id;
  };

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    admin = createAdminClient();

    [owner, coach, staff, player, teammate, otherCoach, stranger] =
      await createLogins(
        admin,
        [
          "owner",
          "coach",
          "staff",
          "player",
          "teammate",
          "other-coach",
          "stranger",
        ],
        { mark: RM_MARK, password: RM_PASSWORD, authUserIds },
      );

    const programs = await admin
      .from("programs")
      .insert([
        {
          org_type: "club",
          school_name: `${RM_MARK} Club`,
          status: "active",
          owner_user_id: owner.userId,
        },
        {
          org_type: "club",
          school_name: `${RM_MARK} Other Club`,
          status: "active",
          owner_user_id: otherCoach.userId,
        },
      ])
      .select("id, school_name");
    if (programs.error) throw new Error(`programs: ${programs.error.message}`);
    programId = programs.data.find((p) => !p.school_name.includes("Other"))!
      .id as string;
    otherProgramId = programs.data.find((p) => p.school_name.includes("Other"))!
      .id as string;

    const members = await admin.from("program_members").insert([
      { program_id: programId, user_id: owner.userId, role: "owner" },
      { program_id: programId, user_id: coach.userId, role: "coach" },
      { program_id: programId, user_id: staff.userId, role: "staff" },
      { program_id: programId, user_id: player.userId, role: "player" },
      { program_id: programId, user_id: teammate.userId, role: "player" },
      { program_id: otherProgramId, user_id: otherCoach.userId, role: "coach" },
    ]);
    if (members.error) throw new Error(`members: ${members.error.message}`);

    const team = { program_id: programId };
    playerMatch = await insertMatch(player.userId, "player", team);
    playerMatch2 = await insertMatch(player.userId, "player-2", team);
    teammateMatch = await insertMatch(teammate.userId, "teammate", team);
    staffMatch = await insertMatch(staff.userId, "staff", team);
    personalMatch = await insertMatch(player.userId, "personal");
  });

  test.afterAll(async () => {
    if (!admin) return;
    await admin.from(TABLE).delete().like("filename", `${RM_MARK}%`);
    // points (and their shots) cascade from the match.
    await admin.from("matches").delete().like("tournament_name", `${RM_MARK}%`);
    for (const id of [programId, otherProgramId]) {
      if (!id) continue;
      await admin.from("program_members").delete().eq("program_id", id);
      await admin.from("programs").delete().eq("id", id);
    }
    await deleteAuthUsers(admin, authUserIds);
  });

  // ── 1. Privilege boundary ─────────────────────────────────────────────────

  test("anon and authenticated sessions cannot execute the removal RPC; retired_reason is checked", async () => {
    const anon = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const args = {
      p_actor_id: player.userId,
      p_match_id: playerMatch,
      p_attachment_id: randomUUID(),
    };
    for (const [label, client] of [
      ["anon", anon],
      ["authenticated (player)", player.client],
      ["authenticated (owner)", owner.client],
    ] as const) {
      const result = (await client.rpc(
        "match_video_remove_attachment",
        args,
      )) as unknown as RpcResult;
      expect(result.error?.code, label).toBe(INSUFFICIENT_PRIVILEGE);
    }

    expectRefused(
      await rpc("match_video_remove_attachment", {
        ...args,
        p_attachment_id: null,
      }),
      INVALID_PARAMETER,
      "actor, match and attachment are required",
      "missing_argument",
    );

    // The column: only the two reasons, and only on a retired row.
    const pending = await admin
      .from(TABLE)
      .insert({
        match_id: playerMatch,
        uploaded_by: player.userId,
        state: "pending",
        filename: `${RM_MARK}-check.mp4`,
        declared_size_bytes: 1_000,
        declared_content_type: "video/mp4",
        staged_blob_key: `${RM_MARK}/staged/${randomUUID()}.mp4`,
        final_blob_key: `${RM_MARK}/final/${randomUUID()}.mp4`,
        client_request_id: randomUUID(),
      })
      .select("id")
      .single();
    expect(pending.error).toBeNull();
    const pendingId = pending.data!.id as string;

    const onPending = await admin
      .from(TABLE)
      .update({ retired_reason: "removed" })
      .eq("id", pendingId);
    expect(onPending.error?.code).toBe(CHECK_VIOLATION);

    const bogus = await admin
      .from(TABLE)
      .update({
        state: "retired",
        retired_at: new Date().toISOString(),
        retired_reason: "replaced",
      })
      .eq("id", pendingId);
    expect(bogus.error?.code).toBe(CHECK_VIOLATION);

    await admin.from(TABLE).delete().eq("id", pendingId);
  });

  // ── 2–4. Who, what, and never the source ─────────────────────────────────

  let playerVideo: string;
  let teammateVideo: string;
  let staffVideo: string;
  let personalVideo: string;

  test("staff, players, a coach of another program and a stranger are refused rows they did not upload", async () => {
    playerVideo = await publish(teamOf(player), playerMatch);
    teammateVideo = await publish(teamOf(teammate), teammateMatch);
    staffVideo = await publish(teamOf(staff), staffMatch);
    personalVideo = await publish(personalOf(player), personalMatch);

    for (const [label, actor, matchId, id] of [
      ["player → teammate's", player, teammateMatch, teammateVideo],
      ["staff → player's", staff, playerMatch, playerVideo],
      ["player → staff's", player, staffMatch, staffVideo],
      ["other coach → player's", otherCoach, playerMatch, playerVideo],
      ["stranger → player's", stranger, playerMatch, playerVideo],
      // A personal match has no program lead: the team's owner is nobody here.
      ["owner → player's personal", owner, personalMatch, personalVideo],
      ["coach → player's personal", coach, personalMatch, personalVideo],
    ] as const) {
      expectRefused(
        await removeAs(actor, matchId, id),
        INSUFFICIENT_PRIVILEGE,
        "forbidden",
        "not_uploader_or_program_lead",
        label,
      );
    }
    for (const id of [playerVideo, teammateVideo, staffVideo, personalVideo]) {
      expect((await rowOf(id)).state).toBe("active");
    }
  });

  test("the uploader removes their own video: retired as 'removed', due for cleanup now, and the source rows are untouched", async () => {
    const before = await importedSnapshot(playerMatch);
    const pointsBefore = await pointCount(playerMatch);
    expect(pointsBefore).toBe(2);
    expect(before.shots).toHaveLength(2);
    const keysBefore = await rowOf(playerVideo);

    const startedAt = Date.now();
    const removed = firstRow(await removeAs(player, playerMatch, playerVideo));
    expect(removed).toEqual({
      attachment_id: playerVideo,
      state: "retired",
      retired_reason: "removed",
    });

    const row = await rowOf(playerVideo);
    expect(row.state).toBe("retired");
    expect(row.retired_reason).toBe("removed");
    expect(row.retired_at).not.toBeNull();
    expect(row.cleanup_next_attempt_at).toBe(row.retired_at);
    // now(), give or take clock skew between the runner and the database.
    expect(
      Math.abs(new Date(row.retired_at as string).getTime() - startedAt),
    ).toBeLessThan(60_000);
    expect(row.cleaned_up_at).toBeNull();
    // The keys stay for the worker.
    expect(row.final_blob_key).toBe(keysBefore.final_blob_key);
    expect(row.staged_blob_key).toBe(keysBefore.staged_blob_key);

    expect(await pointCount(playerMatch)).toBe(pointsBefore);
    expect(await importedSnapshot(playerMatch)).toEqual(before);
  });

  test("running it again does no harm: same answer, nothing moves", async () => {
    const before = await rowOf(playerVideo);
    const again = firstRow(await removeAs(player, playerMatch, playerVideo));
    expect(again).toEqual({
      attachment_id: playerVideo,
      state: "retired",
      retired_reason: "removed",
    });
    expect(await rowOf(playerVideo)).toEqual(before);

    // A row retired some other way (replacement) keeps its NULL reason.
    const first = await publish(teamOf(player), playerMatch2);
    const replacement = await (async () => {
      const scope = teamOf(player);
      const reserved = firstRow(
        await rpc("match_video_reserve_upload", {
          ...who(scope, playerMatch2),
          p_filename: `${RM_MARK}-v2.mp4`,
          p_declared_size_bytes: 2_000_000,
          p_declared_content_type: "video/mp4",
          p_client_request_id: randomUUID(),
          p_expected_active_id: first,
          p_expected_active_version: 0,
          p_upload_sas_expires_at: new Date(
            Date.now() + 6 * 3_600_000,
          ).toISOString(),
        }),
      );
      const id = reserved.attachment_id as string;
      const token = randomUUID();
      firstRow(
        await rpc("match_video_begin_finalization", {
          ...who(scope, playerMatch2),
          p_attachment_id: id,
          p_lease_token: token,
          p_lease_seconds: 300,
          p_confirmed_video_time_seconds: CONFIRMED,
          p_expected_active_id: first,
          p_expected_active_version: 0,
        }),
      );
      firstRow(
        await rpc("match_video_activate_attachment", {
          ...who(scope, playerMatch2),
          p_attachment_id: id,
          p_lease_token: token,
          p_confirmed_video_time_seconds: CONFIRMED,
          p_verified_size_bytes: 1_999_000,
          p_verified_content_type: "video/mp4",
          p_verified_duration_seconds: 200,
        }),
      );
      return id;
    })();
    const replaced = await rowOf(first);
    expect(replaced.state).toBe("retired");
    expect(firstRow(await removeAs(player, playerMatch2, first))).toEqual({
      attachment_id: first,
      state: "retired",
      retired_reason: null,
    });
    expect(await rowOf(first)).toEqual(replaced);
    expect((await rowOf(replacement)).state).toBe("active");
  });

  test("a team coach and the owner remove anyone's video; staff remove their own", async () => {
    expect(
      firstRow(await removeAs(coach, teammateMatch, teammateVideo)),
    ).toMatchObject({ state: "retired", retired_reason: "removed" });

    const replacement = await publish(teamOf(teammate), teammateMatch);
    expect(
      firstRow(await removeAs(owner, teammateMatch, replacement)),
    ).toMatchObject({ state: "retired", retired_reason: "removed" });

    expect(
      firstRow(await removeAs(staff, staffMatch, staffVideo)),
    ).toMatchObject({ state: "retired", retired_reason: "removed" });

    // Personal: only the uploader.
    expect(
      firstRow(await removeAs(player, personalMatch, personalVideo)),
    ).toMatchObject({ state: "retired", retired_reason: "removed" });
  });

  test("a pending attempt is mode_conflict; an attachment on another match or an unknown match is not found", async () => {
    const scope = teamOf(teammate);
    const reserved = firstRow(
      await rpc("match_video_reserve_upload", {
        ...who(scope, teammateMatch),
        p_filename: `${RM_MARK}-pending.mp4`,
        p_declared_size_bytes: 2_000_000,
        p_declared_content_type: "video/mp4",
        p_client_request_id: randomUUID(),
        p_expected_active_id: null,
        p_expected_active_version: null,
        p_upload_sas_expires_at: new Date(
          Date.now() + 6 * 3_600_000,
        ).toISOString(),
      }),
    );
    const pendingId = reserved.attachment_id as string;

    expectRefused(
      await removeAs(teammate, teammateMatch, pendingId),
      RPC_STATE_CONFLICT,
      "mode_conflict",
      "attachment_pending",
    );
    expect((await rowOf(pendingId)).state).toBe("pending");

    expectRefused(
      await removeAs(coach, playerMatch, pendingId),
      RPC_NOT_FOUND,
      "match_not_found",
      "no_such_attachment",
    );
    expectRefused(
      await removeAs(coach, randomUUID(), pendingId),
      RPC_NOT_FOUND,
      "match_not_found",
      "no_such_match",
    );

    firstRow(
      await rpc("match_video_cancel_upload", {
        ...who(scope, teammateMatch),
        p_attachment_id: pendingId,
      }),
    );
  });

  test("a removed video frees its seat in the workspace's usage", async () => {
    const usage = await rpc("match_video_workspace_usage", {
      p_actor_id: coach.userId,
      p_workspace_kind: "team",
      p_workspace_id: programId,
    });
    expect(usage.error).toBeNull();
    const ids = (usage.data as Record<string, unknown>[]).map(
      (r) => r.attachment_id,
    );
    for (const removed of [playerVideo, teammateVideo, staffVideo]) {
      expect(ids).not.toContain(removed);
    }
  });
});
