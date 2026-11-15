import { OutreachPageSkeleton } from "@/components/admin/outreach-page-content";

/**
 * Admin › Outreach reads the recipients, sends, templates and the programs
 * they point at before it draws. This draws the page's frame on the default
 * email, in Recipients mode.
 */
export default function AdminOutreachLoading() {
  return <OutreachPageSkeleton />;
}
