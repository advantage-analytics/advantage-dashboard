import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchPrograms, redactForPlayer } from "@/lib/data/programs-server";

/**
 * Typeahead for the claim flow's program search.
 *
 * PUBLIC on purpose — screens F2 and F3 run before an account exists, so
 * requiring auth here would invert the flow. Nothing it returns is sensitive:
 * school, squad, division, conference and whether the program is already taken
 * are published facts, and the owner comes back as "D. Wu" with no address.
 * Contact addresses live in a table `anon` cannot read at all.
 *
 * `?intent=join` narrows that further. A coach is searching for their own
 * program and needs to know who already has it; a player is searching for a
 * program they do not belong to, and design 4.1 is explicit that "On Advantage"
 * is the only status they may see. So the join intent gets a redacted row —
 * built server-side, here, because a component that merely declines to RENDER
 * the owner still ships the name to the browser in the JSON.
 *
 * Not rate limited. There is no rate-limiting layer in this project yet, and
 * inventing one for a single route would be worse than saying so: the exposure
 * is a directory of 1,940 programs that anyone can also read off the ITA
 * website, and the query is capped at 20 rows out of a 1.3 MB table.
 */
export async function GET(req: NextRequest) {
  const term = req.nextUrl.searchParams.get("q") ?? "";

  // Two characters is the floor the SQL enforces too; returning early saves a
  // round trip on the first keystroke of every search.
  if (term.trim().length < 2) {
    return NextResponse.json({ results: [] });
  }

  const supabase = await createClient();
  const results = await searchPrograms(supabase, term);

  // Anything that is not exactly "join" is the coach intent, which is the
  // existing behaviour unchanged. Fail towards the redacted shape only on an
  // explicit request for it, so a typo in the parameter cannot quietly strip
  // the column F3's result list is built around.
  const joining = req.nextUrl.searchParams.get("intent") === "join";
  const body = joining ? results.map(redactForPlayer) : results;

  return NextResponse.json(
    { results: body },
    {
      // The directory changes when the scrape is re-seeded, not between
      // keystrokes. Shared, not per-user: one coach's "mer", "meri", "merid"
      // are three URLs and three cache keys, so what this absorbs is the same
      // short term typed by everyone — which is also the term that costs most.
      //
      // `intent` is part of the URL and therefore part of the cache key, so the
      // full and the redacted answer to the same term can never be served for
      // each other.
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
    }
  );
}
