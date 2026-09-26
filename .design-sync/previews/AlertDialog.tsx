import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "advantage-analytics-ds";

/** The bare Radix wrapper: Cancel takes the initial focus, one Action closes on click. `ConfirmDialog` is the product's shell over this. */
export function DiscardScores() {
  return (
    <AlertDialog open>
      <AlertDialogContent
        style={{ width: 440, borderRadius: "var(--radius-card)" }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>Discard the entered scores?</AlertDialogTitle>
          <AlertDialogDescription>
            Two sets have been typed for this line. Leaving now drops them;
            nothing has been saved.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep editing</AlertDialogCancel>
          <AlertDialogAction>Discard scores</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
