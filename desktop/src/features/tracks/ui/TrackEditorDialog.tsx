import * as React from "react";
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
import { validateTrackDraft } from "../lib/trackEvents";
import type {
  Track,
  TrackDraft,
  TrackOwnerOption,
  TrackPatch,
  TrackStatus,
} from "../types";

export function TrackEditorDialog({
  track,
  owners,
  currentPubkey,
  open,
  pending,
  error,
  onClose,
  onSave,
}: {
  track?: Track;
  owners: TrackOwnerOption[];
  currentPubkey?: string;
  open: boolean;
  pending: boolean;
  error?: string;
  onClose: () => void;
  onSave: (value: TrackDraft | TrackPatch) => void;
}) {
  const [draft, setDraft] = React.useState<TrackDraft>(() =>
    initialDraft(track, currentPubkey),
  );
  const [validationError, setValidationError] = React.useState<string>();

  React.useEffect(() => {
    if (open) {
      setDraft(initialDraft(track, currentPubkey));
      setValidationError(undefined);
    }
  }, [currentPubkey, open, track]);

  const ownerOptions = React.useMemo(() => {
    if (!draft.owner || owners.some((owner) => owner.pubkey === draft.owner)) {
      return owners;
    }
    return [
      ...owners,
      {
        pubkey: draft.owner,
        label: "Unknown current owner",
        kind: "person" as const,
      },
    ];
  }, [draft.owner, owners]);

  const submit = () => {
    try {
      validateTrackDraft(draft);
      setValidationError(undefined);
      onSave(
        track
          ? {
              name: draft.name,
              description: draft.description,
              owner: draft.owner,
              startDate: draft.startDate,
              endDate: draft.endDate,
              status: draft.status,
            }
          : draft,
      );
    } catch (nextError) {
      setValidationError(
        nextError instanceof Error
          ? nextError.message
          : "Check the track details.",
      );
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg" data-testid="track-editor-dialog">
        <DialogHeader>
          <DialogTitle>{track ? "Edit track" : "Create track"}</DialogTitle>
          <DialogDescription>
            Define the owner and planned window for this body of work.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Name" htmlFor="track-name">
            <Input
              autoFocus
              id="track-name"
              maxLength={256}
              value={draft.name}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />
          </Field>
          <Field label="Description" htmlFor="track-description">
            <Textarea
              id="track-description"
              placeholder="What outcome should this track reach?"
              value={draft.description}
              onChange={(event) =>
                setDraft({ ...draft, description: event.target.value })
              }
            />
          </Field>
          <Field label="Owner" htmlFor="track-owner">
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              id="track-owner"
              value={draft.owner}
              onChange={(event) =>
                setDraft({ ...draft, owner: event.target.value })
              }
            >
              <option disabled value="">
                Select an owner
              </option>
              {ownerOptions.map((owner) => (
                <option key={owner.pubkey} value={owner.pubkey}>
                  {owner.label}
                  {owner.kind === "agent" ? " · Agent" : ""}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Start date" htmlFor="track-start-date">
              <Input
                id="track-start-date"
                type="date"
                value={draft.startDate}
                onChange={(event) =>
                  setDraft({ ...draft, startDate: event.target.value })
                }
              />
            </Field>
            <Field label="End date" htmlFor="track-end-date">
              <Input
                aria-invalid={draft.endDate < draft.startDate}
                id="track-end-date"
                min={draft.startDate}
                type="date"
                value={draft.endDate}
                onChange={(event) =>
                  setDraft({ ...draft, endDate: event.target.value })
                }
              />
            </Field>
          </div>
          <Field label="Status" htmlFor="track-status">
            <select
              className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              id="track-status"
              value={draft.status}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  status: event.target.value as TrackStatus,
                })
              }
            >
              <option value="planned">Planned</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="canceled">Canceled</option>
            </select>
          </Field>
          {draft.endDate < draft.startDate ? (
            <p className="text-sm text-destructive">
              End date cannot be before start date.
            </p>
          ) : null}
          {validationError || error ? (
            <p className="text-sm text-destructive" role="alert">
              {validationError ?? error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button disabled={pending} onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button disabled={pending} onClick={submit}>
            {pending ? "Saving…" : track ? "Save changes" : "Create track"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5 text-sm font-medium" htmlFor={htmlFor}>
      {label}
      {children}
    </label>
  );
}

function initialDraft(
  track: Track | undefined,
  currentPubkey?: string,
): TrackDraft {
  if (track) {
    return {
      id: track.id,
      name: track.name,
      description: track.description,
      owner: track.owner,
      startDate: track.startDate,
      endDate: track.endDate,
      status: track.status,
    };
  }
  const startDate = new Date().toISOString().slice(0, 10);
  const end = new Date(`${startDate}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 30);
  return {
    id: crypto.randomUUID(),
    name: "",
    description: "",
    owner: currentPubkey ?? "",
    startDate,
    endDate: end.toISOString().slice(0, 10),
    status: "planned",
  };
}
