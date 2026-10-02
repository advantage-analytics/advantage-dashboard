"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileSpreadsheet,
  Video,
  ListOrdered,
  Trophy,
  Check,
} from "lucide-react";
import {
  loadAdminAttachmentTargetsAction,
  prepareAdminAttachmentAction,
} from "@/app/admin/uploads/new/attachment-actions";
import type { AdminAttachmentOption } from "@/lib/data/admin-attachment-server";
import type { AdminWizardMode } from "@/components/dashboard/matches/new-match-wizard/admin-mode";
import { advButton } from "@/lib/ui/adv-button";
import { advField } from "@/lib/ui/adv-field";
import type { AdminUploadContext } from "@/lib/data/admin-upload-server";
import { AdminUploadMatchFlow } from "@/components/dashboard/matches/new-match-wizard/admin-mode";
import {
  adminUploadHref,
  type AdminUploadKind,
} from "./admin-upload-selection";

const choices = [
  {
    kind: "file",
    label: "Match file",
    detail: "SwingVision export, .xlsx",
    icon: FileSpreadsheet,
  },
  {
    kind: "video",
    label: "Match video",
    detail: "Counts against the team’s hours",
    icon: Video,
  },
  {
    kind: "dual",
    label: "Dual result",
    detail: "Team score and every line",
    icon: ListOrdered,
  },
  {
    kind: "tournament",
    label: "Tournament result",
    detail: "Rounds, draws and placings",
    icon: Trophy,
  },
] as const;

function FileOrVideo({
  context,
  kind,
}: {
  context: AdminUploadContext;
  kind: "file" | "video";
}) {
  // These survive all wizard rerenders and retries; changing the target remounts
  // this boundary so an operation is never reused for another team or source.
  const [ids] = useState(() => ({
    operationId: crypto.randomUUID(),
    itemId: crypto.randomUUID(),
  }));
  const [target, setTarget] = useState("new");
  const [options, setOptions] = useState<AdminAttachmentOption[]>([]);
  const [attachment, setAttachment] = useState<AdminWizardMode["attachment"]>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function chooseExisting() {
    setTarget("existing");
    setPending(true);
    setError(null);
    try {
      const result = await loadAdminAttachmentTargetsAction(
        context.workspace.id,
      );
      if (result.ok)
        setOptions(
          result.options.filter((o) => kind === "file" || o.supportsVideo),
        );
      else setError(result.message);
    } catch {
      setError("We couldn’t load recorded results. Try again.");
    } finally {
      setPending(false);
    }
  }
  async function prepare() {
    setPending(true);
    setError(null);
    try {
      const result = await prepareAdminAttachmentAction({
        programId: context.workspace.id,
        matchId: target,
        ...ids,
      });
      if (result.ok) setAttachment(result.attachment);
      else setError(result.message);
    } catch {
      setError("We couldn’t prepare this result. Try again.");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="flex flex-col gap-5">
      {!attachment && (
        <section aria-label="Analysis target" className="flex flex-col gap-3">
          <div className="flex gap-4 text-[13px]">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="analysis-target"
                checked={target === "new"}
                disabled={pending}
                onChange={() => {
                  setTarget("new");
                  setError(null);
                }}
              />
              New match
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="analysis-target"
                checked={target !== "new"}
                disabled={pending}
                onChange={chooseExisting}
              />
              Existing recorded result
            </label>
          </div>
          {target !== "new" && (
            <>
              <label className="flex flex-col gap-2 text-[12px]">
                Recorded result
                <select
                  aria-label="Recorded result"
                  className={advField("boxed")}
                  value={target === "existing" ? "" : target}
                  disabled={pending}
                  onChange={(e) => setTarget(e.target.value || "existing")}
                >
                  <option value="">Choose a recorded result</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              {!pending && options.length === 0 && (
                <p role="status" className="text-[13px] text-[var(--ink-600)]">
                  No eligible recorded results for this analysis kind.
                </p>
              )}
              <button
                type="button"
                className={advButton("primary", "md")}
                disabled={pending || target === "existing"}
                onClick={prepare}
              >
                {pending ? "Loading…" : "Use recorded result"}
              </button>
            </>
          )}
          {error && (
            <p role="alert" className="text-[13px] text-[var(--error)]">
              {error}
            </p>
          )}
        </section>
      )}
      {(target === "new" || attachment) && (
        <AdminUploadMatchFlow
          mode={{
            context,
            ...ids,
            attachment,
            exitHref: adminUploadHref(context.workspace.id, null),
            successHref: "/admin/uploads",
          }}
          initialProvider={kind === "file" ? "swing-vision" : "splitstep"}
        />
      )}
    </div>
  );
}

/** T13/T14 supply the result forms through these explicit integration slots. */
export function AdminUploadEntry({
  context,
  kind,
  picker,
  error,
  dualResult,
  tournamentResult,
}: {
  context: AdminUploadContext | null;
  kind: AdminUploadKind | null;
  picker: ReactNode;
  error?: string | null;
  dualResult?: ReactNode;
  tournamentResult?: ReactNode;
}) {
  const router = useRouter();
  const team = context?.workspace.id ?? null;
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <main className="mx-auto flex w-full max-w-[1000px] flex-col gap-6 px-6 pt-9 pb-12">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-display">Upload for a team</h1>
          <p className="text-[13px] text-[var(--ink-600)]">
            Add match files, videos and results to the team’s workspace
          </p>
        </div>
        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] p-3 text-[13px] text-[var(--ink-700)]"
          >
            <span>{error}</span>
            <Link
              href={adminUploadHref(null, kind)}
              className="text-[var(--blue)]"
            >
              Choose another team
            </Link>
            <button
              type="button"
              onClick={() => router.refresh()}
              className="cursor-pointer text-[var(--blue)]"
            >
              Try again
            </button>
          </div>
        )}
        {context ? (
          <div className="flex flex-wrap items-center gap-3">
            <span
              aria-hidden="true"
              className="flex size-7 items-center justify-center rounded-[var(--radius-button)] bg-[var(--surface-subtle)] text-[11px] font-medium"
            >
              {context.workspace.mark}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[14px] font-medium">
                {context.workspace.name}
                {context.workspace.team === "mens"
                  ? " Men’s"
                  : context.workspace.team === "womens"
                    ? " Women’s"
                    : ""}
              </span>
              <span className="text-[12px] text-[var(--ink-600)]">
                {context.workspace.programStatus === "active"
                  ? "Pilot"
                  : "Not active"}{" "}
                · {(context.videoAllowance.remainingSeconds / 3600).toFixed(1)}{" "}
                h of video left this month
              </span>
            </div>
            <Link
              href={adminUploadHref(null, kind)}
              className="text-[12px] text-[var(--blue)]"
            >
              Change team
            </Link>
          </div>
        ) : (
          picker
        )}
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-3 text-[12px] text-[var(--ink-600)]">
            What are you adding?
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {choices.map(({ kind: value, label, detail, icon: Icon }) => (
              <label
                key={value}
                className={`relative flex cursor-pointer flex-col gap-1 rounded-[var(--radius-dropdown)] border bg-[var(--surface-card)] px-[18px] pt-[18px] pb-5 ${kind === value ? "border-[var(--blue)] shadow-[0_0_0_3px_var(--blue-tint-12)]" : "border-[var(--border-field)] hover:border-[var(--ink-300)]"}`}
              >
                <span className="absolute top-4 right-4 size-3.5">
                  <input
                    type="radio"
                    name="upload-kind"
                    value={value}
                    checked={kind === value}
                    onChange={() => router.push(adminUploadHref(team, value))}
                    aria-label={label}
                    className="absolute inset-0 size-3.5 cursor-pointer appearance-none rounded-full border border-[var(--ink-300)] bg-[var(--surface-card)] checked:border-[var(--blue)] checked:bg-[var(--blue)]"
                  />
                  {kind === value && (
                    <Check
                      aria-hidden="true"
                      className="pointer-events-none absolute top-1/2 left-1/2 size-[9px] -translate-x-1/2 -translate-y-1/2 text-white"
                      strokeWidth={2.5}
                    />
                  )}
                </span>
                <span className="mb-2 flex size-9 items-center justify-center rounded-[var(--radius-element)] bg-[var(--surface-subtle)]">
                  <Icon
                    className="size-[18px]"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </span>
                <span className="text-[13px] font-medium">{label}</span>
                <span className="text-[12px] text-[var(--ink-600)]">
                  {detail}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        {context && (kind === "dual" || kind === "tournament") && (
          <section
            aria-label={`${kind === "dual" ? "Dual" : "Tournament"} result`}
            className="rounded-[var(--radius-card)] border border-[var(--border-card)] p-6 shadow-[var(--shadow-card)]"
          >
            {(kind === "dual" ? dualResult : tournamentResult) ?? (
              <p role="status" className="text-[13px] text-[var(--ink-600)]">
                {kind === "dual" ? "Dual" : "Tournament"} result entry is coming
                soon. Choose a match file or video to continue.
              </p>
            )}
          </section>
        )}
        {!context && (
          <p className="text-[13px] text-[var(--ink-600)]">
            Choose a team to continue.
          </p>
        )}
        {context && !kind && (
          <p className="text-[13px] text-[var(--ink-600)]">
            Choose what you’re adding to continue.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-4 text-[12px] text-[var(--ink-600)]">
          <span>Uploads are attributed to the selected team.</span>
          <Link href="/admin/uploads" className="hover:text-[var(--ink-900)]">
            Cancel
          </Link>
        </div>
      </main>
      {context && (kind === "file" || kind === "video") && (
        <FileOrVideo key={`${team}:${kind}`} context={context} kind={kind} />
      )}
    </div>
  );
}
