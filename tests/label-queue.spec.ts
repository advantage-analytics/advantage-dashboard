import { expect, test } from "@playwright/test";

import {
  LABEL_CLAIM_CHOICES,
  LABEL_DUE_WINDOW_HOURS,
  LABEL_QUEUE_CARRIED_FROM,
  LABEL_QUEUE_FROM,
  claimableJobIds,
  enterLabelQueue,
  isOverdue,
  isTestOwner,
  labelDueAt,
  labelPublishedText,
  labelDueText,
  sortByDue,
  urgencyLevel,
  type LabelQueueJob,
} from "@/lib/services/labels/queue";

const NOW = new Date("2026-11-13T12:00:00Z");
const MIN = 60_000;
const HOUR = 3_600_000;
const at = (offsetMs: number) => new Date(NOW.getTime() + offsetMs);

function job(over: Partial<LabelQueueJob> = {}): LabelQueueJob {
  return {
    id: "job-a",
    completedAt: "2026-11-20T10:00:00Z",
    start_time_seconds: 0,
    end_time_seconds: 3600,
    billable_seconds: 3600,
    ownerEmail: "maya@stanford.edu",
    session: null,
    ...over,
  };
}

test.describe("label queue: due time", () => {
  test("constants are the settled launch rules", () => {
    expect(LABEL_DUE_WINDOW_HOURS).toBe(36);
    expect(LABEL_QUEUE_FROM).toBe("2026-11-17T00:00:00Z");
    expect(LABEL_QUEUE_CARRIED_FROM).toBe("2026-10-29T00:00:00Z");
    expect(LABEL_CLAIM_CHOICES).toBe(3);
  });

  test("due is completion plus 36 hours", () => {
    expect(labelDueAt("2026-11-01T10:00:00Z").toISOString()).toBe(
      "2026-11-02T22:00:00.000Z",
    );
  });

  test("minutes under an hour", () => {
    expect(labelDueText(at(59 * MIN + 59_000), NOW)).toBe("Due in 59 min");
    expect(labelDueText(at(30 * MIN), NOW)).toBe("Due in 30 min");
    expect(labelDueText(at(20_000), NOW)).toBe("Due in 1 min");
  });

  test("floored hours from one hour up", () => {
    expect(labelDueText(at(HOUR), NOW)).toBe("Due in 1 h");
    expect(labelDueText(at(2 * HOUR - 1), NOW)).toBe("Due in 1 h");
    expect(labelDueText(at(2 * HOUR), NOW)).toBe("Due in 2 h");
    expect(labelDueText(at(36 * HOUR), NOW)).toBe("Due in 36 h");
  });

  test("overdue reads at least 1 h", () => {
    expect(labelDueText(NOW, NOW)).toBe("Overdue by 1 h");
    expect(labelDueText(at(-1 * MIN), NOW)).toBe("Overdue by 1 h");
    expect(labelDueText(at(-2 * HOUR + 1), NOW)).toBe("Overdue by 1 h");
    expect(labelDueText(at(-2.5 * HOUR), NOW)).toBe("Overdue by 2 h");
  });

  test("isOverdue flips at the due moment", () => {
    expect(isOverdue(at(1), NOW)).toBe(false);
    expect(isOverdue(NOW, NOW)).toBe(true);
    expect(isOverdue(at(-1), NOW)).toBe(true);
  });

  test("urgency is express or standard", () => {
    expect(urgencyLevel("express")).toBe("express");
    expect(urgencyLevel("standard")).toBe("standard");
    expect(urgencyLevel(null)).toBe("standard");
  });
});

test.describe("label queue: who enters", () => {
  test("a real, analysed, unpublished job enters", () => {
    expect(enterLabelQueue(job())).toBe(true);
    expect(enterLabelQueue(job({ completedAt: LABEL_QUEUE_FROM }))).toBe(true);
    expect(
      enterLabelQueue(
        job({ session: { status: "labelling", assignedTo: "u1" } }),
      ),
    ).toBe(true);
  });

  test("a job completed 2026-10-28T23:59Z is left out", () => {
    expect(enterLabelQueue(job({ completedAt: "2026-10-28T23:59:00Z" }))).toBe(
      false,
    );
    expect(enterLabelQueue(job({ completedAt: null }))).toBe(false);
  });

  test("before the to-do cut-off, only work already started stays", () => {
    const carried = "2026-11-06T10:00:00Z";
    // Waiting for a labeller: off the to-do, so off the queue.
    expect(enterLabelQueue(job({ completedAt: carried }))).toBe(false);
    expect(
      enterLabelQueue(
        job({
          completedAt: carried,
          session: { status: "labelling", assignedTo: null },
        }),
      ),
    ).toBe(false);
    // Held, sent back, handed in or published and unchecked: kept.
    for (const session of [
      { status: "labelling", assignedTo: "u1" },
      { status: "labelling", assignedTo: null, sentBackAt: carried },
      { status: "submitted", assignedTo: "u1" },
      { status: "complete", assignedTo: "u1" },
    ]) {
      expect(enterLabelQueue(job({ completedAt: carried, session }))).toBe(
        true,
      );
    }
    // A checked one has left, as it does after the cut-off.
    expect(
      enterLabelQueue(
        job({
          completedAt: carried,
          session: { status: "complete", assignedTo: "u1", checkedAt: carried },
        }),
      ),
    ).toBe(false);
  });

  test("a zero-length video is left out", () => {
    expect(
      enterLabelQueue(
        job({
          start_time_seconds: 0,
          end_time_seconds: null,
          billable_seconds: 0,
        }),
      ),
    ).toBe(false);
    expect(
      enterLabelQueue(
        job({
          start_time_seconds: 0,
          end_time_seconds: null,
          billable_seconds: null,
        }),
      ),
    ).toBe(false);
  });

  test("a test-email owner is left out", () => {
    const testJob = job({ ownerEmail: "run42-coach@example.com" });
    expect(isTestOwner(testJob)).toBe(true);
    expect(enterLabelQueue(testJob)).toBe(false);
  });

  test("a published session stays until the admin checks it", () => {
    expect(
      enterLabelQueue(
        job({
          session: { status: "complete", assignedTo: "u", checkedAt: null },
        }),
      ),
    ).toBe(true);
    expect(
      enterLabelQueue(
        job({ session: { status: "complete", assignedTo: "u" } }),
      ),
    ).toBe(true);
  });

  test("a checked (complete) session is left out", () => {
    expect(
      enterLabelQueue(
        job({
          session: {
            status: "complete",
            assignedTo: "u",
            checkedAt: "2026-11-12T10:00:00Z",
          },
        }),
      ),
    ).toBe(false);
  });

  test("a sent-back session stays in the queue", () => {
    expect(
      enterLabelQueue(
        job({
          session: {
            status: "labelling",
            assignedTo: "u",
            sentBackAt: "2026-11-12T10:00:00Z",
          },
        }),
      ),
    ).toBe(true);
  });
});

test.describe("label queue: published timeliness", () => {
  test("on time at or before due, floored hours late after", () => {
    const due = "2026-11-02T22:00:00Z";
    expect(labelPublishedText("2026-11-02T21:00:00Z", due)).toBe("On time");
    expect(labelPublishedText(due, due)).toBe("On time");
    expect(labelPublishedText("2026-11-02T22:10:00Z", due)).toBe("1 h late");
    expect(labelPublishedText("2026-11-03T00:59:00Z", due)).toBe("2 h late");
  });
});

test.describe("label queue: order and claims", () => {
  test("earliest due first, ties by job id", () => {
    const rows = [
      { id: "c", dueAt: "2026-11-02T10:00:00Z" },
      { id: "b", dueAt: "2026-11-01T10:00:00Z" },
      { id: "a", dueAt: "2026-11-02T10:00:00Z" },
    ];
    expect(sortByDue(rows).map((r) => r.id)).toEqual(["b", "a", "c"]);
    expect(rows[0].id).toBe("c");
  });

  test("only the first three open rows are claimable", () => {
    const rows = [
      { id: "1", session: null },
      { id: "2", session: { status: "labelling", assignedTo: null } },
      { id: "3", session: null },
      { id: "4", session: { status: "labelling", assignedTo: null } },
    ];
    expect(claimableJobIds(rows)).toEqual(["1", "2", "3"]);
  });

  test("held or handed-in rows are skipped, not counted", () => {
    const rows = [
      { id: "1", session: { status: "labelling", assignedTo: "u1" } },
      { id: "2", session: { status: "submitted", assignedTo: null } },
      { id: "3", session: null },
      { id: "4", session: null },
    ];
    expect(claimableJobIds(rows)).toEqual(["3", "4"]);
  });

  test("a published session is never claimable, nor a sent-back one", () => {
    const rows = [
      {
        id: "1",
        session: { status: "complete", assignedTo: null, checkedAt: null },
      },
      {
        id: "2",
        session: {
          status: "labelling",
          assignedTo: null,
          sentBackAt: "2026-11-12T10:00:00Z",
        },
      },
      {
        id: "3",
        session: {
          status: "labelling",
          assignedTo: "u1",
          sentBackAt: "2026-11-12T10:00:00Z",
        },
      },
      { id: "4", session: null },
    ];
    expect(claimableJobIds(rows)).toEqual(["4"]);
  });
});
