"use client";

import {
  createContext,
  use,
  useCallback,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";
import type { ProviderId } from "@/lib/services/upload";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import type { EventPreset, MatchDraft } from "./types";
import {
  useUploadMatchWizard,
  type RosterSubject,
  type UseUploadMatchWizardReturn,
  type VideoUploadEvent,
} from "./useUploadMatchWizard";
import { useDraftSaving } from "./useDraftSaving";
import { useScoreCheck } from "./useScoreCheck";
import { useWizardGates, type WizardGates } from "./useWizardGates";
import { useWizardKeys } from "./useWizardKeys";
import {
  continueLabelFor,
  stepHeading,
  subjectFirstNameOf,
} from "./wizard-view";

/**
 * The wizard page's one context: state, actions and meta.
 *
 * This provider is the only place that knows the state comes from
 * `useUploadMatchWizard`. The step bodies and footer pieces read the interface,
 * so each can be composed into the shell without the page drilling fifty
 * props through it.
 */
export interface UploadWizardContextValue {
  /**
   * The hook's API exactly as it returns it — state and handlers together.
   * Re-splitting fifty fields into a second shape here would be a copy that
   * drifts from the hook's own `UseUploadMatchWizardReturn`.
   */
  wizard: UseUploadMatchWizardReturn;
  /** What the page derives from it: heading, gates, which notices show. */
  view: WizardGates & {
    title: string;
    description: string;
    continueLabel: string;
    subjectFirstName: string | null;
    scoreCheckVisible: boolean;
  };
  /** What the page itself adds on top of the hook's handlers. */
  actions: {
    /** The primary button and plain Enter — the step's own continue. */
    continue: () => void;
    /** Writes the draft row, then leaves — only if the write worked. */
    saveDraft: () => Promise<void>;
    dismissScoreCheck: () => void;
  };
  meta: {
    /** The content column, for the keyboard walk and the missing-field jump. */
    contentRef: RefObject<HTMLDivElement | null>;
    exitHref: string;
    /** The line this flow is filling. A preset IS the line it came from. */
    preset: EventPreset | null;
    onSwitchPreset: (next: EventPreset) => void;
    draftRefusal: string | null;
    workspaceKind: "team" | "personal";
  };
}

const UploadWizardContext = createContext<UploadWizardContextValue | null>(
  null,
);

export function useUploadWizard(): UploadWizardContextValue {
  const value = use(UploadWizardContext);
  if (!value) {
    throw new Error("useUploadWizard must be used inside UploadWizardProvider");
  }
  return value;
}

export interface UploadWizardProviderProps {
  onCreated: (matchId: string) => void;
  onVideoUpload: (event: VideoUploadEvent) => void;
  exitHref: string;
  preset: EventPreset | null;
  onSwitchPreset: (next: EventPreset) => void;
  draft: MatchDraft | null;
  draftRefusal: string | null;
  initialProvider: ProviderId | null;
  initialSubject: RosterSubject | null;
  children: ReactNode;
}

export function UploadWizardProvider({
  onCreated,
  onVideoUpload,
  exitHref,
  preset,
  onSwitchPreset,
  draft,
  draftRefusal,
  initialProvider,
  initialSubject,
  children,
}: UploadWizardProviderProps) {
  const router = useRouter();
  // Which workspace this match will be created in, and billed against.
  const workspaces = useWorkspace();

  // `onOpenChange(false)` fires both when the user backs out and when a match
  // is committed. onCreated lands first in the success path, so this ref tells
  // the two apart without the hook needing to know it is on a page.
  const createdRef = useRef(false);
  const handleCreated = useCallback(
    (matchId: string) => {
      createdRef.current = true;
      onCreated(matchId);
    },
    [onCreated],
  );
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open && !createdRef.current) router.push(exitHref);
    },
    [router, exitHref],
  );

  const wizard = useUploadMatchWizard({
    open: true,
    onOpenChange: handleOpenChange,
    onCreated: handleCreated,
    onVideoUpload,
    preset,
    draft,
    initialProvider,
    initialSubject,
  });
  const { step } = wizard;

  const contentRef = useRef<HTMLDivElement>(null);
  const saveDraft = useDraftSaving(wizard, exitHref);
  const scoreCheck = useScoreCheck({
    step,
    formData: wizard.formData,
    provider: wizard.selectedProvider,
    handleCreateMatch: wizard.handleCreateMatch,
  });
  const gates = useWizardGates(wizard, scoreCheck.unanswered);

  const continueHandler =
    step === "provider"
      ? wizard.handleProviderContinue
      : step === "file"
        ? wizard.handleFileContinue
        : step === "trim"
          ? wizard.handleTrimContinue
          : scoreCheck.saveMatch;

  // The same `gates.continueDisabled` the footer button is disabled by.
  useWizardKeys({
    contentRef,
    canGoBack: step !== wizard.firstStep,
    onBack: wizard.handleBack,
    continueDisabled: gates.continueDisabled,
    onContinue: continueHandler,
  });

  const subjectFirstName = subjectFirstNameOf({
    whoPlayed: wizard.whoPlayed,
    preset,
    playerName: wizard.formData.playerName,
  });

  // Not memoized: the hook hands back a new object on every render, so a memo
  // here would never hit — and every consumer re-renders with the page anyway.
  const value: UploadWizardContextValue = {
    wizard,
    view: {
      ...gates,
      ...stepHeading({
        step,
        isProcessingProvider: wizard.isProcessingProvider,
        line: preset,
        subjectFirstName,
      }),
      continueLabel: continueLabelFor(step, wizard.isCreating),
      subjectFirstName,
      scoreCheckVisible: scoreCheck.visible,
    },
    actions: {
      continue: continueHandler,
      saveDraft,
      dismissScoreCheck: scoreCheck.dismiss,
    },
    meta: {
      contentRef,
      exitHref,
      preset,
      onSwitchPreset,
      draftRefusal,
      workspaceKind: workspaces.active.kind === "team" ? "team" : "personal",
    },
  };

  return <UploadWizardContext value={value}>{children}</UploadWizardContext>;
}
