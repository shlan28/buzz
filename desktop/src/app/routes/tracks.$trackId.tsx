import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ViewLoadingFallback } from "@/shared/ui/ViewLoadingFallback";

const TrackDetailScreen = React.lazy(async () => {
  const module = await import("@/features/tracks/ui/TrackDetailScreen");
  return { default: module.TrackDetailScreen };
});

export const Route = createFileRoute("/tracks/$trackId")({
  validateSearch: (search: Record<string, unknown>) => ({
    task:
      typeof search.task === "string" && search.task.length > 0
        ? search.task
        : undefined,
  }),
  component: TrackDetailRoute,
});

function TrackDetailRoute() {
  const { trackId } = Route.useParams();
  const { task } = Route.useSearch();
  return (
    <React.Suspense fallback={<ViewLoadingFallback kind="projects" />}>
      <TrackDetailScreen taskId={task} trackId={trackId} />
    </React.Suspense>
  );
}
