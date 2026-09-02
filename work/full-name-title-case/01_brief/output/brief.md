# Brief — full-name-title-case

A person's name renders three different ways across the claim/join flow, and
none of them normalize casing. The same owner is "Clajerson G." on the program
status page, "C. Gimena" in the program search dropdown, and the full raw
"clajerson gimena" on the join page. Make it one name, in full, in title case,
everywhere in that flow.

## Goal

Across the claim and join flow, a person's name always renders as their **full
name** — first and last — **in title case**, regardless of how the row was
typed into the database.

## Scope

Confirmed with the human during this stage: **the whole claim/join flow**, and
the full surname is to be shown.

The name-rendering sites in that flow, and what each does today:

| Surface | Renders today | Source |
|---|---|---|
| `/claim/[programKey]` — active state (the screenshot) | `First L.` | `program_public_status()` |
| `/claim/[programKey]` — other states, `/request`, `/object` | `First L.` | same `ownerDisplay` |
| `/claim/program` search dropdown | `F. Lastname` — abbreviated the *other way* | `search_programs()` |
| `/join/[token]` and its forms | full name already, raw casing | `displayName()` in `invite-acceptance.ts` |

Both abbreviations live in `SECURITY DEFINER` SQL functions, so the change
reaches the database, not only the render sites. Casing is normalized nowhere.

Two states that every surface already handles and must keep handling: a user
row with **no name at all** (4 of 16 live users have a blank first or last
name), and an owner the page is not allowed to name — the copy is written for
not knowing ("Nobody was notified" rather than a placeholder), and that stays.

## Non-goals

- Surfaces outside the claim/join flow — roster, settings, invites, match
  detail, email templates. If a shared formatter falls out of this work, other
  callers adopting it is separate work.
- Changing what is *stored* in `users.first_name` / `users.last_name`. This is
  about what renders. (Whether normalization should also happen at write time
  is an open question below, not a decision made here.)
- Pronouns or role titles. The existing copy deliberately avoids both — "They're
  listed on the staff", never "She's listed as head coach" — and that stays.
- Email addresses. `program_public_status()` promises it "never [returns] an
  address"; that half of the promise is not in scope to change.

## Constraints

- **This reverses a deliberate privacy decision, with the human's explicit
  approval.** `program_public_status()` is documented as returning "an owner as
  'First L.' and never an address", and the page is reachable by anonymous,
  signed-out visitors — anyone who reaches `/claim/<programKey>` will now see
  the owner's surname. The human was shown this trade-off and chose the full
  name. It should be recorded as a decision in the change itself, so the next
  reader doesn't "fix" it back.
- The abbreviation is database-side. The live functions match the repo
  migrations here, but the repo is ~100 migrations behind overall — the live
  database is the source of truth for anything else this touches.
- Title case cannot be plain `initcap()`. Real names break it: McCarthy,
  O'Brien, de la Cruz, van Dijk, hyphenated surnames, and suffixes like II/III.
  A name the user typed correctly must not be *un*-corrected by the formatter.
- Both SQL functions are `SECURITY DEFINER` with `search_path` pinned to `''`;
  whatever replaces them keeps those properties.
- The claim pages are pre-auth and server-rendered; `search_programs()` is also
  granted to `anon`.

## Success criteria

1. On `/claim/[programKey]` the headline reads with the owner's full name, in
   title case, whatever the casing stored in the row.
2. The same person reads identically on the status page, the request and object
   pages, the search dropdown, and the join page — one shape, not three.
3. A row stored as `clajerson gimena` or `CLAJERSON GIMENA` renders as
   `Clajerson Gimena`. A row already stored as `McCarthy` still renders as
   `McCarthy`.
4. The footer note reads "Notifies Clajerson Gimena." — the doubled period in
   today's "Notifies Clajerson G.." is gone as a consequence, not as a patch.
5. Missing-name and not-allowed-to-name states are unchanged: no placeholder
   name, no "undefined", no stray punctuation where a name isn't.
6. Nothing outside the claim/join flow changes.

## Open questions

1. **Title case rules.** How far should the formatter go — Mc/Mac, O', hyphens,
   particles (de, van, van der), suffixes (II, III, Jr)? A short explicit rule
   set is better than a clever one; stage 02 should propose the list and the
   cases it deliberately declines to handle.
2. **Render-time or write-time.** Normalize on the way out (every surface must
   call it) or on the way in (sign-up, profile, invite acceptance — and the 3
   existing rows that are already off)? Affects whether this is one formatter or
   a formatter plus a backfill.
3. **Formatter placement.** The two abbreviations are in SQL and the full name
   is in TypeScript. Does the SQL return raw parts and TypeScript formats, or
   does SQL keep composing the display string? Stage 02's call.
4. **Search dropdown confirm.** The `/claim/program` dropdown is in the flow by
   the human's "whole claim/join flow" answer, but it was not the screenshot.
   Confirm it is meant to change too — it is a second `SECURITY DEFINER`
   function and a second privacy surface.
5. **Other `First L.` sites.** Only `program_public_status()` and
   `search_programs()` abbreviate today, verified against the live database.
   Nothing else in the flow does.

## Also consulted

Beyond the declared input (`../BRIEF-SEED.md`), to verify specific facts:

- `src/app/claim/[programKey]/page.tsx`, `.../request/page.tsx`,
  `.../object/page.tsx` — where the name renders and the current copy
- `src/components/claim/contact-owner-form.tsx`,
  `src/components/claim/program-search.tsx` — the other `ownerDisplay` consumers
- `src/lib/data/programs-server.ts` — how `owner_display` reaches the page
- `src/app/join/[token]/page.tsx`, `src/components/join/nothing-sent.tsx`,
  `src/components/join/join-forms.tsx`,
  `src/lib/services/programs/invite-acceptance.ts` (`displayName`),
  `src/lib/services/programs/join-role.ts` — the join half of the flow
- `supabase/migrations/20260817074759_program_public_status.sql`,
  `.../20260830000931_custom_org_programs.sql` — the documented intent
- Live database via Supabase MCP: definitions of `program_public_status()` and
  `search_programs()`; a scan of every `public` function referencing
  `last_name` (only those two abbreviate); and aggregate counts on
  `public.users` for casing drift and blank names (counts only, no rows read)
