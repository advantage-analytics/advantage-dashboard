"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AdvSelect } from "@/components/ui/adv-select";
import { Checkbox } from "@/components/ui/checkbox";
import type { Labeller } from "@/lib/services/labels/assign-session";
import type {
  CreatePracticeCopiesResult,
  PracticeCopyOutcome,
} from "@/lib/services/labels/practice-session";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

/**
 * "Create practice copies": a set (or the whole match) and the labellers who
 * get one. One copy per person; the server refuses a second copy for someone
 * who already holds one, and says so on that person's line.
 */
export function CreatePracticeCopies({
  sourceSessionId,
  pointsBySet,
  judgedBySet,
  labellers,
  alreadyHave,
  create,
}: {
  sourceSessionId: string;
  pointsBySet: Record<number, number>;
  judgedBySet: Record<number, number>;
  labellers: readonly Labeller[];
  /** Labellers holding a copy of this key already: listed, not pickable. */
  alreadyHave: readonly string[];
  create: (input: {
    sourceSessionId: string;
    setNumber: number | null;
    labellerIds: string[];
  }) => Promise<CreatePracticeCopiesResult>;
}) {
  const router = useRouter();
  const sets = Object.keys(pointsBySet)
    .map(Number)
    .sort((a, b) => a - b);
  const [set, setSet] = useState<string>(sets[0] ? String(sets[0]) : "match");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<PracticeCopyOutcome[] | null>(null);

  const held = new Set(alreadyHave);
  const setNumber = set === "match" ? null : Number(set);
  const judged = setNumber === null ? null : (judgedBySet[setNumber] ?? 0);

  function toggle(id: string, on: boolean) {
    setChosen((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function submit() {
    setError(null);
    setOutcomes(null);
    startTransition(async () => {
      const result = await create({
        sourceSessionId,
        setNumber,
        labellerIds: [...chosen],
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setOutcomes(result.copies);
      setChosen(new Set());
      router.refresh();
    });
  }

  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] p-6 shadow-[var(--shadow-card)]">
      <h2 className="text-[16px] font-medium text-[var(--ink-900)]">
        Create practice copies
      </h2>
      <p className="text-body-sm mt-1.5">
        Each person gets their own copy of the AI output to clean. Copies are
        submitted and graded against this session; they never publish.
      </p>

      <div className="mt-5 flex flex-wrap items-end gap-6">
        <label className="flex flex-col gap-1.5">
          <span className="eyebrow-sm">Set</span>
          <AdvSelect
            kind="boxed"
            value={set}
            onChange={(event) => setSet(event.target.value)}
            wrapperClassName="w-[200px]"
          >
            {sets.map((n) => (
              <option key={n} value={String(n)}>
                Set {n} · {pointsBySet[n]} points
              </option>
            ))}
            <option value="match">Whole match</option>
          </AdvSelect>
        </label>
        {judged !== null && (
          <p
            className={cn(
              "pb-2 text-[12px]",
              judged === 0 ? "text-[var(--ink-700)]" : "text-[var(--ink-500)]",
            )}
          >
            {judged === 0
              ? "No forced/unforced calls in this set yet, so error kind won’t be graded."
              : `${judged} forced/unforced calls in this set.`}
          </p>
        )}
      </div>

      <fieldset className="mt-5">
        <legend className="eyebrow-sm">Labellers</legend>
        {labellers.length === 0 ? (
          <p className="text-body-sm mt-2">
            No one is a labeller yet. Give an account the labeller role first.
          </p>
        ) : (
          <ul className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            {labellers.map((person) => {
              const has = held.has(person.id);
              return (
                <li key={person.id}>
                  <label
                    className={cn(
                      "flex h-9 items-center gap-2.5 text-[13px]",
                      has ? "text-[var(--ink-400)]" : "text-[var(--ink-900)]",
                    )}
                  >
                    <Checkbox
                      checked={chosen.has(person.id)}
                      disabled={has || pending}
                      onChange={(on) => toggle(person.id, on)}
                    />
                    <span className="truncate">{person.name}</span>
                    <span className="truncate text-[12px] text-[var(--ink-500)]">
                      {has ? "Has a copy" : person.email}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      <div className="mt-5 flex items-center gap-4">
        <button
          type="button"
          className={advButton("primary", "md")}
          disabled={pending || chosen.size === 0}
          onClick={submit}
        >
          {pending
            ? "Creating…"
            : chosen.size > 1
              ? `Create ${chosen.size} copies`
              : "Create copy"}
        </button>
        {error && (
          <p role="alert" className="text-[13px] text-[var(--danger)]">
            {error}
          </p>
        )}
      </div>

      {outcomes && (
        <ul className="mt-4 flex flex-col gap-1 text-[13px]" role="status">
          {outcomes.map((outcome) => (
            <li
              key={outcome.labellerId}
              className={
                outcome.ok ? "text-[var(--ink-700)]" : "text-[var(--danger)]"
              }
            >
              {outcome.name}: {outcome.ok ? "copy created" : outcome.error}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
