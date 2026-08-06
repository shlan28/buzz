import {
  Archive,
  CalendarDays,
  MoreHorizontal,
  RotateCcw,
  UserRound,
} from "lucide-react";
import { Button } from "@/shared/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Progress } from "@/shared/ui/progress";
import { cn } from "@/shared/lib/cn";
import { visibleTrackProgress } from "../lib/trackProgress";
import type { Task } from "@/features/tasks/types";
import type { Track, TrackOwnerOption, TrackStatus } from "../types";

export const TRACK_STATUS_PRESENTATION: Record<
  TrackStatus,
  { label: string; className: string }
> = {
  planned: { label: "Planned", className: "bg-muted text-muted-foreground" },
  active: {
    label: "Active",
    className: "bg-blue-500/10 text-blue-600 dark:text-blue-300",
  },
  completed: {
    label: "Completed",
    className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  },
  canceled: {
    label: "Canceled",
    className: "bg-rose-500/10 text-rose-600 dark:text-rose-300",
  },
};

export function TrackStatusBadge({ status }: { status: TrackStatus }) {
  const value = TRACK_STATUS_PRESENTATION[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        value.className,
      )}
    >
      {value.label}
    </span>
  );
}

export function TrackList({
  tracks,
  tasks,
  owners,
  pending,
  onOpen,
  onEdit,
  onArchive,
  onRestore,
}: {
  tracks: Track[];
  tasks: Task[];
  owners: TrackOwnerOption[];
  pending: boolean;
  onOpen: (track: Track) => void;
  onEdit: (track: Track) => void;
  onArchive: (track: Track) => void;
  onRestore: (track: Track) => void;
}) {
  const ownerLabels = new Map(
    owners.map((owner) => [owner.pubkey.toLowerCase(), owner.label]),
  );
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
      <div className="mx-auto max-w-6xl divide-y divide-border overflow-hidden rounded-xl border border-border bg-background">
        {tracks.map((track) => {
          const progress = visibleTrackProgress(track.id, tasks);
          const owner =
            ownerLabels.get(track.owner.toLowerCase()) ?? "Unknown owner";
          return (
            <div
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 hover:bg-muted/40 md:grid-cols-[minmax(0,1fr)_minmax(8rem,0.5fr)_minmax(10rem,0.7fr)_minmax(9rem,0.7fr)_auto]"
              data-testid={`track-row-${track.id}`}
              key={track.id}
            >
              <button
                className="min-w-0 text-left"
                onClick={() => onOpen(track)}
                type="button"
              >
                <span className="block truncate text-sm font-medium">
                  {track.name}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {track.description || "No description"}
                </span>
              </button>
              <TrackStatusBadge status={track.status} />
              <span className="hidden min-w-0 items-center gap-1.5 text-xs text-muted-foreground md:flex">
                <UserRound className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{owner}</span>
              </span>
              <span className="hidden items-center gap-1.5 text-xs text-muted-foreground md:flex">
                <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                {formatDate(track.startDate)} – {formatDate(track.endDate)}
              </span>
              <div className="hidden min-w-36 items-center gap-2 md:flex">
                <Progress className="h-1.5" value={progress.percent} />
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {progress.completed}/{progress.total} visible
                </span>
              </div>
              <div className="justify-self-end">
                {track.archived && track.canManage ? (
                  <Button
                    disabled={pending}
                    onClick={() => onRestore(track)}
                    size="sm"
                    variant="outline"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Restore
                  </Button>
                ) : track.canManage ? (
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        aria-label={`Actions for ${track.name}`}
                        disabled={pending}
                        size="icon"
                        variant="ghost"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => onEdit(track)}>
                        Edit track
                      </DropdownMenuItem>
                      {track.status === "completed" ||
                      track.status === "canceled" ? (
                        <DropdownMenuItem onSelect={() => onArchive(track)}>
                          <Archive className="h-4 w-4" />
                          Archive track
                        </DropdownMenuItem>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Read only
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function formatDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(year === new Date().getFullYear() ? {} : { year: "numeric" }),
  }).format(new Date(year, month - 1, day));
}
