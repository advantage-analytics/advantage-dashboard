-- One open "Something still wrong? Tell us" report per match and address
-- (Advantage Review step 1). reportMatchIssue checks first and answers a
-- 23505 from this index the same way, so two Sends at once cannot both
-- file. `program_requests_open_unique` never covers these rows: it is keyed
-- on program_id, which a match_issue leaves null.
create unique index program_requests_one_open_match_issue
  on public.program_requests (match_id, lower(email))
  where kind = 'match_issue' and status = 'open';
