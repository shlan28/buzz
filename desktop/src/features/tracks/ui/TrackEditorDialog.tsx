import * as React from "react";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
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
  const readOnly = Boolean(track && !track.canManage);

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
              members: draft.members,
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
              disabled={readOnly}
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
              disabled={readOnly}
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
              disabled={readOnly}
              value={draft.owner}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  owner: event.target.value,
                  members: draft.members.filter(
                    (member) => member !== event.target.value,
                  ),
                })
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
          <MembersField
            disabled={readOnly}
            members={draft.members}
            options={ownerOptions.filter(
              (option) => option.pubkey !== draft.owner,
            )}
            onChange={(members) => setDraft({ ...draft, members })}
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Start date" htmlFor="track-start-date">
              <Input
                id="track-start-date"
                disabled={readOnly}
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
                disabled={readOnly}
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
              disabled={readOnly}
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
          <Button disabled={pending || readOnly} onClick={submit}>
            {pending ? "Saving…" : track ? "Save changes" : "Create track"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MembersField({
  members,
  options,
  disabled,
  onChange,
}: {
  members: string[];
  options: TrackOwnerOption[];
  disabled: boolean;
  onChange: (members: string[]) => void;
}) {
  const labels = new Map(
    options.map((option) => [option.pubkey.toLowerCase(), option.label]),
  );
  const selected = new Set(members.map((member) => member.toLowerCase()));
  return (
    <div className="space-y-1.5 text-sm font-medium">
      <span>Members</span>
      {members.length > 0 ? (
        <div
          className="flex flex-wrap gap-1.5"
          data-testid="track-member-chips"
        >
          {members.map((member) => (
            <span
              className="inline-flex min-w-0 items-center gap-1 rounded-full bg-muted px-2 py-1 text-xs font-normal text-foreground"
              key={member}
            >
              <span className="max-w-40 truncate">
                {labels.get(member.toLowerCase()) ?? "Unknown member"}
              </span>
              {!disabled ? (
                <button
                  aria-label={`Remove ${labels.get(member.toLowerCase()) ?? "member"}`}
                  className="rounded-full text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    onChange(
                      members.filter((candidate) => candidate !== member),
                    )
                  }
                  type="button"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </span>
          ))}
        </div>
      ) : null}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="Add track members"
            className="w-full justify-between font-normal"
            disabled={disabled}
            type="button"
            variant="outline"
          >
            {members.length === 0
              ? "Add people or agents"
              : `${members.length} ${members.length === 1 ? "member" : "members"}`}
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-64 overflow-y-auto"
          onCloseAutoFocus={(event) => event.preventDefault()}
          style={{ minWidth: "var(--radix-dropdown-menu-trigger-width)" }}
        >
          {options.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              No other community identities are available.
            </p>
          ) : (
            options.map((option) => (
              <DropdownMenuCheckboxItem
                checked={selected.has(option.pubkey.toLowerCase())}
                key={option.pubkey}
                onCheckedChange={(checked) =>
                  onChange(
                    checked
                      ? [...members, option.pubkey]
                      : members.filter(
                          (member) =>
                            member.toLowerCase() !==
                            option.pubkey.toLowerCase(),
                        ),
                  )
                }
                onSelect={(event) => event.preventDefault()}
              >
                {option.label}
                {option.kind === "agent" ? " · Agent" : ""}
              </DropdownMenuCheckboxItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <p className="text-xs font-normal text-muted-foreground">
        Members can find and read this track. They cannot manage it.
      </p>
    </div>
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
      members: track.members,
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
    members: [],
    startDate,
    endDate: end.toISOString().slice(0, 10),
    status: "planned",
  };
}
