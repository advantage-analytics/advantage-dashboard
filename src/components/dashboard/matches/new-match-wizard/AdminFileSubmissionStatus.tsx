import { advButton } from "@/lib/ui/adv-button";

export function AdminFileSubmissionStatus({
  result,
  error,
  pending,
  onRetry,
  successHref,
}: {
  result: { state: string; message?: string };
  error: string | null;
  pending: boolean;
  onRetry: () => void;
  successHref: string;
}) {
  return (
    <div className="mx-auto max-w-[640px] py-10" aria-busy={pending}>
      <h1 className="text-display">File processing: {result.state}</h1>
      <p role={result.state === "failed" ? "alert" : "status"} className="mt-6">
        {result.message}
      </p>
      {error && (
        <p role="alert" className="mt-6 text-[var(--danger)]">
          {error}
        </p>
      )}
      {result.state === "queued" && (
        <button
          type="button"
          disabled={pending}
          onClick={onRetry}
          className={`mt-6 ${advButton("outline")}`}
        >
          {pending
            ? "Retrying with the same file…"
            : "Retry with the same file"}
        </button>
      )}
      <a href={successHref} className="mt-6 block text-[var(--blue)]">
        Return to uploads
      </a>
    </div>
  );
}
