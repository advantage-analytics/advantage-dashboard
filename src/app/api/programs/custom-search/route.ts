import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { searchCustomPrograms } from "@/lib/data/programs-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Typeahead over existing custom orgs, for a coach about to create one.
 *
 * A separate route rather than `?kind=` on `/api/programs/search`, because
 * that route is anonymous, publicly cached and filtered to college at the SQL
 * layer — each of those on purpose. Custom orgs are private workspaces
 * (migration 20260830050000), and this route publishes three facts about them
 * to SIGNED-IN users only: name, type and the owner's first name with a
 * surname initial. That is the minimum a second coach at "Centennial" needs
 * to recognise the team a colleague already made, instead of creating a
 * duplicate. `search_custom_programs` projects nothing else and is not
 * granted to `anon`, so the 401 below is the first gate, not the only one.
 *
 * The search runs through the caller's own cookie client — never the admin
 * client — so the database's grant is what decides, not this file.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: PRIVATE_HEADERS },
    );
  }

  const term = req.nextUrl.searchParams.get("q") ?? "";
  const type = req.nextUrl.searchParams.get("type");

  // Two characters is the floor the SQL enforces too; returning early saves a
  // round trip on the first keystroke of every search.
  if (term.trim().length < 2) {
    return NextResponse.json({ results: [] }, { headers: PRIVATE_HEADERS });
  }

  const results = await searchCustomPrograms(supabase, term, type);
  return NextResponse.json({ results }, { headers: PRIVATE_HEADERS });
}

/**
 * Per-user and never stored: unlike the college directory, what this answers
 * depends on WHO is asking (a session, or nothing), and the rows name private
 * clubs. Sharing a cached answer between users would hand one coach's result
 * page to the next anonymous request for the same term.
 */
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" } as const;
