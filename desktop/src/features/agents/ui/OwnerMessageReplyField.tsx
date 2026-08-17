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
    <section
      className="flex items-start justify-between gap-4 rounded-lg border border-border px-3 py-3"
      data-testid="edit-agent-owner-message-reply"
    >
      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Channel replies
        </p>
        <label
          className="text-sm font-medium text-foreground"
          htmlFor="edit-agent-respond-to-owner-messages"
        >
          Reply to my messages without an @mention
        </label>
        <p className="text-xs text-muted-foreground">
          Applies in every channel this Agent has joined. Other members must
          still @mention it. If multiple Agents have this enabled in one
          channel, they will all reply.
        </p>
      </div>
      <Switch
        checked={checked}
        disabled={disabled}
        id="edit-agent-respond-to-owner-messages"
        onCheckedChange={onCheckedChange}
      />
    </section>
  );
}
