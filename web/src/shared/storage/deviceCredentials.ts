export type StoredRemoteSignerCredential = {
  clientSecretKey: Uint8Array;
  remoteSignerPubkey: string;
  relayUrl: string;
  userPubkey: string;
};

const DATABASE_NAME = "buzz-device-credentials";
const STORE_NAME = "remote-signer";
const ACTIVE_KEY = "active";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveRemoteSignerCredential(
  credential: StoredRemoteSignerCredential,
): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(credential, ACTIVE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

export async function loadRemoteSignerCredential(): Promise<
  StoredRemoteSignerCredential | undefined
> {
  const database = await openDatabase();
  const credential = await new Promise<
    StoredRemoteSignerCredential | undefined
  >((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .get(ACTIVE_KEY);
    request.onsuccess = () =>
      resolve(request.result as StoredRemoteSignerCredential | undefined);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return credential;
}

export async function clearRemoteSignerCredential(): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(ACTIVE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}
