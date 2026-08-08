import { Link } from "@tanstack/react-router";
import { Check, Link2, LoaderCircle, ShieldCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Nip46Client, parseBunkerUri } from "../../shared/api/nip46Client";
import { saveRemoteSignerCredential } from "../../shared/storage/deviceCredentials";
import { resetPairedSignerSession } from "../../shared/api/signer";
import { WebPairingSession } from "./pairingSession";
import type { PairingViewState, RemoteSignerConnection } from "./types";

const INITIAL_STATE: PairingViewState = { status: "idle" };

export function PairPage() {
  const [pairingLink, setPairingLink] = useState("");
  const [state, setState] = useState<PairingViewState>(INITIAL_STATE);
  const [connection, setConnection] = useState<RemoteSignerConnection>();
  const sessionRef = useRef<WebPairingSession | undefined>(undefined);

  useEffect(() => {
    const session = new WebPairingSession(setState, (pairedConnection) => {
      setState({ status: "transferring" });
      void activateRemoteSigner(pairedConnection)
        .then((verifiedConnection) => {
          setConnection(verifiedConnection);
          setState({ status: "success" });
        })
        .catch((error: unknown) => {
          setState({
            status: "error",
            errorMessage:
              error instanceof Error
                ? error.message
                : "Could not activate the Desktop signer.",
          });
        });
    });
    sessionRef.current = session;
    return () => session.close();
  }, []);

  const isBusy =
    state.status === "connecting" ||
    state.status === "reconnecting" ||
    state.status === "transferring";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center border-b border-border/60 px-4">
        <h1 className="text-sm font-semibold">Pair with Mac</h1>
      </header>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-6">
        <section className="w-full max-w-md rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
          <div className="mb-5 flex size-10 items-center justify-center rounded-xl bg-sidebar-active text-sidebar-active-foreground">
            <ShieldCheck aria-hidden="true" className="size-5" />
          </div>

          {state.status === "success" ? (
            <SuccessState connection={connection} />
          ) : state.status === "reconnecting" ? (
            <div role="status">
              <LoaderCircle className="mb-4 size-6 animate-spin" />
              <h2 className="text-base font-semibold">Restoring connection</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Keep this page and Buzz Desktop open. The same pairing session
                and security code will resume automatically.
              </p>
            </div>
          ) : state.status === "confirming-sas" ? (
            <SasState
              errorMessage={state.errorMessage}
              onConfirm={() => sessionRef.current?.confirmSas()}
              onDeny={() => sessionRef.current?.denySas()}
              sasCode={state.sasCode ?? "------"}
            />
          ) : (
            <>
              <h2 className="text-base font-semibold">Connect this browser</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                On Buzz Desktop, open Settings → Pair Device, then paste the
                pairing link here. Your user private key never enters the
                browser. Each pairing link is valid for 10 minutes and can only
                be used once.
              </p>
              <label
                className="mt-5 block text-xs font-medium"
                htmlFor="pairing-link"
              >
                Desktop pairing link
              </label>
              <textarea
                autoCapitalize="none"
                autoCorrect="off"
                className="mt-2 min-h-24 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/20"
                disabled={isBusy}
                id="pairing-link"
                onChange={(event) => setPairingLink(event.target.value)}
                placeholder="nostrpair://…"
                spellCheck={false}
                value={pairingLink}
              />
              {state.errorMessage ? (
                <p className="mt-2 text-xs text-destructive" role="alert">
                  {state.errorMessage}
                </p>
              ) : null}
              <button
                className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isBusy || pairingLink.trim().length === 0}
                onClick={() => sessionRef.current?.connect(pairingLink)}
                type="button"
              >
                {isBusy ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin"
                  />
                ) : (
                  <Link2 aria-hidden="true" className="size-4" />
                )}
                {isBusy ? "Connecting…" : "Start pairing"}
              </button>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

async function activateRemoteSigner(
  connection: RemoteSignerConnection,
): Promise<RemoteSignerConnection> {
  if (connection.type !== "bunker") {
    throw new Error(
      "This Web build requires a bunker connection from Desktop.",
    );
  }
  const bunker = parseBunkerUri(connection.uri, connection.clientSecretKey);
  const client = new Nip46Client(bunker);
  try {
    const userPubkey = await client.connect();
    if (!/^[0-9a-f]{64}$/.test(userPubkey)) {
      throw new Error("Desktop returned an invalid user identity.");
    }
    await saveRemoteSignerCredential({
      clientSecretKey: connection.clientSecretKey,
      remoteSignerPubkey: bunker.remoteSignerPubkey,
      relayUrl: bunker.relayUrl,
      userPubkey,
    });
    resetPairedSignerSession();
    return connection;
  } finally {
    client.close();
  }
}

function SasState({
  errorMessage,
  onConfirm,
  onDeny,
  sasCode,
}: {
  errorMessage?: string;
  onConfirm: () => void;
  onDeny: () => void;
  sasCode: string;
}) {
  return (
    <>
      <h2 className="text-base font-semibold">Do these codes match?</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        Compare this code with Buzz Desktop before approving the device.
      </p>
      <div className="my-6 rounded-xl bg-muted px-4 py-5 text-center font-mono text-3xl font-semibold tracking-[0.28em]">
        {sasCode}
      </div>
      {errorMessage ? (
        <p className="mb-3 text-xs text-destructive" role="alert">
          {errorMessage}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <button
          className="flex h-9 items-center justify-center gap-2 rounded-lg border border-border text-sm font-medium hover:bg-accent"
          onClick={onDeny}
          type="button"
        >
          <X aria-hidden="true" className="size-4" /> Codes differ
        </button>
        <button
          className="flex h-9 items-center justify-center gap-2 rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
          onClick={onConfirm}
          type="button"
        >
          <Check aria-hidden="true" className="size-4" /> Codes match
        </button>
      </div>
    </>
  );
}

function SuccessState({ connection }: { connection?: RemoteSignerConnection }) {
  return (
    <>
      <h2 className="text-base font-semibold">Mac paired</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        The remote signer connection is active for this browser session
        {connection ? ` (${connection.type})` : ""}.
      </p>
      <Link
        className="mt-5 flex h-9 w-full items-center justify-center rounded-lg bg-primary text-sm font-medium text-primary-foreground"
        to="/app/channels"
      >
        Open Channels
      </Link>
    </>
  );
}
