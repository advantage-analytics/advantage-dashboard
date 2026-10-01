import { expect, test } from "@playwright/test";

import { renderEmail } from "@/lib/services/email/shell";
import {
  OutreachConfigError,
  renderOutreachEmail,
} from "@/lib/services/email/templates/outreach";
import { recipientsFromCsv } from "@/lib/services/outreach/csv";
import { buildRows } from "@/lib/services/outreach/rows";
import type {
  OutreachRecipient,
  OutreachSend,
} from "@/lib/services/outreach/types";

/**
 * /admin/outreach — offline. The CSV import, the row states and the template
 * are pure; nothing here touches a database or sends anything.
 */

const SITE = "https://app.example.test";

test.beforeAll(() => {
  process.env.NEXT_PUBLIC_SITE_URL = SITE;
});

const HEADER =
  "program_keys,school,division,conference,to_name,to_last_name,to_role,to_email,cc_emails,cc_names,claim_urls,first_send_resend_id,note";

function recipient(over: Partial<OutreachRecipient> = {}): OutreachRecipient {
  return {
    id: "r1",
    emailNo: 7,
    rowKey: "ExampleUniversityM;ExampleUniversityW",
    label: "Example University",
    division: "D2",
    conference: "Sun",
    toName: "Pat Coach",
    toLastName: "Coach",
    toRole: "Head Coach",
    toEmail: "pat@example.edu",
    cc: [{ name: "Sam Assistant", email: "sam@example.edu" }],
    programKeys: ["ExampleUniversityM", "ExampleUniversityW"],
    fields: {},
    ...over,
  };
}

function send(over: Partial<OutreachSend> = {}): OutreachSend {
  return {
    id: "s1",
    recipientId: "r1",
    emailNo: 7,
    status: "sent",
    resendId: "re_1",
    scheduledAt: null,
    createdAt: "2026-09-01T12:00:00.000Z",
    error: null,
    ...over,
  };
}

test("list 7 CSV: keys, CC and duplicate To addresses", () => {
  const csv = [
    HEADER,
    `ExampleUniversityM;ExampleUniversityW,Example University,D2,Sun,Pat Coach,Coach,Head Coach,pat@example.edu,"sam@example.edu;pat@example.edu","Sam Assistant;Pat Coach",,,`,
    `OtherCollegeW,Other College,D3,UAA,Lee Coach,Coach,Head Coach,PAT@example.edu,,,,,`,
    `BadW,Bad,D3,UAA,No One,One,Head Coach,not-an-email,,,,,`,
  ].join("\n");
  const { rows, problems } = recipientsFromCsv(7, csv);
  expect(rows).toHaveLength(1);
  expect(rows[0].programKeys).toEqual([
    "ExampleUniversityM",
    "ExampleUniversityW",
  ]);
  // The To address never repeats in CC.
  expect(rows[0].cc.map((cc) => cc.email)).toEqual(["sam@example.edu"]);
  expect(problems.length).toBeGreaterThanOrEqual(2);
});

test("a CSV missing a required column is refused whole", () => {
  const { rows, problems } = recipientsFromCsv(7, "school,to_email\nX,a@b.co");
  expect(rows).toHaveLength(0);
  expect(problems[0]).toContain("missing");
});

test("row states: claimed, live send wins, follow-up waits seven days", () => {
  const now = new Date("2026-09-05T12:00:00.000Z");
  const r = recipient();

  expect(buildRows(7, [r], [], new Set(), now)[0].state).toBe("not_sent");
  expect(
    buildRows(7, [r], [], new Set(["ExampleUniversityW"]), now)[0].state,
  ).toBe("claimed");
  expect(
    buildRows(
      7,
      [r],
      [send(), send({ id: "s2", status: "failed" })],
      new Set(),
      now,
    )[0].state,
  ).toBe("sent");

  // Email 7 went on Sep 1: not due on Sep 5, due on Sep 9.
  expect(buildRows(8, [r], [send()], new Set(), now)[0].state).toBe("not_due");
  expect(
    buildRows(8, [r], [send()], new Set(), new Date("2026-09-09T12:00:00Z"))[0]
      .state,
  ).toBe("not_sent");
});

test("cold email: claim buttons, CC, unsubscribe and postal address", () => {
  const { subject, message } = renderOutreachEmail(
    7,
    recipient(),
    "Advantage Analytics, 1 Main St, Town, ST 00000",
  );
  expect(subject).toContain("Example University");
  expect(message.cc).toEqual(["sam@example.edu"]);
  expect(message.headers?.["List-Unsubscribe"]).toContain("unsubscribe");
  expect(message.html).toContain(`${SITE}/claim/ExampleUniversityM`);
  expect(message.html).toContain(`${SITE}/claim/ExampleUniversityW`);
  expect(message.html).toContain("1 Main St");
  expect(message.text).toContain("1 Main St");
});

test("cold email refuses to render without a postal address", () => {
  expect(() => renderOutreachEmail(7, recipient(), null)).toThrow(
    OutreachConfigError,
  );
  // The preview still renders, with a placeholder.
  expect(() =>
    renderOutreachEmail(7, recipient(), null, { preview: true }),
  ).not.toThrow();
});

test("the shell is unchanged for mail with no compliance footer", () => {
  const html = renderEmail({
    preheader: "p",
    eyebrow: "e",
    heading: "h",
    body: ["x"],
    cta: { label: "Go", url: `${SITE}/x` },
  });
  expect(html).not.toContain("Unsubscribe");
  expect(html).not.toContain('class="btn2');
});
