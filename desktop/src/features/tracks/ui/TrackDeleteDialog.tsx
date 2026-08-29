import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/ui/alert-dialog";
import { Button } from "@/shared/ui/button";
import type { Track } from "../types";

export function TrackDeleteDialog({
  track,
  open,
  pending,
  error,
  onClose,
  onDelete,
}: {
  track: Track;
  open: boolean;
  pending: boolean;
  error?: string;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent data-testid="delete-track-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Track?</AlertDialogTitle>
          <AlertDialogDescription>
            “{track.name}” will disappear for everyone and cannot be restored. A
            Track with linked Tasks cannot be deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button disabled={pending} type="button" variant="outline">
              Cancel
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button
              disabled={pending}
              onClick={(event) => {
                event.preventDefault();
                onDelete();
              }}
              type="button"
              variant="destructive"
            >
              {pending ? "Deleting…" : "Delete Track"}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
