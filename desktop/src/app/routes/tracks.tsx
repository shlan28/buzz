import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ViewLoadingFallback } from "@/shared/ui/ViewLoadingFallback";

const TracksScreen = React.lazy(async () => {
  const module = await import("@/features/tracks/ui/TracksScreen");
  return { default: module.TracksScreen };
});

export const Route = createFileRoute("/tracks")({
  component: TracksRoute,
});

function TracksRoute() {
  return (
    <React.Suspense fallback={<ViewLoadingFallback kind="projects" />}>
      <TracksScreen />
    </React.Suspense>
  );
}
