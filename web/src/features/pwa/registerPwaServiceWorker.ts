export function registerPwaServiceWorker(): void {
  if (import.meta.env.DEV || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch((error: unknown) => {
      console.warn("Buzz PWA service worker registration failed", error);
    });
  });
}
