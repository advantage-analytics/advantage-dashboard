"use client";

import { UploadMatchSuccess } from "@/components/dashboard/matches/new-match-wizard/UploadMatchSuccess";
import type {
  CreatedMatch,
  UploadState,
} from "@/components/dashboard/matches/new-match-wizard/upload-progress";
import type { VideoUploadProgress } from "@/lib/services/splitstep/submit-match-video";

const noop = () => {};

const MATCH: CreatedMatch = {
  matchId: "00000000-0000-4000-8000-000000000001",
  playerName: "Maya Chen",
  opponentName: "Sofia Alvarez",
  sets: [],
  won: null,
  follows: "video",
};

function preparing(progress: Partial<VideoUploadProgress>): UploadState {
  return {
    matchId: MATCH.matchId,
    phase: "uploading",
    jobId: "00000000-0000-4000-8000-000000000002",
    cancel: noop,
    progress: {
      stage: "preparing",
      pct: 0,
      bytesUploaded: 0,
      bytesTotal: 0,
      speed: 0,
      etaSeconds: 0,
      ...progress,
    },
  };
}

/** Each way the video is prepared before its bytes move, then the upload. */
const STATES: readonly { id: string; label: string; upload: UploadState }[] = [
  {
    id: "trim",
    label: "Trimming — a 3.2 GB file cut to its window",
    upload: preparing({ pct: 41, bytesTotal: 3_200_000_000 }),
  },
  {
    id: "convert",
    label: "Converting — a 4K HEVC phone recording",
    upload: preparing({
      pct: 18,
      converting: true,
      bytesTotal: 11_400_000_000,
      etaSeconds: 2460,
    }),
  },
  {
    id: "compress",
    label: "Compressing — 23 GB, 2 h 20 min at 60 fps, over the limit",
    upload: preparing({
      pct: 12,
      converting: true,
      compressing: true,
      bytesTotal: 23_000_000_000,
      etaSeconds: 3780,
    }),
  },
  {
    id: "upload",
    label: "Then the upload — the 6.9 GB compressed file",
    upload: {
      ...preparing({}),
      progress: {
        stage: "uploading",
        pct: 9,
        bytesUploaded: 620_000_000,
        bytesTotal: 6_900_000_000,
        speed: 2_400_000,
        etaSeconds: 2620,
      },
    },
  },
];

export function UploadProgressPreview() {
  return (
    <main className="min-h-screen bg-[var(--surface-page)] px-14 py-10">
      <h1 className="text-[16px] font-medium text-[var(--ink-900)]">
        Upload wizard — preparing the video
      </h1>
      <p className="mt-1 max-w-[60ch] text-[12px] leading-[1.6] text-[var(--ink-600)]">
        The final screen while this tab trims, converts or compresses the video,
        then uploads it.
      </p>
      <div className="mt-8 grid grid-cols-2 gap-6">
        {STATES.map((s) => (
          <section key={s.id} className="flex flex-col gap-3" data-state={s.id}>
            <h2 className="text-[12px] font-medium text-[var(--ink-600)]">
              {s.label}
            </h2>
            <div className="rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] [&>div]:!pt-10">
              <UploadMatchSuccess
                match={MATCH}
                upload={s.upload}
                removedError={null}
                onUploadAnother={noop}
                onResubmitted={noop}
                exitHref="/dashboard/matches"
                preset={null}
              />
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
