"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import {
  CountPills,
  FilterMenuPill,
  PillSearch,
  type FilterMenuOption,
} from "@/components/admin/admin-cells";
import { AdminPage } from "@/components/admin/admin-page";
import {
  OUTREACH_STATE_LABEL,
  OutreachRecipientTable,
  formatOutreachWhen,
} from "@/components/admin/outreach/outreach-recipient-table";
import { OutreachTemplateEditor } from "@/components/admin/outreach-template-editor";
import { AdvSelect } from "@/components/ui/adv-select";
import {
  ConfirmDialog,
  ConfirmProse,
  Em,
} from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import {
  cancelOutreachSend,
  importOutreachCsv,
  previewOutreach,
  removeOutreachRecipients,
  sendOutreachTest,
  sendOutreachTranche,
  setOutreachHeld,
  updateOutreachRecipient,
} from "@/app/admin/outreach/actions";
import { buildRows } from "@/lib/services/outreach/rows";
import {
  COLD_EMAILS,
  IMPORTABLE_LISTS,
  OUTREACH_EMAILS,
  outreachEmail,
  type OutreachProgram,
  type OutreachRecipient,
  type OutreachRow,
  type OutreachSend,
  type OutreachTrancheResult,
} from "@/lib/services/outreach/types";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

/**
 * Admin › Outreach.
 *
 * One email at a time, in two modes:
 *  - **Recipients** (Outreach2 board) — the email pills with their list
 *    sizes, then Division / Conference / Status filter pills over the list on
 *    the left; the selected row's exact email, its test send and the send
 *    itself on the right. Tick rows to send to exactly those, or send the next
 *    N of the division and conference. Hold, edit or remove rows; see each
 *    program and whether it has been claimed.
 *  - **Edit email** — the subject and HTML, pasted or edited, previewed as a
 *    real recipient before it is saved.
 *
 * Every send is confirmed in a dialog that names the count; there is no "send
 * all", and the server caps a send at 100.
 */

type View = "all" | "not_sent" | "scheduled" | "sent" | "failed" | "excluded";
type Mode = "recipients" | "edit";

const VIEW_OPTIONS: { value: View; label: string }[] = [
  { value: "all", label: "All" },
  { value: "not_sent", label: "Not sent" },
  { value: "scheduled", label: "Scheduled" },
  { value: "sent", label: "Sent" },
  { value: "failed", label: "Failed" },
  { value: "excluded", label: "Held, claimed or not due" },
];

const MODE_OPTIONS: { value: Mode; label: string }[] = [
  { value: "recipients", label: "Recipients" },
  { value: "edit", label: "Edit email" },
];

const MAX_SEND = 100;
const SHOWN = 400;

const count = (value: number) => value.toLocaleString("en-US");

function addresses(rows: OutreachRow[]): number {
  return rows.reduce((sum, row) => sum + 1 + row.recipient.cc.length, 0);
}

function isSendable(row: OutreachRow): boolean {
  return row.state === "not_sent" || row.state === "failed";
}

function inView(row: OutreachRow, view: View): boolean {
  switch (view) {
    case "all":
      return true;
    case "not_sent":
      return row.state === "not_sent";
    case "scheduled":
      return row.state === "scheduled";
    case "sent":
      return row.state === "sent" || row.state === "sending";
    case "failed":
      return row.state === "failed";
    case "excluded":
      return (
        row.state === "claimed" ||
        row.state === "held" ||
        row.state === "not_due"
      );
  }
}

/** A scheduled send whose time has passed has gone out. */
function displayState(row: OutreachRow, now: number): OutreachRow["state"] {
  if (
    row.state === "scheduled" &&
    row.send?.scheduledAt &&
    new Date(row.send.scheduledAt).getTime() <= now
  ) {
    return "sent";
  }
  return row.state;
}

function ccText(recipient: OutreachRecipient): string {
  return recipient.cc
    .map((person) =>
      person.name ? `${person.name} <${person.email}>` : person.email,
    )
    .join("\n");
}

export function OutreachPageContent({
  initialEmailNo,
  recipients,
  sends,
  programs,
  crests,
  customizedEmails,
  adminEmail,
  postalSet,
  resendSet,
  setupError,
}: {
  initialEmailNo: number;
  recipients: OutreachRecipient[];
  sends: OutreachSend[];
  programs: OutreachProgram[];
  /** `program_key` → crest URL, for the Program column. */
  crests: Record<string, string>;
  customizedEmails: number[];
  adminEmail: string;
  postalSet: boolean;
  resendSet: boolean;
  setupError: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [emailNo, setEmailNo] = useState(initialEmailNo);
  const [mode, setMode] = useState<Mode>("recipients");
  const [view, setView] = useState<View>("all");
  const [division, setDivision] = useState("");
  const [conference, setConference] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Ticked rows, keyed to the email they were ticked on.
  const [ticked, setTicked] = useState<{ emailNo: number; ids: Set<string> }>(
    () => ({ emailNo: initialEmailNo, ids: new Set() }),
  );
  const tickedIds = useMemo(
    () => (ticked.emailNo === emailNo ? ticked.ids : new Set<string>()),
    [ticked, emailNo],
  );

  const def = outreachEmail(emailNo) ?? OUTREACH_EMAILS[4];
  const programByKey = useMemo(
    () => new Map(programs.map((program) => [program.key, program])),
    [programs],
  );
  const claimed = useMemo(
    () =>
      new Set(
        programs
          .filter((program) => program.status !== "unclaimed")
          .map((program) => program.key),
      ),
    [programs],
  );
  const customized = new Set(customizedEmails);
  // Fixed per render pass of the server data, so rows don't reshuffle while
  // the admin reads them.
  const [now] = useState(() => Date.now());

  const rows = useMemo(
    () =>
      buildRows(emailNo, recipients, sends, claimed, new Date(now)).map(
        (row) => ({
          ...row,
          state: displayState(row, now),
        }),
      ),
    [emailNo, recipients, sends, claimed, now],
  );

  const divisions = useMemo(
    () =>
      [
        ...new Set(rows.map((row) => row.recipient.division).filter(Boolean)),
      ] as string[],
    [rows],
  );
  const conferences = useMemo(
    () =>
      [
        ...new Set(
          rows
            .filter((row) => !division || row.recipient.division === division)
            .map((row) => row.recipient.conference)
            .filter(Boolean),
        ),
      ].sort() as string[],
    [rows, division],
  );

  const cut = useMemo(
    () =>
      rows
        .filter((row) => !division || row.recipient.division === division)
        .filter(
          (row) => !conference || row.recipient.conference === conference,
        ),
    [rows, division, conference],
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return cut
      .filter((row) => inView(row, view))
      .filter(
        (row) =>
          !needle ||
          [
            row.recipient.label,
            row.recipient.toName,
            row.recipient.toEmail,
            ...row.recipient.programKeys,
            ...row.recipient.cc.map((c) => c.email),
          ]
            .join(" ")
            .toLowerCase()
            .includes(needle),
      );
  }, [cut, view, search]);

  const selected =
    visible.find((row) => row.recipient.id === selectedId) ??
    visible[0] ??
    null;

  const tickedRows = rows.filter((row) => tickedIds.has(row.recipient.id));
  const sendable = cut.filter(isSendable);
  const tally = (state: OutreachRow["state"]) =>
    rows.filter((row) => row.state === state).length;

  function chooseEmail(next: number) {
    setEmailNo(next);
    setView("all");
    setDivision("");
    setConference("");
    setSelectedId(null);
    setResult(null);
    const query = next === 7 ? "" : `?email=${next}`;
    router.replace(`${pathname}${query}`, { scroll: false });
  }

  /* ── Ticking ─────────────────────────────────────────────────────────── */

  function setTickedIds(ids: Set<string>) {
    setTicked({ emailNo, ids });
  }

  function toggle(id: string, on: boolean) {
    const next = new Set(tickedIds);
    if (on) next.add(id);
    else next.delete(id);
    setTickedIds(next);
  }

  const visibleIds = visible.map((row) => row.recipient.id);
  const allVisibleTicked =
    visibleIds.length > 0 && visibleIds.every((id) => tickedIds.has(id));

  function toggleAllVisible(on: boolean) {
    const next = new Set(tickedIds);
    for (const id of visibleIds) {
      if (on) next.add(id);
      else next.delete(id);
    }
    setTickedIds(next);
  }

  /* ── Preview ─────────────────────────────────────────────────────────── */

  const [preview, setPreview] = useState<{
    key: string;
    subject: string;
    html: string;
  } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewPending, startPreview] = useTransition();
  const selectedRecipientId = selected?.recipient.id ?? null;
  // A saved template changes the server's answer, so it is part of the key.
  const templateStamp = customized.has(emailNo) ? "custom" : "original";
  const previewKey = selectedRecipientId
    ? `${selectedRecipientId}:${emailNo}:${templateStamp}:${selected?.recipient.toEmail}`
    : null;

  useEffect(() => {
    if (mode !== "recipients" || !selectedRecipientId || !previewKey) return;
    if (preview?.key === previewKey) return;
    startPreview(async () => {
      const next = await previewOutreach(selectedRecipientId, emailNo);
      if (next.ok) {
        setPreview({ key: previewKey, subject: next.subject, html: next.html });
        setPreviewError(null);
      } else {
        setPreviewError(next.error);
      }
    });
  }, [mode, selectedRecipientId, emailNo, previewKey, preview?.key]);

  /* ── Row actions: test, cancel, edit, hold ───────────────────────────── */

  const [testTo, setTestTo] = useState(adminEmail);
  // Keyed to the row and email it came from, so choosing another row hides it
  // without an effect resetting state.
  const [notice, setNotice] = useState<{
    key: string;
    ok: boolean;
    message: string;
  } | null>(null);
  const noticeKey = `${selectedRecipientId ?? ""}:${emailNo}`;
  const rowNotice = notice?.key === noticeKey ? notice : null;
  function setRowNotice(value: { ok: boolean; message: string }) {
    setNotice({ key: noticeKey, ...value });
  }
  const [rowPending, startRow] = useTransition();

  const [editing, setEditing] = useState<{
    id: string;
    toName: string;
    toLastName: string;
    toEmail: string;
    cc: string;
  } | null>(null);
  const editingSelected =
    editing && editing.id === selectedRecipientId ? editing : null;

  function startEditing() {
    if (!selected) return;
    const recipient = selected.recipient;
    setEditing({
      id: recipient.id,
      toName: recipient.toName ?? "",
      toLastName: recipient.toLastName ?? "",
      toEmail: recipient.toEmail,
      cc: ccText(recipient),
    });
  }

  function saveEdit() {
    if (!editingSelected) return;
    const { id, ...edit } = editingSelected;
    startRow(async () => {
      const outcome = await updateOutreachRecipient(id, edit);
      setRowNotice(outcome);
      if (outcome.ok) {
        setEditing(null);
        router.refresh();
      }
    });
  }

  function sendTest() {
    if (!selected) return;
    startRow(async () => {
      setRowNotice(
        await sendOutreachTest(selected.recipient.id, emailNo, testTo),
      );
    });
  }

  function cancelScheduled(sendId: string) {
    startRow(async () => {
      const outcome = await cancelOutreachSend(sendId);
      setRowNotice(outcome);
      if (outcome.ok) router.refresh();
    });
  }

  function holdOne(held: boolean) {
    if (!selected) return;
    startRow(async () => {
      const outcome = await setOutreachHeld([selected.recipient.id], held);
      setRowNotice(outcome);
      if (outcome.ok) router.refresh();
    });
  }

  /* ── Bulk actions on ticked rows ─────────────────────────────────────── */

  const [bulkNotice, setBulkNotice] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [bulkPending, startBulk] = useTransition();
  const [confirmRemove, setConfirmRemove] = useState(false);

  function bulkHold(held: boolean) {
    const ids = [...tickedIds];
    startBulk(async () => {
      const outcome = await setOutreachHeld(ids, held);
      setBulkNotice(outcome);
      if (outcome.ok) router.refresh();
    });
  }

  function bulkRemove() {
    const ids = [...tickedIds];
    startBulk(async () => {
      const outcome = await removeOutreachRecipients(ids);
      setBulkNotice(outcome);
      setConfirmRemove(false);
      setTickedIds(new Set());
      router.refresh();
    });
  }

  /* ── Send ────────────────────────────────────────────────────────────── */

  const [limit, setLimit] = useState(40);
  const [when, setWhen] = useState<"now" | "later">("now");
  const [at, setAt] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<OutreachTrancheResult | null>(null);
  const [tranchePending, startTranche] = useTransition();

  // Ticked rows, when there are any, are the send. Otherwise the next N of
  // the division and conference.
  const usingTicks = tickedIds.size > 0;
  const tickedSendable = tickedRows.filter(isSendable);
  const next = usingTicks
    ? tickedSendable
    : sendable.slice(0, Math.max(0, Math.min(limit || 0, MAX_SEND)));
  const cold = COLD_EMAILS.has(emailNo);
  const blocker = !resendSet
    ? "RESEND_API_KEY isn't set in this environment, so nothing can send."
    : cold && !postalSet
      ? "Set OUTREACH_POSTAL_ADDRESS in the environment before sending cold email."
      : usingTicks && tickedSendable.length === 0
        ? "None of the ticked rows are waiting for this email."
        : usingTicks && tickedSendable.length > MAX_SEND
          ? `Tick ${MAX_SEND} or fewer at a time; ${count(tickedSendable.length)} are ticked.`
          : next.length === 0
            ? "Nobody in this selection is waiting for this email."
            : when === "later" && !at
              ? "Pick a time to schedule for."
              : null;

  const selection = usingTicks
    ? "the ticked rows"
    : [division, conference].filter(Boolean).join(" · ") || "every division";

  function runTranche() {
    startTranche(async () => {
      const outcome = await sendOutreachTranche({
        emailNo,
        division: usingTicks ? null : division || null,
        conference: usingTicks ? null : conference || null,
        limit: next.length,
        scheduledAt: when === "later" && at ? new Date(at).toISOString() : null,
        recipientIds: usingTicks ? next.map((row) => row.recipient.id) : null,
      });
      setResult(outcome);
      setConfirming(false);
      if (usingTicks) setTickedIds(new Set());
      router.refresh();
    });
  }

  /* ── Import ──────────────────────────────────────────────────────────── */

  const [importing, setImporting] = useState(false);
  const [importNotice, setImportNotice] = useState<{
    ok: boolean;
    message: string;
    problems: string[];
  } | null>(null);
  const [importPending, startImport] = useTransition();

  function submitImport(form: HTMLFormElement) {
    const data = new FormData(form);
    startImport(async () => {
      const outcome = await importOutreachCsv(data);
      setImportNotice(outcome);
      if (outcome.ok) {
        form.reset();
        router.refresh();
      }
    });
  }

  /* ── Render ──────────────────────────────────────────────────────────── */

  if (setupError) {
    return (
      <AdminPage>
        <h1 className="text-display">Outreach</h1>
        <p className="text-body-sm mt-[9px] max-w-[640px] text-[var(--ink-600)]">
          The outreach tables aren&apos;t in this database yet. Apply the
          migrations <code>20261001050000_outreach.sql</code> and{" "}
          <code>20261001060000_outreach_templates.sql</code>, then reload.
        </p>
        <p className="mt-2 text-[12px] text-[var(--ink-500)]">{setupError}</p>
      </AdminPage>
    );
  }

  const summary = [
    `Email ${emailNo}`,
    def.name,
    `${count(rows.length)} on the list`,
    `${count(tally("sent") + tally("sending"))} sent`,
    `${count(tally("scheduled"))} scheduled`,
    `${count(tally("not_sent"))} not sent`,
    tally("failed") ? `${count(tally("failed"))} failed` : null,
    tally("held") ? `${count(tally("held"))} held` : null,
    tally("claimed") ? `${count(tally("claimed"))} claimed` : null,
    emailNo === 8 ? `${count(tally("not_due"))} not due yet` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const selectedPrograms = selected
    ? selected.recipient.programKeys.map((key) => ({
        key,
        program: programByKey.get(key) ?? null,
      }))
    : [];

  const listSize = (no: number) => {
    const list = outreachEmail(no)?.list;
    return recipients.filter((recipient) => recipient.emailNo === list).length;
  };

  const statusOptions: FilterMenuOption<View>[] = VIEW_OPTIONS.map(
    (option) => ({
      ...option,
      count: cut.filter((row) => inView(row, option.value)).length,
    }),
  );

  const sendLabel = `${when === "later" ? "Schedule" : "Send"} ${count(next.length)} ${next.length === 1 ? "email" : "emails"}`;

  return (
    <AdminPage>
      <div className="flex flex-wrap items-end gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-display">Outreach</h1>
          <p className="text-body-sm mt-[9px] text-[var(--ink-600)] tabular-nums">
            {summary}
          </p>
        </div>
        <button
          type="button"
          aria-expanded={importing}
          className={advButton("outline", "md")}
          onClick={() => setImporting((open) => !open)}
        >
          Import send list
        </button>
      </div>

      {importing && (
        <form
          className="mt-4 flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] p-4"
          onSubmit={(event) => {
            event.preventDefault();
            submitImport(event.currentTarget);
          }}
        >
          <p className="text-body-sm max-w-[680px]">
            Import a reviewed send list (<code>email7_send_list.csv</code> and
            the like). Rows match on their program keys or address, so importing
            the same file again updates rows instead of adding copies. Addresses
            stay in the database, never in the repository.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[12px] text-[var(--ink-600)]">
              Email
              <AdvSelect
                kind="boxed"
                name="listNo"
                id="outreach-import-list"
                defaultValue="7"
                className="min-w-[220px]"
              >
                {IMPORTABLE_LISTS.map((no) => (
                  <option key={no} value={no}>
                    {no} · {outreachEmail(no)?.name}
                  </option>
                ))}
              </AdvSelect>
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-[var(--ink-600)]">
              CSV file
              <Input
                id="outreach-import-file"
                name="file"
                type="file"
                accept=".csv,text/csv"
                required
              />
            </label>
            <button
              type="submit"
              className={advButton("primary", "md")}
              disabled={importPending}
            >
              {importPending ? "Importing…" : "Import"}
            </button>
          </div>
          {importNotice && (
            <div className="flex flex-col gap-1 text-[12px]">
              <p
                className={
                  importNotice.ok
                    ? "text-[var(--ink-800)]"
                    : "text-[var(--danger)]"
                }
              >
                {importNotice.message}
              </p>
              {importNotice.problems.slice(0, 8).map((problem) => (
                <p key={problem} className="text-[var(--ink-500)]">
                  {problem}
                </p>
              ))}
              {importNotice.problems.length > 8 && (
                <p className="text-[var(--ink-500)]">
                  and {importNotice.problems.length - 8} more.
                </p>
              )}
            </div>
          )}
        </form>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <CountPills
          label="Email"
          options={OUTREACH_EMAILS.map((email) => ({
            value: String(email.no),
            label: `${email.name}${customized.has(email.no) ? " (edited)" : ""}`,
            count: listSize(email.no),
          }))}
          value={String(emailNo)}
          onChange={(value) => chooseEmail(Number(value))}
        />
        <div className="flex-1" />
        <CountPills
          label="Mode"
          options={MODE_OPTIONS}
          value={mode}
          onChange={setMode}
        />
      </div>

      {mode === "edit" ? (
        <div className="mt-4">
          <OutreachTemplateEditor
            emailNo={emailNo}
            emailName={def.name}
            recipients={rows.map((row) => ({
              id: row.recipient.id,
              label: row.recipient.label,
            }))}
            initialRecipientId={selected?.recipient.id ?? null}
          />
        </div>
      ) : (
        <div className="mt-4 grid min-w-0 grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_600px]">
          <section
            aria-label="Recipients"
            className="flex min-w-0 flex-col gap-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <FilterMenuPill
                label="Division"
                options={[
                  { value: "", label: "All" },
                  ...divisions.map((value) => ({ value, label: value })),
                ]}
                value={division}
                onChange={(value) => {
                  setDivision(value);
                  setConference("");
                }}
              />
              <FilterMenuPill
                label="Conference"
                width={300}
                options={[
                  { value: "", label: "All" },
                  ...conferences.map((value) => ({ value, label: value })),
                ]}
                value={conference}
                onChange={setConference}
              />
              <FilterMenuPill
                label="Status"
                options={statusOptions}
                value={view}
                onChange={setView}
              />
              <PillSearch
                value={search}
                onChange={setSearch}
                placeholder="Search school, coach, address or key"
                label="Search recipients"
                className="w-[240px]"
              />
              <div className="flex-1" />
              <span className="text-[12px] text-[var(--ink-600)] tabular-nums">
                {count(tickedIds.size)} ticked
              </span>
              {tickedIds.size > 0 && (
                <>
                  <button
                    type="button"
                    className={advButton("outline", "sm")}
                    disabled={bulkPending}
                    onClick={() => bulkHold(true)}
                  >
                    Hold
                  </button>
                  <button
                    type="button"
                    className={advButton("outline", "sm")}
                    disabled={bulkPending}
                    onClick={() => bulkHold(false)}
                  >
                    Release
                  </button>
                  <button
                    type="button"
                    className={advButton("danger", "sm")}
                    disabled={bulkPending}
                    onClick={() => setConfirmRemove(true)}
                  >
                    Remove from list
                  </button>
                  <button
                    type="button"
                    className={advButton("ghost", "sm")}
                    onClick={() => setTickedIds(new Set())}
                  >
                    Clear
                  </button>
                </>
              )}
            </div>
            {bulkNotice && (
              <p
                className={cn(
                  "text-[12px]",
                  bulkNotice.ok
                    ? "text-[var(--ink-700)]"
                    : "text-[var(--danger)]",
                )}
              >
                {bulkNotice.message}
              </p>
            )}

            <div className="min-w-0 overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
              {rows.length === 0 ? (
                <p className="text-body-sm p-6">
                  No list for this email yet. Use Import send list to load{" "}
                  <code>email{def.list}_send_list.csv</code>.
                </p>
              ) : (
                <div className="max-h-[760px] overflow-auto px-6 pt-0.5 pb-1.5">
                  <OutreachRecipientTable
                    rows={visible.slice(0, SHOWN)}
                    programs={def.programs}
                    crests={crests}
                    selectedId={selected?.recipient.id ?? null}
                    tickedIds={tickedIds}
                    allTicked={allVisibleTicked}
                    onSelect={setSelectedId}
                    onTick={toggle}
                    onTickAll={toggleAllVisible}
                  />
                  {visible.length > SHOWN && (
                    <p className="text-body-sm py-3">
                      Showing {SHOWN} of {count(visible.length)}. Ticking all
                      ticks every row in this view, shown or not. Narrow by
                      division, conference or search.
                    </p>
                  )}
                </div>
              )}
            </div>
          </section>

          <aside
            aria-label="Preview and send"
            className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-4"
          >
            {selected && (
              <div className="overflow-hidden rounded-[12px] border border-[var(--border-hairline)]">
                {editingSelected ? (
                  <form
                    className="flex flex-col gap-2 px-4 pt-4 pb-3 text-[12px]"
                    onSubmit={(event) => {
                      event.preventDefault();
                      saveEdit();
                    }}
                  >
                    <p className="font-medium text-[var(--ink-900)]">
                      Edit {selected.recipient.label}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="flex flex-col gap-1 text-[var(--ink-600)]">
                        To name
                        <Input
                          id="outreach-edit-name"
                          value={editingSelected.toName}
                          onChange={(event) =>
                            setEditing({
                              ...editingSelected,
                              toName: event.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[var(--ink-600)]">
                        Last name (for “Coach …”)
                        <Input
                          id="outreach-edit-last"
                          value={editingSelected.toLastName}
                          onChange={(event) =>
                            setEditing({
                              ...editingSelected,
                              toLastName: event.target.value,
                            })
                          }
                        />
                      </label>
                    </div>
                    <label className="flex flex-col gap-1 text-[var(--ink-600)]">
                      To address
                      <Input
                        id="outreach-edit-email"
                        type="email"
                        value={editingSelected.toEmail}
                        onChange={(event) =>
                          setEditing({
                            ...editingSelected,
                            toEmail: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-[var(--ink-600)]">
                      CC, one per line: Name &lt;address&gt;
                      <textarea
                        id="outreach-edit-cc"
                        value={editingSelected.cc}
                        rows={4}
                        onChange={(event) =>
                          setEditing({
                            ...editingSelected,
                            cc: event.target.value,
                          })
                        }
                        className="w-full resize-y rounded-[6px] border border-[var(--border-card)] bg-[var(--surface-page)] p-2 text-[12px] text-[var(--ink-900)] outline-none focus-visible:shadow-[var(--focus-ring)]"
                      />
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className={advButton("primary", "sm")}
                        disabled={rowPending}
                      >
                        {rowPending ? "Saving…" : "Save"}
                      </button>
                      <button
                        type="button"
                        className={advButton("ghost", "sm")}
                        onClick={() => setEditing(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <dl className="m-0 grid grid-cols-[70px_minmax(0,1fr)] gap-x-3 gap-y-2 border-b border-[var(--border-hairline)] px-4 py-3.5 text-[12px]">
                    <dt className="text-[var(--ink-600)]">To</dt>
                    <dd className="break-words text-[var(--ink-900)]">
                      {selected.recipient.toName
                        ? `${selected.recipient.toName} <${selected.recipient.toEmail}>`
                        : selected.recipient.toEmail}
                      {selected.recipient.toRole
                        ? ` · ${selected.recipient.toRole}`
                        : ""}
                    </dd>
                    {selected.recipient.cc.length > 0 && (
                      <>
                        <dt className="text-[var(--ink-600)]">CC</dt>
                        <dd className="break-words text-[var(--ink-900)]">
                          {selected.recipient.cc
                            .map((person) => person.email)
                            .join(", ")}
                        </dd>
                      </>
                    )}
                    <dt className="text-[var(--ink-600)]">Subject</dt>
                    <dd className="font-medium text-[var(--ink-900)]">
                      {preview?.key === previewKey ? preview.subject : "…"}
                    </dd>
                    <dt className="text-[var(--ink-600)]">Status</dt>
                    <dd className="text-[var(--ink-900)]">
                      {OUTREACH_STATE_LABEL[selected.state]}
                      {selected.send
                        ? selected.send.scheduledAt
                          ? ` for ${formatOutreachWhen(selected.send.scheduledAt)}`
                          : ` ${formatOutreachWhen(selected.send.createdAt)}`
                        : ""}
                      {selected.send?.error ? ` · ${selected.send.error}` : ""}
                    </dd>
                    {selectedPrograms.length > 0 && (
                      <>
                        <dt className="text-[var(--ink-600)]">Programs</dt>
                        <dd className="flex flex-col gap-1">
                          {selectedPrograms.map(({ key, program }) => (
                            <div
                              key={key}
                              className="flex flex-wrap items-center gap-2"
                            >
                              {program ? (
                                <Link
                                  href={`/admin/teams/${program.id}`}
                                  className="text-[var(--ink-900)] underline-offset-2 hover:underline"
                                >
                                  {program.name || key}
                                </Link>
                              ) : (
                                <span className="text-[var(--danger)]">
                                  {key} isn&apos;t in programs
                                </span>
                              )}
                              {program && (
                                <span className="text-[var(--ink-600)]">
                                  {program.status === "unclaimed"
                                    ? "Unclaimed"
                                    : program.status.replace(/_/g, " ")}
                                </span>
                              )}
                              <a
                                href={`/claim/${encodeURIComponent(key)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[var(--ink-500)] hover:text-[var(--ink-800)]"
                              >
                                Claim page
                                <ExternalLink
                                  className="size-3"
                                  strokeWidth={1.5}
                                  aria-hidden
                                />
                              </a>
                            </div>
                          ))}
                        </dd>
                      </>
                    )}
                    {selected.firstSentAt && (
                      <>
                        <dt className="text-[var(--ink-600)]">Email 7</dt>
                        <dd className="text-[var(--ink-900)]">
                          {formatOutreachWhen(selected.firstSentAt)}
                        </dd>
                      </>
                    )}
                    {selected.recipient.fields.note && (
                      <>
                        <dt className="text-[var(--ink-600)]">Note</dt>
                        <dd className="text-[var(--ink-900)]">
                          {selected.recipient.fields.note}
                        </dd>
                      </>
                    )}
                  </dl>
                )}
                <div className="bg-[var(--surface-subtle)]">
                  {previewError ? (
                    <p className="text-body-sm p-4 text-[var(--danger)]">
                      {previewError}
                    </p>
                  ) : preview?.key === previewKey ? (
                    <iframe
                      aria-label={`Email ${emailNo} as ${selected.recipient.label} gets it`}
                      srcDoc={preview.html}
                      sandbox=""
                      className="block h-[720px] w-full border-0"
                    />
                  ) : (
                    <p className="text-body-sm p-4">
                      {previewPending ? "Rendering…" : ""}
                    </p>
                  )}
                </div>
              </div>
            )}

            {selected && (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {!editingSelected && (
                    <button
                      type="button"
                      className={advButton("outline", "sm")}
                      onClick={startEditing}
                    >
                      Edit recipient
                    </button>
                  )}
                  <button
                    type="button"
                    className={advButton("outline", "sm")}
                    disabled={rowPending}
                    onClick={() => holdOne(!selected.recipient.held)}
                  >
                    {selected.recipient.held ? "Release" : "Hold"}
                  </button>
                  {selected.state === "scheduled" && selected.send && (
                    <button
                      type="button"
                      className={advButton("danger", "sm")}
                      disabled={rowPending}
                      onClick={() => cancelScheduled(selected.send!.id)}
                    >
                      Cancel scheduled send
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <label className="flex min-w-[220px] flex-1 flex-col gap-1.5 text-[12px] text-[var(--ink-700)]">
                    Send a test to
                    <input
                      id="outreach-test-to"
                      type="email"
                      value={testTo}
                      onChange={(event) => setTestTo(event.target.value)}
                      className="h-8 border-0 border-b border-[var(--border-medium)] bg-transparent p-0 text-[13px] text-[var(--ink-900)] outline-none focus-visible:border-[var(--blue)]"
                    />
                  </label>
                  <button
                    type="button"
                    className={advButton("outline", "md")}
                    disabled={rowPending || !resendSet}
                    onClick={sendTest}
                  >
                    Send test
                  </button>
                </div>
                {rowNotice && (
                  <p
                    className={cn(
                      "text-[12px]",
                      rowNotice.ok
                        ? "text-[var(--ink-700)]"
                        : "text-[var(--danger)]",
                    )}
                  >
                    {rowNotice.message}
                  </p>
                )}
              </div>
            )}

            {/* The send: the ticked rows, or the next N of the division and
                conference chosen above the table. */}
            <section
              aria-labelledby="outreach-send"
              className="flex flex-col gap-3 border-t border-[var(--border-hairline)] pt-4"
            >
              <h2 id="outreach-send" className="sr-only">
                Send
              </h2>
              <div className="flex flex-wrap items-end gap-3">
                {!usingTicks && (
                  <label className="flex flex-col gap-1 text-[12px] text-[var(--ink-600)]">
                    How many
                    <Input
                      id="outreach-limit"
                      type="number"
                      min={1}
                      max={MAX_SEND}
                      value={limit}
                      onChange={(event) => setLimit(Number(event.target.value))}
                      className="w-[90px] tabular-nums"
                    />
                  </label>
                )}
                <fieldset className="flex flex-col gap-1 text-[12px] text-[var(--ink-600)]">
                  <legend className="pb-1">When</legend>
                  <div className="flex h-9 items-center gap-3">
                    <label className="flex items-center gap-1.5 text-[13px] text-[var(--ink-800)]">
                      <input
                        type="radio"
                        name="outreach-when"
                        id="outreach-when-now"
                        checked={when === "now"}
                        onChange={() => setWhen("now")}
                      />
                      Now
                    </label>
                    <label className="flex items-center gap-1.5 text-[13px] text-[var(--ink-800)]">
                      <input
                        type="radio"
                        name="outreach-when"
                        id="outreach-when-later"
                        checked={when === "later"}
                        onChange={() => setWhen("later")}
                      />
                      Schedule
                    </label>
                    {when === "later" && (
                      <Input
                        id="outreach-at"
                        type="datetime-local"
                        aria-label="Send at, your local time"
                        value={at}
                        onChange={(event) => setAt(event.target.value)}
                        className="w-[200px]"
                      />
                    )}
                  </div>
                </fieldset>
                <div className="flex-1" />
                <button
                  type="button"
                  className={advButton("primary", "md")}
                  disabled={Boolean(blocker) || tranchePending}
                  onClick={() => setConfirming(true)}
                >
                  {sendLabel}
                </button>
              </div>
              <p className="text-[12px] text-[var(--ink-500)]">
                {blocker ??
                  (usingTicks
                    ? `${count(next.length)} ticked ${def.programs ? "programs" : "people"} waiting for this email: ${count(addresses(next))} addresses including CC.${tickedRows.length > next.length ? ` ${count(tickedRows.length - next.length)} ticked rows were already sent, held or claimed and are left out.` : ""} Claim links are checked before anything sends.`
                    : `Next ${count(next.length)} of ${count(sendable.length)} waiting in ${selection}: ${count(addresses(next))} addresses including CC. Tick rows to send to exactly those instead. Claim links are checked before anything sends.`)}
              </p>
              {result && (
                <div className="flex flex-col gap-1 text-[12px]">
                  <p
                    className={
                      result.ok
                        ? "text-[var(--ink-800)]"
                        : "text-[var(--danger)]"
                    }
                  >
                    {result.message}
                  </p>
                  {result.failed.slice(0, 6).map((item) => (
                    <p key={item.label} className="text-[var(--ink-500)]">
                      {item.label}: {item.error}
                    </p>
                  ))}
                  {result.skipped.slice(0, 6).map((item) => (
                    <p key={item.label} className="text-[var(--ink-500)]">
                      Skipped {item.label}: {item.reason}
                    </p>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={(open) => !tranchePending && setConfirming(open)}
        title={
          when === "later"
            ? `Schedule ${next.length} emails?`
            : `Send ${next.length} emails?`
        }
        description={
          <ConfirmProse>
            Email {emailNo}, <Em>{def.name}</Em>
            {customized.has(emailNo) ? " (your edited version)" : ""}, to{" "}
            {usingTicks ? "the" : "the next"} {count(next.length)}{" "}
            {def.programs ? "programs" : "people"} in {selection}:{" "}
            {count(addresses(next))} addresses including CC
            {when === "later" && at
              ? `, going out ${formatOutreachWhen(new Date(at).toISOString())} your time`
              : ", right now"}
            . Every claim link is checked first, and nothing goes out if one
            doesn&apos;t load. This can&apos;t be undone
            {when === "later" ? " after the send time" : ""}.
          </ConfirmProse>
        }
        confirmLabel={
          when === "later" ? `Schedule ${next.length}` : `Send ${next.length}`
        }
        pendingLabel={when === "later" ? "Scheduling…" : "Sending…"}
        pending={tranchePending}
        onConfirm={runTranche}
      />

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={(open) => !bulkPending && setConfirmRemove(open)}
        tone="danger"
        title={`Remove ${count(tickedIds.size)} from the list?`}
        description={
          <ConfirmProse>
            Deletes these rows from email {def.list}&apos;s list. Rows that
            already have sends on record are kept; hold those instead. Importing
            the CSV again would bring removed rows back.
          </ConfirmProse>
        }
        confirmLabel={`Remove ${count(tickedIds.size)}`}
        pendingLabel="Removing…"
        pending={bulkPending}
        onConfirm={bulkRemove}
      />
    </AdminPage>
  );
}
