export type PairingStatus =
  | "idle"
  | "connecting"
  | "confirming-sas"
  | "transferring"
  | "success"
  | "error";

export type PairingViewState = {
  status: PairingStatus;
  sasCode?: string;
  errorMessage?: string;
};

export type PairingQrPayload = {
  sourcePubkey: string;
  sessionSecret: Uint8Array;
  relay: string;
};

export type RemoteSignerConnection = {
  type: "bunker" | "connect";
  uri: string;
};

export type PairingMessage =
  | { type: "sas-confirm"; transcript_hash: string }
  | { type: "payload"; payload_type: string; payload: string }
  | { type: "abort"; reason: string };
