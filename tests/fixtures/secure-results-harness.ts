import { createLoader } from "./vm-modules";

export type PipelineLog = { level: string; message: string; detail: unknown };

/**
 * `secureResults()` loaded through the vm loader with the pipeline logger
 * stubbed to record every line. Shared by `secure-results.spec.ts` and
 * `secure-results-host-guard.spec.ts`.
 */
export function loadSecureResults() {
  const logs: PipelineLog[] = [];
  const record =
    (level: string) =>
    (message: string, detail?: unknown): void => {
      logs.push({ level, message, detail });
    };
  const loader = createLoader({
    globals: { Error, Blob, AbortSignal, URL },
    stubs: {
      "./pipeline-log": {
        pipelineLog: {
          info: record("info"),
          warn: record("warn"),
          error: record("error"),
        },
      },
    },
  });
  const mod = loader.load("src/lib/services/splitstep/secure-results.ts");
  return {
    secureResults: mod.secureResults as (p: Record<string, unknown>) => Promise<
      | {
          resultsSecured: true;
          objectKey: string;
          bytes: number;
          body?: string;
        }
      | { resultsSecured: false; error: string }
    >,
    logs,
  };
}
