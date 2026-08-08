/// <reference types="vite/client" />

import type { WorkConsoleData } from "@/shared/api/communitySession";

declare global {
  interface Window {
    __BUZZ_E2E_WORK_CONSOLE_DATA__?: WorkConsoleData;
    __BUZZ_E2E_PUBLISH_CHANNEL_MESSAGE__?: (input: {
      channelId: string;
      content: string;
      mentionPubkeys?: string[];
    }) => Promise<string>;
  }
}
