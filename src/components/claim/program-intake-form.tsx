"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { saveProgramIntake } from "@/app/claim/team/about/actions";
import {
  ACQUISITION_SOURCES,
  ROSTER_SIZE_BANDS,
  WEEKLY_FILM_BANDS,
  isAcquisitionSource,
  type AcquisitionSource,
  type RosterSizeBand,
  type WeeklyFilmBand,
} from "@/app/onboarding/answers";
import {
  ClaimActions,
  ClaimSelect,
  CLAIM_BUTTON,
  CLAIM_LABEL,
  CLAIM_LINK,
  RadioDot,
} from "./claim-shell";

/**
 * Onboarding & Team Setup, screen 5.2 — the coach's intake. Two band questions
 * as 4-across radio rows and one "how did you hear" select.
 *
 * Every answer is optional, so the button never waits on a selection: a coach
 * who presses it with nothing chosen goes to their team exactly as Skip does,
 * and a coach who answers one question saves that one. A chosen band can't be
 * unchosen — that is what a radio is — but nothing forces the first choice.
 *
 * The select's empty first option is the unanswered state and maps to null.
 * It uses `coachLabel`, which differs from the player wording only for
 * `coach_or_teammate` ("Another coach or program").
 */
export function ProgramIntakeForm({ programId }: { programId: string }) {
  const [rosterSizeBand, setRosterSizeBand] = useState<RosterSizeBand | null>(
    null,
  );
  const [weeklyFilmBand, setWeeklyFilmBand] = useState<WeeklyFilmBand | null>(
    null,
  );
  const [acquisitionSource, setAcquisitionSource] =
    useState<AcquisitionSource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      // Success redirects on the server; a returned value is always a refusal.
      const result = await saveProgramIntake({
        programId,
        rosterSizeBand,
        weeklyFilmBand,
        acquisitionSource,
      });
      if (result && !result.ok) setError(result.error);
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <BandQuestion
        label="Players on your roster"
        options={ROSTER_SIZE_BANDS}
        value={rosterSizeBand}
        onChange={setRosterSizeBand}
      />
      <BandQuestion
        label="Matches you film in a typical week"
        options={WEEKLY_FILM_BANDS}
        value={weeklyFilmBand}
        onChange={setWeeklyFilmBand}
      />

      <div>
        <label htmlFor="acquisitionSource" className={CLAIM_LABEL}>
          How did you hear about Advantage?
        </label>
        <ClaimSelect
          id="acquisitionSource"
          value={acquisitionSource ?? ""}
          onChange={(e) =>
            setAcquisitionSource(
              isAcquisitionSource(e.target.value) ? e.target.value : null,
            )
          }
        >
          <option value="">Choose one</option>
          {ACQUISITION_SOURCES.map((source) => (
            <option key={source.value} value={source.value}>
              {source.coachLabel}
            </option>
          ))}
        </ClaimSelect>
      </div>

      {error && (
        <p className="rounded-[var(--radius-button)] bg-[var(--danger-tint-15)] px-3 py-2 text-[12px] text-[var(--danger)]">
          {error}
        </p>
      )}

      <ClaimActions>
        <button type="submit" disabled={pending} className={CLAIM_BUTTON}>
          {pending ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Saving
            </span>
          ) : (
            "Go to my team"
          )}
        </button>
        <Link href="/dashboard/team" className={CLAIM_LINK}>
          Skip
        </Link>
      </ClaimActions>
    </form>
  );
}

/**
 * One question: a 13px label over four compact radio rows, 4-across. The row
 * markup is onboarding step 3's (`role="radio"`, blue ring + 8% tint when
 * chosen) at `px-4 py-3` so four fit on one line of a 720px column.
 */
function BandQuestion<Value extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: Value; label: string }[];
  value: Value | null;
  onChange: (value: Value) => void;
}) {
  return (
    <div>
      <p className="mb-2.5 text-[13px] text-[var(--ink-900)]">{label}</p>
      <div
        role="radiogroup"
        aria-label={label}
        className="grid grid-cols-4 gap-2"
      >
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-[var(--radius-element)] border px-4 py-3 text-left transition-colors duration-[var(--duration-fast)]",
                "focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
                selected
                  ? "border-[var(--blue)] bg-[var(--blue-tint-08)]"
                  : "border-[var(--border-field)] bg-[var(--surface-card)] hover:bg-[var(--surface-subtle)]",
              )}
            >
              <RadioDot selected={selected} align="" />
              <span className="text-[14px] leading-5 text-[var(--ink-900)]">
                {option.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
