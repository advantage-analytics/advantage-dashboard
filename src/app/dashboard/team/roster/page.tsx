import { ComingSoonPage } from "@/components/dashboard/coming-soon";

export default function RosterPage() {
  return (
    <ComingSoonPage
      title="Roster"
      heading="Everyone on the program"
      description="Players and staff, who can send video, and how much of the program's monthly allowance each has used. The owner invites people and sets those permissions here."
      showHelp={false}
    />
  );
}
