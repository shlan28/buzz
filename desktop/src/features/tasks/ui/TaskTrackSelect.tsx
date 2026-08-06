import type { TaskTrackOption } from "../types";

export function TaskTrackSelect({
  tracks,
  value,
  disabled = false,
  onChange,
}: {
  tracks: TaskTrackOption[];
  value: string | null;
  disabled?: boolean;
  onChange: (trackId: string | null) => void;
}) {
  const selectedArchived = tracks.find(
    (track) => track.id === value && track.archived,
  );
  return (
    <label className="block space-y-1.5 text-sm font-medium">
      Track
      <select
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        disabled={disabled}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">No track</option>
        {selectedArchived ? (
          <option value={selectedArchived.id}>
            {selectedArchived.name} (archived)
          </option>
        ) : null}
        {tracks
          .filter((track) => !track.archived)
          .map((track) => (
            <option key={track.id} value={track.id}>
              {track.name}
            </option>
          ))}
      </select>
    </label>
  );
}
