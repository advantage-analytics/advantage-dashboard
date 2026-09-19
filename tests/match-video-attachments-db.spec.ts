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
 * SwingVision video attachment plan — table and privilege boundary only; the
 * reservation and activation RPCs are T3/T4 and have their own specs).
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
