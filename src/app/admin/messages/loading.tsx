import { MessagesPageSkeleton } from "@/components/admin/messages-page-content";

/**
 * Admin › Messages reads every support thread with the service role before
 * it draws a row. This draws the page's frame on "Waiting on you".
 */
export default function AdminMessagesLoading() {
  return <MessagesPageSkeleton />;
}
