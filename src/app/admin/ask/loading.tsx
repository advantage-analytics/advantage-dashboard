import { AskFeedbackPageSkeleton } from "@/components/admin/ask-feedback-page-content";

/**
 * Admin › Ask is `force-dynamic` and reads up to `MAX_ADMIN_ASK_FEEDBACK`
 * rows with the service role, then their askers and programs — long enough
 * that, without this, a click in the admin nav sits on the previous page.
 * The page's own frame with a table skeleton, as `admin/uploads/loading.tsx`.
 */
export default function AdminAskLoading() {
  return <AskFeedbackPageSkeleton />;
}
