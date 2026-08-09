import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { S3Client, DeleteObjectsCommand } from "npm:@aws-sdk/client-s3@^3.600.0";

/**
 * Delete a match's source video(s) from R2.
 *
 * Lives here rather than in the Next.js delete route because this is where the
 * R2 write credentials already are. Putting them in Vercel too would duplicate
 * the credential surface for one call, and the app has no S3 client at all.
 *
 * MUST be called BEFORE the match row is deleted. `video_object_key` lives on
 * `processing_jobs`, which cascades away with the match — delete first and the
 * key is gone, leaving an object in R2 that nothing can even name.
 *
 * Auth mirrors upload-video-r2: an Authorization header, the real user resolved
 * from it, and the match's `created_by` checked. Nobody deletes anyone else's
 * video.
 */

interface DeleteVideoRequest {
  matchId: string;
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new ConfigError(name);
  return value;
}

class ConfigError extends Error {
  constructor(public readonly variable: string) {
    super(`${variable} is not set`);
    this.name = "ConfigError";
  }
}

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ success: false, error: "Missing Authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return json({ success: false, error: "Unauthorized user" }, 401);
    }

    const { matchId }: DeleteVideoRequest = await req.json();
    if (!matchId) {
      return json({ success: false, error: "matchId is required" }, 400);
    }

    const dbClient = supabaseServiceKey
      ? createClient(supabaseUrl, supabaseServiceKey)
      : userClient;

    const { data: match, error: matchError } = await dbClient
      .from("matches")
      .select("id, created_by")
      .eq("id", matchId)
      .single();

    if (matchError || !match || match.created_by !== user.id) {
      return json({ success: false, error: "Match not found or unauthorized" }, 403);
    }

    // Every job for this match, not just the newest: a match resubmitted after
    // a failed upload can have several, and each may have put bytes in R2.
    const { data: jobs } = await dbClient
      .from("processing_jobs")
      .select("video_object_key")
      .eq("match_id", matchId)
      .not("video_object_key", "is", null);

    const keys = [
      ...new Set(
        (jobs ?? [])
          .map((j: { video_object_key: string | null }) => j.video_object_key)
          .filter((k): k is string => Boolean(k))
      ),
    ];

    if (keys.length === 0) {
      // Nothing was ever uploaded. Not an error — most matches are imports.
      return json({ success: true, deleted: [], reason: "no video objects" }, 200);
    }

    const accountId = requireEnv("R2_ACCOUNT_ID");
    const s3 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      forcePathStyle: true,
      credentials: {
        accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
      },
      // R2 rejects the CRC32 checksum headers the SDK adds by default.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });

    const result = await s3.send(
      new DeleteObjectsCommand({
        Bucket: requireEnv("R2_BUCKET_VIDEOS"),
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: false },
      })
    );

    // R2 reports per-object outcomes; a key that was already gone is a success,
    // since the desired end state is "not there".
    const errors = result.Errors ?? [];
    if (errors.length > 0) {
      console.error("❌ some R2 deletes failed", { matchId, errors });
    }

    console.log(`✅ deleted ${result.Deleted?.length ?? 0}/${keys.length} R2 object(s) for match ${matchId}`);

    return json(
      {
        success: errors.length === 0,
        deleted: (result.Deleted ?? []).map((d) => d.Key),
        errors: errors.map((e) => ({ key: e.Key, message: e.Message })),
      },
      200
    );
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(
        `❌ delete-video-r2 is misconfigured: ${err.variable} is not set.`
      );
      return json({ success: false, error: "Video deletion is not configured." }, 503);
    }

    console.error("❌ Error in delete-video-r2 Edge Function:", err);
    return json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Internal Server Error",
      },
      500
    );
  }
});
