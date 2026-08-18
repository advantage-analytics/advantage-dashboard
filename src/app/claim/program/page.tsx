import { ClaimShell } from "@/components/claim/claim-shell";
import { ProgramSearch } from "@/components/claim/program-search";

export const metadata = { title: "Find your program" };

/**
 * F3 — find your program.
 *
 * Men's and women's are separate rows because they are separate workspaces with
 * separate budgets, and the search has to make that obvious before someone
 * picks one. All 1,940 teams are in the directory across every division, so the
 * "isn't listed" path is now the rare case the design wanted it to be.
 *
 * `intent` carries the answer from F2 through to what picking a row does. A
 * coach is setting the program up; a player is asking to be added to one, and
 * must not be routed at the "Set up this program" action.
 */
export default async function FindProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  const { intent } = await searchParams;
  const joining = intent === "join";

  return (
    <ClaimShell
      step="Step 2 of 2"
      heading={joining ? "Which program do you play for?" : "Find your program"}
      sub={
        joining
          ? "We'll ask whoever runs it to add you. Men's and women's teams are separate."
          : "Men's and women's teams are set up separately."
      }
    >
      <ProgramSearch intent={joining ? "join" : "claim"} />
    </ClaimShell>
  );
}
