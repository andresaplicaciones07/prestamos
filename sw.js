// ============================================================
//  SERVICE WORKER — Negocio de Préstamos
//  Regla de oro: si cambias app.js u otro archivo, sube también
//  el número de CACHE_NAME (prestamos-v2, v3...).
// ============================================================
const CACHE_NAME = "prestamos-v2";

// Archivos propios (se guardan uno por uno: si falta alguno, los demás se guardan igual)
const APP_SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.json",
  "./privacidad.html",
  "./anuncios.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-512-maskable.png",
  "./apple-touch-icon.png"
];

// Librerías externas (direcciones EXACTAS iguales a las del index.html)
const EXTERNAS = [
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap"
];

// Guarda las hojas de estilo externas y también los archivos de letras que mencionan
async function guardarExterna(cache, url) {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res || !res.ok) return;
    await cache.put(url, res.clone());
    if (url.indexOf("fonts.googleapis.com") !== -1) {
      const css = await res.text();
      const fuentes = [...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]);
      await Promise.allSettled(fuentes.map((f) => cache.add(f)));
    }
  } catch (e) { /* sin internet: se guardará en otra ocasión */ }
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(APP_SHELL.map((u) => cache.add(u)));
    await Promise.allSettled(EXTERNAS.map((u) => guardarExterna(cache, u)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const claves = await caches.keys();
    // Solo borra cachés VIEJAS de esta app (prestamos-...), nunca las de otras apps del mismo usuario
    await Promise.all(claves.filter((k) => k.startsWith("prestamos-") && k !== CACHE_NAME).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Inicio de sesión y Drive de Google: nunca se tocan
  if (url.hostname === "accounts.google.com" || url.hostname === "www.googleapis.com" || url.hostname === "apis.google.com") return;

  // 1) Abrir la app: siempre el index.html guardado (aunque la URL traiga ?tienda=1 u otro parámetro)
  if (req.mode === "navigate" && !url.pathname.endsWith("privacidad.html")) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const guardado = (await cache.match("./index.html")) || (await cache.match("./"));
      const actualizar = fetch("./index.html")
        .then((r) => { if (r && r.ok) cache.put("./index.html", r.clone()); return r; })
        .catch(() => null);
      if (guardado) { event.waitUntil(actualizar); return guardado; }
      return (await actualizar) || new Response("Sin conexión", { status: 503 });
    })());
    return;
  }

  // 2) Anuncios: internet primero (para ver los cambios al instante), con respaldo en caché
  if (url.origin === self.location.origin && url.pathname.endsWith("/anuncios.json")) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const r = await fetch(req);
        if (r && r.ok) cache.put("./anuncios.json", r.clone());
        return r;
      } catch (e) {
        return (await cache.match("./anuncios.json")) || new Response('{"anuncios":[]}', { headers: { "Content-Type": "application/json" } });
      }
    })());
    return;
  }

  // 3) Todo lo demás (archivos propios y letras): Stale-While-Revalidate
  const propio = url.origin === self.location.origin;
  const letras = url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com";
  if (!propio && !letras) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const guardado = await cache.match(req, { ignoreSearch: propio });
    const red = fetch(req)
      .then((r) => { if (r && (r.ok || r.type === "opaque")) cache.put(req, r.clone()); return r; })
      .catch(() => null);
    if (guardado) { event.waitUntil(red); return guardado; }
    return (await red) || new Response("", { status: 504 });
  })());
});
