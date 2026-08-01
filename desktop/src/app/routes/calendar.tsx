import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { usePreviewFeatureWarning } from "@/shared/features";
import { ViewLoadingFallback } from "@/shared/ui/ViewLoadingFallback";
import type { CalendarView } from "@/features/calendar/lib/calendarTypes";

const CalendarScreen = React.lazy(async () => {
  const module = await import("@/features/calendar/ui/CalendarScreen");
  return { default: module.CalendarScreen };
});

export const Route = createFileRoute("/calendar")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { date?: string; view?: CalendarView } => ({
    date:
      typeof search.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(search.date)
        ? search.date
        : undefined,
    view:
      search.view === "day" || search.view === "month" || search.view === "week"
        ? search.view
        : undefined,
  }),
  component: CalendarRoute,
});

function CalendarRoute() {
  usePreviewFeatureWarning("calendar");
  return (
    <React.Suspense fallback={<ViewLoadingFallback kind="projects" />}>
      <CalendarScreen />
    </React.Suspense>
  );
}
