/* Service worker di Sleep Tracker: lettura offline (solo lettura, nessuna coda di scrittura).
 *
 * - /_next/static/*: cache-first (i file hanno l'impronta nel nome, non cambiano mai).
 * - Pagine (navigazioni) e dati RSC delle sezioni: rete per prima; se manca la rete (o è lentissima) si usa
 *   l'ultima copia salvata su questo dispositivo.
 * - Si salvano solo risposte 200 dirette: mai redirect (es. verso /login), mai /api, mai /login.
 * - Il messaggio {type:'warm'} scarica in anticipo le sezioni; {type:'clear'} cancella tutto (al logout).
 * Le chiamate non-GET (Server Actions, /api/events) non passano mai di qui. */

const VERSION = 'v1';
const PAGES = `st-pages-${VERSION}`;
const STATIC = `st-static-${VERSION}`;
const NETWORK_TIMEOUT_MS = 5000;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PAGES, STATIC]);
      for (const key of await caches.keys()) {
        if (key.startsWith('st-') && !keep.has(key)) await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});

function cacheable(response) {
  return response.status === 200 && response.type === 'basic' && !response.redirected;
}

function skip(url) {
  return url.pathname.startsWith('/api/') || url.pathname === '/login' || url.pathname.startsWith('/login/') || url.pathname === '/sw.js';
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (cacheable(response)) await cache.put(request, response.clone());
  return response;
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const OFFLINE_HTML = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Sleep Tracker</title><style>:root{color-scheme:light dark}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:1.5rem;font:1rem/1.5 system-ui,sans-serif;background:#eef2f6;color:#27303b}@media(prefers-color-scheme:dark){body{background:#161a22;color:#e8ecf3}}main{max-width:26rem}h1{font-size:1.25rem;margin:0 0 .5rem}a{color:inherit}</style></head><body><main><h1>Sei offline</h1><p>Questa sezione non è ancora stata salvata su questo dispositivo. Aprila una volta con la connessione attiva e dopo sarà disponibile anche offline.</p><p><a href="/">Torna alla Notte</a></p></main></body></html>`;

async function networkFirst(request, isNavigation) {
  const cache = await caches.open(PAGES);
  try {
    const response = await withTimeout(fetch(request), NETWORK_TIMEOUT_MS);
    if (cacheable(response)) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const hit = await cache.match(request, { ignoreVary: true });
    if (hit) return hit;
    if (isNavigation) {
      return new Response(OFFLINE_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || skip(url)) return;

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.pathname.startsWith('/_next/')) return;

  const isNavigation = request.mode === 'navigate';
  const isFlight = request.headers.get('RSC') === '1';
  if (isNavigation || isFlight) {
    event.respondWith(networkFirst(request, isNavigation));
  }
});

/* Indirizzi /_next/static/... citati in un testo (HTML con i tag script/link e i dati RSC, oppure CSS con url(...)). */
function staticUrls(text, baseUrl) {
  const found = new Set();
  for (const match of text.matchAll(/\/_next\/static\/[^"'\s)\\<>]+/g)) found.add(match[0]);
  for (const match of text.matchAll(/url\(\s*["']?(?!data:)([^"')\s]+)/g)) {
    try {
      const url = new URL(match[1], baseUrl);
      if (url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) found.add(url.pathname + url.search);
    } catch {
      // url non valido: si ignora
    }
  }
  return [...found];
}

/* Salva in anticipo i file statici di una pagina: la prima visita avviene prima che il service worker controlli la
 * pagina, quindi quei file non sono passati dal gestore fetch e offline mancherebbero. */
async function cacheStatic(urls, depth) {
  const cache = await caches.open(STATIC);
  for (const path of urls) {
    try {
      const request = new Request(path, { credentials: 'same-origin' });
      let response = await cache.match(request);
      if (!response) {
        response = await fetch(request);
        if (!cacheable(response)) continue;
        await cache.put(request, response.clone());
      }
      if (depth > 0 && path.split('?')[0].endsWith('.css')) {
        await cacheStatic(staticUrls(await response.clone().text(), new URL(path, self.location.origin)), depth - 1);
      }
    } catch {
      // Offline o file mancante: si riprova al prossimo avvio.
    }
  }
}

async function warm(urls) {
  const cache = await caches.open(PAGES);
  let saved = 0;
  for (const path of urls) {
    try {
      const request = new Request(path, { credentials: 'same-origin' });
      const response = await fetch(request);
      if (cacheable(response)) {
        const html = await response.clone().text();
        await cache.put(request, response);
        await cacheStatic(staticUrls(html, new URL(path, self.location.origin)), 1);
        saved += 1;
      }
    } catch {
      // Offline o errore: si riprova al prossimo avvio.
    }
  }
  return saved;
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data.type !== 'string') return;
  if (data.type === 'clear') {
    event.waitUntil(
      (async () => {
        for (const key of await caches.keys()) {
          if (key.startsWith('st-')) await caches.delete(key);
        }
      })(),
    );
  } else if (data.type === 'warm' && Array.isArray(data.urls)) {
    const urls = data.urls.filter((u) => typeof u === 'string' && u.startsWith('/') && !u.startsWith('//'));
    event.waitUntil(
      warm(urls).then((saved) => {
        if (event.source) event.source.postMessage({ type: 'warmed', saved, total: urls.length });
      }),
    );
  }
});
