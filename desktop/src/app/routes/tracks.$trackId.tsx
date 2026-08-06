import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ViewLoadingFallback } from "@/shared/ui/ViewLoadingFallback";

const TrackDetailScreen = React.lazy(async () => {
  const module = await import("@/features/tracks/ui/TrackDetailScreen");
  return { default: module.TrackDetailScreen };
});

export const Route = createFileRoute("/tracks/$trackId")({
  component: TrackDetailRoute,
});

function TrackDetailRoute() {
  const { trackId } = Route.useParams();
  return (
    <React.Suspense fallback={<ViewLoadingFallback kind="projects" />}>
      <TrackDetailScreen trackId={trackId} />
    </React.Suspense>
  );
}
