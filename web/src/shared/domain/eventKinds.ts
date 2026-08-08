export const KINDS = {
  channelMetadata: 39_000,
  channelMembership: 39_002,
  channelMessage: 9,
  agentMessage: 40_002,
  agentProfile: 10_100,
  calendarDate: 31_922,
  calendarTime: 31_923,
  taskState: 30_500,
  trackState: 30_510,
} as const;

export const MESSAGE_KINDS = [KINDS.channelMessage, KINDS.agentMessage];
