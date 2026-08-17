import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchPrograms } from "@/lib/data/programs-server";

/**
 * Typeahead for the claim flow's program search.
 *
 * PUBLIC on purpose — screens F2 and F3 run before an account exists, so
 * requiring auth here would invert the flow. Nothing it returns is sensitive:
 * school, squad, division, conference and whether the program is already taken
 * are published facts, and the owner comes back as "D. Wu" with no address.
 * Contact addresses live in a table `anon` cannot read at all.
 *
 * Not rate limited. There is no rate-limiting layer in this project yet, and
 * inventing one for a single route would be worse than saying so: the exposure
 * is a directory of 1,940 programs that anyone can also read off the ITA
 * website, and the query is index-served and capped at 20 rows.
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

  return NextResponse.json(
    { results },
    {
      // The directory changes when the scrape is re-seeded, not between
      // keystrokes. A short shared cache absorbs the repeated prefixes every
      // typeahead produces ("mer", "meri", "merid").
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
    }
  );
}
