const CACHE_NAME = "haven-carer-pwa-cache-v1";
const urlsToCache = [
  "/",
  "/index.html",
  "/manifest.json",
  "./assets/icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache)).catch(() => undefined)
  );
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).catch(() => caches.match("/index.html"));
    })
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "HAVEN WACHT", body: "Nieuwe haptic melding voor de wijkverpleging." };
  try {
    if (event.data) data = event.data.json();
  } catch {
    // raw text
  }

  event.waitUntil(
    self.registration.showNotification(data.title ?? "HAVEN WACHT", {
      body: data.body ?? "Inspecteer de overdracht voor nieuwe acties.",
      icon: "./assets/icon.png",
      data: data.data ?? {},
    })
  );
});
