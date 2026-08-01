import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import type { CalendarEvent } from "../lib/calendarTypes";

export function CalendarEventPopover({
  event,
  currentPubkey,
  authorLabel,
  onClose,
  onEdit,
  onDelete,
}: {
  event: CalendarEvent | null;
  currentPubkey?: string;
  authorLabel?: string;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Dialog
      open={Boolean(event)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        data-testid="calendar-event-details"
      >
        {event ? (
          <>
            <DialogHeader>
              <DialogTitle>{event.title}</DialogTitle>
              <DialogDescription>
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: "medium",
                  timeStyle: event.allDay ? undefined : "short",
                }).format(event.start)}{" "}
                –{" "}
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: "medium",
                  timeStyle: event.allDay ? undefined : "short",
                }).format(event.end)}
              </DialogDescription>
            </DialogHeader>
            {event.description ? (
              <p className="whitespace-pre-wrap text-sm">{event.description}</p>
            ) : null}
            {event.location ? (
              <p className="text-sm text-muted-foreground">{event.location}</p>
            ) : null}
            <p className="truncate text-xs text-muted-foreground">
              {event.author === currentPubkey
                ? "Created by you"
                : `Created by ${authorLabel ?? event.author}`}
            </p>
            <DialogFooter>
              <Button variant="destructive" onClick={onDelete}>
                Delete
              </Button>
              {event.author === currentPubkey ? (
                <Button onClick={onEdit}>Edit</Button>
              ) : null}
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
