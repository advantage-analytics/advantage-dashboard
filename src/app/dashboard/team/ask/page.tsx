import { ComingSoonPage } from "@/components/dashboard/coming-soon";

export const metadata = { title: "Ask" };

export default function TeamAskPage() {
  return (
    <ComingSoonPage
      title="Ask"
      heading="Ask about your program's matches."
      description="Put a question to your program's match data — how a lineup held up under pressure, or where a pattern broke down across the roster. The answers will draw on every match the program has logged."
      action={{ label: "View program matches", href: "/dashboard/matches" }}
    />
  );
}
