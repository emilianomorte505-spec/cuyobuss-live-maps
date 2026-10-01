/* Cuyobuss · guardián sin internet.
   Guarda cada parada visitada y sus recursos; sin señal muestra la última versión guardada. */
const CACHE = "cuyobuss-v1";
const PRECACHE = ["/", "/favicon.ico"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .catch(() => {}),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  const mismaWeb = url.origin === self.location.origin;
  const esFuente = url.hostname.endsWith("fonts.googleapis.com") || url.hostname.endsWith("fonts.gstatic.com");
  if (!mismaWeb && !esFuente) return;

  const acepta = req.headers.get("accept") || "";
  const esNavegacion = req.mode === "navigate" || acepta.includes("text/html");

  if (esNavegacion) {
    // Red primero: siempre horarios frescos con señal; sin señal, la última parada guardada.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && mismaWeb) {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/"))),
    );
    return;
  }

  // Recursos (pantalla, estilos, letras): primero lo guardado, sino la red.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok) {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
          }
          return res;
        }),
    ),
  );
});
