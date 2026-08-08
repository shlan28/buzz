import { Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronLeft,
  Link2,
  MonitorCog,
  Palette,
  Radio,
  Trash2,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { relayHttpBaseUrl } from "@/shared/lib/relay-url";
import { resetPairedSignerSession } from "@/shared/api/signer";
import {
  clearRemoteSignerCredential,
  loadRemoteSignerCredential,
} from "@/shared/storage/deviceCredentials";
import { useTheme } from "@/shared/theme/ThemeProvider";
import { DesktopParityAppShell } from "@/shared/ui/DesktopParityAppShell";
import { useWorkConsoleData } from "@/shared/hooks/useWorkConsoleData";
import { profileLabel } from "@/features/profile/eventCodec";

type Section = "profile" | "appearance" | "connection" | "device" | "desktop";
const sections = [
  { id: "profile", label: "Profile", icon: UserRound },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "connection", label: "Connection", icon: Radio },
  { id: "device", label: "Paired device", icon: Link2 },
  { id: "desktop", label: "Desktop settings", icon: MonitorCog },
] as const;

export function SettingsPage() {
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>("profile");
  const { theme, setTheme } = useTheme();
  const { state: workState } = useWorkConsoleData();
  const workData = workState.status === "ready" ? workState.data : undefined;
  const [credential, setCredential] =
    useState<Awaited<ReturnType<typeof loadRemoteSignerCredential>>>();
  const [relayOnline, setRelayOnline] = useState<boolean>();
  useEffect(() => {
    void loadRemoteSignerCredential().then(setCredential);
  }, []);
  const checkRelay = useCallback(async () => {
    try {
      setRelayOnline((await fetch(`${relayHttpBaseUrl()}/health`)).ok);
    } catch {
      setRelayOnline(false);
    }
  }, []);
  useEffect(() => {
    void checkRelay();
  }, [checkRelay]);
  const clearPairing = async () => {
    resetPairedSignerSession();
    await clearRemoteSignerCredential();
    setCredential(undefined);
    void navigate({ to: "/app/pair" });
  };

  return (
    <DesktopParityAppShell
      sidebar={(collapsed) => (
        <aside
          className={`${collapsed ? "w-12" : "w-[300px]"} shrink-0 p-3 text-sidebar-foreground max-[760px]:w-14`}
        >
          <Link
            className="mb-3 flex h-8 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted"
            to="/app/inbox"
          >
            <ChevronLeft className="size-4" />
            <span className="max-[760px]:sr-only">Back to Buzz</span>
          </Link>
          <h1 className="px-2 pb-3 text-lg font-semibold max-[760px]:sr-only">
            Settings
          </h1>
          <nav className="space-y-1">
            {sections.map(({ id, icon: Icon, label }) => (
              <button
                className={`flex h-9 w-full items-center gap-2 rounded-md px-2 text-sm max-[760px]:justify-center ${section === id ? "bg-accent font-medium" : "text-muted-foreground hover:bg-muted"}`}
                key={id}
                onClick={() => setSection(id)}
                type="button"
              >
                <Icon className="size-4" />
                <span className="max-[760px]:sr-only">{label}</span>
              </button>
            ))}
          </nav>
        </aside>
      )}
    >
      <main
        className="min-w-0 flex-1 overflow-y-auto px-8 py-7 max-[760px]:px-4"
        data-testid="settings-screen"
      >
        <div className="mx-auto max-w-2xl">
          {section === "profile" && (
            <Panel
              title="Profile"
              description="Your paired Buzz identity on this browser."
            >
              <SettingRow
                label="Display name"
                value={profileLabel(
                  workData?.currentProfile,
                  workData?.userPubkey ?? "",
                )}
              />
              <SettingRow
                label="User pubkey"
                value={credential?.userPubkey ?? "Not paired"}
                mono
              />
            </Panel>
          )}
          {section === "appearance" && (
            <Panel
              title="Appearance"
              description="Choose how Buzz looks on this browser."
            >
              <div className="grid grid-cols-3 gap-3">
                {(["system", "light", "dark"] as const).map((value) => (
                  <button
                    className={`rounded-xl border p-4 text-sm capitalize ${theme === value ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted"}`}
                    key={value}
                    onClick={() => setTheme(value)}
                    type="button"
                  >
                    {value}
                  </button>
                ))}
              </div>
            </Panel>
          )}
          {section === "connection" && (
            <Panel
              title="Connection"
              description="Relay and Mac signer availability."
            >
              <SettingRow
                label="Relay"
                value={
                  relayOnline === undefined
                    ? "Checking…"
                    : relayOnline
                      ? "Connected"
                      : "Unavailable"
                }
                status={relayOnline}
              />
              <SettingRow
                label="Relay address"
                value={relayHttpBaseUrl()}
                mono
              />
              <button
                className="mt-4 rounded-md border px-3 py-2 text-sm hover:bg-muted"
                onClick={() => void checkRelay()}
                type="button"
              >
                Check connection
              </button>
            </Panel>
          )}
          {section === "device" && (
            <Panel
              title="Paired device"
              description="This browser holds only its device key. Your user private key remains on Mac."
            >
              <SettingRow
                label="Mac signer"
                value={credential ? "Paired" : "Not paired"}
                status={Boolean(credential)}
              />
              <SettingRow
                label="Signer pubkey"
                value={credential?.remoteSignerPubkey ?? "—"}
                mono
              />
              {credential ? (
                <button
                  className="mt-6 inline-flex items-center gap-2 rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive hover:bg-destructive/5"
                  onClick={() => void clearPairing()}
                  type="button"
                >
                  <Trash2 className="size-4" />
                  Clear pairing on this browser
                </button>
              ) : (
                <Link
                  className="mt-6 inline-flex rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
                  to="/app/pair"
                >
                  Pair with Mac
                </Link>
              )}
            </Panel>
          )}
          {section === "desktop" && (
            <Panel
              title="Desktop settings"
              description="These settings control software and secrets stored on your Mac."
            >
              <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
                Agent runtimes, model API keys, harnesses, local archive, sleep
                prevention and app updates must be managed in Buzz Desktop. Web
                does not expose fake controls for Mac-local secrets.
              </div>
            </Panel>
          )}
        </div>
      </main>
    </DesktopParityAppShell>
  );
}

function Panel({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card px-4">
        {children}
      </div>
    </section>
  );
}
function SettingRow({
  label,
  mono,
  status,
  value,
}: {
  label: string;
  mono?: boolean;
  status?: boolean;
  value: string;
}) {
  return (
    <div className="flex min-h-14 items-center justify-between gap-5 border-b border-border last:border-0">
      <span className="text-sm font-medium">{label}</span>
      <span
        className={`min-w-0 truncate text-right text-sm text-muted-foreground ${mono ? "font-mono text-xs" : ""}`}
      >
        {status !== undefined && (
          <span
            className={`mr-2 inline-block size-2 rounded-full ${status ? "bg-emerald-500" : "bg-destructive"}`}
          />
        )}
        {value}
      </span>
    </div>
  );
}
