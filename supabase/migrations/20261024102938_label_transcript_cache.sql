-- The labels console derives a job's transcript on every load of a session
-- (`buildJobMarks`, src/lib/data/labels-server.ts): job and match rows, the
-- vendor's results JSON and trajectories JSON downloaded from Storage, then
-- analyzeResults / buildTranscript. Nothing changes between loads unless one
-- of the inputs does, so the built transcript and rallies are kept here, one
-- row per job, and a load that finds a row whose key matches downloads
-- nothing. The key is every input the build reads: the derivation code's
-- version, the two Storage object keys, and a fingerprint of the match's
-- `score` and `format` and the job's `ad_scoring`
-- (src/lib/services/labels/transcript-cache.ts). A row is only ever written
-- after a build whose transcript reconciled (`transcript.ok`); a refused or
-- failed build writes nothing, so the cache never holds a transcript the
-- console would not otherwise have shown.
--
-- Service role only: the server code reads and writes it behind the admin
-- check, as it does every label table. No policy, and no grant to the API
-- roles, so a signed-in user cannot read a transcript off it.
create table public.label_transcript_cache (
  job_id uuid primary key references public.processing_jobs (id) on delete cascade,
  derivation_version text not null,
  results_object_key text not null,
  -- '' when the job stored no trajectories file, so the key is comparable.
  trajectories_object_key text not null default '',
  -- sha256 (hex) of the match's score and format and the job's ad_scoring.
  fingerprint text not null,
  transcript jsonb not null,
  rallies jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.label_transcript_cache is
  'Per-job cache of the derived transcript and rallies the labels console marks from; keyed on every input of the build, written only after a reconciled build, read and written by the service role alone.';

alter table public.label_transcript_cache enable row level security;
revoke all on public.label_transcript_cache from anon, authenticated;
