-- The ball's spin on a labelled stroke, so the labeller can check the one
-- thing the vendor reads that no other label column carries. The vendor's
-- `spin_type` (`label_shots.vendor->>'spin_type'`) holds topspin, flat,
-- backspin, sidespin and the odd `None`; the column takes the four, lower-cased,
-- and null for anything else (lib/services/labels/seed.ts `labelSpin`).
--
-- A value field like `stroke`: seeded, measured for `kept` / `edited`, and
-- restored by Reset — so it joins the frozen `seed` jsonb too
-- (20260928190425_label_rows_seed.sql). It is deliberately NOT in the
-- scoring join yet; the labeller's reading of it is the point.
alter table public.label_shots
  add column spin text
    check (spin in ('topspin', 'flat', 'backspin', 'sidespin'));

-- Backfill: every vendor stroke already carries its spin in `vendor`, and no
-- labeller has touched the column yet, so the vendor's value is both the
-- current value and the seed. Rows whose vendor spin is outside the four (the
-- vendor's `None`) stay null and get no seed key, which the seed parser reads
-- as null. Rows with a null `seed` — edited rows awaiting
-- scripts/label-backfill-seed.ts, and added strokes, which have no vendor —
-- are left alone: the script rebuilds the whole seed, spin included.
update public.label_shots
set spin = lower(vendor->>'spin_type')
where spin is null
  and lower(vendor->>'spin_type') in ('topspin', 'flat', 'backspin', 'sidespin');

update public.label_shots
set seed = seed || jsonb_build_object('spin', spin)
where seed is not null
  and spin is not null
  and not (seed ? 'spin');
