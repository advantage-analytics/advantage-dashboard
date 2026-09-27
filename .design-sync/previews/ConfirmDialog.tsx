import { FileClock } from "lucide-react";
import {
  ConfirmAside,
  ConfirmDialog,
  ConfirmNote,
  ConfirmProse,
  Em,
} from "advantage-analytics-ds";

const noop = () => {};

/** Red only when something is lost: the danger tone, prose consequences with the load-bearing nouns in `Em`. */
export function DeleteMatch() {
  return (
    <ConfirmDialog
      open
      onOpenChange={noop}
      onConfirm={noop}
      tone="danger"
      title="Delete this match?"
      description="The match, its video and every statistic derived from it are removed for everyone on the program."
      confirmLabel="Delete match"
    >
      <ConfirmProse>
        <p>
          Your <Em>Sep 21 win over Elena Vargas</Em> leaves the season record,
          and the <Em>47 minutes of film</Em> attached to it are deleted from
          storage.
        </p>
        <p>
          Match videos already counted this month <Em>are not refunded</Em>.
        </p>
      </ConfirmProse>
      <ConfirmAside>
        You can upload the match again later; it will count as a new video.
      </ConfirmAside>
    </ConfirmDialog>
  );
}

/** Nothing is lost, so the primary stays blue; a `ConfirmNote` for the one thing also thrown away. */
export function SignOut() {
  return (
    <ConfirmDialog
      open
      onOpenChange={noop}
      onConfirm={noop}
      title="Sign out everywhere?"
      description="Every browser and phone signed in to your account is signed out."
      confirmLabel="Sign out everywhere"
      footerLeft={
        <a
          href="#"
          style={{ fontSize: 12, color: "var(--blue)", textDecoration: "none" }}
        >
          Just this device
        </a>
      }
    >
      <ConfirmNote icon={<FileClock />}>
        Your unsaved lineup for Saturday&apos;s dual is discarded.
      </ConfirmNote>
    </ConfirmDialog>
  );
}

/** While `pending`, every way out is held and the spinner is the state. */
export function Pending() {
  return (
    <ConfirmDialog
      open
      onOpenChange={noop}
      onConfirm={noop}
      tone="danger"
      pending
      pendingLabel="Deleting…"
      title="Delete this event?"
      description="The dual and its nine lines are removed; matches already played keep their scores."
      confirmLabel="Delete event"
    />
  );
}

/** A refused action reads as one at a glance: `error` draws `DialogProblem` at the body's foot. */
export function WithError() {
  return (
    <ConfirmDialog
      open
      onOpenChange={noop}
      onConfirm={noop}
      title="Leave Meridian State?"
      description="You keep your matches; the program keeps its copy of them."
      confirmLabel="Leave team"
      error="You are the program's only owner. Transfer ownership before leaving."
    />
  );
}
