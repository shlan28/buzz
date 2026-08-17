import { Button } from "@/shared/ui/button";
import { AgentCreationPreview } from "./AgentCreationPreview";

export function AgentInstanceAvatarField({
  avatarUrl,
  label,
  onClearAvatar,
  onEditLinkedPersona,
  onOpenChange,
  onSelectAvatar,
  onUploadPendingChange,
}: {
  avatarUrl: string | null;
  label: string;
  onClearAvatar: () => void;
  onEditLinkedPersona?: () => void;
  onOpenChange: (open: boolean) => void;
  onSelectAvatar: (url: string) => void;
  onUploadPendingChange: (pending: boolean) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <AgentCreationPreview
        avatarUrl={avatarUrl}
        hideEditControl
        label={label}
        onClearAvatar={onClearAvatar}
        onUploadPendingChange={onUploadPendingChange}
        onSelectAvatar={onSelectAvatar}
      />
      {onEditLinkedPersona ? (
        <Button
          className="w-full"
          onClick={() => {
            onOpenChange(false);
            onEditLinkedPersona();
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          Edit avatar
        </Button>
      ) : (
        <p className="text-center text-xs text-muted-foreground">
          Avatar is shared identity
        </p>
      )}
    </div>
  );
}
