import { getRelayHttpUrl, signRelayEvent } from "@/shared/api/tauri";

const NIP98_KIND = 27235;
const REQUEST_TIMEOUT_MS = 15_000;
const SUBSCRIPTION_PATH = "/api/calendar/subscription";

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

async function nip98Header(
  url: string,
  method: CalendarSubscriptionMethod,
): Promise<string> {
  const authEvent = await signRelayEvent({
    kind: NIP98_KIND,
    content: "",
    tags: [
      ["u", url],
      ["method", method],
      ["nonce", crypto.randomUUID()],
    ],
  });
  return `Nostr ${btoa(JSON.stringify(authEvent))}`;
}

async function request<T>(
  method: CalendarSubscriptionMethod,
  suffix = "",
): Promise<T> {
  const base = (await getRelayHttpUrl()).replace(/\/+$/, "");
  const url = `${base}${SUBSCRIPTION_PATH}${suffix}`;
  const authorization = await nip98Header(url, method);
  const response = await fetch(url, {
    method,
    headers: { Authorization: authorization },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const json = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    const message =
      typeof json.error === "string"
        ? json.error
        : `Calendar subscription request failed (${response.status}).`;
    throw new Error(message);
  }
  return json as T;
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
