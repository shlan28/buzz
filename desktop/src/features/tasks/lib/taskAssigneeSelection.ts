export function taskAssigneeFromSelectValue(value: string): string | null {
  return value === "" ? null : value;
}
