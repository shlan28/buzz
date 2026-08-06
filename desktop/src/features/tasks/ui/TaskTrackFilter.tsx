import type { TaskTrackOption } from "../types";

export function TaskTrackFilter({
  tracks,
  selected,
  onChange,
}: {
  tracks: TaskTrackOption[];
  selected: string | null;
  onChange: (trackId: string | null) => void;
}) {
  if (tracks.length === 0) return null;
  return (
    <select
      aria-label="Filter by track"
      className="h-8 max-w-48 rounded-md border border-input bg-background px-2 text-xs"
      value={selected ?? ""}
      onChange={(event) => onChange(event.target.value || null)}
    >
      <option value="">All tracks</option>
      {tracks.map((track) => (
        <option key={track.id} value={track.id}>
          {track.name}
          {track.archived ? " (Archived)" : ""}
        </option>
      ))}
    </select>
  );
}
