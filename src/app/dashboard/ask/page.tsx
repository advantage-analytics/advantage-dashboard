import { ComingSoonPage } from "@/components/dashboard/coming-soon";

export default function AskPage() {
  return (
    <ComingSoonPage
      title="Ask"
      heading="Ask questions about your matches."
      description="Put a question to the matches already in your account: how a second serve held up under pressure, or what changed between sets."
      action={{ label: "View your matches", href: "/dashboard/matches" }}
    />
  );
}
