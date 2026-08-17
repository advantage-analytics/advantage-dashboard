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
 */
export default function FindProgramPage() {
  return (
    <ClaimShell
      step="Step 2 of 2"
      heading="Find your program"
      sub="Men's and women's teams are set up separately."
    >
      <ProgramSearch />
    </ClaimShell>
  );
}
