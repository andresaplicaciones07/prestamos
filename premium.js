// ============================================================
//  PREMIUM, PRUEBA GRATIS, PUBLICIDAD Y GOOGLE DRIVE
//  Negocio de Préstamos · se carga ANTES que app.js (ver index.html)
//
//  Contenido:
//    1. Variables de configuración
//    2. Prueba gratis de 4 días (ligada a la cuenta de Google)
//    3. Google Play Billing (compra, restaurar, confirmar)
//    4. Ventana Premium (paywall) y tarjeta del plan
//    5. Publicidad (anuncios.json)
//    6. Google Drive (carpeta oculta de la app)
// ============================================================

// ---------- 1. Variables de configuración ----------
const MODO_PRUEBA = false;   // true = se puede SIMULAR Premium sin pagar (solo para probar). Poner false antes de empaquetar con PWA Builder
const MODO_TIENDA = true;   // true = versión con Premium y publicidad. false = uso personal: todo desbloqueado
const PLAY_SKU = "premium_mensual";                // ID de la suscripción en Play Console
const PLAY_PACKAGE = "com.andresaroca.prestamos";  // igual al Package ID de PWA Builder y de Play Console
const GOOGLE_CLIENT_ID = "1074281877164-2eq8ku7brpqhq70krk3k14eperukr9i7.apps.googleusercontent.com"; // OAuth Web de Google Cloud (proyecto Negocio Prestamos). No es secreto                        // OAuth (Web) de Google Cloud. Vacío = la prueba y Drive funcionan sin Google (modo sencillo)
const APP_VERSION = "1.3";                          // subir en cada actualización: se muestra en "Más"
const DIAS_PRUEBA = 4;
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata"; // carpeta oculta de la app: no ve el resto del Drive
const DRIVE_ARCHIVO = "negocio-prestamos-backup.json";
const DRIVE_PRUEBA = "negocio-prestamos-prueba.json";
const CONTACTO_ANUNCIOS = "andresaplicaciones07@gmail.com"; // correo al que escriben quienes quieren poner publicidad
const PREMIUM_KEY = "negocio-prestamos-premium";
const PRUEBA_KEY = "negocio-prestamos-prueba";
const DRIVE_KEY = "negocio-prestamos-drive";
const urlPlay = PLAY_PACKAGE ? "https://play.google.com/store/apps/details?id=" + PLAY_PACKAGE : "";

function leerJSON(k) { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (e) { return null; } }
function guardarJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }

let premium = (function () { const p = leerJSON(PREMIUM_KEY); return p && p.tienda ? p : null; })();
let prueba = leerJSON(PRUEBA_KEY);   // { inicio: ISO, visto: ms }  (NO viaja en los respaldos)
let premiumUI = null;                // null = ventana cerrada; objeto = abierta { motivo, error, precio, cargando }

// Aviso corto que se ve unos segundos (no depende de render)
function mostrarAviso(texto) {
  const viejo = document.getElementById("aviso-flotante");
  if (viejo) viejo.remove();
  const d = document.createElement("div");
  d.id = "aviso-flotante";
  d.textContent = texto;
  d.style.cssText = "position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:" + C.surface + ";color:" + C.text + ";padding:10px 18px;border-radius:999px;font-size:13px;font-weight:600;z-index:80;box-shadow:0 4px 18px rgba(0,0,0,.35);max-width:90vw;text-align:center;";
  document.body.appendChild(d);
  setTimeout(() => { if (d.parentNode) d.remove(); }, 3500);
}

// ---------- 2. Prueba gratis de 4 días ----------
// Empieza cuando el usuario toca "Activar mi prueba". La fecha de inicio se guarda en una carpeta
// oculta de SU Google Drive: si desinstala y vuelve a instalar, al iniciar sesión recupera los días que le quedaban.
// Si el reloj del celular se atrasa, no se gana tiempo (se recuerda la última fecha vista).
function ahoraMs() {
  let t = Date.now();
  if (prueba && prueba.visto && prueba.visto > t) t = prueba.visto;
  return t;
}
function diasRestantesPrueba() {
  if (!prueba || !prueba.inicio) return 0;
  const ini = Date.parse(prueba.inicio);
  if (isNaN(ini)) return 0;
  return Math.max(0, Math.ceil(DIAS_PRUEBA - (ahoraMs() - ini) / 86400000));
}
function enPrueba() {
  const d = diasRestantesPrueba();
  if (d > 0 && prueba && Date.now() - (prueba.visto || 0) > 600000) { prueba.visto = Date.now(); guardarJSON(PRUEBA_KEY, prueba); }
  return d > 0;
}
function pruebaTerminada() { return !!(prueba && prueba.inicio) && diasRestantesPrueba() === 0; }
function pruebaActivada() { return !!(prueba && prueba.inicio); }
function esPremiumPagado() { return !!premium; }
function esPremium() { return !MODO_TIENDA || !!premium || enPrueba(); }

function errorVisible(msg) {
  if (premiumUI) { premiumUI.error = msg; premiumUI.cargando = false; render(); }
  else mostrarAviso(msg);
}
async function activarPrueba() {
  if (pruebaActivada()) { if (pruebaTerminada()) abrirPremium(""); return; }
  if (premiumUI) { premiumUI.error = ""; premiumUI.cargando = true; render(); }
  try {
    let inicio = new Date().toISOString();
    if (GOOGLE_CLIENT_ID) {
      if (!navigator.onLine) throw new Error("offline");
      const token = await driveToken();
      const previo = await driveLeerJSON(token, DRIVE_PRUEBA);
      if (previo && previo.inicio && !isNaN(Date.parse(previo.inicio))) inicio = previo.inicio;   // reinstalación: sigue la prueba original
      else await driveSubir(token, DRIVE_PRUEBA, JSON.stringify({ inicio: inicio, v: 1 }));
    }
    prueba = { inicio: inicio, visto: Date.now() };
    guardarJSON(PRUEBA_KEY, prueba);
    premiumUI = null;
    render();
    const n = diasRestantesPrueba();
    if (n > 0) mostrarAviso("¡Prueba activada! Te quedan " + n + " día" + (n === 1 ? "" : "s") + " de Premium");
    else { mostrarAviso("Tu prueba de " + DIAS_PRUEBA + " días ya se usó con esta cuenta de Google"); abrirPremium(""); }
  } catch (e) {
    const m = String((e && e.message) || "");
    errorVisible(m === "offline" || m === "sin conexión" ? "Necesitas internet para activar tu prueba." : "No se completó el inicio de sesión con Google. Intenta de nuevo.");
  }
}

// ---------- 3. Google Play Billing (solo funciona en la app instalada desde Google Play) ----------
async function playService() {
  if (!("getDigitalGoodsService" in window)) throw new Error("no-dg");
  return window.getDigitalGoodsService("https://play.google.com/billing");
}
async function playDetalles() {
  const sv = await playService();
  const d = await sv.getDetails([PLAY_SKU]);
  return d && d[0] ? d[0] : null;
}
// Confirma (acknowledge) la suscripción. Si falla, NO impide activar Premium: se reintenta al abrir la app.
async function playConfirmar(sv, token) {
  try { await sv.acknowledge(token, "subscription"); return true; }
  catch (e) { console.warn("acknowledge pendiente", e); return false; }
}
async function playComprar() {
  const sv = await playService();
  const req = new PaymentRequest([{ supportedMethods: "https://play.google.com/billing", data: { sku: PLAY_SKU } }]);
  const resp = await req.show();
  const token = resp.details && resp.details.purchaseToken;
  if (!token) { await resp.complete("fail"); throw new Error("sin-token"); }
  await playConfirmar(sv, token);
  try { await resp.complete("success"); } catch (e) { /* ignore */ }
  return token;
}
async function playComprasActivas() {
  const sv = await playService();
  const l = await sv.listPurchases();
  return (l || []).filter((x) => x.itemId === PLAY_SKU);
}

function abrirPremium(motivo) {
  premiumUI = { motivo: motivo || "", error: "", precio: "", cargando: false };
  render();
  playDetalles().then((d) => {
    if (premiumUI && d && d.price) { premiumUI.precio = d.price.currency + " " + Number(d.price.value).toLocaleString("es-CO"); render(); }
  }).catch(() => {});
}
function cerrarPremium() { premiumUI = null; render(); }
// Si no es Premium abre la ventana de Premium y devuelve false
function exigirPremium(motivo) {
  if (esPremium()) return true;
  abrirPremium(motivo);
  return false;
}
function puedeAgregarCliente() { return true; }   // sin límite de clientes (decisión: el plan gratis no limita clientes)

function activarPremium(token, opciones) {
  const op = opciones || {};
  premium = { tienda: true, sku: PLAY_SKU, token: token, activadoEn: new Date().toISOString(), simulado: !!op.simulado };
  guardarJSON(PREMIUM_KEY, premium);
  premiumUI = null;
  render();
  mostrarAviso(op.silencioso ? "Premium restaurado" : op.simulado ? "Premium simulado (modo prueba)" : "¡Premium activado!");
}
function quitarPremiumLocal() {
  premium = null;
  try { localStorage.removeItem(PREMIUM_KEY); } catch (e) { /* ignore */ }
  render();
}
function simularPremium() { if (MODO_PRUEBA) activarPremium("simulado", { simulado: true }); }
async function suscribirPremium() {
  if (!premiumUI) return;
  premiumUI.error = ""; premiumUI.cargando = true; render();
  try { const token = await playComprar(); activarPremium(token); return; }
  catch (e) {
    if (!(e && e.name === "AbortError") && premiumUI) premiumUI.error = e && e.message === "no-dg" ? "Premium se activa desde la app instalada desde Google Play." : "No se pudo completar la compra. Intenta de nuevo.";
  }
  if (premiumUI) premiumUI.cargando = false;
  render();
}
async function restaurarPremium() {
  if (!premiumUI) return;
  premiumUI.error = ""; premiumUI.cargando = true; render();
  try {
    const l = await playComprasActivas();
    if (l.length) { activarPremium(l[0].purchaseToken, { silencioso: true }); return; }
    if (premiumUI) premiumUI.error = "No encontré una suscripción activa en tu cuenta de Google Play.";
  } catch (e) { if (premiumUI) premiumUI.error = "Para restaurar tu compra abre la app instalada desde Google Play."; }
  if (premiumUI) premiumUI.cargando = false;
  render();
}
// Se ejecuta SOLA al abrir la app (desde Google Play):
//  - si Google Play tiene la suscripción activa y la app no está en Premium -> la activa (reinstalación, otro celular, compra sin activar)
//  - reintenta confirmar (acknowledge) la compra por si falló antes
//  - si la app estaba en Premium y Google ya no tiene suscripción (cancelada/vencida) -> quita Premium
// Sin internet o fuera de Play no toca nada.
async function verificarSuscripcion() {
  if (!MODO_TIENDA) return;
  if (premium && premium.simulado && !MODO_PRUEBA) quitarPremiumLocal();   // restos de una simulación
  if (!("getDigitalGoodsService" in window)) return;
  let lista;
  try { lista = await playComprasActivas(); } catch (e) { return; }
  if (!Array.isArray(lista)) return;
  if (lista.length) {
    try { const sv = await playService(); for (const c of lista) await playConfirmar(sv, c.purchaseToken); } catch (e) { /* ignore */ }
    if (!premium || premium.simulado) activarPremium(lista[0].purchaseToken, { silencioso: true });
  } else if (premium && !premium.simulado) {
    quitarPremiumLocal();
  }
}

// ---------- 4. Ventana Premium (paywall) y tarjeta del plan ----------
const BENEFICIOS_PREMIUM = [
  "Sin publicidad",
  "Exportar todo a Excel",
  "Cobro por WhatsApp con el mensaje ya escrito",
  "Copia de seguridad en Google Drive",
];
function renderPremiumModal() {
  if (!premiumUI) return "";
  const u = premiumUI;
  const nunca = !pruebaActivada();
  const termino = pruebaTerminada();
  return `<div style="position:fixed;inset:0;z-index:70;display:flex;align-items:flex-end;justify-content:center;">
    <div onclick="cerrarPremium()" style="position:absolute;inset:0;background:rgba(0,0,0,.6);"></div>
    <div style="position:relative;max-width:640px;width:100%;max-height:90vh;overflow-y:auto;box-sizing:border-box;background:${C.surface};border-radius:26px 26px 0 0;padding:22px 20px calc(22px + env(safe-area-inset-bottom,0px));">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <span style="display:flex;align-items:center;gap:8px;font-family:${FONT_D};font-size:21px;font-weight:700;color:${C.text};">${ico("corona", 22, C.goldText)} Hazte Premium</span>
        <button onclick="cerrarPremium()" style="background:none;border:none;font-size:26px;line-height:1;color:${C.muted};cursor:pointer;padding:0 4px;">×</button>
      </div>
      ${u.motivo ? `<div style="font-size:13px;font-weight:700;color:${C.red};margin-bottom:10px;">“${esc(u.motivo)}” es una función Premium.</div>` : ""}
      ${termino ? `<div style="font-size:13px;color:${C.muted};margin-bottom:8px;">Tu prueba de ${DIAS_PRUEBA} días terminó. Sigue con todo Premium cuando quieras.</div>` : ""}
      <div style="display:flex;flex-direction:column;gap:9px;margin:12px 0 16px;">
        ${BENEFICIOS_PREMIUM.map((b) => `<div style="display:flex;align-items:center;gap:10px;font-size:14px;color:${C.text};">${ico("check", 18, C.green)}<span>${esc(b)}</span></div>`).join("")}
      </div>
      ${nunca ? `<button ${u.cargando ? "disabled" : ""} onclick="activarPrueba()" style="width:100%;background:${C.gold};color:${C.bg};border:none;border-radius:999px;padding:14px;font-weight:700;font-size:15px;font-family:inherit;cursor:pointer;margin-bottom:6px;${u.cargando ? "opacity:.5;" : ""}">${u.cargando ? "Un momento…" : "Activar mis " + DIAS_PRUEBA + " días gratis"}</button>
      <div style="font-size:11.5px;color:${C.muted};text-align:center;margin-bottom:14px;">Sin tarjeta.${GOOGLE_CLIENT_ID ? " Inicias sesión con Google solo para recordar tu prueba si reinstalas la app." : ""}</div>` : ""}
      <div style="font-size:14px;font-weight:700;color:${C.goldText};margin-bottom:12px;">${u.precio ? esc(u.precio) + " por mes" : "$40.000 COP por mes"}</div>
      <button ${u.cargando ? "disabled" : ""} onclick="suscribirPremium()" style="width:100%;background:#01875F;color:#fff;border:none;border-radius:999px;padding:14px;font-weight:700;font-size:15px;font-family:inherit;cursor:pointer;margin-bottom:10px;${u.cargando ? "opacity:.5;" : ""}">${u.cargando ? "Un momento…" : "Suscribirme con Google Play"}</button>
      <button ${u.cargando ? "disabled" : ""} onclick="restaurarPremium()" style="width:100%;background:none;border:none;color:${C.muted};text-decoration:underline;font-size:13px;font-family:inherit;cursor:pointer;margin-bottom:8px;">Ya pagué: restaurar mi compra</button>
      ${MODO_PRUEBA ? `<button onclick="simularPremium()" style="width:100%;background:${C.surface2};border:1.5px dashed ${C.border};color:${C.muted};border-radius:999px;padding:10px;font-size:12.5px;font-family:inherit;cursor:pointer;margin-bottom:8px;">Simular Premium (solo para pruebas)</button>` : ""}
      ${u.error ? `<div style="font-size:12.5px;color:${C.red};margin-bottom:8px;">${esc(u.error)}</div>` : ""}
      ${u.error && urlPlay ? `<a href="${urlPlay}" target="_blank" rel="noopener noreferrer" style="font-size:13px;font-weight:700;color:${C.red};">Abrir la app en Google Play</a>` : ""}
      <div style="font-size:11.5px;color:${C.muted};margin-top:6px;">El pago y la cancelación se manejan desde tu cuenta de Google Play.</div>
    </div>
  </div>`;
}

// Tarjeta del plan (pestaña "Más")
function renderPlanCard() {
  if (!MODO_TIENDA) return "";
  if (esPremiumPagado()) {
    return card(`<div style="display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700;color:${C.green};margin-bottom:4px;">${ico("corona", 18, C.green)} Premium activo${premium.simulado ? " (modo prueba)" : ""}</div>
      <div style="font-size:12.5px;color:${C.muted};margin-bottom:10px;">Sin publicidad y con todas las funciones.</div>
      <a href="https://play.google.com/store/account/subscriptions" target="_blank" rel="noopener noreferrer" style="font-size:12.5px;color:${C.muted};">Administrar mi suscripción en Google Play</a>`,
      `margin-bottom:16px;background:${C.greenSoft};border-color:${C.green};`);
  }
  if (enPrueba()) {
    const n = diasRestantesPrueba();
    return card(`<div style="display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700;color:${C.green};margin-bottom:4px;">${ico("corona", 18, C.green)} Prueba Premium</div>
      <div style="font-size:12.5px;color:${C.muted};margin-bottom:12px;">Te quedan <b>${n} día${n === 1 ? "" : "s"}</b> con todas las funciones y sin publicidad.</div>
      <button onclick="abrirPremium('')" style="width:100%;background:${C.gold};color:${C.bg};border:none;border-radius:999px;padding:12px;font-weight:700;font-size:14px;font-family:inherit;cursor:pointer;">Suscribirme ahora</button>`,
      `margin-bottom:16px;background:${C.greenSoft};border-color:${C.green};`);
  }
  const nunca = !pruebaActivada();
  return card(`<div style="font-size:15px;font-weight:700;margin-bottom:4px;">${nunca ? "Prueba Premium gratis" : "Plan gratis"}</div>
    <div style="font-size:12.5px;color:${C.muted};margin-bottom:12px;">${nunca ? "Prueba " + DIAS_PRUEBA + " días con todo Premium, sin tarjeta." : "Tu prueba terminó."} Con Premium: sin publicidad, Excel, cobro por WhatsApp y copia en Drive.</div>
    <button onclick="${nunca ? "activarPrueba()" : "abrirPremium('')"}" style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;background:${C.gold};color:${C.bg};border:none;border-radius:999px;padding:12px;font-weight:700;font-size:14px;font-family:inherit;cursor:pointer;">${ico("corona", 18)} ${nunca ? "Activar mis " + DIAS_PRUEBA + " días gratis" : "Ver Premium"}</button>`,
    "margin-bottom:16px;");
}
// Botón de función Premium: lleva una coronita mientras no seas Premium
function premiumBtn(label, onclick) {
  return `<button onclick="${onclick}" style="background:${C.greenSoft};color:${C.green};border:none;border-radius:999px;padding:11px 20px;font-weight:700;font-size:14px;font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:7px;">${esPremium() ? "" : ico("corona", 16)}${esc(label)}</button>`;
}

// ---------- 5. Publicidad (se quita con Premium) ----------
// Los anuncios se leen de anuncios.json: lo editas en GitHub sin tocar el código.
let anuncios = [];
let anuncioI = 0;
let anuncioTimer = null;
function enlaceSeguro(u) { return /^(https?:\/\/|mailto:)/i.test(String(u || "")) ? String(u) : ""; }
function anuncioActual() {
  if (anuncios.length) return anuncios[anuncioI % anuncios.length];
  return { titulo: "Tu publicidad aquí", texto: "Anuncia tu negocio a todos los que usan esta app. Escríbenos.", enlace: "mailto:" + CONTACTO_ANUNCIOS + "?subject=" + encodeURIComponent("Quiero poner publicidad en la app") };
}
function adInterior() {
  const a = anuncioActual();
  const href = enlaceSeguro(a.enlace);
  const img = a.imagen && (enlaceSeguro(a.imagen) || /^[\w./-]+$/.test(a.imagen)) ? a.imagen : "";
  return `${img ? `<img src="${esc(img)}" alt="" style="width:52px;height:52px;object-fit:cover;border-radius:12px;flex-shrink:0;" />` : ""}
    <a ${href ? `href="${esc(href)}" target="_blank" rel="noopener noreferrer"` : ""} style="flex:1;min-width:0;text-decoration:none;color:${C.text};">
      <div style="font-size:10.5px;font-weight:700;color:${C.muted};">Publicidad</div>
      <div style="font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(a.titulo)}</div>
      ${a.texto ? `<div style="font-size:12px;color:${C.muted};line-height:1.3;">${esc(a.texto)}</div>` : ""}
    </a>
    <button onclick="abrirPremium('Quitar la publicidad')" style="flex-shrink:0;display:flex;align-items:center;gap:5px;background:${C.bg};color:#F2A93B;border:none;border-radius:999px;padding:8px 12px;font-weight:700;font-size:12px;font-family:inherit;cursor:pointer;">${ico("corona", 14)} Quitar</button>`;
}
// Arriba de cada pantalla: durante la prueba, un aviso breve; sin Premium, el anuncio; con Premium, nada.
function renderAdBanner() {
  if (!MODO_TIENDA || esPremiumPagado()) return "";
  if (enPrueba()) {
    const n = diasRestantesPrueba();
    return `<div style="background:${C.greenSoft};border-radius:14px;padding:8px 12px;margin-bottom:12px;display:flex;align-items:center;gap:8px;font-size:12.5px;color:${C.green};font-weight:600;">
      ${ico("corona", 16, C.green)}<span style="flex:1;">Prueba Premium: te quedan ${n} día${n === 1 ? "" : "s"}</span>
      <button onclick="abrirPremium('')" style="background:none;border:none;color:${C.green};text-decoration:underline;font-weight:700;font-size:12.5px;font-family:inherit;cursor:pointer;">Suscribirme</button>
    </div>`;
  }
  return `<div id="ad-banner" style="background:${C.surface2};border:1.5px dashed #C9C4A8;border-radius:18px;padding:10px 12px;margin-bottom:14px;display:flex;align-items:center;gap:12px;">${adInterior()}</div>`;
}
function pintarAnuncio() {
  const el = document.getElementById("ad-banner");
  if (el) el.innerHTML = adInterior();
}
function cargarAnuncios() {
  fetch("./anuncios.json?t=" + Date.now(), { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : { anuncios: [] }))
    .then((d) => { if (d && Array.isArray(d.anuncios)) { anuncios = d.anuncios.filter((a) => a && a.titulo); anuncioI = 0; pintarAnuncio(); } })
    .catch(() => {});
  if (!anuncioTimer) anuncioTimer = setInterval(() => { if (anuncios.length > 1) { anuncioI++; pintarAnuncio(); } }, 8000);
}

// ---------- 6. Google Drive (carpeta oculta de la app: permiso drive.appdata) ----------
let _dtok = null;
function driveConectado() { try { return localStorage.getItem(DRIVE_KEY) === "1"; } catch (e) { return false; } }
function cargarGIS() {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) { resolve(); return; }
    const sc = document.createElement("script");
    sc.src = "https://accounts.google.com/gsi/client"; sc.async = true;
    sc.onload = () => resolve(); sc.onerror = () => reject(new Error("sin conexión"));
    document.head.appendChild(sc);
  });
}
async function driveToken(prompt) {
  if (_dtok && _dtok.exp > Date.now() + 60000 && !prompt) return _dtok.t;
  await cargarGIS();
  return new Promise((resolve, reject) => {
    const tc = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: DRIVE_SCOPE,
      callback: (r) => {
        if (r && r.access_token) { _dtok = { t: r.access_token, exp: Date.now() + (Number(r.expires_in) || 3600) * 1000 }; resolve(r.access_token); }
        else reject(new Error((r && r.error) || "sin permiso"));
      },
      error_callback: (e) => reject(new Error((e && e.type) || "cancelado")),
    });
    tc.requestAccessToken({ prompt: prompt || "" });
  });
}
async function driveBuscar(token, nombre) {
  const q = encodeURIComponent("name='" + nombre + "' and trashed=false");
  const r = await fetch("https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=" + q + "&fields=files(id,name,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=1", { headers: { Authorization: "Bearer " + token } });
  if (!r.ok) throw new Error("drive " + r.status);
  const d = await r.json();
  return (d.files || [])[0] || null;
}
async function driveSubir(token, nombre, contenido) {
  const ex = await driveBuscar(token, nombre);
  const limite = "nc" + uid() + uid();
  const meta = ex ? {} : { name: nombre, mimeType: "application/json", parents: ["appDataFolder"] };
  const cuerpo = "--" + limite + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(meta) + "\r\n--" + limite + "\r\nContent-Type: application/json\r\n\r\n" + contenido + "\r\n--" + limite + "--";
  const url = ex ? "https://www.googleapis.com/upload/drive/v3/files/" + ex.id + "?uploadType=multipart" : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
  const r = await fetch(url, { method: ex ? "PATCH" : "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "multipart/related; boundary=" + limite }, body: cuerpo });
  if (!r.ok) throw new Error("drive " + r.status);
}
async function driveBajar(token, nombre) {
  const ex = await driveBuscar(token, nombre);
  if (!ex) return null;
  const r = await fetch("https://www.googleapis.com/drive/v3/files/" + ex.id + "?alt=media", { headers: { Authorization: "Bearer " + token } });
  if (!r.ok) throw new Error("drive " + r.status);
  return r.text();
}
async function driveLeerJSON(token, nombre) {
  const txt = await driveBajar(token, nombre);
  if (!txt) return null;
  try { return JSON.parse(txt); } catch (e) { return null; }
}
function marcarRespaldoHecho(esDrive) {
  state.meta = state.meta || {};
  state.meta.lastExportISO = hoyISO();
  if (esDrive) state.meta.lastDriveISO = new Date().toISOString();
  save(); render();
}
// Sin GOOGLE_CLIENT_ID: abre el menú de compartir del celular para elegir Drive (o descarga el archivo)
async function compartirRespaldo() {
  const nombre = "negocio-prestamos-backup-" + hoyISO() + ".json";
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  let file = null;
  try { file = new File([blob], nombre, { type: "application/json" }); } catch (e) { file = null; }
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Respaldo Negocio de préstamos" }); marcarRespaldoHecho(false); mostrarAviso("Respaldo enviado"); } catch (e) { /* canceló */ }
    return;
  }
  exportData();
}
function avisoSinInternet() { mostrarAviso("Sin internet. Tus datos siguen guardados en el celular."); }

// Las cuatro funciones de Drive
async function conectarDrive() {
  if (!exigirPremium("Copia en Google Drive")) return;
  if (!GOOGLE_CLIENT_ID) { mostrarAviso("Drive aún no está configurado"); return; }
  if (!navigator.onLine) { avisoSinInternet(); return; }
  try {
    await driveToken("select_account");
    try { localStorage.setItem(DRIVE_KEY, "1"); } catch (e) { /* ignore */ }
    render();
    mostrarAviso("Google Drive conectado");
  } catch (e) { mostrarAviso("No se pudo conectar con Google Drive"); }
}
async function subirRespaldoDrive() {
  if (!exigirPremium("Copia en Google Drive")) return;
  if (!GOOGLE_CLIENT_ID) { mostrarAviso("Elige Google Drive en el menú"); await compartirRespaldo(); return; }
  if (!navigator.onLine) { avisoSinInternet(); return; }
  try {
    mostrarAviso("Guardando en Google Drive…");
    const token = await driveToken();
    state.meta = state.meta || {};
    state.meta.lastDriveISO = new Date().toISOString();
    state.meta.lastExportISO = hoyISO();   // va dentro de la copia, así al restaurar no se pierde "Última copia"
    await driveSubir(token, DRIVE_ARCHIVO, JSON.stringify(state));
    try { localStorage.setItem(DRIVE_KEY, "1"); } catch (e) { /* ignore */ }
    marcarRespaldoHecho(true);
    mostrarAviso("Copia guardada en Google Drive");
  } catch (e) { console.error(e); mostrarAviso("No se pudo guardar en Drive. Revisa tu internet."); }
}
async function restaurarDesdeDrive() {
  if (!exigirPremium("Copia en Google Drive")) return;
  if (!GOOGLE_CLIENT_ID) { mostrarAviso("Usa «Restaurar desde archivo» y elige el archivo desde tu Drive"); triggerImport(); return; }
  if (!navigator.onLine) { avisoSinInternet(); return; }
  if (!confirm("Esto reemplaza los datos de este celular con la última copia de Google Drive. ¿Seguir?")) return;
  try {
    const token = await driveToken();
    const txt = await driveBajar(token, DRIVE_ARCHIVO);
    if (!txt) { mostrarAviso("No encontré ninguna copia en tu Drive"); return; }
    const parsed = JSON.parse(txt);
    if (!parsed || !Array.isArray(parsed.clientes)) { mostrarAviso("La copia de Drive no es válida"); return; }
    if (!Array.isArray(parsed.movimientos)) parsed.movimientos = [];
    if (!Array.isArray(parsed.cierres)) parsed.cierres = [];
    if (!parsed.meta || typeof parsed.meta !== "object") parsed.meta = {};
    state = parsed;
    ui.selectedCliente = state.clientes.length ? state.clientes[0].id : null;
    save(); render();
    mostrarAviso("Datos restaurados desde Drive");
  } catch (e) { console.error(e); mostrarAviso("No se pudo leer la copia de Drive"); }
}
async function desconectarDrive() {
  try {
    if (_dtok && window.google && window.google.accounts && window.google.accounts.oauth2) window.google.accounts.oauth2.revoke(_dtok.t, () => {});
  } catch (e) { /* ignore */ }
  _dtok = null;
  try { localStorage.removeItem(DRIVE_KEY); } catch (e) { /* ignore */ }
  render();
  mostrarAviso("Google Drive desconectado");
}
