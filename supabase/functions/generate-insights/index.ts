// supabase/functions/generate-insights/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const GEMINI_API_KEY = Deno.env.get("GEMINI_KEY");
/**
 * gemini-2.5-flash is closed to new Google Cloud projects ("limiting access to
 * the 2.5 models to users who have actively used them in the past"), so the
 * paid key moved in 2026-09-28 was refused with a 404. 3.5 Flash replaced
 * 3.5 Flash-Lite on 2026-09-29 after a 16-match side-by-side (better
 * headlines, no wrong figures); it takes ~14 s a call against ~3 s.
 */
const GEMINI_MODEL = "gemini-3.5-flash";

/**
 * The video webhook waits this long on the function (`INSIGHTS_CAP_MS` in
 * `src/lib/services/splitstep/request-insights.ts`). A rejected first answer
 * is asked for again only while a whole second call still fits inside it —
 * the slowest Flash call seen was 18.6 s — and that call is cut off at
 * `DB_WRITE_MARGIN_MS` before the wait ends, keeping the first answer. The
 * caller's clock starts before this one does (the network hop, a cold boot),
 * so `CALLER_HEAD_START_MS` is taken off the wait up front.
 */
const WEBHOOK_WAIT_MS = 35_000;
const CALLER_HEAD_START_MS = 3_000;
const RETRY_NEEDS_MS = 20_000;
const DB_WRITE_MARGIN_MS = 1_500;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const POSTHOG_PROJECT_TOKEN = Deno.env.get("POSTHOG_PROJECT_TOKEN");
const POSTHOG_HOST = Deno.env.get("POSTHOG_HOST");

/**
 * Gemini's transient refusals — 429 rate limit, 500, 503 "high demand" — used
 * to end the review for good: every caller swallows this function's failure and
 * nothing asks again, so the match simply never got one. Two more tries with
 * backoff ride out a spike. Any other status is the request's own fault and is
 * returned at once.
 *
 * Kept short on purpose: `deriveAndPublish` caps its wait on this function, so
 * backing off past that cap would only finish after nobody is waiting.
 */
const RETRY_STATUSES = new Set([429, 500, 503]);
const RETRY_DELAYS_MS = [1500, 4000];

async function fetchWithRetry(
  url: string,
  init: RequestInit,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const delay = RETRY_DELAYS_MS[attempt];
    try {
      const response = await fetch(url, init);
      if (!RETRY_STATUSES.has(response.status) || delay === undefined) {
        return response;
      }
      console.warn(
        `Gemini returned ${response.status}; retrying (attempt ${attempt + 2})`,
      );
      await response.body?.cancel();
    } catch (err) {
      // A deliberately cut-off call is over; backing off would only waste
      // the time the cut-off was saving.
      if (delay === undefined || init.signal?.aborted) throw err;
      console.warn(
        `Gemini request threw; retrying (attempt ${attempt + 2}):`,
        err instanceof Error ? err.message : String(err),
      );
    }
    await new Promise((r) => setTimeout(r, delay + Math.random() * 500));
  }
}

/**
 * Analytics only — nothing here may fail or stall the review. Every step,
 * trace id included, sits inside the try, and PostHog gets three seconds.
 */
async function captureGeminiGeneration({
  userId,
  latency,
}: {
  userId?: string;
  latency: number;
}): Promise<void> {
  if (!POSTHOG_PROJECT_TOKEN || !POSTHOG_HOST || !userId) return;

  try {
    const traceId = crypto.randomUUID();
    const response = await fetch(new URL("/i/v0/e/", POSTHOG_HOST).toString(), {
      method: "POST",
      signal: AbortSignal.timeout(3000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: POSTHOG_PROJECT_TOKEN,
        event: "$ai_generation",
        properties: {
          distinct_id: userId,
          $ai_trace_id: traceId,
          $ai_session_id: null,
          $ai_span_name: "generate_match_insights",
          $ai_model: GEMINI_MODEL,
          $ai_provider: "gemini",
          // No $ai_input / $ai_output_choices: the prompt and reply carry
          // player first names and stats, so only usage is recorded — the
          // same privacy mode the app's LLM adapter uses.
          $ai_latency: latency,
          $ai_temperature: 0.4,
          $ai_http_status: 200,
        },
      }),
    });

    if (!response.ok) {
      console.warn("PostHog AI generation capture failed:", response.status);
    }
  } catch (error) {
    console.warn("PostHog AI generation capture threw:", error);
  }
}

/**
 * The match report's insight card shows a summary's first sentence as its
 * headline and the rest as the description beneath it
 * (`src/components/dashboard/matches/match-detail/insight-text.ts`). The
 * model writes the two as separate fields and `summary` is composed from
 * them, so every reader of `summary` keeps working and the card's split
 * lands exactly on the headline.
 */
const HEADLINE_MAX_CHARS = 90;
const SUMMARY_MAX_CHARS = 350;

const PLAYER_KEYS = ["player1", "player2"] as const;

/**
 * Words whose period the card's splitter reads as an abbreviation's, so a
 * headline ending on one never splits from its description. A copy of
 * `ABBREVIATIONS` in `insight-text.ts`, which this function cannot import.
 */
const ABBREVIATIONS = new Set([
  "vs",
  "v",
  "mr",
  "mrs",
  "ms",
  "dr",
  "st",
  "jr",
  "sr",
  "approx",
  "etc",
]);

/** A headline's last word, when the splitter would take its period as an abbreviation's. */
function endsOnAbbreviation(headline: string): boolean {
  const word = (/(\S+)\.$/.exec(headline)?.[1] ?? "").replace(/^[("'“‘]+/, "");
  return (
    /^[A-Za-z]$/.test(word) ||
    /^(?:[A-Za-z]\.)+[A-Za-z]$/.test(word) ||
    ABBREVIATIONS.has(word.toLowerCase().replace(/\./g, ""))
  );
}

/**
 * The prompt's voice rules, checked: no coach "we" (lowercase "us", so "US
 * Open" is not caught) and never the prompt's own Player 1 / Player 2 labels.
 */
const COACH_VOICE = /\b(?:[Ww]e|us|[Oo]ur|[Ll]et['’]s)\b/;
const PLAYER_LABEL = /\bplayer\s*[12]\b/i;

type PlayerSummary = {
  focus?: string;
  headline?: string;
  description?: string;
  summary?: string;
};

/**
 * What stops one player's headline and description from reading as the
 * card's two lines, or null. A headline must be one sentence the card's
 * splitter ends at: closing punctuation, no sentence break inside it, and a
 * description that opens with a capital (the splitter's boundary is
 * `[.!?]` + whitespace + capital). Stricter than the splitter, which also
 * forgives abbreviations — a stray "J. Smith" only costs a retry.
 */
function playerSummaryProblem(
  player: PlayerSummary | undefined,
): string | null {
  const headline = player?.headline?.trim() ?? "";
  const description = player?.description?.trim() ?? "";
  if (!headline || !description) return "a headline or description is missing";
  if (headline.length > HEADLINE_MAX_CHARS) {
    return `a headline is ${headline.length} characters, over ${HEADLINE_MAX_CHARS}`;
  }
  if (/\d/.test(headline)) return "a headline quotes a figure";
  if (!/[.!?]$/.test(headline)) return "a headline does not end its sentence";
  if (/[.!?]\s+[A-Z]/.test(headline))
    return "a headline is more than one sentence";
  if (endsOnAbbreviation(headline)) {
    return "a headline ends on an abbreviation or initial";
  }
  if (!/^[A-Z]/.test(description)) {
    return "a description does not start a new sentence";
  }
  if (description.length <= headline.length) {
    return "a description is not longer than its headline";
  }
  const text = `${headline} ${description}`;
  if (text.length > SUMMARY_MAX_CHARS) {
    return `a summary is ${text.length} characters, over ${SUMMARY_MAX_CHARS}`;
  }
  if (PLAYER_LABEL.test(text)) return 'a summary says "Player 1" or "Player 2"';
  if (COACH_VOICE.test(text)) return 'a summary speaks as "we"';
  return null;
}

function summaryProblems(insights: Record<string, PlayerSummary>): string[] {
  const problems: string[] = [];
  for (const key of PLAYER_KEYS) {
    const problem = playerSummaryProblem(insights?.[key]);
    if (problem) problems.push(`${key}: ${problem}`);
  }
  return problems;
}

/**
 * Per player, the retry's answer only where it fixed what the first answer
 * got wrong. A player the first answer already got right keeps it, and a
 * retry that is no better never replaces it.
 */
function keepBetter(
  first: Record<string, PlayerSummary>,
  retried: Record<string, PlayerSummary>,
): Record<string, PlayerSummary> {
  const kept = { ...first };
  for (const key of PLAYER_KEYS) {
    if (
      playerSummaryProblem(first?.[key]) !== null &&
      playerSummaryProblem(retried?.[key]) === null
    ) {
      kept[key] = retried[key];
    }
  }
  return kept;
}

/**
 * A summary still naming "Player 1" or "Player 2" after everything is not
 * saved: the viewer may be either player, so the label can point at them or
 * at their opponent, and no summary reads better than a wrong-seeming one.
 * The card shows its empty state; strengths and weaknesses are kept.
 */
function dropLabelledSummaries(insights: Record<string, PlayerSummary>) {
  for (const key of PLAYER_KEYS) {
    const player = insights?.[key];
    if (!player) continue;
    if (
      PLAYER_LABEL.test(`${player.headline ?? ""} ${player.description ?? ""}`)
    ) {
      console.warn(`${key}: summary still says Player 1/2; not saving it`);
      delete player.focus;
      delete player.headline;
      delete player.description;
      delete player.summary;
    }
  }
}

/** Writes each player's `summary` as headline + description. */
function composeSummaries(insights: Record<string, PlayerSummary>) {
  for (const key of PLAYER_KEYS) {
    const player = insights?.[key];
    if (!player) continue;
    const parts = [player.headline, player.description]
      .map((part) => part?.trim())
      .filter(Boolean);
    if (parts.length > 0) player.summary = parts.join(" ");
  }
}

/** One Gemini call: the parsed JSON answer, or a thrown error. */
async function generateInsights(
  url: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<Record<string, PlayerSummary>> {
  const geminiResponse = await fetchWithRetry(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  const geminiData = await geminiResponse.json();

  // 👇 ADDED: Check if Google returned an API error
  if (!geminiResponse.ok) {
    console.error(
      "GEMINI API ERROR Payload:",
      JSON.stringify(geminiData, null, 2),
    );
    throw new Error(
      `Gemini API failed: ${geminiData.error?.message || "Unknown error"}`,
    );
  }

  // 👇 ADDED: Safety check just in case the response is weirdly formatted
  if (!geminiData.candidates || geminiData.candidates.length === 0) {
    console.error(
      "UNEXPECTED GEMINI RESPONSE:",
      JSON.stringify(geminiData, null, 2),
    );
    throw new Error("Gemini API returned an empty or malformed response.");
  }

  return JSON.parse(geminiData.candidates[0].content.parts[0].text);
}

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
 * Whether `caller` may (re)write this match's review. The service role may —
 * it is what `process-match`'s chained invoke and the video webhook's
 * `requestMatchInsights` send. A user must be the match's uploader; a match
 * that cannot be read, or has no uploader, is refused the same way, so the
 * answer never says whether a match id exists.
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

serve(async (req) => {
  const requestStartedAt = Date.now();
  try {
    // The caller is verified before the body is trusted for anything: the
    // write below runs under the service role, so without this any anon-key
    // call could overwrite `matches.insights` for any match id.
    const auth = await authorizeCaller(req);
    if ("status" in auth) {
      return refuse(auth.status, auth.error);
    }
    const { caller } = auth;

    // 1. We only need the matchId now
    const { matchId } = await req.json();

    if (!matchId) {
      return new Response(JSON.stringify({ error: "matchId is required" }), {
        status: 400,
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (!(await callerOwnsMatch(supabase, caller, matchId))) {
      return refuse(403, "You do not have access to this match");
    }

    // 2. Query your View to get stats for the entire match
    const { data: matchStats, error: viewError } = await supabase
      .from("match_stats_with_percentages")
      .select("*")
      .eq("match_id", matchId);

    if (viewError || !matchStats || matchStats.length === 0) {
      throw new Error(`Failed to fetch stats from view: ${viewError?.message}`);
    }

    // 3. Separate the players based on the boolean
    const player1Stats = matchStats.find((stat) => stat.is_player1 === true);
    const player2Stats = matchStats.find((stat) => stat.is_player1 === false);

    // 3b. Comparison context (uploading user = player1, matching getPlayerAverageStats):
    // the player's career averages over PRIOR matches + their immediately previous match,
    // so the LLM can frame this match against them. Best-effort — any failure just omits it.
    let comparisonContext = "";
    // Who PostHog attributes the generation to: the account that filed the
    // match, read from the row rather than taken from the request body — any
    // caller can reach this function, and a body field would let one attribute
    // a generation to someone else. `player1_id` is not a substitute; it may be
    // a program_players id rather than an account.
    let uploaderId: string | undefined;
    try {
      const { data: matchRow } = await supabase
        .from("matches")
        .select("player1_id, date, program_id, created_by")
        .eq("id", matchId)
        .single();

      uploaderId = matchRow?.created_by ?? undefined;
      const userId = matchRow?.player1_id;
      const matchDate = matchRow?.date;

      if (userId && matchDate && matchRow.program_id !== undefined) {
        let historyQuery = supabase
          .from("matches")
          .select("id, date")
          .eq("player1_id", userId)
          .lt("date", matchDate);

        // This client bypasses RLS. History must stay in the match's own
        // workspace so a team report never reveals personal/other-team stats.
        historyQuery =
          matchRow.program_id === null
            ? historyQuery.is("program_id", null)
            : historyQuery.eq("program_id", matchRow.program_id);
        const { data: priorMatches } = await historyQuery.order("date", {
          ascending: false,
        });

        if (priorMatches && priorMatches.length > 0) {
          const priorIds = priorMatches.map((m) => m.id);
          const prevMatchId = priorMatches[0].id;

          const AVG_FIELDS = [
            "first_serve_pct",
            "first_serve_won_pct",
            "second_serve_won_pct",
            "service_games_won_pct",
            "break_points_converted_pct",
            "first_return_won_pct",
            "return_games_won_pct",
            "winners",
            "unforced_errors",
            "aces",
            "double_faults",
          ];

          const { data: priorRows } = await supabase
            .from("match_stats_with_percentages")
            .select(["match_id", ...AVG_FIELDS].join(", "))
            .in("match_id", priorIds)
            .eq("is_player1", true);

          if (priorRows && priorRows.length > 0) {
            const averages: Record<string, number | null> = {};
            for (const field of AVG_FIELDS) {
              const vals = priorRows
                .map((r) => Number(r[field] ?? 0))
                .filter((v) => !isNaN(v));
              averages[field] = vals.length
                ? Math.round(
                    (vals.reduce((a, b) => a + b, 0) / vals.length) * 10,
                  ) / 10
                : null;
            }
            const prevRow =
              priorRows.find((r) => r.match_id === prevMatchId) ?? null;

            if (priorRows.length === 1) {
              // Only one prior match: the "average" IS that match, so present a single
              // reference to avoid the model double-stating it or implying a long history.
              comparisonContext = `

      Player 1 comparison context (use ONLY for Player 1's headline and description):
      - This is only the player's 2nd recorded match. Their single prior match (their baseline AND previous match): ${JSON.stringify(prevRow ?? averages)}
      In Player 1's description, briefly note whether they improved or regressed since that previous match — qualitatively: do not print the prior-match or average figures (this match's own percentages are still quoted as above). Do NOT imply an established trend or long history from a single prior match.`;
            } else {
              comparisonContext = `

      Player 1 comparison context (use ONLY for Player 1's headline and description):
      - Typical averages across ${priorRows.length} prior matches: ${JSON.stringify(averages)}
      - Immediately previous match: ${prevRow ? JSON.stringify(prevRow) : "unavailable"}
      In Player 1's description, frame THIS match against their typical averages AND their previous match (above/below their usual level; improved or regressed since last time) — qualitatively: do not print the prior-match or average figures (this match's own percentages are still quoted as above).`;
            }
          }
        }
      }
    } catch (_err) {
      // Comparison is best-effort; on any failure fall back to match-only context.
      comparisonContext = "";
    }

    // 4. Define the strict JSON schema for BOTH players
    const insightItemSchema = {
      type: "OBJECT",
      properties: {
        name: { type: "STRING" },
        description: { type: "STRING" },
        value: { type: "INTEGER" },
      },
      required: ["name", "description", "value"],
    };

    // The summary arrives as its parts, in the order the model writes them:
    // the subject first, so the headline and description are both written
    // about something already named. `summary` is composed from them below.
    const playerInsightsSchema = {
      type: "OBJECT",
      properties: {
        focus: { type: "STRING" },
        headline: { type: "STRING" },
        description: { type: "STRING" },
        strengths: { type: "ARRAY", items: insightItemSchema },
        weaknesses: { type: "ARRAY", items: insightItemSchema },
      },
      required: ["focus", "headline", "description", "strengths", "weaknesses"],
      propertyOrdering: [
        "focus",
        "headline",
        "description",
        "strengths",
        "weaknesses",
      ],
    };

    const responseSchema = {
      type: "OBJECT",
      properties: {
        player1: playerInsightsSchema,
        player2: playerInsightsSchema,
      },
      required: ["player1", "player2"],
    };

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    // 5. Build the prompt asking for insights on both players
    const prompt = `
      You are an expert college tennis coach. Analyze the following match statistics and provide, for BOTH Player 1 and Player 2:
      - 3 key strengths and 3 areas to improve (weaknesses). The 'value' should be the relevant percentage (0-100) associated with that specific stat.
      - a 'focus': the one part of their game this match's summary is about, named as the statistic (e.g. "second-serve points won"). Choose it first; the headline and description are both about it and nothing else.
      - a 'headline': one sentence, under ${HEADLINE_MAX_CHARS} characters, with no figures, speaking directly to the player: the single most important takeaway from this match about the focus, in plain words.
      - a 'description': exactly two sentences, longer than the headline and under ${SUMMARY_MAX_CHARS} characters together with it. Quote the one or two percentages from THIS match that prove the headline inline, rounded to the nearest whole number and written as digits with a percent sign (e.g. 73.5 becomes "you won 74% of first-serve points"), then, in the second sentence, say what to work on to build on it or fix it. Stay on the focus: no second topic, and no closing "but" that turns to another part of their game. Do not greet them, do not use markdown headers or bullet points, and do not list stats one after another — weave those figures into a flowing observation.

      Crucially, contextualize their performances against each other. If Player 1 dominated at the net, factor that into Player 2's weaknesses.
      Keep everything encouraging and actionable for college athletes.
      Speak to each player as "you"; never write "we", "us", "our" or "let's" — there is no coach speaking. Call the other player "your opponent", never "Player 1" or "Player 2".

      Player 1 Stats: ${JSON.stringify(player1Stats || { note: "Stats unavailable" })}
      Player 2 Stats: ${JSON.stringify(player2Stats || { note: "Stats unavailable" })}${comparisonContext}
    `;

    const generationStartedAt = Date.now();
    const request = (text: string) => ({
      contents: [{ role: "user", parts: [{ text }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: 0.4,
      },
    });
    // 6. Call Gemini, and once more if a headline breaks the card's rules
    let insightsJSON = await generateInsights(geminiUrl, request(prompt));
    let problems = summaryProblems(insightsJSON);
    const remainingMs =
      WEBHOOK_WAIT_MS - CALLER_HEAD_START_MS - (Date.now() - requestStartedAt);
    if (problems.length > 0 && remainingMs >= RETRY_NEEDS_MS) {
      console.warn("Summary rejected, asking again:", problems.join("; "));
      try {
        const retried = await generateInsights(
          geminiUrl,
          request(`${prompt}
      A previous answer was rejected because ${problems.join("; ")}. Follow the headline and description rules exactly.`),
          AbortSignal.timeout(remainingMs - DB_WRITE_MARGIN_MS),
        );
        insightsJSON = keepBetter(insightsJSON, retried);
        problems = summaryProblems(insightsJSON);
      } catch (err) {
        // The first answer is still usable; a failed or cut-off retry must
        // not cost the match its summary.
        console.warn(
          "Retry failed; keeping the first answer:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
    if (problems.length > 0) {
      // Kept anyway (no time for a retry, or the retry was off too): a
      // summary that breaks a rule still beats none, and the card falls back
      // to splitting it at its first sentence.
      console.warn("Summary kept despite:", problems.join("; "));
    }
    await captureGeminiGeneration({
      userId: uploaderId,
      latency: (Date.now() - generationStartedAt) / 1000,
    });
    dropLabelledSummaries(insightsJSON);
    composeSummaries(insightsJSON);

    // 7. Update the 'matches' table directly
    // Assuming the primary key in your 'matches' table is 'id'
    const { error: dbError } = await supabase
      .from("matches")
      .update({ insights: insightsJSON })
      .eq("id", matchId);

    if (dbError) throw dbError;

    return new Response(
      JSON.stringify({ success: true, insights: insightsJSON }),
      {
        headers: { "Content-Type": "application/json" },
        status: 200,
      },
    );
  } catch (error) {
    console.error(
      "CRITICAL ERROR IN GENERATE-INSIGHTS:",
      error.message,
      error.stack,
    );

    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
