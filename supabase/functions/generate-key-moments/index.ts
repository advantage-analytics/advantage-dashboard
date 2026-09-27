// supabase/functions/generate-key-moments/index.ts
//
// Retrieved from the live project pouxujkhtbvkdwbzfvka on 2026-09-26 with the
// Supabase MCP `get_edge_function` (deployed version 22, verify_jwt = true).
// Until then this function existed only as a deployment and had never been
// committed here; the first commit of this file is that fetch byte for byte,
// and the caller check (`authorizeCaller`, `callerOwnsMatch` and the two
// guards at the top of the handler) is the one change made on top of it.
// process-match is its only caller: it invokes this function with
// `{ match_id }` from its service-role client once the stats are written,
// and generate-insights after that.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

function refuse(status: number, error: string): Response {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: JSON_HEADERS,
  });
}

type Caller = { kind: "service" } | { kind: "user"; userId: string };

/**
 * Who is calling. `verify_jwt` only proves the bearer is *a* JWT signed for
 * this project — the public anon key passes it — so the function checks for
 * itself. Two callers are legitimate: the project's own service role (the
 * bearer equals SUPABASE_SERVICE_ROLE_KEY) and a signed-in user, whose access
 * token is what `supabase.functions.invoke` sends from `/api/upload`. A user
 * token is verified with `auth.getUser` on an anon client; anything else is
 * answered 401. Whether that user may touch the match is decided afterwards,
 * against `matches.created_by`.
 *
 * Meant to be the same helper in every edge function here — copy it verbatim
 * rather than adapting it.
 */
async function authorizeCaller(
  req: Request,
): Promise<{ caller: Caller } | { status: 401; error: string }> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.replace(/^bearer\s+/i, "").trim();
  if (!token) {
    return { status: 401, error: "Missing bearer token" };
  }
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRoleKey && token === serviceRoleKey) {
    return { caller: { kind: "service" } };
  }
  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data, error } = await anon.auth.getUser(token);
  if (error || !data?.user) {
    return { status: 401, error: "Invalid or expired token" };
  }
  return { caller: { kind: "user", userId: data.user.id } };
}

/**
 * Whether `caller` may (re)write this match's key moments. The service role
 * may — it is what `process-match`'s chained invoke sends. A user must be the
 * match's uploader; a match that cannot be read, or has no uploader, is
 * refused the same way, so the answer never says whether a match id exists.
 * Same body as generate-insights' copy.
 */
async function callerOwnsMatch(
  supabase: ReturnType<typeof createClient>,
  caller: Caller,
  matchId: string,
): Promise<boolean> {
  if (caller.kind === "service") return true;
  const { data: match, error } = await supabase
    .from("matches")
    .select("created_by")
    .eq("id", matchId)
    .single();
  if (error || !match?.created_by) return false;
  return match.created_by === caller.userId;
}

Deno.serve(async (req: Request) => {
  try {
    // The caller is verified before the body is trusted for anything: the RPC
    // and the write below run under the service role, so without this any
    // anon-key call could rewrite `matches.key_moments` for any match id.
    const auth = await authorizeCaller(req);
    if ("status" in auth) {
      return refuse(auth.status, auth.error);
    }
    const { caller } = auth;

    const { match_id } = await req.json();
    console.log(`📌 Generating key moments for match_id: ${match_id}`);

    if (!match_id) {
      throw new Error("match_id is required in the request body");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (!(await callerOwnsMatch(supabase, caller, match_id))) {
      return refuse(403, "You do not have access to this match");
    }

    const { data: keyMoments, error: rpcError } = await supabase.rpc(
      "key_moments",
      {
        // Key Moments 2.0 function
        target_match_id: match_id,
      },
    );

    if (rpcError) throw rpcError;

    const keyMomentsJson = (keyMoments || []).reduce((acc: any[], row: any) => {
      let momentObj = null;

      // Get result and format it
      const resultStr = row.out_result_type
        ? row.out_result_type.toLowerCase()
        : "shot";
      let resultType = "";
      if (row.out_won_by_player1) {
        resultType = resultStr.includes("error") ? "via opponent's" : "with a";
      } else {
        resultType = resultStr.includes("error") ? "with a" : "via opponent's";
      }

      // Parse game score for break context
      const [serverGames, receiverGames] = row.out_game_score
        .split("-")
        .map(Number);
      const isLateBreak = serverGames >= 5;
      const isBreakBack = serverGames > receiverGames;

      // Condition 1: Strong Finish
      if (row.out_is_set_point === true && row.out_winning_streak >= 3) {
        momentObj = {
          moment: "Strong Finish",
          description:
            row.out_is_match_point === true
              ? `Won the final ${row.out_winning_streak} games to close out the match`
              : `Won the last ${row.out_winning_streak} games of set ${row.out_set_number}`,
        };
      }
      // Condition 2: Clutch Hold
      else if (
        row.out_is_break_point === true &&
        row.out_server_is_player1 === true &&
        row.out_won_by_player1 === true &&
        row.out_break_point_opportunities >= 2
      ) {
        momentObj = {
          moment: "Clutch Hold",
          description: `Saved ${row.out_break_point_opportunities} break points in Set ${row.out_set_number}, Game ${row.out_game_number}`,
        };
      }

      // Condition 3: Clutch Break
      else if (
        row.out_is_break_point === true &&
        row.out_server_is_player1 === false &&
        row.out_won_by_player1 === true &&
        (isLateBreak || isBreakBack)
      ) {
        let clutchDescription = "";
        let clutchMomentName = "Clutch Break";

        if (isLateBreak && isBreakBack) {
          clutchMomentName = "Clutch Break Back";
          clutchDescription = `Broke back in Set ${row.out_set_number}, Game ${row.out_game_number} to stay in it`;
        } else if (isBreakBack) {
          clutchMomentName = "Break Back";
          clutchDescription = `Closed the gap in Set ${row.out_set_number}, Game ${row.out_game_number}`;
        } else if (isLateBreak) {
          clutchDescription = `Took the lead in Set ${row.out_set_number}, Game ${row.out_game_number}`;
        }

        momentObj = {
          moment: clutchMomentName,
          description: clutchDescription,
        };
      }

      // Condition 4: Missed Opportunity
      else if (
        row.out_server_is_player1 === false &&
        row.out_won_by_player1 === false &&
        row.out_break_point_opportunities >= 3
      ) {
        momentObj = {
          moment: "Missed Opportunity",
          description: `No conversion with ${row.out_break_point_opportunities} break point opportunities in Set ${row.out_set_number}, Game ${row.out_game_number}`,
        };
      }

      // Condition 5: Momentum Shift
      else if (row.out_rally_length >= 10) {
        // Check if the number sounds like it starts with a vowel (11, 18, or 8x)
        const article =
          row.out_rally_length === 11 ||
          row.out_rally_length === 18 ||
          row.out_rally_length.toString().startsWith("8")
            ? "an"
            : "a";

        momentObj = {
          moment: "Momentum Shift",
          description: row.out_won_by_player1
            ? `Won ${article} ${row.out_rally_length} shot rally ${resultType} ${resultStr}`
            : `Lost ${article} ${row.out_rally_length} shot rally ${resultType} ${resultStr}`,
        };
      }

      // Condition 6: Generic Break Point
      else if (row.out_is_break_point === true) {
        momentObj = {
          moment: `Break in Set ${row.out_set_number}, Game ${row.out_game_number}`,
          description:
            row.out_won_by_player1 === true
              ? `Converted break point ${resultType} ${resultStr}`
              : `Got broken ${resultType} ${resultStr}`,
        };
      }

      // Condition 7: If a condition was met, push it to our array. Otherwise, it skips the row.out_
      if (momentObj !== null) {
        acc.push(momentObj);
      }

      return acc;
    }, []);

    console.log(`✅ Generated ${keyMomentsJson.length} moments to insert.`);

    // 5. Update the match_stats table
    console.log("💾 Updating matches table with JSONB array...");
    const { error: updateError } = await supabase
      .from("matches")
      .update({ key_moments: keyMomentsJson })
      .eq("id", match_id);

    if (updateError) throw updateError;

    console.log("🎉 Successfully updated matches!");

    return new Response(
      JSON.stringify({ success: true, updated_data: keyMomentsJson }),
      { headers: { "Content-Type": "application/json" }, status: 200 },
    );
  } catch (err: any) {
    console.error("🔥 FATAL ERROR:", err);
    return new Response(
      JSON.stringify({ error: err.message || JSON.stringify(err) }),
      { headers: { "Content-Type": "application/json" }, status: 500 },
    );
  }
});
