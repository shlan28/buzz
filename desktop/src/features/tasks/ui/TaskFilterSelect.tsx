export function TaskFilterSelect({
  label,
  values,
  selected,
  onChange,
}: {
  label: string;
  values: string[];
  selected: ReadonlySet<string>;
  onChange: (next: ReadonlySet<string>) => void;
}) {
  if (values.length === 0) return null;
  return (
    <select
      aria-label={`Filter by ${label}`}
      className="h-8 max-w-40 rounded-md border border-input bg-background px-2 text-xs"
      value={selected.size === 1 ? [...selected][0] : ""}
      onChange={(event) =>
        onChange(event.target.value ? new Set([event.target.value]) : new Set())
      }
    >
      <option value="">All {label}</option>
      {values.map((value) => (
        <option key={value} value={value}>
          {display(value)}
        </option>
      ))}
    </select>
  );
}

function display(value: string) {
  const parts = value.split(":");
  return parts.at(-1) || value;
}
