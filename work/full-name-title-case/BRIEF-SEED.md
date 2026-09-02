# Brief seed — full-name-title-case

Captured verbatim from the `/feature-new` invocation:

> for this page make sure that the full name is shown always in title case

## Attached screenshot (described, not a separate instruction)

A screenshot came with the invocation. It shows the join / request-access
page for a program the user is not a member of:

- Eyebrow: `DARTMOUTH COLLEGE · WOMEN'S · D-I · IVY LEAGUE (IVY)`
- Headline: **"Clajerson G. manages Advantage here"**
- Body: "They're listed on the staff for Dartmouth College. Ask for access
  and they can add you with the right role."
- Form: Your name / Your email / Your role (optional) / Add a note (optional)
- Actions: "Request an invite" (primary) and "They no longer work here"
- Footer note: "Notifies Clajerson G.. No account is created for you, and
  nothing is queued." — note the doubled period after the abbreviated name.

So the manager's name currently renders **abbreviated** ("Clajerson G.")
rather than full, and casing is whatever the database holds.

## Edit this file

Replace or extend the above with anything else you want the brief to
account for — for example: which name field(s) this covers (manager name
only, or program/school names too), whether "title case" should preserve
particles and initialisms (McCarthy, O'Brien, de la Cruz, II, III), and
whether the fix belongs at the render site or in a shared formatter.

Then run `/feature-next full-name-title-case` to start stage 01.
