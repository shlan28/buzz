import { invokeTauri } from "@/shared/api/tauri";

type RawCalendarSubscriptionStatus = {
  active: boolean;
  created_at: string | null;
};

type RawCalendarSubscriptionSecret = RawCalendarSubscriptionStatus & {
  https_url: string;
  webcal_url: string;
};

export type CalendarSubscriptionStatus = {
  active: boolean;
  createdAt: string | null;
};

export type CalendarSubscriptionSecret = CalendarSubscriptionStatus & {
  httpsUrl: string;
  webcalUrl: string;
};

type CalendarSubscriptionMethod = "GET" | "POST" | "DELETE";

async function request<T>(
  method: CalendarSubscriptionMethod,
  suffix = "",
): Promise<T> {
  return invokeTauri<T>("calendar_subscription_request", {
    method,
    suffix,
  });
}

function mapStatus(
  raw: RawCalendarSubscriptionStatus,
): CalendarSubscriptionStatus {
  return { active: raw.active, createdAt: raw.created_at };
}

function mapSecret(
  raw: RawCalendarSubscriptionSecret,
): CalendarSubscriptionSecret {
  return {
    ...mapStatus(raw),
    httpsUrl: raw.https_url,
    webcalUrl: raw.webcal_url,
  };
}

export async function getCalendarSubscription(): Promise<CalendarSubscriptionStatus> {
  return mapStatus(await request<RawCalendarSubscriptionStatus>("GET"));
}

export async function createCalendarSubscription(): Promise<CalendarSubscriptionSecret> {
  return mapSecret(await request<RawCalendarSubscriptionSecret>("POST"));
}

export async function regenerateCalendarSubscription(): Promise<CalendarSubscriptionSecret> {
  return mapSecret(
    await request<RawCalendarSubscriptionSecret>("POST", "/regenerate"),
  );
}

export async function revokeCalendarSubscription(): Promise<CalendarSubscriptionStatus> {
  return mapStatus(await request<RawCalendarSubscriptionStatus>("DELETE"));
}
