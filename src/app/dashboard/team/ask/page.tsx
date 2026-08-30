import { ComingSoonPage } from "@/components/dashboard/coming-soon";

export const metadata = { title: "Ask" };

export default function TeamAskPage() {
  return (
    <ComingSoonPage
      title="Ask"
      heading="Ask questions about your program's matches"
      description="Put a question to your program's match data — how a lineup's second serve held up under pressure, where a pattern broke down across the roster, what changed between rounds. The answers will draw on every match your program has already logged."
      action={{ label: "View program matches", href: "/dashboard/matches" }}
    />
  );
}
