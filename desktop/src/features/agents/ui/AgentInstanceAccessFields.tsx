import type { RespondToMode, TaskAssignmentPolicy } from "@/shared/api/types";
import { OwnerMessageReplyField } from "./OwnerMessageReplyField";
import { OwnerOnlyAccessField } from "./OwnerOnlyAccessField";
import { TaskAssignmentAccessField } from "./TaskAssignmentAccessField";

export function AgentInstanceAccessFields({
  accessLocked,
  disabled,
  respondTo,
  respondToAllowlist,
  respondToOwnerMessages,
  taskAssignmentAllowlist,
  taskAssignmentPolicy,
  onRespondToAllowlistChange,
  onRespondToChange,
  onRespondToOwnerMessagesChange,
  onTaskAssignmentAllowlistChange,
  onTaskAssignmentPolicyChange,
}: {
  accessLocked: boolean;
  disabled: boolean;
  respondTo: RespondToMode;
  respondToAllowlist: string[];
  respondToOwnerMessages: boolean;
  taskAssignmentAllowlist: string[];
  taskAssignmentPolicy: TaskAssignmentPolicy;
  onRespondToAllowlistChange: (allowlist: string[]) => void;
  onRespondToChange: (mode: RespondToMode) => void;
  onRespondToOwnerMessagesChange: (checked: boolean) => void;
  onTaskAssignmentAllowlistChange: (allowlist: string[]) => void;
  onTaskAssignmentPolicyChange: (policy: TaskAssignmentPolicy) => void;
}) {
  return (
    <>
      <OwnerOnlyAccessField
        accessLocked={accessLocked}
        allowlist={respondToAllowlist}
        disabled={disabled}
        mode={respondTo}
        onAllowlistChange={onRespondToAllowlistChange}
        onModeChange={onRespondToChange}
      />
      <OwnerMessageReplyField
        checked={respondToOwnerMessages}
        disabled={disabled}
        onCheckedChange={onRespondToOwnerMessagesChange}
      />
      <TaskAssignmentAccessField
        allowlist={taskAssignmentAllowlist}
        disabled={disabled}
        onAllowlistChange={onTaskAssignmentAllowlistChange}
        onPolicyChange={onTaskAssignmentPolicyChange}
        policy={taskAssignmentPolicy}
      />
    </>
  );
}
