"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { DialogProblem } from "@/components/ui/dialog-problem";
import { MenuSelect } from "@/components/ui/menu-select";
import { AdvSwitch } from "@/components/ui/adv-switch";
import { ImageAdjustDialog } from "@/components/dashboard/settings/image-adjust-dialog";
import { ProgramCrest } from "@/components/dashboard/settings/teams/program-crest";
import { ConferenceSelect } from "@/components/dashboard/settings/teams/conference-select";
import { adminUploadProgramCrest } from "@/lib/services/programs/admin-team-actions";
import {
  conferenceOptionsFor,
  createProgram,
} from "@/lib/services/programs/admin-program-actions";
import type {
  CreateProgramOwnerOutcome,
  ProgramOrgType,
} from "@/lib/services/programs/admin-program-actions";
import { advButton } from "@/lib/ui/adv-button";
import { advField } from "@/lib/ui/adv-field";
import { formatPilotEnd } from "@/lib/services/splitstep/config";
import { cn } from "@/lib/utils";

/**
 * Admin › Teams › Create team.
 *
 * The hand path beside the imported directory: a school the ITA data does not
 * have, a club running a pilot, a coach who cannot claim a row that does not
 * exist. `createProgram()` (`services/programs/admin-program-actions.ts`)
 * carries the rules; this collects what it needs and says what happened.
 *
 * ── Two steps, because creation is not the end of it ────────────────────────
 * Creating the row is one action, and everything the admin might want next —
 * the crest, and knowing what became of the coach's address — depends on the
 * id it returns. So the dialog does not close on success: it swaps to a second
 * step that names the outcome in a sentence and offers the crest, with the
 * program's page one button away. Closing on success and re-finding the team
 * to add its crest would be the same two steps with a navigation in the
 * middle.
 *
 * ── Why the owner's email is optional ───────────────────────────────────────
 * The directory is full of programs with no owner; that is its resting state,
 * not a gap. An admin seeding a row before anyone has been spoken to should
 * not have to invent an address, so the field is blank-able and the second
 * step says plainly that the program is directory data until somebody claims
 * it.
 *
 * Fields are the underline vocabulary (`advField("underline")` and
 * `MenuSelect`'s underline trigger), which is the Dialog spec's rule: the
 * active field's rule thickens to 2px blue and that is its only focus mark,
 * hence `data-focus-ring="none"` on each — see `reference/focus.md`'s
 * underline opt-out.
 */

const ORG_TYPES: {
  value: ProgramOrgType;
  label: string;
  description?: string;
}[] = [
  {
    value: "college",
    label: "College",
    description: "Gets a claim link and a directory record",
  },
  { value: "club", label: "Club" },
  { value: "high_school", label: "High school" },
  { value: "academy", label: "Academy" },
  { value: "other", label: "Other" },
];

const SQUADS = [
  { value: "mens" as const, label: "Men's tennis" },
  { value: "womens" as const, label: "Women's tennis" },
];

/** The five `programs_division_check` allows, said the way every screen says them. */
const DIVISIONS = [
  { value: "D1", label: "D-I" },
  { value: "D2", label: "D-II" },
  { value: "D3", label: "D-III" },
  { value: "NAIA", label: "NAIA" },
  { value: "JUCO", label: "JUCO" },
];

const STATES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DC",
  "DE",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
].map((code) => ({ value: code, label: code }));

/** Edge of the square the adjust dialog bakes — the crest control's own number. */
const CREST_EDGE_PX = 512;
const CREST_ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";

interface Created {
  programId: string;
  name: string;
  owner: CreateProgramOwnerOutcome;
  warning?: string;
}

export function CreateTeamDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();

  const [orgType, setOrgType] = useState<ProgramOrgType | undefined>(undefined);
  const [name, setName] = useState("");
  const [team, setTeam] = useState<"mens" | "womens" | undefined>(undefined);
  const [division, setDivision] = useState<string | undefined>(undefined);
  const [conference, setConference] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState<string | undefined>(undefined);
  const [domain, setDomain] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [startPilot, setStartPilot] = useState(false);

  const [conferences, setConferences] = useState<{
    key: string;
    options: string[];
  }>({ key: "", options: [] });
  const [problem, setProblem] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [pending, startCreating] = useTransition();

  const isCollege = orgType === "college";

  // The directory's conferences are per division — a D-I conference on a
  // D-III record is a program nobody will ever match — so the list is refetched
  // whenever the division changes, and there is none at all for a non-college
  // org, which has no directory to pick from.
  //
  // The fetched list is stored WITH the division it answers, and read only when
  // the two still agree (the same trick the teams list plays with its keyset
  // pages). Clearing it in the effect instead would paint the previous
  // division's conferences for a frame, and would be a synchronous setState in
  // an effect body — the cascading-render pattern the lint rule names.
  const conferenceKey = isCollege ? (division ?? "any") : "";
  const conferenceChoices =
    conferences.key === conferenceKey ? conferences.options : [];

  useEffect(() => {
    if (!open || !isCollege) return;
    let live = true;
    const key = conferenceKey;
    conferenceOptionsFor(division ?? null).then((options) => {
      if (live) setConferences({ key, options });
    });
    return () => {
      live = false;
    };
  }, [conferenceKey, division, isCollege, open]);

  // Everything resets on close, including the outcome step: reopening is a new
  // program, and a form that remembers the last one is how the wrong school
  // ends up in the directory.
  const close = (next: boolean) => {
    onOpenChange(next);
    if (next) return;
    setOrgType(undefined);
    setName("");
    setTeam(undefined);
    setDivision(undefined);
    setConference("");
    setCity("");
    setState(undefined);
    setDomain("");
    setOwnerEmail("");
    setStartPilot(false);
    setProblem(null);
    setCreated(null);
  };

  // The primary's promise: nothing is missing that the row cannot be written
  // without. A college needs its squad — `programs_college_fields_check` and
  // the key both depend on it — and everything else is genuinely optional.
  const ready =
    name.trim().length >= 2 && orgType !== undefined && (!isCollege || !!team);

  const submit = () => {
    if (!ready || !orgType) return;
    setProblem(null);
    startCreating(async () => {
      const result = await createProgram({
        orgType,
        schoolName: name,
        team: isCollege ? (team ?? null) : null,
        division: isCollege ? (division ?? null) : null,
        conference: conference.trim() || null,
        city: city.trim() || null,
        state: state ?? null,
        primaryDomain: domain.trim() || null,
        ownerEmail: ownerEmail.trim() || null,
        startPilot,
      });
      if (!result.ok) {
        setProblem(result.error);
        return;
      }
      setCreated({
        programId: result.programId,
        name: name.trim(),
        owner: result.owner,
        warning: result.warning,
      });
    });
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        hideCloseButton
        className="gap-0 border-0 bg-[var(--surface-card)] p-0 sm:max-w-none"
        style={{
          width: "440px",
          maxWidth: "calc(100vw - 32px)",
          borderRadius: "14px",
          boxShadow: "var(--shadow-dropdown)",
        }}
      >
        <div className="flex flex-col gap-[18px] p-6 pb-5">
          <div className="flex items-start gap-2.5">
            <div className="flex-1">
              <DialogTitle className="text-left text-[16px] font-medium text-[var(--ink-900)]">
                {created ? "Team created" : "Create a team"}
              </DialogTitle>
              <DialogDescription className="mt-1 text-left text-[12px] leading-[1.55] text-[var(--ink-600)]">
                {created
                  ? outcomeSentence(created)
                  : "Adds a program to the directory. A college gets a claim link; anything else is invited."}
              </DialogDescription>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => close(false)}
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
            >
              <X className="size-3.5" strokeWidth={1.5} aria-hidden />
            </button>
          </div>

          {created ? (
            <CrestStep
              created={created}
              onProblem={setProblem}
              problem={problem}
            />
          ) : (
            <div className="flex flex-col gap-[18px]">
              <div className="grid grid-cols-2 gap-x-4 gap-y-[18px]">
                <Field label="School or club name" className="col-span-2">
                  <input
                    type="text"
                    value={name}
                    placeholder="Meridian State University"
                    autoComplete="off"
                    data-focus-ring="none"
                    onChange={(event) => setName(event.target.value)}
                    className={cn(advField("underline"), "w-full outline-none")}
                  />
                </Field>

                <Field label="Type">
                  <MenuSelect
                    label="Type"
                    variant="underline"
                    value={orgType}
                    placeholder="Choose"
                    options={ORG_TYPES}
                    onChange={(next) => {
                      setOrgType(next);
                      // A squad, a division and a conference are a college's
                      // record. Carrying them onto a club would write fields
                      // the constraint forbids.
                      if (next !== "college") {
                        setTeam(undefined);
                        setDivision(undefined);
                        setConference("");
                      }
                    }}
                  />
                </Field>

                {/* Hidden rather than disabled for a club: a disabled control
                    still looks like something the admin failed to fill in,
                    where an absent one reads as not applying. */}
                {isCollege && (
                  <Field label="Team">
                    <MenuSelect
                      label="Team"
                      variant="underline"
                      value={team}
                      placeholder="Choose"
                      options={SQUADS}
                      onChange={setTeam}
                    />
                  </Field>
                )}

                {isCollege && (
                  <Field label="Division">
                    <MenuSelect
                      label="Division"
                      variant="underline"
                      value={division}
                      placeholder="Not set"
                      options={DIVISIONS}
                      onChange={(next) => {
                        setDivision(next);
                        // The new division lists different conferences, and
                        // the one on screen may not be among them.
                        setConference("");
                      }}
                    />
                  </Field>
                )}

                {isCollege && (
                  <Field
                    label="Conference"
                    className={
                      conferenceChoices.length > 0 ? "col-span-2" : undefined
                    }
                  >
                    {conferenceChoices.length > 0 ? (
                      <ConferenceSelect
                        value={conference}
                        options={conferenceChoices}
                        division={division ?? null}
                        onChange={setConference}
                      />
                    ) : (
                      <input
                        type="text"
                        value={conference}
                        placeholder="Pacific Coast"
                        autoComplete="off"
                        data-focus-ring="none"
                        onChange={(event) => setConference(event.target.value)}
                        className={cn(
                          advField("underline"),
                          "w-full outline-none",
                        )}
                      />
                    )}
                  </Field>
                )}

                <Field label="City">
                  <input
                    type="text"
                    value={city}
                    placeholder="Ann Arbor"
                    autoComplete="off"
                    data-focus-ring="none"
                    onChange={(event) => setCity(event.target.value)}
                    className={cn(advField("underline"), "w-full outline-none")}
                  />
                </Field>

                <Field label="State">
                  <MenuSelect
                    label="State"
                    variant="underline"
                    value={state}
                    placeholder="Not set"
                    options={STATES}
                    scroll
                    onChange={setState}
                  />
                </Field>

                <Field
                  label="School email domain"
                  className="col-span-2"
                  hint="What the claim flow checks a coach's address against."
                >
                  <input
                    type="text"
                    value={domain}
                    placeholder="meridian.edu"
                    autoComplete="off"
                    spellCheck={false}
                    data-focus-ring="none"
                    onChange={(event) => setDomain(event.target.value)}
                    className={cn(advField("underline"), "w-full outline-none")}
                  />
                </Field>

                <Field
                  label="Owner's email"
                  className="col-span-2"
                  hint={ownerHint(orgType)}
                >
                  <input
                    type="email"
                    value={ownerEmail}
                    placeholder="coach@meridian.edu"
                    autoComplete="off"
                    spellCheck={false}
                    data-focus-ring="none"
                    onChange={(event) => setOwnerEmail(event.target.value)}
                    className={cn(advField("underline"), "w-full outline-none")}
                  />
                </Field>
              </div>

              <div className="flex items-start gap-3 border-t border-[var(--border-hairline)] pt-[18px]">
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-[var(--ink-900)]">
                    Start the pilot
                  </div>
                  <div className="mt-[3px] text-[11px] leading-[1.5] text-[var(--ink-500)]">
                    Opens the workspace without a review step. Pilot ends{" "}
                    {formatPilotEnd()}.
                  </div>
                </div>
                <AdvSwitch
                  label="Start the pilot"
                  checked={startPilot}
                  onCheckedChange={setStartPilot}
                />
              </div>

              <DialogProblem message={problem} />
            </div>
          )}

          <div className="flex items-center gap-2.5 pt-0.5">
            <div className="flex-1" />
            {created ? (
              <button
                type="button"
                className={advButton("primary", "md")}
                onClick={() => {
                  onOpenChange(false);
                  router.push(`/admin/teams/${created.programId}`);
                }}
              >
                Open the team
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className={advButton("ghost", "md")}
                  onClick={() => close(false)}
                  disabled={pending}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={advButton("primary", "md")}
                  onClick={submit}
                  disabled={!ready || pending}
                >
                  {pending ? "Creating…" : "Create team"}
                </button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The second step: the crest, offered rather than demanded.
 *
 * `adminUploadProgramCrest` and `ImageAdjustDialog` directly rather than
 * `CrestControl`, which is the same pair wrapped in the Settings card's own
 * heading and copy ("Crest, name and home courts") — true there, wrong in a
 * dialog that has just created a program and owns neither.
 */
function CrestStep({
  created,
  problem,
  onProblem,
}: {
  created: Created;
  problem: string | null;
  onProblem: (message: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [adjusting, setAdjusting] = useState<File | null>(null);
  const [crestUrl, setCrestUrl] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const submit = (baked: Blob) => {
    const ext = baked.type === "image/webp" ? "webp" : "png";
    const formData = new FormData();
    formData.set("programId", created.programId);
    formData.set(
      "file",
      new File([baked], `crest.${ext}`, { type: baked.type }),
    );
    onProblem(null);
    startSaving(async () => {
      const result = await adminUploadProgramCrest(formData);
      if (!result.ok) {
        onProblem(result.error);
        return;
      }
      // The bucket's public URL is not handed back, and the team's own page
      // will render it on arrival; a local preview is enough to say it landed.
      setCrestUrl(URL.createObjectURL(baked));
      setAdjusting(null);
    });
  };

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex items-center gap-4">
        <button
          type="button"
          aria-label="Add a team crest"
          disabled={saving}
          onClick={() => inputRef.current?.click()}
          className="group relative shrink-0 cursor-pointer overflow-hidden rounded-[8px] focus-visible:outline-none disabled:cursor-wait disabled:opacity-60"
        >
          <ProgramCrest name={created.name} crestUrl={crestUrl} size={52} />
          <span
            aria-hidden="true"
            className="absolute inset-0 flex items-center justify-center bg-[rgba(13,13,13,0.55)] text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            <Camera className="size-4" strokeWidth={1.5} />
          </span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-[var(--ink-900)]">
            {crestUrl ? "Crest saved" : "Add a crest"}
          </div>
          <div className="mt-[3px] text-[11px] leading-[1.5] text-[var(--ink-500)]">
            Optional — the initials mark stands in until there is one. PNG, JPG,
            WebP or SVG, under 512&nbsp;KB.
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={() => inputRef.current?.click()}
            className="mt-[7px] cursor-pointer text-[11px] font-medium text-[var(--blue)] transition-colors hover:text-[var(--blue-hover)] focus-visible:outline-none disabled:opacity-50"
          >
            {crestUrl ? "Replace the crest" : "Upload a crest"}
          </button>
        </div>
      </div>

      {created.warning && (
        <p className="rounded-[var(--radius-element)] px-3 py-2.5 text-[11px] leading-[1.6] text-[var(--ink-700)] [background:var(--surface-subtle)]">
          {created.warning}
        </p>
      )}

      <DialogProblem message={problem} />

      <input
        ref={inputRef}
        type="file"
        accept={CREST_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Reset so choosing the same file again still fires a change.
          event.target.value = "";
          if (file) {
            onProblem(null);
            setAdjusting(file);
          }
        }}
      />

      <ImageAdjustDialog
        open={adjusting !== null}
        file={adjusting}
        shape="square"
        outputEdge={CREST_EDGE_PX}
        saving={saving}
        onSave={submit}
        onCancel={() => setAdjusting(null)}
        onChooseAnother={() => inputRef.current?.click()}
      />
    </div>
  );
}

/** What actually happened to the address, in one sentence. */
function outcomeSentence(created: Created): string {
  switch (created.owner) {
    case "owner":
      return `${created.name} is created and its owner is set — the workspace is on their account already.`;
    case "claim-invited":
      return `${created.name} is created. The coach has a link to set it up; nothing is theirs until they do.`;
    case "coach-invited":
      return `${created.name} is created and the coach is invited as staff. Make them the owner from the team's page once they've accepted.`;
    case "none":
      return `${created.name} is in the directory. It has no owner until somebody claims it.`;
  }
}

/** Why the address does different things for a college and for a club. */
function ownerHint(orgType: ProgramOrgType | undefined): string {
  if (orgType === "college") {
    return "Optional. An existing account becomes the owner; anyone else gets a link to claim the program.";
  }
  if (orgType === undefined) {
    return "Optional. What happens next depends on the type.";
  }
  // A custom org has no `program_key`, so `/claim/…` cannot reach it, and
  // `create_program_invite` refuses the owner role — ownership moves by
  // transfer. Said here rather than discovered later.
  return "Optional. An existing account becomes the owner; anyone else is invited as a coach, and you make them the owner from the team's page.";
}

/** Caption, control, optional line under it — the underline form's one row. */
function Field({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-2", className)}>
      <span className="text-[11px] text-[var(--ink-600)]">{label}</span>
      {children}
      {hint && (
        <span className="text-[11px] leading-[1.5] text-[var(--ink-500)]">
          {hint}
        </span>
      )}
    </label>
  );
}
