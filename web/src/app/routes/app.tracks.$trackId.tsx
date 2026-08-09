import { createFileRoute } from "@tanstack/react-router";
import { TrackDetailPage } from "@/features/tracks/TrackDetailPage";

export const Route = createFileRoute("/app/tracks/$trackId")({
  component: TrackDetailRoute,
});

function TrackDetailRoute() {
  const { trackId } = Route.useParams();
  return <TrackDetailPage trackId={trackId} />;
}
