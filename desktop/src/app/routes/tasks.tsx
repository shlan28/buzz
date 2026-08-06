import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ViewLoadingFallback } from "@/shared/ui/ViewLoadingFallback";

const TasksScreen = React.lazy(async () => {
  const module = await import("@/features/tasks/ui/TasksScreen");
  return { default: module.TasksScreen };
});

export const Route = createFileRoute("/tasks")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    task?: string;
    view?: "board" | "list";
    group?: "assignee" | "status" | "track";
    track?: string;
  } => ({
    task:
      typeof search.task === "string" && search.task.length > 0
        ? search.task
        : undefined,
    view:
      search.view === "board" || search.view === "list"
        ? search.view
        : undefined,
    group:
      search.group === "assignee" ||
      search.group === "status" ||
      search.group === "track"
        ? search.group
        : undefined,
    track:
      typeof search.track === "string" && search.track.length > 0
        ? search.track
        : undefined,
  }),
  component: TasksRoute,
});

function TasksRoute() {
  return (
    <React.Suspense fallback={<ViewLoadingFallback kind="projects" />}>
      <TasksScreen />
    </React.Suspense>
  );
}
