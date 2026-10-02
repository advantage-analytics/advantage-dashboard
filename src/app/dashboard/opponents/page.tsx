import { ComingSoonPage } from "@/components/dashboard/coming-soon";

export const metadata = { title: "Opponents" };

/**
 * Who this program plays, and who it is about to — not finalised, so the page
 * says so rather than showing a half-answer.
 *
 * The loaders it will need are live and stay in `opponents-server.ts`:
 * `getConferenceTable` is a seeded directory of 1,940 programs and is never
 * empty, and `getOpponentsPlayed` already has an honest empty state. The UI
 * that read them is gone because nothing about its shape was settled; the data
 * layer outlives it.
 *
 * The stub answers before any team gate, so a personal workspace sees "coming
 * soon" rather than being bounced to /dashboard — the nav offers this entry in
 * both workspaces, and a nav item that silently redirects reads as a broken
 * link rather than an unfinished feature.
 */
export default function OpponentsPage() {
  return (
    <ComingSoonPage
      title="Opponents"
      heading="Opponent scouting is still being built."
      description="Who your program plays and who it is about to — a conference directory, and every lineup and result an opponent has shared, before you meet them."
      action={{ label: "View matches", href: "/dashboard/matches" }}
    />
  );
}
