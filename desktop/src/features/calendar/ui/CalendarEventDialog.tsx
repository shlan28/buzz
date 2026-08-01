import * as React from "react";
import { CalendarDays, Clock, MapPin, Users } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Textarea } from "@/shared/ui/textarea";
import type { CalendarDraft } from "../lib/calendarTypes";

function inputDateTime(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function withAllDay(draft: CalendarDraft, allDay: boolean): CalendarDraft {
  if (!allDay) {
    const start = new Date(draft.start);
    start.setHours(9, 0, 0, 0);
    return {
      ...draft,
      allDay: false,
      start,
      end: new Date(start.getTime() + 30 * 60_000),
    };
  }
  const start = new Date(
    draft.start.getFullYear(),
    draft.start.getMonth(),
    draft.start.getDate(),
  );
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { ...draft, allDay: true, start, end };
}

export function CalendarEventDialog({
  draft,
  open,
  pending,
  error,
  onChange,
  onClose,
  onSave,
}: {
  draft: CalendarDraft | null;
  open: boolean;
  pending: boolean;
  error?: string;
  onChange: (draft: CalendarDraft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  React.useEffect(() => {
    if (!open) setExpanded(false);
  }, [open]);
  if (!draft) return null;
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-xl"
        data-testid="calendar-event-dialog"
      >
        <DialogHeader>
          <DialogTitle>
            {draft.eventId ? "Edit event" : "Create event"}
          </DialogTitle>
          <DialogDescription>
            Only you can see this event in this community.
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          aria-label="Event title"
          placeholder="Add title"
          value={draft.title}
          onChange={(event) =>
            onChange({ ...draft, title: event.target.value })
          }
        />
        <div className="flex items-center gap-3">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Start time"
            type="datetime-local"
            value={inputDateTime(draft.start)}
            onChange={(event) =>
              onChange({ ...draft, start: new Date(event.target.value) })
            }
          />
          <span>–</span>
          <Input
            aria-label="End time"
            type="datetime-local"
            value={inputDateTime(draft.end)}
            onChange={(event) =>
              onChange({ ...draft, end: new Date(event.target.value) })
            }
          />
        </div>
        <div className="flex items-center gap-3">
          <Users className="h-4 w-4 text-muted-foreground" />
          <Input
            aria-label="Participants"
            placeholder="Add participant pubkeys, separated by commas"
            value={draft.participants.join(", ")}
            onChange={(event) =>
              onChange({
                ...draft,
                participants: event.target.value
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>
        <div className="flex items-start gap-3">
          <CalendarDays className="mt-2 h-4 w-4 text-muted-foreground" />
          <Textarea
            aria-label="Description"
            placeholder="Add description"
            value={draft.description}
            onChange={(event) =>
              onChange({ ...draft, description: event.target.value })
            }
          />
        </div>
        {expanded ? (
          <>
            <div className="flex items-center gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <Input
                aria-label="Location"
                placeholder="Add location"
                value={draft.location}
                onChange={(event) =>
                  onChange({ ...draft, location: event.target.value })
                }
              />
            </div>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={draft.allDay}
                onChange={(event) =>
                  onChange(withAllDay(draft, event.target.checked))
                }
              />
              All day
            </label>
          </>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <DialogFooter className="items-center sm:justify-between">
          <Button
            type="button"
            variant="link"
            onClick={() => setExpanded(true)}
            disabled={expanded}
          >
            More options
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onSave}
              disabled={
                pending || !draft.title.trim() || draft.end <= draft.start
              }
            >
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
