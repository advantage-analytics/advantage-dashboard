"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdvSelect } from "@/components/ui/adv-select";
import {
  ConfirmDialog,
  ConfirmProse,
  Em,
} from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { StatePill } from "@/components/ui/state-pill";
import {
  loadOriginalOutreachTemplate,
  loadOutreachTemplate,
  previewOutreach,
  resetOutreachTemplate,
  saveOutreachTemplate,
} from "@/app/admin/outreach/actions";
import {
  COLD_EMAILS,
  OUTREACH_MERGE_FIELDS,
} from "@/lib/services/outreach/types";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

/**
 * Admin › Outreach › Edit email.
 *
 * The subject and full HTML of one email, editable or pasted over, with the
 * merge fields beside it and the result rendered for a real recipient on the
 * right. Nothing changes for sends until Save; "Reset to original" goes back
 * to the copy in code.
 */

interface Draft {
  emailNo: number;
  subject: string;
  html: string;
  savedSubject: string;
  savedHtml: string;
  custom: boolean;
  updatedAt: string | null;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function OutreachTemplateEditor({
  emailNo,
  emailName,
  recipients,
  initialRecipientId,
}: {
  emailNo: number;
  emailName: string;
  /** Who the preview can be rendered as: this email's rows, in list order. */
  recipients: { id: string; label: string }[];
  initialRecipientId: string | null;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, startLoad] = useTransition();

  const current = draft?.emailNo === emailNo ? draft : null;

  useEffect(() => {
    if (draft?.emailNo === emailNo) return;
    startLoad(async () => {
      const result = await loadOutreachTemplate(emailNo);
      if (result.ok) {
        setDraft({
          emailNo,
          subject: result.draft.subject,
          html: result.draft.html,
          savedSubject: result.draft.subject,
          savedHtml: result.draft.html,
          custom: result.draft.custom,
          updatedAt: result.draft.updatedAt,
        });
        setLoadError(null);
      } else {
        setLoadError(result.error);
      }
    });
  }, [emailNo, draft?.emailNo]);

  const dirty =
    current !== null &&
    (current.subject !== current.savedSubject ||
      current.html !== current.savedHtml);

  /* ── Preview ─────────────────────────────────────────────────────────── */

  const [as, setAs] = useState<{ emailNo: number; id: string } | null>(null);
  const previewId =
    (as?.emailNo === emailNo ? as.id : null) ??
    initialRecipientId ??
    recipients[0]?.id ??
    null;

  const [preview, setPreview] = useState<{
    key: string;
    subject: string;
    html: string;
  } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewing, startPreview] = useTransition();

  function renderPreview(source: Draft, recipientId: string) {
    startPreview(async () => {
      const result = await previewOutreach(recipientId, emailNo, {
        subject: source.subject,
        html: source.html,
      });
      if (result.ok) {
        setPreview({
          key: `${emailNo}:${recipientId}`,
          subject: result.subject,
          html: result.html,
        });
        setPreviewError(null);
      } else {
        setPreviewError(result.error);
      }
    });
  }

  // Render once when the email loads or the recipient changes; after that,
  // edits re-render on "Update preview" so typing doesn't fire a request per
  // keystroke.
  const previewKey = previewId ? `${emailNo}:${previewId}` : null;
  const loadedEmail = current?.emailNo ?? null;
  useEffect(() => {
    if (!previewId || loadedEmail !== emailNo || !draft) return;
    if (preview?.key === previewKey) return;
    renderPreview(draft, previewId);
    // `draft` is read, not tracked: a keystroke must not re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, loadedEmail]);

  /* ── Save, start over, reset ─────────────────────────────────────────── */

  const [notice, setNotice] = useState<{
    emailNo: number;
    ok: boolean;
    message: string;
    problems: string[];
  } | null>(null);
  const shownNotice = notice?.emailNo === emailNo ? notice : null;
  const [saving, startSave] = useTransition();
  const [confirmReset, setConfirmReset] = useState(false);

  function edit(patch: Partial<Pick<Draft, "subject" | "html">>) {
    setDraft((previous) =>
      previous && previous.emailNo === emailNo
        ? { ...previous, ...patch }
        : previous,
    );
  }

  function save() {
    if (!current) return;
    startSave(async () => {
      const result = await saveOutreachTemplate(
        emailNo,
        current.subject,
        current.html,
      );
      setNotice({ emailNo, ...result });
      if (result.ok) {
        setDraft({
          ...current,
          savedSubject: current.subject,
          savedHtml: current.html,
          custom: true,
          updatedAt: new Date().toISOString(),
        });
        if (previewId) renderPreview(current, previewId);
        router.refresh();
      }
    });
  }

  function startFromOriginal() {
    startSave(async () => {
      const result = await loadOriginalOutreachTemplate(emailNo);
      if (result.ok) {
        edit({ subject: result.subject, html: result.html });
        setNotice({
          emailNo,
          ok: true,
          message:
            "Loaded the original into the editor. It isn't saved until you press Save.",
          problems: [],
        });
      } else {
        setNotice({ emailNo, ok: false, message: result.error, problems: [] });
      }
    });
  }

  function reset() {
    startSave(async () => {
      const result = await resetOutreachTemplate(emailNo);
      setConfirmReset(false);
      setNotice({ emailNo, ...result, problems: [] });
      if (result.ok) {
        setDraft(null); // reloads the built-in copy
        setPreview(null);
        router.refresh();
      }
    });
  }

  /* ── Render ──────────────────────────────────────────────────────────── */

  if (loadError) {
    return <p className="text-body-sm text-[var(--danger)]">{loadError}</p>;
  }
  if (!current) {
    return (
      <p className="text-body-sm">{loading ? "Loading the email…" : ""}</p>
    );
  }

  const cold = COLD_EMAILS.has(emailNo);
  const shownPreview = preview?.key === previewKey ? preview : null;

  return (
    <div className="grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_640px]">
      <section
        aria-label={`Edit email ${emailNo}`}
        className="flex min-w-0 flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] p-4"
      >
        <div className="flex flex-wrap items-center gap-2">
          <StatePill outline={!current.custom}>
            {current.custom ? "Your version" : "Original"}
          </StatePill>
          <p className="text-[12px] text-[var(--ink-500)]">
            {current.custom && current.updatedAt
              ? `Email ${emailNo}, ${emailName}: saved ${formatWhen(current.updatedAt)}. Previews, tests and sends use it.`
              : `Email ${emailNo}, ${emailName}: the copy in code. Edit below and Save to use your own.`}
            {dirty ? " Unsaved changes." : ""}
          </p>
        </div>

        <label className="flex flex-col gap-1 text-[12px] text-[var(--ink-600)]">
          Subject
          <Input
            id="outreach-template-subject"
            value={current.subject}
            onChange={(event) => edit({ subject: event.target.value })}
          />
        </label>

        <label className="flex flex-col gap-1 text-[12px] text-[var(--ink-600)]">
          HTML (paste a whole email over this, or edit it)
          <textarea
            id="outreach-template-html"
            value={current.html}
            spellCheck={false}
            onChange={(event) => edit({ html: event.target.value })}
            className="h-[520px] w-full resize-y rounded-[var(--radius-input,6px)] border border-[var(--border-card)] bg-[var(--surface-page)] p-3 font-mono text-[12px] leading-[18px] text-[var(--ink-900)] outline-none focus-visible:shadow-[var(--focus-ring)]"
          />
        </label>

        <details className="text-[12px] text-[var(--ink-700)]">
          <summary className="cursor-pointer text-[var(--ink-800)]">
            Merge fields, filled in per recipient
          </summary>
          <dl className="mt-2 grid grid-cols-[150px_minmax(0,1fr)] gap-x-3 gap-y-1">
            {OUTREACH_MERGE_FIELDS.map((field) => (
              <div key={field.token} className="contents">
                <dt className="font-mono text-[var(--ink-900)]">
                  {`{{${field.token}}}`}
                </dt>
                <dd className="text-[var(--ink-600)]">{field.means}</dd>
              </div>
            ))}
          </dl>
          {cold && (
            <p className="mt-2 text-[var(--ink-600)]">
              This is cold email, so it can only be saved with{" "}
              <code>{"{{unsubscribe_url}}"}</code> and{" "}
              <code>{"{{postal_address}}"}</code> in it. The unsubscribe headers
              are added either way.
            </p>
          )}
        </details>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={advButton("primary", "md")}
            disabled={!dirty || saving}
            onClick={save}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            className={advButton("outline", "md")}
            disabled={!previewId || previewing}
            onClick={() => previewId && renderPreview(current, previewId)}
          >
            {previewing ? "Rendering…" : "Update preview"}
          </button>
          <button
            type="button"
            className={advButton("outline", "md")}
            disabled={saving}
            onClick={startFromOriginal}
          >
            Start from original
          </button>
          {current.custom && (
            <button
              type="button"
              className={advButton("danger", "md")}
              disabled={saving}
              onClick={() => setConfirmReset(true)}
            >
              Reset to original
            </button>
          )}
        </div>

        {shownNotice && (
          <div className="flex flex-col gap-1 text-[12px]">
            <p
              className={
                shownNotice.ok
                  ? "text-[var(--ink-800)]"
                  : "text-[var(--danger)]"
              }
            >
              {shownNotice.message}
            </p>
            {shownNotice.problems.map((problem) => (
              <p key={problem} className="text-[var(--danger)]">
                {problem}
              </p>
            ))}
          </div>
        )}
      </section>

      <aside
        aria-label="Preview"
        className="flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] xl:sticky xl:top-4"
      >
        <div className="flex flex-col gap-2 px-4 pt-4 pb-3 text-[12px]">
          <label className="flex items-center gap-2 text-[var(--ink-600)]">
            Preview as
            <AdvSelect
              kind="boxed"
              id="outreach-template-as"
              value={previewId ?? ""}
              onChange={(event) => setAs({ emailNo, id: event.target.value })}
              className="min-w-0 flex-1"
              disabled={recipients.length === 0}
            >
              {recipients.length === 0 && (
                <option value="">Import a list to preview</option>
              )}
              {recipients.map((recipient) => (
                <option key={recipient.id} value={recipient.id}>
                  {recipient.label}
                </option>
              ))}
            </AdvSelect>
          </label>
          <p className="text-[var(--ink-900)]">
            <span className="text-[var(--ink-500)]">Subject </span>
            {shownPreview?.subject ?? "…"}
          </p>
          {dirty && shownPreview && (
            <p className="text-[var(--ink-500)]">
              Showing your edits as of the last Update preview. They aren&apos;t
              saved yet.
            </p>
          )}
        </div>
        <div className="border-t border-[var(--border-hairline)] bg-[var(--surface-page)]">
          {previewError ? (
            <p className="text-body-sm p-4 text-[var(--danger)]">
              {previewError}
            </p>
          ) : shownPreview ? (
            <iframe
              aria-label={`Email ${emailNo} preview`}
              srcDoc={shownPreview.html}
              sandbox=""
              className={cn(
                "block h-[820px] w-full border-0",
                previewing && "opacity-60",
              )}
            />
          ) : (
            <p className="text-body-sm p-4">
              {recipients.length === 0
                ? "Import this email's list to see it as a recipient gets it."
                : previewing
                  ? "Rendering…"
                  : ""}
            </p>
          )}
        </div>
      </aside>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={(open) => !saving && setConfirmReset(open)}
        tone="danger"
        title="Reset to the original email?"
        description={
          <ConfirmProse>
            Deletes your version of email {emailNo}, <Em>{emailName}</Em>.
            Previews, tests and sends go back to the copy in code. Copy your
            HTML somewhere first if you want to keep it.
          </ConfirmProse>
        }
        confirmLabel="Reset to original"
        pendingLabel="Resetting…"
        pending={saving}
        onConfirm={reset}
      />
    </div>
  );
}
