import type { Task } from "@/features/tasks/types";
import type { Track, TrackProgress, TrackScope } from "../types";

export function visibleTrackProgress(
  trackId: string,
  visibleTasks: readonly Task[],
): TrackProgress {
  const tasks = visibleTasks.filter(
    (task) => !task.archived && task.trackId === trackId,
  );
  const completed = tasks.filter((task) => task.status === "done").length;
  return {
    completed,
    total: tasks.length,
    percent:
      tasks.length === 0 ? 0 : Math.round((completed / tasks.length) * 100),
  };
}

export function trackMatchesScope(track: Track, scope: TrackScope) {
  if (scope === "archived") return track.archived;
  if (track.archived) return false;
  return scope === "current"
    ? track.status === "active" || track.status === "planned"
    : track.status === "completed" || track.status === "canceled";
}

export function sortTracks(tracks: readonly Track[], scope: TrackScope) {
  return [...tracks].sort((left, right) => {
    if (scope === "current") {
      const leftRank = left.status === "active" ? 0 : 1;
      const rightRank = right.status === "active" ? 0 : 1;
      return leftRank - rightRank || left.endDate.localeCompare(right.endDate);
    }
    return right.updatedAt - left.updatedAt;
  });
}
