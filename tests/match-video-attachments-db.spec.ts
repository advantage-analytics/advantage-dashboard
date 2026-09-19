import { randomUUID } from "node:crypto";

import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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
