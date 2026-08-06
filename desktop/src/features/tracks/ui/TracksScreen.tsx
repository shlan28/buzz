import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { useTasks } from "@/features/tasks/hooks";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { useTracks } from "../hooks";
import {
  sortTracks,
  trackMatchesScope,
  visibleTrackProgress,
} from "../lib/trackProgress";
import type { Track, TrackDraft, TrackPatch, TrackScope } from "../types";
import { TrackEditorDialog } from "./TrackEditorDialog";
import { TrackList } from "./TrackList";

export function TracksScreen() {
  const navigate = useNavigate();
  const tracksQuery = useTracks();
  const tasksQuery = useTasks();
  const [scope, setScope] = React.useState<TrackScope>("current");
  const [query, setQuery] = React.useState("");
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Track>();
  const [mutationError, setMutationError] = React.useState<string>();

  const visible = React.useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return sortTracks(
      tracksQuery.tracks.filter(
        (track) =>
          trackMatchesScope(track, scope) &&
          (!needle ||
            track.name.toLocaleLowerCase().includes(needle) ||
            track.description.toLocaleLowerCase().includes(needle)),
      ),
      scope,
    );
  }, [query, scope, tracksQuery.tracks]);

  const summary = React.useMemo(
    () =>
      visible.reduce(
        (total, track) => {
          const progress = visibleTrackProgress(track.id, tasksQuery.tasks);
          total.completed += progress.completed;
          total.tasks += progress.total;
          return total;
        },
        { completed: 0, tasks: 0 },
      ),
    [tasksQuery.tasks, visible],
  );

  const save = (value: TrackDraft | TrackPatch) => {
    setMutationError(undefined);
    if (editing) {
      tracksQuery.update.mutate(
        { track: editing, patch: value as TrackPatch },
        {
          onSuccess: () => {
            setEditorOpen(false);
            setEditing(undefined);
          },
          onError: (error) => setMutationError(messageFromError(error)),
        },
      );
      return;
    }
    tracksQuery.create.mutate(value as TrackDraft, {
      onSuccess: () => setEditorOpen(false),
      onError: (error) => setMutationError(messageFromError(error)),
    });
  };

  const archive = (track: Track) => {
    tracksQuery.update.mutate(
      { track, patch: { archived: true } },
      {
        onSuccess: () => {
          toast(`“${track.name}” was archived.`, {
            action: {
              label: "Undo",
              onClick: async () => {
                const refreshed = await tracksQuery.refetch();
                const latest = refreshed.data?.find(
                  (candidate) => candidate.id === track.id,
                );
                if (
                  refreshed.isError ||
                  !latest ||
                  latest.eventId === track.eventId
                ) {
                  toast.error("The archived track could not be refreshed.");
                  return;
                }
                tracksQuery.update.mutate(
                  { track: latest, patch: { archived: false } },
                  {
                    onError: (error) => toast.error(messageFromError(error)),
                  },
                );
              },
            },
          });
        },
        onError: (error) => toast.error(messageFromError(error)),
      },
    );
  };

  const restore = (track: Track) => {
    tracksQuery.update.mutate(
      { track, patch: { archived: false } },
      {
        onSuccess: () => toast.success(`“${track.name}” was restored.`),
        onError: (error) => toast.error(messageFromError(error)),
      },
    );
  };

  const loading = tracksQuery.isLoading || tasksQuery.isLoading;
  const failed = tracksQuery.isError || tasksQuery.isError;
  return (
    <div
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
      data-testid="tracks-screen"
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3">
        <div className="mr-auto">
          <h1 className="text-lg font-semibold tracking-tight">Tracks</h1>
          <p className="text-xs text-muted-foreground">
            Coordinate owned work across a planned timeline.
          </p>
        </div>
        <div className="relative min-w-52 flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search tracks"
            className="pl-8"
            placeholder="Search tracks…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Button
          onClick={() => {
            setMutationError(undefined);
            setEditing(undefined);
            setEditorOpen(true);
          }}
          size="sm"
        >
          <Plus className="h-4 w-4" />
          Track
        </Button>
      </header>
      <div className="flex flex-wrap items-center gap-3 px-5 py-3">
        <Tabs
          value={scope}
          onValueChange={(value) => setScope(value as TrackScope)}
        >
          <TabsList>
            <TabsTrigger value="current">Current</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
            <TabsTrigger value="archived">Archived</TabsTrigger>
          </TabsList>
        </Tabs>
        {!loading && !failed ? (
          <p className="text-xs text-muted-foreground">
            {visible.length} {visible.length === 1 ? "track" : "tracks"} ·{" "}
            {summary.completed}/{summary.tasks} visible tasks completed
          </p>
        ) : null}
      </div>
      {loading ? <Centered>Loading tracks…</Centered> : null}
      {failed ? (
        <Centered>
          <div className="space-y-3 text-center">
            <p>Tracks couldn&apos;t be loaded.</p>
            <Button
              onClick={() => {
                void tracksQuery.refetch();
                void tasksQuery.refetch();
              }}
              size="sm"
              variant="outline"
            >
              Retry
            </Button>
          </div>
        </Centered>
      ) : null}
      {!loading && !failed && visible.length === 0 ? (
        <Centered>
          <div className="max-w-sm text-center">
            <p className="text-sm font-medium">{emptyTitle(scope, query)}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {emptyDescription(scope, query)}
            </p>
          </div>
        </Centered>
      ) : null}
      {!loading && !failed && visible.length > 0 ? (
        <TrackList
          onArchive={archive}
          onEdit={(track) => {
            setMutationError(undefined);
            setEditing(track);
            setEditorOpen(true);
          }}
          onOpen={(track) =>
            void navigate({
              to: "/tracks/$trackId",
              params: { trackId: track.id },
            } as never)
          }
          onRestore={restore}
          owners={tracksQuery.owners}
          pending={tracksQuery.update.isPending}
          tasks={tasksQuery.tasks}
          tracks={visible}
        />
      ) : null}
      <TrackEditorDialog
        currentPubkey={tracksQuery.currentPubkey}
        error={mutationError}
        onClose={() => {
          if (!tracksQuery.create.isPending && !tracksQuery.update.isPending) {
            setEditorOpen(false);
            setEditing(undefined);
          }
        }}
        onSave={save}
        open={editorOpen}
        owners={tracksQuery.owners}
        pending={tracksQuery.create.isPending || tracksQuery.update.isPending}
        track={editing}
      />
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
      {children}
    </div>
  );
}

function emptyTitle(scope: TrackScope, query: string) {
  if (query.trim()) return "No matching tracks";
  if (scope === "archived") return "No archived tracks";
  if (scope === "completed") return "No completed tracks";
  return "No current tracks";
}

function emptyDescription(scope: TrackScope, query: string) {
  if (query.trim()) return "Try a different search term.";
  if (scope === "archived")
    return "Archived tracks remain available here when you need them.";
  if (scope === "completed")
    return "Completed and canceled tracks appear here before they are archived.";
  return "Create a track to coordinate related tasks, ownership, and dates.";
}

function messageFromError(error: unknown) {
  return error instanceof Error
    ? error.message
    : "The track could not be saved.";
}
