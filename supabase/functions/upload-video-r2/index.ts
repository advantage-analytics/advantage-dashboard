import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3@^3.600.0";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@^3.600.0";

interface UploadVideoRequest {
  matchId: string;
  fileName: string;
  contentType?: string;
}

Deno.serve(async (req: Request) => {
  console.log("🚀 Edge Function 'upload-video-r2' invoked");

  // CORS headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing Authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase Client with caller token & Service Role key fallback
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      console.error("Auth error in upload-video-r2:", userError);
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized user" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { matchId, fileName, contentType = "video/mp4" }: UploadVideoRequest = await req.json();

    if (!matchId || !fileName) {
      return new Response(
        JSON.stringify({ success: false, error: "matchId and fileName are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Query matches table using Service Role client to bypass RLS timing issues
    const dbClient = supabaseServiceKey
      ? createClient(supabaseUrl, supabaseServiceKey)
      : userClient;

    const { data: match, error: matchError } = await dbClient
      .from("matches")
      .select("id, created_by")
      .eq("id", matchId)
      .single();

    if (matchError || !match || match.created_by !== user.id) {
      console.error("Match verification failed:", { matchError, match, userId: user.id });
      return new Response(
        JSON.stringify({
          success: false,
          error: matchError ? matchError.message : "Match not found or unauthorized",
        }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cloudflare R2 Credentials & Configuration
    const r2AccountId = Deno.env.get("R2_ACCOUNT_ID") || "filler_account_id";
    const r2AccessKeyId = Deno.env.get("R2_ACCESS_KEY_ID") || "filler_access_key_id";
    const r2SecretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY") || "filler_secret_access_key";
    const bucketName = Deno.env.get("R2_BUCKET_VIDEOS") || "advantage-videos";

    const r2Endpoint = `https://${r2AccountId}.r2.cloudflarestorage.com`;

    const s3Client = new S3Client({
      region: "auto",
      endpoint: r2Endpoint,
      forcePathStyle: true,
      credentials: {
        accessKeyId: r2AccessKeyId,
        secretAccessKey: r2SecretAccessKey,
      },
    });

    const extMatch = fileName.match(/\.([a-zA-Z0-9]+)$/);
    const ext = extMatch ? extMatch[1].toLowerCase() : "mp4";
    const videoObjectKey = `videos/${user.id}/${matchId}/original.${ext}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: videoObjectKey,
    });

    // 1-hour presigned URL for upload
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    console.log(`✅ Generated presigned R2 upload URL for ${videoObjectKey}`);

    return new Response(
      JSON.stringify({
        success: true,
        uploadUrl,
        videoObjectKey,
        bucket: bucketName,
        expiresInSeconds: 3600,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("❌ Error in upload-video-r2 Edge Function:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : "Internal Server Error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
