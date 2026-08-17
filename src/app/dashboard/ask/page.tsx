import { ComingSoonPage } from "@/components/dashboard/coming-soon";

export default function AskPage() {
  return (
    <ComingSoonPage
      title="Ask"
      heading="Ask questions about your matches"
      description="Put a question to your own match data — how a second serve held up under pressure, where a pattern broke down, what changed between sets. The answers draw on the matches already in your account."
      action={{ label: "View your matches", href: "/dashboard/matches" }}
    />
  );
}
