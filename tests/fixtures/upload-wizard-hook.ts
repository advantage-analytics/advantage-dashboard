import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import ts from "typescript";
import * as types from "@/components/dashboard/matches/new-match-wizard/types";
import * as validation from "@/components/dashboard/matches/new-match-wizard/validation";
import * as scoreState from "@/components/dashboard/matches/new-match-wizard/score-state";
import type {
  UseUploadMatchWizardProps,
  UseUploadMatchWizardReturn,
} from "@/components/dashboard/matches/new-match-wizard/useUploadMatchWizard";

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** Execute the real hook with deterministic hook slots and controlled IO.
 * This tests state/handler contracts, not React rendering or browser events. */
export function uploadWizardHarness(
  options: { team?: boolean; props?: Partial<UseUploadMatchWizardProps> } = {},
) {
  const slots: any[] = [];
  let cursor = 0;
  let dirty = true;
  let effects: (() => void)[] = [];
  const workspace = {
    active: {
      id: options.team ? "team-a" : "user",
      kind: options.team ? "team" : "personal",
    },
    viewer: { id: "user", name: "Riley Player" },
  };
  const parses = new Map<string, ReturnType<typeof deferred<any>>>();
  const checks = new Map<string, ReturnType<typeof deferred<any>>>();
  const apiChecks = new Map<string, ReturnType<typeof deferred<any>>>();
  const writes: unknown[] = [];
  const stored = new Map<string, string>();
  const storage = {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => stored.set(key, value),
    removeItem: (key: string) => stored.delete(key),
  };
  function memo(factory: () => any, deps?: unknown[]) {
    const index = cursor++;
    const prior = slots[index];
    if (!prior || !deps || deps.some((v, i) => !Object.is(v, prior.deps[i])))
      slots[index] = { deps, value: factory() };
    return slots[index].value;
  }
  const react = {
    useState(initial: any) {
      const index = cursor++;
      if (!(index in slots))
        slots[index] = typeof initial === "function" ? initial() : initial;
      return [
        slots[index],
        (value: any) => {
          const next =
            typeof value === "function" ? value(slots[index]) : value;
          if (!Object.is(slots[index], next)) {
            slots[index] = next;
            dirty = true;
          }
        },
      ];
    },
    useRef: (value: unknown) => memo(() => ({ current: value }), []),
    useMemo: memo,
    useCallback: (callback: unknown, deps: unknown[]) =>
      memo(() => callback, deps),
    useEffect(effect: () => (() => void) | void, deps: unknown[]) {
      const index = cursor++;
      const prior = slots[index];
      if (!prior || deps.some((v, i) => !Object.is(v, prior.deps[i]))) {
        effects.push(() => {
          prior?.cleanup?.();
          slots[index].cleanup = effect();
        });
        slots[index] = { deps };
      }
    },
  };
  const query: any = new Proxy(
    {},
    {
      get: (_, key) => {
        if (key === "then")
          return (resolve: (value: unknown) => void) =>
            resolve({
              data: writes.length ? [{ id: "created-match" }] : [],
              error: null,
            });
        if (key === "single")
          return async () => ({
            data: { first_name: "Riley", last_name: "Player" },
          });
        if (key === "insert" || key === "update")
          return (row: unknown) => {
            writes.push(row);
            return query;
          };
        return () => query;
      },
    },
  );
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: "user" } } }) },
    from: () => query,
    rpc: async () => ({ data: [] }),
  };
  const dependencies: Record<string, unknown> = {
    react,
    "@/lib/utils": { capitalize: (value: string) => value },
    "next/navigation": { useRouter: () => ({ refresh() {} }) },
    "@/lib/supabase/client": { createClient: () => supabase },
    "@/components/dashboard/workspace-provider": {
      useWorkspace: () => workspace,
    },
    "@/lib/services/upload": {
      getProviderKind: (id: string) =>
        id === "video" ? "processing" : "import",
      providerKindOrNull: (id: string) =>
        id === "video" ? "processing" : "import",
      isProviderSupported: () => true,
      getProviderStrategy: () => ({
        validateFile: (file: File) =>
          checks.get(file.name)?.promise ?? { success: true },
        getAcceptString: () => ".csv",
      }),
    },
    "@/lib/services/upload/parsers": {
      hasParser: async () => true,
      getParser: async () => ({
        parse: (file: File) => parses.get(file.name)!.promise,
      }),
    },
    "@/lib/providers": { providers: [{ id: "video" }, { id: "swing-vision" }] },
    "@/lib/services/splitstep/submit-match-video": {},
    "@/lib/services/splitstep/config": { currentBillingMonth: () => "2026-09" },
    "@/lib/services/splitstep/quota": {
      accountTypeFor: () => "user",
      monthlyCapSecondsFor: () => 7200,
    },
    "@/lib/data/usage-format": { formatResetDate: () => "Oct 1" },
    "@/lib/data/roster-shared": { rosterPlayerOptions: () => [] },
    "@/lib/wizard/actions": {},
    "./types": types,
    "./validation": validation,
    "./score-state": scoreState,
    "./utils": {
      STORAGE_KEYS: {
        UPLOADED_FILE: "file",
        SELECTED_PROVIDER: "provider",
        DRAFT_KEPT: "draft",
      },
      loadFormDataFromStorage: () => null,
      loadUploadedFileFromStorage: () => null,
      saveFormDataToStorage() {},
      clearStorageData() {},
      formatFileSize: () => "1 KB",
      getAdjustedScores: (scores: unknown) => scores,
      determineWinner: () => ({ winner: {}, loser: {} }),
      buildMatchData: (_id: unknown, form: unknown) => form,
    },
  };
  const source = fs.readFileSync(
    path.resolve(
      "src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts",
    ),
    "utf8",
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const hookModule = {
    exports: {} as {
      useUploadMatchWizard: (
        props: UseUploadMatchWizardProps,
      ) => UseUploadMatchWizardReturn;
    },
  };
  vm.runInNewContext(compiled, {
    exports: hookModule.exports,
    require: (name: string) => {
      if (!(name in dependencies))
        throw new Error(`Unexpected dependency ${name}`);
      return dependencies[name];
    },
    console,
    Date,
    crypto,
    localStorage: storage,
    sessionStorage: storage,
    window: { setTimeout: () => 1, clearTimeout() {}, dispatchEvent() {} },
    setTimeout() {},
    CustomEvent: class {},
    FormData,
    FileReader: class {
      result = "data:application/octet-stream;base64,Zml4dHVyZQ==";
      onload?: () => void;
      readAsDataURL() {
        this.onload?.();
      }
    },
    fetch: async (url: string, init: { body: string }) => ({
      ok: true,
      json: async () =>
        url === "/api/validate-file"
          ? (apiChecks.get(JSON.parse(init.body).fileName)?.promise ?? {
              success: true,
            })
          : { success: true },
    }),
  });
  const props: UseUploadMatchWizardProps = {
    open: true,
    onOpenChange() {},
    initialProvider: "swing-vision",
    ...options.props,
  };
  let current!: UseUploadMatchWizardReturn;
  function render() {
    let limit = 30;
    do {
      dirty = false;
      cursor = 0;
      effects = [];
      current = hookModule.exports.useUploadMatchWizard(props);
      effects.forEach((effect) => effect());
      if (--limit === 0) throw new Error("Hook did not settle");
    } while (dirty);
    return current;
  }
  async function flush() {
    for (let i = 0; i < 15; i++) {
      await Promise.resolve();
      if (dirty) render();
    }
    return current;
  }
  render();
  return {
    get current() {
      return current;
    },
    workspace,
    props,
    writes,
    checks,
    apiChecks,
    parses,
    render,
    flush,
    async pick(name: string) {
      const pending = deferred<any>();
      parses.set(name, pending);
      const file = new File(["fixture"], name, { type: "text/csv" });
      current.handleFileChange({
        target: { files: [file] },
        currentTarget: { value: name },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
      await flush();
      return pending;
    },
  };
}

export function parsedNames(
  playerName: string,
  opponentName = "Casey Opponent",
) {
  return {
    success: true,
    warnings: [],
    data: {
      playerName,
      opponentName,
      playerScores: [6],
      opponentScores: [4],
      bestOf: "3",
      adScoring: true,
    },
  };
}
