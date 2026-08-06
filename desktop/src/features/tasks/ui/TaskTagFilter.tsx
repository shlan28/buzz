import { Check, Tags, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover";

export function TaskTagFilter({
  values,
  selected,
  onChange,
}: {
  values: string[];
  selected: ReadonlySet<string>;
  onChange: (next: ReadonlySet<string>) => void;
}) {
  if (values.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            className="h-8 gap-1.5 px-2 text-xs"
            size="sm"
            variant="outline"
          >
            <Tags className="h-3.5 w-3.5" />
            Tags{selected.size > 0 ? ` (${selected.size})` : ""}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-60 p-2">
          <p className="px-2 py-1 text-xs font-medium">Match any tag</p>
          <div className="max-h-64 overflow-y-auto py-1">
            {values.map((value) => {
              const checked = selected.has(value);
              return (
                <button
                  aria-pressed={checked}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                  key={value}
                  onClick={() => {
                    const next = new Set(selected);
                    if (checked) next.delete(value);
                    else next.add(value);
                    onChange(next);
                  }}
                  type="button"
                >
                  <span className="flex h-4 w-4 items-center justify-center rounded border border-input">
                    {checked ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span className="truncate">{value}</span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      {selected.size > 0 ? (
        <Button
          aria-label="Clear tag filters"
          className="h-8 w-8 p-0"
          onClick={() => onChange(new Set())}
          size="sm"
          variant="ghost"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
