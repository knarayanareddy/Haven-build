const CACHE_NAME = "haven-elder-pwa-cache-v1";
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
  let data = { title: "HAVEN Veiligheidsmelding", body: "Er is een nieuwe haptic melding in uw zorgnetwerk." };
  try {
    if (event.data) data = event.data.json();
  } catch {
    // raw text
  }

  event.waitUntil(
    self.registration.showNotification(data.title ?? "HAVEN Noodmelding", {
      body: data.body ?? "Een familielid of zorgverlener vraagt om uw aandacht.",
      icon: "./assets/icon.png",
      data: data.data ?? {},
    })
  );
});
