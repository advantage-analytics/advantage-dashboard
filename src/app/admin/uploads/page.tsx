import { ComingSoonPage } from "@/components/dashboard/coming-soon";

export const metadata = { title: "Uploads" };

export default function AdminUploadsPage() {
  return (
    <ComingSoonPage
      title="Uploads"
      heading="Upload oversight is coming soon"
      description="A cross-team view of match processing — what's in flight, what failed, what it cost — isn't built yet."
      action={{ label: "Back to teams", href: "/admin/teams" }}
    />
  );
}
