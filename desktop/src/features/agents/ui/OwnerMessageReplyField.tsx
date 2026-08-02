import { Switch } from "@/shared/ui/switch";

export function OwnerMessageReplyField({
  checked,
  disabled,
  onCheckedChange,
}: {
  checked: boolean;
  disabled: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border px-3 py-3">
      <div className="space-y-1">
        <label
          className="text-sm font-medium text-foreground"
          htmlFor="edit-agent-respond-to-owner-messages"
        >
          Reply to my messages without an @mention
        </label>
        <p className="text-xs text-muted-foreground">
          Every matching message you send will trigger a reply. If multiple
          agents have this enabled in one channel, they will all reply.
        </p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        id="edit-agent-respond-to-owner-messages"
        onCheckedChange={onCheckedChange}
      />
    </div>
  );
}
