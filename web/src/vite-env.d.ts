/// <reference types="vite/client" />

import type { WorkConsoleData } from "@/shared/api/communitySession";

declare global {
  interface Window {
    __BUZZ_E2E_WORK_CONSOLE_DATA__?: WorkConsoleData;
  }
}
