"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { AdminPage } from "@/components/admin/admin-page";
import { ViewPills } from "@/components/admin/view-pills";
import { AdvSelect } from "@/components/ui/adv-select";
import {
  ConfirmDialog,
  ConfirmProse,
  Em,
} from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { StatePill } from "@/components/ui/state-pill";
import {
  cancelOutreachSend,
  importOutreachCsv,
  previewOutreach,
  sendOutreachTest,
  sendOutreachTranche,
} from "@/app/admin/outreach/actions";
import { buildRows } from "@/lib/services/outreach/rows";
import {
  IMPORTABLE_LISTS,
  OUTREACH_EMAILS,
  outreachEmail,
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
 * One email at a time: its recipients on the left, the selected recipient's
 * exact email on the right, and the send controls above the list. A send is
 * always a tranche — the next N not-yet-sent rows of the current selection —
 * confirmed in a dialog that names the count, never a "send all".
 */

type View = "all" | "not_sent" | "scheduled" | "sent" | "failed" | "excluded";

const VIEW_OPTIONS: { value: View; label: string }[] = [
  { value: "all", label: "All" },
  { value: "not_sent", label: "Not sent" },
  { value: "scheduled", label: "Scheduled" },
  { value: "sent", label: "Sent" },
  { value: "failed", label: "Failed" },
  { value: "excluded", label: "Claimed or not due" },
];

const STATE_LABEL: Record<OutreachRow["state"], string> = {
  not_sent: "Not sent",
  sending: "Sending",
  sent: "Sent",
  scheduled: "Scheduled",
  failed: "Failed",
  claimed: "Claimed",
  not_due: "Not due",
};

const count = (value: number) => value.toLocaleString("en-US");

function addresses(rows: OutreachRow[]): number {
  return rows.reduce((sum, row) => sum + 1 + row.recipient.cc.length, 0);
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
      return row.state === "claimed" || row.state === "not_due";
  }
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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

export function OutreachPageContent({
  initialEmailNo,
  recipients,
  sends,
  claimedKeys,
  adminEmail,
  postalSet,
  resendSet,
  setupError,
}: {
  initialEmailNo: number;
  recipients: OutreachRecipient[];
  sends: OutreachSend[];
  claimedKeys: string[];
  adminEmail: string;
  postalSet: boolean;
  resendSet: boolean;
  setupError: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [emailNo, setEmailNo] = useState(initialEmailNo);
  const [view, setView] = useState<View>("all");
  const [division, setDivision] = useState("");
  const [conference, setConference] = useState("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const def = outreachEmail(emailNo) ?? OUTREACH_EMAILS[4];
  const claimed = useMemo(() => new Set(claimedKeys), [claimedKeys]);
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

  const sendable = cut.filter(
    (row) => row.state === "not_sent" || row.state === "failed",
  );
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

  /* ── Preview ─────────────────────────────────────────────────────────── */

  const [preview, setPreview] = useState<{
    id: string;
    emailNo: number;
    subject: string;
    html: string;
  } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewPending, startPreview] = useTransition();
  const selectedRecipientId = selected?.recipient.id ?? null;

  useEffect(() => {
    if (!selectedRecipientId) return;
    if (preview?.id === selectedRecipientId && preview.emailNo === emailNo)
      return;
    startPreview(async () => {
      const next = await previewOutreach(selectedRecipientId, emailNo);
      if (next.ok) {
        setPreview({
          id: selectedRecipientId,
          emailNo,
          subject: next.subject,
          html: next.html,
        });
        setPreviewError(null);
      } else {
        setPreviewError(next.error);
      }
    });
  }, [selectedRecipientId, emailNo, preview?.id, preview?.emailNo]);

  /* ── Test send and cancel ────────────────────────────────────────────── */

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

  /* ── Tranche ─────────────────────────────────────────────────────────── */

  const [limit, setLimit] = useState(40);
  const [when, setWhen] = useState<"now" | "later">("now");
  const [at, setAt] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<OutreachTrancheResult | null>(null);
  const [tranchePending, startTranche] = useTransition();

  const next = sendable.slice(0, Math.max(0, Math.min(limit || 0, 100)));
  const cold = emailNo === 6 || emailNo === 7 || emailNo === 8;
  const blocker = !resendSet
    ? "RESEND_API_KEY isn't set in this environment, so nothing can send."
    : cold && !postalSet
      ? "Set OUTREACH_POSTAL_ADDRESS in the environment before sending cold email."
      : next.length === 0
        ? "Nobody in this selection is waiting for this email."
        : when === "later" && !at
          ? "Pick a time to schedule for."
          : null;

  const selection =
    [division, conference].filter(Boolean).join(" · ") || "every division";

  function runTranche() {
    startTranche(async () => {
      const outcome = await sendOutreachTranche({
        emailNo,
        division: division || null,
        conference: conference || null,
        limit: next.length,
        scheduledAt: when === "later" && at ? new Date(at).toISOString() : null,
      });
      setResult(outcome);
      setConfirming(false);
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
      <AdminPage className="gap-4">
        <h1 className="text-display">Outreach</h1>
        <p className="text-body-sm max-w-[640px]">
          The outreach tables aren&apos;t in this database yet. Apply the
          migration <code>supabase/migrations/20261001050000_outreach.sql</code>
          , then reload.
        </p>
        <p className="text-[12px] text-[var(--ink-500)]">{setupError}</p>
      </AdminPage>
    );
  }

  const summary = [
    `${count(rows.length)} ${def.programs ? "programs" : "people"}`,
    `${count(tally("sent") + tally("sending"))} sent`,
    `${count(tally("scheduled"))} scheduled`,
    `${count(tally("not_sent"))} not sent`,
    tally("claimed") ? `${count(tally("claimed"))} claimed` : null,
    emailNo === 8 ? `${count(tally("not_due"))} not due yet` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <AdminPage className="gap-5">
      <div className="flex items-end gap-2.5">
        <div className="flex min-w-0 flex-1 items-baseline gap-4">
          <h1 className="text-display">Outreach</h1>
          <p className="text-body-sm truncate tabular-nums">{summary}</p>
        </div>
        <button
          type="button"
          aria-expanded={importing}
          className={advButton("outline", "md")}
          onClick={() => setImporting((open) => !open)}
        >
          <Upload className="size-3.5" strokeWidth={1.5} aria-hidden />
          Import list
        </button>
      </div>

      {importing && (
        <form
          className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] p-4"
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

      <ViewPills
        options={OUTREACH_EMAILS.map((email) => ({
          value: String(email.no),
          label: `${email.no} · ${email.name}`,
        }))}
        value={String(emailNo)}
        onChange={(value) => chooseEmail(Number(value))}
      />

      {/* The send bar: the next N of this selection, now or at a time. */}
      <section
        aria-labelledby="outreach-send"
        className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] p-4"
      >
        <div className="flex flex-wrap items-end gap-3">
          <h2 id="outreach-send" className="sr-only">
            Send
          </h2>
          <label className="flex flex-col gap-1 text-[12px] text-[var(--ink-600)]">
            Division
            <AdvSelect
              kind="boxed"
              id="outreach-division"
              value={division}
              onChange={(event) => {
                setDivision(event.target.value);
                setConference("");
              }}
              className="min-w-[140px]"
            >
              <option value="">Every division</option>
              {divisions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </AdvSelect>
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-[var(--ink-600)]">
            Conference
            <AdvSelect
              kind="boxed"
              id="outreach-conference"
              value={conference}
              onChange={(event) => setConference(event.target.value)}
              className="max-w-[320px] min-w-[240px]"
            >
              <option value="">Every conference</option>
              {conferences.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </AdvSelect>
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-[var(--ink-600)]">
            How many
            <Input
              id="outreach-limit"
              type="number"
              min={1}
              max={100}
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
              className="w-[90px] tabular-nums"
            />
          </label>
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
            {when === "later"
              ? `Schedule ${next.length}`
              : `Send ${next.length}`}
          </button>
        </div>
        <p className="text-[12px] text-[var(--ink-500)]">
          {blocker ??
            `Next ${count(next.length)} of ${count(sendable.length)} waiting in ${selection}: ${count(addresses(next))} addresses including CC. Claim links are checked before anything sends.`}
        </p>
        {result && (
          <div className="flex flex-col gap-1 text-[12px]">
            <p
              className={
                result.ok ? "text-[var(--ink-800)]" : "text-[var(--danger)]"
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
            Email {emailNo}, <Em>{def.name}</Em>, to the next{" "}
            {count(next.length)} {def.programs ? "programs" : "people"} in{" "}
            {selection}: {count(addresses(next))} addresses including CC
            {when === "later" && at
              ? `, going out ${formatWhen(new Date(at).toISOString())} your time`
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

      <div className="flex flex-wrap items-center gap-2">
        <ViewPills options={VIEW_OPTIONS} value={view} onChange={setView} />
        <div className="flex-1" />
        <Input
          id="outreach-search"
          type="search"
          placeholder="Search school, coach or address"
          aria-label="Search recipients"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="w-[280px]"
        />
      </div>

      <div className="grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_640px]">
        <div className="min-w-0 overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)]">
          {rows.length === 0 ? (
            <p className="text-body-sm p-6">
              No list for this email yet. Use Import list to load{" "}
              <code>email{def.list}_send_list.csv</code>.
            </p>
          ) : visible.length === 0 ? (
            <p className="text-body-sm p-6">Nobody here matches this view.</p>
          ) : (
            <div className="max-h-[760px] overflow-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead className="sticky top-0 bg-[var(--surface-card)]">
                  <tr className="text-left text-[11px] text-[var(--ink-500)]">
                    <th className="border-b border-[var(--border-hairline)] px-4 py-2 font-medium">
                      {def.programs ? "Program" : "Name"}
                    </th>
                    <th className="border-b border-[var(--border-hairline)] px-4 py-2 font-medium">
                      To
                    </th>
                    <th className="border-b border-[var(--border-hairline)] px-4 py-2 text-right font-medium">
                      CC
                    </th>
                    {def.programs && (
                      <th className="border-b border-[var(--border-hairline)] px-4 py-2 font-medium">
                        Conference
                      </th>
                    )}
                    <th className="border-b border-[var(--border-hairline)] px-4 py-2 font-medium">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.slice(0, 400).map((row) => {
                    const active = row.recipient.id === selected?.recipient.id;
                    return (
                      <tr
                        key={row.recipient.id}
                        aria-selected={active}
                        onClick={() => setSelectedId(row.recipient.id)}
                        className={cn(
                          "cursor-pointer border-b border-[var(--border-hairline)] hover:bg-[var(--surface-subtle)]",
                          active && "bg-[var(--surface-subtle)]",
                        )}
                      >
                        <td className="px-4 py-2.5">
                          <button
                            type="button"
                            className="text-left font-medium text-[var(--ink-900)] focus-visible:underline focus-visible:outline-none"
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedId(row.recipient.id);
                            }}
                          >
                            {row.recipient.label}
                          </button>
                          {row.recipient.programKeys.length > 1 && (
                            <span className="ml-2 text-[11px] text-[var(--ink-500)]">
                              Men&apos;s &amp; women&apos;s
                            </span>
                          )}
                        </td>
                        <td className="max-w-[260px] truncate px-4 py-2.5 text-[var(--ink-700)]">
                          {row.recipient.toName
                            ? `${row.recipient.toName} · `
                            : ""}
                          {row.recipient.toEmail}
                        </td>
                        <td className="px-4 py-2.5 text-right text-[var(--ink-700)] tabular-nums">
                          {row.recipient.cc.length || ""}
                        </td>
                        {def.programs && (
                          <td className="max-w-[220px] truncate px-4 py-2.5 text-[var(--ink-600)]">
                            {[row.recipient.division, row.recipient.conference]
                              .filter(Boolean)
                              .join(" · ")}
                          </td>
                        )}
                        <td className="px-4 py-2.5">
                          <StatePill outline={row.state === "not_sent"}>
                            {STATE_LABEL[row.state]}
                          </StatePill>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {visible.length > 400 && (
                <p className="text-body-sm px-4 py-3">
                  Showing 400 of {count(visible.length)}. Narrow by division,
                  conference or search.
                </p>
              )}
            </div>
          )}
        </div>

        {selected && (
          <aside
            aria-label="Preview"
            className="flex min-w-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] xl:sticky xl:top-4"
          >
            <dl className="grid grid-cols-[72px_minmax(0,1fr)] gap-x-3 gap-y-1 px-4 pt-4 text-[12px]">
              <dt className="text-[var(--ink-500)]">Subject</dt>
              <dd className="text-[var(--ink-900)]">
                {preview?.id === selected.recipient.id ? preview.subject : "…"}
              </dd>
              <dt className="text-[var(--ink-500)]">To</dt>
              <dd className="break-words text-[var(--ink-800)]">
                {selected.recipient.toName
                  ? `${selected.recipient.toName} <${selected.recipient.toEmail}>`
                  : selected.recipient.toEmail}
                {selected.recipient.toRole
                  ? ` · ${selected.recipient.toRole}`
                  : ""}
              </dd>
              {selected.recipient.cc.length > 0 && (
                <>
                  <dt className="text-[var(--ink-500)]">CC</dt>
                  <dd className="break-words text-[var(--ink-800)]">
                    {selected.recipient.cc
                      .map((person) => person.email)
                      .join(", ")}
                  </dd>
                </>
              )}
              {selected.send && (
                <>
                  <dt className="text-[var(--ink-500)]">Status</dt>
                  <dd className="text-[var(--ink-800)]">
                    {STATE_LABEL[selected.state]}
                    {selected.send.scheduledAt
                      ? ` for ${formatWhen(selected.send.scheduledAt)}`
                      : ` ${formatWhen(selected.send.createdAt)}`}
                    {selected.send.error ? ` · ${selected.send.error}` : ""}
                  </dd>
                </>
              )}
              {selected.firstSentAt && (
                <>
                  <dt className="text-[var(--ink-500)]">Email 7</dt>
                  <dd className="text-[var(--ink-800)]">
                    {formatWhen(selected.firstSentAt)}
                  </dd>
                </>
              )}
              {selected.recipient.fields.note && (
                <>
                  <dt className="text-[var(--ink-500)]">Note</dt>
                  <dd className="text-[var(--ink-800)]">
                    {selected.recipient.fields.note}
                  </dd>
                </>
              )}
            </dl>
            <div className="flex flex-wrap items-center gap-2 px-4 py-3">
              <Input
                id="outreach-test-to"
                type="email"
                aria-label="Send a test to"
                value={testTo}
                onChange={(event) => setTestTo(event.target.value)}
                className="w-[220px]"
              />
              <button
                type="button"
                className={advButton("outline", "sm")}
                disabled={rowPending || !resendSet}
                onClick={sendTest}
              >
                Send test
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
              {rowNotice && (
                <p
                  className={cn(
                    "w-full text-[12px]",
                    rowNotice.ok
                      ? "text-[var(--ink-700)]"
                      : "text-[var(--danger)]",
                  )}
                >
                  {rowNotice.message}
                </p>
              )}
            </div>
            <div className="border-t border-[var(--border-hairline)] bg-[var(--surface-page)]">
              {previewError ? (
                <p className="text-body-sm p-4 text-[var(--danger)]">
                  {previewError}
                </p>
              ) : preview?.id === selected.recipient.id &&
                preview.emailNo === emailNo ? (
                <iframe
                  aria-label={`Email ${emailNo} as ${selected.recipient.label} gets it`}
                  srcDoc={preview.html}
                  sandbox=""
                  className="block h-[820px] w-full border-0"
                />
              ) : (
                <p className="text-body-sm p-4">
                  {previewPending ? "Rendering…" : ""}
                </p>
              )}
            </div>
          </aside>
        )}
      </div>
    </AdminPage>
  );
}
