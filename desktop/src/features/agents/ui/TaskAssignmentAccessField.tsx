import type { TaskAssignmentPolicy } from "@/shared/api/types";
import { CreateAgentRespondToField } from "./RespondToField";

export function TaskAssignmentAccessField({
  policy,
  allowlist,
  disabled,
  onPolicyChange,
  onAllowlistChange,
}: {
  policy: TaskAssignmentPolicy;
  allowlist: string[];
  disabled?: boolean;
  onPolicyChange: (policy: TaskAssignmentPolicy) => void;
  onAllowlistChange: (allowlist: string[]) => void;
}) {
  return (
    <CreateAgentRespondToField
      allowlist={allowlist}
      disabled={disabled}
      label="Who can assign tasks to this agent"
      mode={policy === "owner_only" ? "owner-only" : policy}
      onAllowlistChange={onAllowlistChange}
      onModeChange={(mode) =>
        onPolicyChange(mode === "owner-only" ? "owner_only" : mode)
      }
      testId="agent-task-assignment-access"
      variant="persona"
    />
  );
}
