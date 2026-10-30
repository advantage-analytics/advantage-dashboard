-- Ask: say what the error columns hold now that the forced/unforced split is
-- judged (20261029222042_forced_errors_judged). Comments only: no view, grant
-- or data change. Each comment is the column's meaning in
-- src/lib/services/ask/schema.ts, which tests/ask-prompt.spec.ts holds equal.
comment on column ask.match_stats.unforced_errors is 'Points this side lost by missing a shot. This is every error the side made unless forced_errors is non-null; then it is only the unforced ones (unforced errors). For every error whether or not the split was judged, compute unforced_errors + coalesce(forced_errors, 0) as errors.';
comment on column ask.match_stats.forced_errors is 'Points this side lost by missing a shot under pressure from the other side (forced errors); null when nobody judged the split — an unverified video match, or one verified before the split existed; SwingVision matches and matches verified from now on carry it.';
