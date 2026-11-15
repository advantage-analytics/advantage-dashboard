import {
  PendingBar,
  PendingRegion,
} from "@/components/dashboard/loading/pending";
import { ADMIN_UPLOAD_CHOICES } from "./admin-upload-kinds";

/**
 * Admin › Upload a match while the page loads
 * (`app/admin/uploads/new/loading.tsx`): the page's own column, title and
 * lede, and "What are you adding?" over the four kind cards by name. Who the
 * upload is for — the search, or the chosen team or player — and each card's
 * second line depend on the address, so they are bars.
 */
export function AdminUploadPageSkeleton() {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-[1000px] flex-col gap-6 px-6 pt-9 pb-12">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-display">Upload a match</h1>
          <p className="text-[13px] text-[var(--ink-600)]">
            Add match files, videos and results to a team’s workspace, or a
            match video to a player’s own
          </p>
        </div>
        <PendingRegion
          label="who the upload is for"
          innerClassName="flex items-center gap-3"
        >
          <PendingBar className="size-7 shrink-0 rounded-[var(--radius-button)]" />
          <span className="flex min-w-0 flex-1 flex-col gap-1.5">
            <PendingBar className="h-3.5 w-56" />
            <PendingBar className="h-3 w-72" />
          </span>
        </PendingRegion>
        <div className="flex flex-col gap-3">
          <span className="mb-3 text-[12px] text-[var(--ink-600)]">
            What are you adding?
          </span>
          <div
            aria-hidden="true"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            {ADMIN_UPLOAD_CHOICES.map(({ kind, label, icon: Icon }) => (
              <div
                key={kind}
                className="relative flex flex-col gap-1 rounded-[var(--radius-dropdown)] border border-[var(--border-field)] bg-[var(--surface-card)] px-[18px] pt-[18px] pb-5"
              >
                <span className="absolute top-4 right-4 size-3.5 rounded-full border border-[var(--ink-300)]" />
                <span className="mb-2 flex size-9 items-center justify-center rounded-[var(--radius-element)] bg-[var(--surface-subtle)]">
                  <Icon className="size-[18px]" strokeWidth={1.5} />
                </span>
                <span className="text-[13px] font-medium">{label}</span>
                <PendingBar className="my-[3px] h-3 w-32" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
