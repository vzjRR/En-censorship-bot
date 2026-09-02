// Minimal service worker — its only job is to be present with a fetch
// handler, which is what browsers require before they'll offer "Install
// App" / "Add to Home Screen" for this page. No caching is done here: the
// dashboard always needs live data, so we deliberately just pass requests
// through to the network.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
