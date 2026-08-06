import * as React from "react";
import { X } from "lucide-react";
import { Input } from "@/shared/ui/input";

export function TaskTagInput({
  labels,
  suggestions = [],
  disabled = false,
  onChange,
}: {
  labels: string[];
  suggestions?: string[];
  disabled?: boolean;
  onChange: (labels: string[]) => void;
}) {
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string>();
  const listId = React.useId();

  const add = () => {
    const label = value.trim();
    if (!label) return;
    if (new TextEncoder().encode(label).length > 64) {
      setError("Tags must be 64 bytes or fewer.");
      return;
    }
    if (
      !labels.some(
        (item) => item.toLocaleLowerCase() === label.toLocaleLowerCase(),
      )
    )
      onChange([...labels, label]);
    setValue("");
    setError(undefined);
  };

  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium">Tags</span>
      <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border border-input bg-background p-1.5">
        {labels.map((label) => (
          <span
            className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-1 text-xs"
            key={label.toLocaleLowerCase()}
          >
            {label}
            <button
              aria-label={`Remove ${label} tag`}
              className="text-muted-foreground hover:text-foreground"
              disabled={disabled}
              onClick={() => onChange(labels.filter((item) => item !== label))}
              type="button"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <Input
          aria-label="Add tag"
          className="h-7 min-w-28 flex-1 border-0 px-1 shadow-none focus-visible:ring-0"
          disabled={disabled}
          list={listId}
          placeholder={labels.length === 0 ? "Add tag…" : undefined}
          value={value}
          onBlur={add}
          onChange={(event) => {
            setValue(event.target.value);
            setError(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              add();
            } else if (
              event.key === "Backspace" &&
              !value &&
              labels.length > 0
            ) {
              onChange(labels.slice(0, -1));
            }
          }}
        />
        <datalist id={listId}>
          {suggestions
            .filter(
              (suggestion) =>
                !labels.some(
                  (label) =>
                    label.toLocaleLowerCase() ===
                    suggestion.toLocaleLowerCase(),
                ),
            )
            .map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
        </datalist>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
