import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Beta gate: every PATCH forces private = true until we surface the toggle.
const BETA_FORCE_PRIVATE = true;

type MatchScoreShape = {
  player1: number[];
  player2: number[];
  player1_tiebreaks?: (number | null)[];
  player2_tiebreaks?: (number | null)[];
  winner?: "player1" | "player2" | null;
};

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function badRequest(error: string, field?: string) {
  return NextResponse.json({ error, ...(field ? { field } : {}) }, { status: 400 });
}

function isFiniteNonNegInt(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && Number.isInteger(n);
}

function validateScore(value: unknown): MatchScoreShape | string {
  if (!value || typeof value !== "object") return "score must be an object";
  const v = value as Record<string, unknown>;
  if (!Array.isArray(v.player1) || !Array.isArray(v.player2)) {
    return "score.player1 and score.player2 must be arrays";
  }
  if (v.player1.length !== v.player2.length) {
    return "score.player1 and score.player2 must have equal length";
  }
  if (v.player1.length === 0) return "score must contain at least one set";
  if (v.player1.length > 7) return "score cannot have more than 7 sets";
  if (!v.player1.every(isFiniteNonNegInt) || !v.player2.every(isFiniteNonNegInt)) {
    return "score games must be non-negative integers";
  }

  const p1Tb = v.player1_tiebreaks;
  const p2Tb = v.player2_tiebreaks;
  const normTb = (arr: unknown): (number | null)[] | string => {
    if (arr === undefined || arr === null) return [];
    if (!Array.isArray(arr)) return "tiebreaks must be an array";
    return arr.map((x) => (x === null || x === undefined || x === "" ? null : Number(x))) as (number | null)[];
  };
  const tb1 = normTb(p1Tb);
  const tb2 = normTb(p2Tb);
  if (typeof tb1 === "string") return tb1;
  if (typeof tb2 === "string") return tb2;

  let p1Sets = 0;
  let p2Sets = 0;
  for (let i = 0; i < v.player1.length; i++) {
    const a = v.player1[i] as number;
    const b = v.player2[i] as number;
    if (a > b) p1Sets++;
    else if (b > a) p2Sets++;
  }
  const winner: "player1" | "player2" | null =
    p1Sets === p2Sets ? null : p1Sets > p2Sets ? "player1" : "player2";

  return {
    player1: v.player1 as number[],
    player2: v.player2 as number[],
    player1_tiebreaks: tb1,
    player2_tiebreaks: tb2,
    winner,
  };
}

function trimOrNull(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? null : t;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const { matchId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const { data, error } = await supabase
    .from("matches")
    .select(
      "id, tournament_name, round, date, match_type, court_type, player1_name, player2_name, score, private"
    )
    .eq("id", matchId)
    .eq("created_by", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ match: data });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const { matchId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }

  const update: Record<string, unknown> = {};

  for (const key of ["tournament_name", "round", "match_type", "court_type", "player1_name", "player2_name"] as const) {
    if (key in body) {
      const v = trimOrNull(body[key]);
      if (v !== undefined) update[key] = v;
    }
  }

  if ("player1_name" in update && update.player1_name === null) {
    return badRequest("Player 1 name is required.", "player1_name");
  }
  if ("player2_name" in update && update.player2_name === null) {
    return badRequest("Player 2 name is required.", "player2_name");
  }

  if ("date" in body) {
    const raw = body.date;
    if (typeof raw !== "string" || raw.trim() === "") {
      return badRequest("Date is required.", "date");
    }
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return badRequest("Date is invalid.", "date");
    update.date = d.toISOString();
  }

  if ("score" in body) {
    const parsed = validateScore(body.score);
    if (typeof parsed === "string") return badRequest(parsed, "score");
    update.score = parsed;
    update.result = parsed.winner === "player1" ? "win" : parsed.winner === "player2" ? "loss" : null;
  }

  if (BETA_FORCE_PRIVATE) update.private = true;

  if (Object.keys(update).length === 0) {
    return badRequest("No fields to update");
  }

  const { data, error } = await supabase
    .from("matches")
    .update(update)
    .eq("id", matchId)
    .eq("created_by", user.id)
    .select(
      "id, tournament_name, round, date, match_type, court_type, player1_name, player2_name, score, private"
    )
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/matches");
  revalidatePath(`/dashboard/matches/${matchId}`);

  return NextResponse.json({ match: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const { matchId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const { data: existing, error: lookupError } = await supabase
    .from("matches")
    .select("id")
    .eq("id", matchId)
    .eq("created_by", user.id)
    .maybeSingle();

  if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const { data: files } = await supabase
      .from("match_files")
      .select("storage_path, storage_bucket")
      .eq("match_id", matchId);

    if (files && files.length > 0) {
      const byBucket = new Map<string, string[]>();
      for (const f of files) {
        const bucket = (f.storage_bucket as string | null) ?? "match-data";
        const path = f.storage_path as string | null;
        if (!path) continue;
        const arr = byBucket.get(bucket) ?? [];
        arr.push(path);
        byBucket.set(bucket, arr);
      }
      for (const [bucket, paths] of byBucket) {
        const { error: storageError } = await supabase.storage.from(bucket).remove(paths);
        if (storageError) {
          console.error(`[match delete] storage cleanup failed for ${bucket}:`, storageError.message);
        }
      }
    }
  } catch (err) {
    console.error("[match delete] storage cleanup threw:", err);
  }

  const { error: deleteError } = await supabase
    .from("matches")
    .delete()
    .eq("id", matchId)
    .eq("created_by", user.id);

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/matches");

  return NextResponse.json({ ok: true });
}
