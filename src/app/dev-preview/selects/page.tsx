"use client";

// TEMPORARY preview route — outside /dashboard so it needs no session.
// Delete before `npm test`: tests/generate-map.spec.ts fails on an unlisted route.

import { useState } from "react";
import { AdvSelect } from "@/components/ui/adv-select";
import { MenuSelect } from "@/components/ui/menu-select";
import { advField } from "@/lib/ui/adv-field";

const ROLES = [
  { value: "owner", label: "Owner", description: "Everything, including who else is staff" },
  { value: "coach", label: "Coach", description: "Edits lineups and records results" },
  { value: "staff", label: "Staff", description: "Uploads video and reads everything" },
  { value: "player", label: "Player", description: "Their own matches only" },
] as const;

type Role = (typeof ROLES)[number]["value"];

const SURFACES = [
  { value: "", label: "—" },
  { value: "hard", label: "Hard" },
  { value: "clay", label: "Clay" },
  { value: "grass", label: "Grass" },
] as const;

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-6">
      <h2 className="text-[13px] font-medium text-[var(--ink-900)]">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-[0.04em] text-[var(--ink-500)]">{label}</span>
      {children}
    </div>
  );
}

export default function SelectsPreview() {
  const [advUnderline, setAdvUnderline] = useState("");
  const [advBoxed, setAdvBoxed] = useState("hard");
  const [menuUnderline, setMenuUnderline] = useState<Role>("coach");
  const [menuPill, setMenuPill] = useState<Role>("coach");

  return (
    <main className="min-h-screen bg-[var(--surface-page)] p-12">
      <h1 className="mb-2 text-[22px] font-light tracking-[-0.4px] text-[var(--ink-900)]">
        Two select primitives
      </h1>
      <p className="mb-10 max-w-[640px] text-[13px] text-[var(--ink-600)]">
        Left: <code>AdvSelect</code>, a native <code>&lt;select&gt;</code> under design-system chrome
        (this branch). Right: <code>MenuSelect</code>, a button opening a <code>FloatMenu</code>{" "}
        (splitstep-integration). Tab through them to compare focus; open each to compare the menu.
      </p>

      <div className="grid max-w-[880px] grid-cols-2 gap-16">
        <Block title="AdvSelect — native <select>">
          <Row label="underline, beside a text input">
            <div className="grid grid-cols-2 gap-4">
              <input
                className={advField("underline")}
                placeholder="A text input"
                aria-label="Reference text input"
              />
              <AdvSelect
                kind="underline"
                value={advUnderline}
                onChange={(e) => setAdvUnderline(e.target.value)}
                aria-label="Surface (underline)"
              >
                {SURFACES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </AdvSelect>
            </div>
          </Row>

          <Row label="boxed">
            <AdvSelect
              kind="boxed"
              value={advBoxed}
              onChange={(e) => setAdvBoxed(e.target.value)}
              aria-label="Surface (boxed)"
              wrapperClassName="w-[220px]"
            >
              {SURFACES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </AdvSelect>
          </Row>

          <Row label="disabled">
            <AdvSelect kind="underline" value="hard" disabled aria-label="Disabled" onChange={() => {}}>
              <option value="hard">Hard</option>
            </AdvSelect>
          </Row>
        </Block>

        <Block title="MenuSelect — FloatMenu">
          <Row label="underline, beside a text input">
            <div className="grid grid-cols-2 gap-4">
              <input
                className={advField("underline")}
                placeholder="A text input"
                aria-label="Reference text input"
              />
              <MenuSelect
                label="Role (underline)"
                variant="underline"
                value={menuUnderline}
                options={ROLES}
                onChange={setMenuUnderline}
              />
            </div>
          </Row>

          <Row label="pill, with a foot note">
            <MenuSelect
              label="Role (pill)"
              variant="pill"
              value={menuPill}
              options={ROLES}
              onChange={setMenuPill}
              note="Owners can hand ownership to another coach."
            />
          </Row>

          <Row label="disabled">
            <MenuSelect label="Disabled" variant="pill" value="coach" options={ROLES} onChange={() => {}} disabled />
          </Row>
        </Block>
      </div>
    </main>
  );
}
