// ============================================================
//  NEGOCIO DE PRÉSTAMOS — lógica de la app (sin frameworks)
//  Guía rápida del archivo:
//    1. DATOS DE EJEMPLO (SEED)  -> solo para el modo demo (?demo=1)
//    2. UTILIDADES               -> formateo de moneda/fechas, etc.
//    3. ESTADO Y PERSISTENCIA    -> guardar/cargar en localStorage
//    4. CÁLCULOS                 -> totales de cada cliente
//    5. ACCIONES                 -> lo que pasa al tocar botones
//    6. EXPORTAR / IMPORTAR      -> respaldo en archivo .json
//    7. RENDERIZADO              -> arma el HTML de cada pantalla
//    8. ARRANQUE                 -> carga datos y dibuja la app
//    9. PREMIUM, PUBLICIDAD Y DRIVE
//  Modo demo: abrir con ?demo=1 usa un almacenamiento aparte con
//  datos de ejemplo inventados (no toca los datos reales).
// ============================================================

// ---------- 1. Datos de ejemplo (solo modo demo) ----------
const STORAGE_KEY = "negocio-prestamos-data";
const DEMO_KEY = "negocio-prestamos-demo";
const MODO_DEMO = (function () {
  try { return new URLSearchParams(location.search).get("demo") === "1"; } catch (e) { return false; }
})();
const CLAVE_ACTIVA = MODO_DEMO ? DEMO_KEY : STORAGE_KEY;

// Fecha ISO del día "dia" de hace "mesesAtras" meses (si el mes es corto usa su último día)
function isoDia(mesesAtras, dia) {
  const h = new Date();
  const base = new Date(h.getFullYear(), h.getMonth() - mesesAtras, 1);
  const ult = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
  return base.getFullYear() + "-" + String(base.getMonth() + 1).padStart(2, "0") + "-" + String(Math.min(dia, ult)).padStart(2, "0");
}

// Datos 100 % inventados, con fechas relativas a hoy para que el demo siempre se vea actual.
function crearSeed() {
  const hoy = hoyISO();
  const clientes = [], movimientos = [];
  const mov = (fecha, concepto, gasto, ingreso, obs, medioPago) => {
    const id = uidS();
    movimientos.push({ id, fecha, concepto, gasto, ingreso, obs, medioPago: medioPago || "efectivo" });
    return id;
  };
  mov(isoDia(5, 1), "CAPITAL", 0, 6000000, "Capital para prestar", "efectivo");

  // nombre, tel, mesesAtras, diaInicio, monto, tasa %, periodo, nCuotas, cuotasPagadas, periodosSoloInteres
  function nuevo(nombre, tel, mAtras, dia, monto, tasa, periodo, n, pagadas, soloInt) {
    const interes = Math.round(monto * tasa / 100);
    const valorCuota = Math.round((monto + interes * n) / n);
    const cl = { id: uidS(), nombre, telefono: tel, fechaInicio: isoDia(mAtras, dia), montoPrestado: monto, valorCuota, interes, tasaInteres: tasa,
      periodoPago: periodo, numeroCuotas: n, proximaFechaPago: "", cuotasCapital: [], cuotasInteres: [] };
    cl.movId = mov(cl.fechaInicio, "PRESTAMO", monto, 0, nombre, "efectivo");
    secuenciaFechas(cl, soloInt || 0).forEach((per) => {
      if (per > hoy) return;
      const medio = "transferencia";
      cl.cuotasInteres.push({ id: uidS(), fecha: per, monto: interes, periodo: per, medioPago: medio, movId: mov(per, "INTERESES", 0, interes, nombre, medio) });
    });
    fechasCuotas(cl).slice(0, pagadas || 0).forEach((f, i) => {
      if (f > hoy) return;
      const medio = i % 2 ? "transferencia" : "efectivo";
      cl.cuotasCapital.push({ id: uidS(), grupoId: uidS(), fecha: f, monto: valorCuota, medioPago: medio, detalle: "cuota " + dm(f), movId: mov(f, "PAGARON", 0, valorCuota, nombre, medio) });
    });
    const fechas = fechasCuotas(cl);
    cl.proximaFechaPago = (fechas.find((f) => f >= hoy) || fechas[fechas.length - 1] || cl.fechaInicio);
    if (n > 1) sincronizarProxima(cl);   // apunta a la primera cuota que falta
    clientes.push(cl);
  }
  nuevo("María Fernanda López", "3001110001", 1, 5, 600000, 10, "5 y 20", 4, 3, 0);
  nuevo("Carlos Andrés Gómez", "3001110002", 3, 20, 500000, 10, "20", 3, 1, 0);
  nuevo("Lucía Ramírez", "3001110003", 1, 10, 300000, 10, "10", 1, 0, 1);
  nuevo("Jorge Herrera", "3001110004", 1, 15, 1000000, 8, "15 y 30", 6, 2, 0);
  nuevo("Ana Milena Torres", "3001110005", 4, 5, 200000, 10, "5", 2, 2, 0);
  nuevo("Pedro Castillo", "3001110006", 0, new Date().getDate(), 400000, 12, "1 y 16", 3, 0, 0);
  return { clientes, movimientos, meta: {} };
}


// ---------- 2. Utilidades ----------
function uidS() { return Math.random().toString(36).slice(2, 10); }
function uid() { return Math.random().toString(36).slice(2, 10); }
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function cop(v) {
  if (!isFinite(v)) return "—";
  return "$" + Math.round(v).toLocaleString("es-CO");
}
function fechaCorta(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function hoyISO() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

// ---------- 3. Estado y persistencia ----------
let state = null;
let ui = { tab: "dashboard", selectedCliente: null, showAddCliente: false, editPrestamo: false, showAddPagoCap: false, showAddPagoInt: false, showAddMov: false, movTipo: "ingreso", editMovId: null, editPagoCapId: null, editPagoIntId: null, filtroMes: "", modalPago: null, busquedaCliente: "", filtroEstado: "todos", prefill: null, sim: { monto: "", tasa: "10", n: "4", freq: "quincenal", primera: "" } };
function buscarCliente(val) { ui.busquedaCliente = val; render(); }
function setFiltroEstado(k) { ui.filtroEstado = k; render(); }
function fechaMuyCorta(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}
function diasDesdeISO(iso) {
  if (!iso) return null;
  return Math.round((new Date(hoyISO()) - new Date(iso)) / 86400000);
}
function textoHace(d) {
  if (d === null) return "";
  if (d <= 0) return "Hoy";
  if (d === 1) return "Ayer";
  if (d < 60) return `Hace ${d} días`;
  return `Hace ${Math.round(d / 30)} meses`;
}

// ---------- Cobro por WhatsApp ----------
function telWhatsApp(tel) {
  let d = String(tel || "").replace(/[^\d]/g, "");
  if (d.length === 10 && d[0] === "3") d = "57" + d; // celular colombiano sin indicativo
  return d;
}
function mensajeCobro(cl) {
  const calc = calcCliente(cl);
  const primerNombre = (cl.nombre || "").split(" ")[0];
  const nombre = primerNombre ? primerNombre.charAt(0) + primerNombre.slice(1).toLowerCase() : "";
  const cuota = cop(cl.valorCuota);
  if (calc.estado === "ATRASADO") {
    return `Hola ${nombre}, te escribo por la cuota de ${cuota} de tu préstamo del ${fechaCorta(cl.fechaInicio)}, que venció el ${fechaCorta(cl.proximaFechaPago)} (${calc.diasAtraso} día${calc.diasAtraso === 1 ? "" : "s"} de atraso). ¿Cuándo puedes ponerte al día? Gracias.`;
  }
  const cuando = calc.diasRestantes === 0 ? "hoy" : calc.diasRestantes === 1 ? "mañana" : "el " + fechaCorta(cl.proximaFechaPago);
  return `Hola ${nombre}, te recuerdo que tu cuota de ${cuota} vence ${cuando}. Gracias.`;
}
function cobrarWhatsApp(id) {
  if (!exigirPremium("Cobro por WhatsApp")) return;
  const cl = state.clientes.find((c) => c.id === id);
  if (!cl) return;
  const tel = telWhatsApp(cl.telefono);
  const url = (tel ? "https://wa.me/" + tel : "https://wa.me/") + "?text=" + encodeURIComponent(mensajeCobro(cl));
  window.open(url, "_blank");
}

// ---------- Estado de cuenta (imagen + texto para enviar al cliente) ----------
function datosEstadoCuenta(id) {
  const cl = state.clientes.find((c) => c.id === id);
  if (!cl) return null;
  const calc = calcCliente(cl);
  const cal = calendarioCuotas(cl);
  const vencidas = cal.filas.filter((f) => f.vencida);
  return {
    cl, calc, cal,
    capitalAbonado: cl.cuotasCapital.reduce((t, x) => t + x.monto, 0),
    faltaPagar: Math.max(calc.capitalAdeudado, 0),
    pagado: calc.cuotasPendientes === 0 || calc.capitalAdeudado <= 0,
    vencidas, debeVencido: vencidas.reduce((t, f) => t + f.saldo, 0),
    hoy: hoyISO(),
  };
}
function estadoDeFila(f) {
  if (f.completa) return { txt: "Pagada", col: C.green, peso: 500 };
  if (f.parcial) return { txt: `Parcial · falta ${cop(f.saldo)}` + (f.vencida ? ` · ${f.diasAtraso} d` : ""), col: f.vencida ? C.red : C.goldText, peso: 700 };
  if (f.vencida) return { txt: `Vencida · ${f.diasAtraso} d`, col: C.red, peso: 700 };
  return { txt: "Pendiente", col: C.muted, peso: 700 };
}
function textoEstadoCuenta(id) {
  const d = datosEstadoCuenta(id);
  if (!d) return "";
  const { cl } = d;
  const L = [];
  L.push(`*Estado de cuenta* · ${nombreBonito(cl.nombre)}`);
  L.push(`Al ${fechaCorta(d.hoy)}`);
  L.push("");
  L.push(`Préstamo: ${cop(cl.montoPrestado)} · Cuota: ${cop(cl.valorCuota)} × ${cl.numeroCuotas}`);
  L.push("");
  d.cal.mezcla.forEach((f) => {
    if (f.tipo === "int") L.push(`💛 Int. ${dm(f.fecha)} · ${f.interes ? cop(f.interes) : "$ -"} · Interés pagado`);
    else {
      const e = estadoDeFila(f);
      const icono = f.completa ? "✅" : (f.vencida ? "⚠️" : "⏳");
      L.push(`${icono} Cuota ${f.n} · ${dm(f.fecha)} · ${f.abono ? cop(f.abono) : "$ -"} · ${e.txt}`);
    }
  });
  L.push("");
  if (d.pagado) L.push("✅ Préstamo pagado en su totalidad. ¡Gracias!");
  else {
    if (d.vencidas.length) L.push(`⚠️ Cuotas vencidas: ${d.vencidas.length} (${cop(d.debeVencido)})`);
    if (cl.proximaFechaPago) L.push(`Próxima fecha de pago: ${fechaCorta(cl.proximaFechaPago)}`);
  }
  return L.join("\n");
}
async function dibujarEstadoCuenta(id) {
  const d = datosEstadoCuenta(id);
  if (!d) return null;
  try { await Promise.all([document.fonts.load("700 30px Fraunces"), document.fonts.load("600 16px Inter"), document.fonts.load("700 16px Inter")]); } catch (e) { /* sin letras: usa las del sistema */ }
  const W = 500, P = 22, S = 3, IW = W - P * 2, RH = 54;
  const SANS = "Inter, -apple-system, Roboto, Helvetica, Arial, sans-serif";
  const SERIF = "Fraunces, Georgia, serif";
  const filas = d.cal.mezcla;
  const mostrarAlerta = d.pagado || d.vencidas.length > 0;
  const H = P + 118 + 96 + 24 + 40 + 52 + filas.length * RH + (d.cal.aFavor > 0 ? 40 : 0) + 10 + 20 + (mostrarAlerta ? 84 : 0) + 76 + P;
  const cv = document.createElement("canvas");
  cv.width = W * S; cv.height = H * S;
  const g = cv.getContext("2d");
  g.scale(S, S);
  const rr = (x, y, w, h, r, fill) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.fillStyle = fill; g.fill(); };
  const t = (txt, x, y, font, color, align) => { g.font = font; g.fillStyle = color; g.textAlign = align || "left"; g.textBaseline = "middle"; g.fillText(txt, x, y); };
  const tFit = (txt, x, y, peso, size, color, maxW) => { let sz = size; g.font = `${peso} ${sz}px ${SANS}`; while (g.measureText(txt).width > maxW && sz > 11) { sz -= 1; g.font = `${peso} ${sz}px ${SANS}`; } t(txt, x, y, `${peso} ${sz}px ${SANS}`, color); };

  g.fillStyle = C.bg; g.fillRect(0, 0, W, H);
  let y = P;
  // Encabezado
  t("Estado de cuenta", P, y + 22, `700 30px ${SERIF}`, "#F2A93B");
  t(nombreBonito(d.cl.nombre), P, y + 62, `600 22px ${SANS}`, C.dText);
  t("Al " + new Date().toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" }), P, y + 92, `500 15px ${SANS}`, C.dMuted);
  y += 118;
  // Resumen del préstamo
  rr(P, y, IW, 96, 20, C.surface);
  const cols = [["Prestado", cop(d.cl.montoPrestado)], ["Valor cuota", cop(d.cl.valorCuota) + " × " + d.cl.numeroCuotas], ["Fechas de pago", d.cl.periodoPago ? String(d.cl.periodoPago) : "—"]];
  cols.forEach(([a, b], i) => { const x = P + 22 + i * (IW - 44) / 3; t(a, x, y + 32, `500 13px ${SANS}`, C.muted); tFit(b, x, y + 62, 700, 18, C.text, (IW - 44) / 3 - 10); });
  y += 96 + 24;
  // Tabla
  t("Cuotas del préstamo", P, y + 14, `700 22px ${SANS}`, C.dText);
  y += 40;
  const altoTabla = 52 + filas.length * RH + (d.cal.aFavor > 0 ? 40 : 0) + 10;
  rr(P, y, IW, altoTabla, 22, C.surface);
  const X = [P + 20, P + 76, P + 168, P + 284];
  ["Cuota", "Vence", "Pagado", "Estado"].forEach((h, i) => t(h, X[i], y + 26, `600 14px ${SANS}`, C.muted));
  g.fillStyle = C.border; g.fillRect(P, y + 52, IW, 1.5);
  let fy = y + 52;
  filas.forEach((f, idx) => {
    const cy = fy + RH / 2;
    if (f.tipo === "int") {
      t("Int.", X[0], cy, `700 17px ${SANS}`, C.goldText);
      t(dm(f.fecha), X[1], cy, `500 17px ${SANS}`, C.text);
      t(f.interes ? cop(f.interes) : "$ -", X[2], cy, `500 17px ${SANS}`, C.goldText);
      tFit("Interés pagado", X[3], cy, 700, 17, C.goldText, P + IW - 14 - X[3]);
    } else {
      const e = estadoDeFila(f);
      t(String(f.n), X[0], cy, `700 17px ${SANS}`, C.muted);
      t(dm(f.fecha), X[1], cy, `500 17px ${SANS}`, C.text);
      t(f.abono ? cop(f.abono) : "$ -", X[2], cy, `500 17px ${SANS}`, f.abono ? C.green : C.muted);
      tFit(e.txt, X[3], cy, e.peso, 17, e.col, P + IW - 14 - X[3]);
    }
    fy += RH;
    if (idx < filas.length - 1) { g.fillStyle = C.surface2; g.fillRect(P + 1, fy - 1, IW - 2, 1.5); }
  });
  if (d.cal.aFavor > 0) { t("A favor (pagado de más): " + cop(d.cal.aFavor), P + 22, fy + 20, `700 14px ${SANS}`, C.goldText); fy += 40; }
  y += altoTabla + 20;
  // Aviso: al día / pagado / cuotas vencidas
  if (mostrarAlerta) {
    if (d.pagado) {
      rr(P, y, IW, 70, 18, C.greenSoft);
      t("✓ Préstamo pagado en su totalidad. ¡Gracias!", P + 22, y + 35, `700 17px ${SANS}`, C.green);
    } else {
      rr(P, y, IW, 70, 18, C.redSoft);
      t(`${d.vencidas.length} cuota${d.vencidas.length === 1 ? "" : "s"} vencida${d.vencidas.length === 1 ? "" : "s"}`, P + 22, y + 24, `500 13px ${SANS}`, C.muted);
      t("Por pagar hoy para ponerse al día: " + cop(d.debeVencido), P + 22, y + 48, `700 17px ${SANS}`, C.red);
    }
    y += 84;
  }
  // Próxima fecha de pago
  if (!d.pagado && d.cl.proximaFechaPago) {
    rr(P, y, IW, 62, 18, "#1C3326");
    t("Próxima fecha de pago", P + 22, y + 31, `500 14px ${SANS}`, C.dMuted);
    t(fechaCorta(d.cl.proximaFechaPago), P + IW - 22, y + 31, `700 20px ${SANS}`, C.gold, "right");
  }
  return new Promise((ok) => cv.toBlob((b) => ok(b), "image/png"));
}
async function abrirEstadoCuenta(id) {
  const blob = await dibujarEstadoCuenta(id);
  if (!blob) return;
  if (ui.estadoCuenta && ui.estadoCuenta.url) URL.revokeObjectURL(ui.estadoCuenta.url);
  ui.estadoCuenta = { clienteId: id, blob, url: URL.createObjectURL(blob) };
  render();
}
function cerrarEstadoCuenta() {
  if (ui.estadoCuenta && ui.estadoCuenta.url) URL.revokeObjectURL(ui.estadoCuenta.url);
  ui.estadoCuenta = null; render();
}
async function compartirEstadoCuenta() {
  const e = ui.estadoCuenta;
  if (!e || !e.blob) return;
  const cl = state.clientes.find((c) => c.id === e.clienteId);
  const nombre = "estado-de-cuenta-" + ((cl && cl.nombre) || "cliente").toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, "-").replace(/^-|-$/g, "") + ".png";
  const archivo = new File([e.blob], nombre, { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
    try { await navigator.share({ files: [archivo], title: "Estado de cuenta" }); return; }
    catch (err) { if (err && err.name === "AbortError") return; }
  }
  const a = document.createElement("a");
  a.href = e.url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  mostrarAviso("Imagen guardada en tus descargas");
}
async function copiarEstadoCuenta() {
  const e = ui.estadoCuenta;
  if (!e) return;
  const txt = textoEstadoCuenta(e.clienteId);
  try { await navigator.clipboard.writeText(txt); mostrarAviso("Texto copiado. Pégalo en WhatsApp."); }
  catch (err) {
    const ta = document.createElement("textarea");
    ta.value = txt; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); mostrarAviso("Texto copiado. Pégalo en WhatsApp."); } catch (e2) { mostrarAviso("No se pudo copiar"); }
    ta.remove();
  }
}
function renderEstadoCuenta() {
  const e = ui.estadoCuenta;
  if (!e) return "";
  return `<div style="position:fixed;inset:0;background:rgba(6,12,9,.96);z-index:70;overflow-y:auto;padding:18px;box-sizing:border-box;">
    <div style="max-width:420px;margin:0 auto;">
      <img src="${e.url}" alt="Estado de cuenta" style="width:100%;display:block;border-radius:16px;" />
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px;padding-bottom:20px;">
        ${primaryBtn("📤 Compartir imagen", "compartirEstadoCuenta()")}
        ${ghostBtn("Copiar como texto", "copiarEstadoCuenta()", true)}
        ${ghostBtn("Cerrar", "cerrarEstadoCuenta()", true)}
      </div>
    </div>
  </div>`;
}

// ---------- Exportar a Excel (.xlsx real, sin librerías, funciona sin internet) ----------
function crc32(bytes) {
  if (!crc32.t) { crc32.t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; crc32.t[n] = c >>> 0; } }
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) c = crc32.t[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function zipStore(files) {
  const enc = new TextEncoder();
  const partes = [], central = [];
  let offset = 0;
  const u16 = (v) => [v & 255, (v >> 8) & 255];
  const u32 = (v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
  files.forEach((f) => {
    const nombre = enc.encode(f.name), datos = enc.encode(f.data), crc = crc32(datos);
    const local = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(datos.length), ...u32(datos.length), ...u16(nombre.length), ...u16(0)]);
    partes.push(local, nombre, datos);
    central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(datos.length), ...u32(datos.length), ...u16(nombre.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), nombre);
    offset += local.length + nombre.length + datos.length;
  });
  const tamCentral = central.reduce((s, p) => s + p.length, 0);
  const fin = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(tamCentral), ...u32(offset), ...u16(0)]);
  return new Blob([...partes, ...central, fin], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
function xmlEsc(v) { return String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ""); }
function colLetra(i) { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
function serialFecha(iso) { const [y, m, d] = iso.split("-").map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000; }
// Cada celda: texto, número, {m: dinero} o {f: "AAAA-MM-DD"}
function hojaXml(filas, anchos) {
  const cols = `<cols>${anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`;
  const rows = filas.map((fila, r) => `<row r="${r + 1}">${fila.map((v, c) => {
    const ref = colLetra(c) + (r + 1);
    if (v === null || v === undefined || v === "") return "";
    if (r === 0) return `<c r="${ref}" s="1" t="inlineStr"><is><t>${xmlEsc(v)}</t></is></c>`;
    if (typeof v === "number") return `<c r="${ref}"><v>${v}</v></c>`;
    if (typeof v === "object" && v.m !== undefined) return `<c r="${ref}" s="2"><v>${Number(v.m) || 0}</v></c>`;
    if (typeof v === "object" && v.f) return `<c r="${ref}" s="3"><v>${serialFecha(v.f)}</v></c>`;
    return `<c r="${ref}" t="inlineStr"><is><t>${xmlEsc(v)}</t></is></c>`;
  }).join("")}</row>`).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${rows}</sheetData></worksheet>`;
}
function construirXlsx() {
  const clientes = ordenarPorNombre(state.clientes.map((c) => ({ ...c, calc: calcCliente(c) })));
  const hClientes = [["Cliente", "Teléfono", "Fecha del préstamo", "Monto prestado", "Valor cuota", "N° cuotas", "Cuotas pagadas", "Cuotas pendientes", "Total a pagar", "Capital pagado", "Saldo pendiente", "Intereses pagados aparte", "Próximo pago", "Estado", "Días de atraso"]];
  clientes.forEach((c) => hClientes.push([c.nombre, c.telefono || "", c.fechaInicio ? { f: c.fechaInicio } : "", { m: c.montoPrestado }, { m: c.valorCuota }, c.numeroCuotas, c.calc.cuotasPagadas, c.calc.cuotasPendientes, { m: c.calc.totalPagar }, { m: c.calc.capitalPagado }, { m: Math.max(c.calc.capitalAdeudado, 0) }, { m: c.calc.interesPagado }, c.proximaFechaPago ? { f: c.proximaFechaPago } : "", c.calc.estado === "ATRASADO" ? "Atrasado" : (c.calc.cuotasPendientes === 0 || c.calc.capitalAdeudado <= 0 ? "Pagado" : "Al día"), c.calc.diasAtraso]));
  const hPagos = [["Cliente", "Fecha", "Tipo de pago", "Monto"]];
  const pagos = [];
  clientes.forEach((c) => {
    c.cuotasCapital.forEach((p) => pagos.push([c.nombre, p.fecha, "Cuota", p.monto]));
    c.cuotasInteres.forEach((p) => pagos.push([c.nombre, p.fecha, "Solo interés", p.monto]));
  });
  pagos.sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)).forEach((p) => hPagos.push([p[0], { f: p[1] }, p[2], { m: p[3] }]));
  const hCaja = [["Fecha", "Concepto", "Detalle", "Medio de pago", "Ingreso", "Gasto", "Saldo"]];
  let saldo = 0;
  state.movimientos.slice().sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0)).forEach((m) => {
    saldo += m.ingreso - m.gasto;
    hCaja.push([{ f: m.fecha }, m.concepto, m.obs || "", (m.medioPago || "efectivo") === "transferencia" ? "Transferencia" : "Efectivo", { m: m.ingreso }, { m: m.gasto }, { m: saldo }]);
  });
  const hojas = [["Clientes", hClientes, [26, 14, 16, 15, 13, 10, 13, 15, 14, 14, 15, 18, 14, 11, 12]], ["Pagos", hPagos, [26, 13, 14, 14]], ["Caja", hCaja, [13, 14, 30, 15, 14, 14, 14]]];
  const archivos = [
    { name: "[Content_Types].xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas.map((h, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>` },
    { name: "_rels/.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: "xl/workbook.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas.map((h, i) => `<sheet name="${h[0]}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>` },
    { name: "xl/_rels/workbook.xml.rels", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((h, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: "xl/styles.xml", data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8D98A"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
  ];
  hojas.forEach((h, i) => archivos.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: hojaXml(h[1], h[2]) }));
  return zipStore(archivos);
}
function exportExcel() {
  if (!exigirPremium("Exportar a Excel")) return;
  const blob = construirXlsx();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `negocio-prestamos-${hoyISO()}.xlsx`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------- Simulador de préstamos ----------
// Misma fórmula que usa la app: cuota = capital / N° de cuotas + interés fijo por período
// (interés por período = monto × tasa %).
function sumarDias(iso, dias) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + dias);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function sumarMes(iso, meses) {
  const d = new Date(iso + "T00:00:00");
  const dia = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + meses);
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(dia, ultimo));
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function fechaCuotaSim(primera, i, freq) {
  if (freq === "semanal") return sumarDias(primera, 7 * i);
  if (freq === "mensual") return sumarMes(primera, i);
  // quincenal: de 15 en 15 días
  return sumarDias(primera, 15 * i);
}
function setSim(k, v) { ui.sim[k] = v; render(); }
function calcSim() {
  const s = ui.sim;
  const monto = Number(String(s.monto).replace(/[^\d]/g, "")) || 0;
  const tasa = Number(String(s.tasa).replace(/[^\d.]/g, "")) || 0;
  const n = Math.max(1, Math.min(120, Number(String(s.n).replace(/[^\d]/g, "")) || 0));
  if (!monto || !String(s.n).trim()) return null;
  const interesPeriodo = Math.round(monto * tasa / 100);
  const capitalCuota = Math.round(monto / n);
  const cuota = capitalCuota + interesPeriodo;
  const total = cuota * n;
  const primera = s.primera || sumarDias(hoyISO(), s.freq === "semanal" ? 7 : s.freq === "mensual" ? 30 : 15);
  const filas = [];
  let pendiente = total;
  for (let i = 0; i < n; i++) { pendiente -= cuota; filas.push({ n: i + 1, fecha: fechaCuotaSim(primera, i, s.freq), cuota, pendiente: Math.max(pendiente, 0) }); }
  return { monto, tasa, n, interesPeriodo, cuota, total, ganancia: total - monto, primera, filas };
}
function usarSimulacion() {
  const r = calcSim();
  if (!r) return;
  if (!puedeAgregarCliente()) return;
  const periodoTxt = ui.sim.freq === "semanal" ? "Semanal" : ui.sim.freq === "mensual" ? "Mensual" : "15 y 30";
  ui.prefill = { monto: r.monto, cuota: r.cuota, interes: r.interesPeriodo, tasa: r.tasa, periodo: periodoTxt, n: r.n, proxima: r.primera };
  ui.tab = "dashboard"; ui.showAddCliente = true; render();
  window.scrollTo(0, document.body.scrollHeight);
}
function renderSimulador() {
  const s = ui.sim;
  const r = calcSim();
  const lbl = (t) => `<div style="font-size:12px;font-weight:600;color:${C.muted};margin-bottom:4px;">${t}</div>`;
  const selStyle = `width:100%;box-sizing:border-box;background:${C.surface2};border:1.5px solid ${C.border};border-radius:12px;color:${C.text};padding:10px 12px;font-size:14px;font-family:inherit;`;
  let html = card(`
    <div style="font-size:14px;font-weight:700;color:${C.text};margin-bottom:6px;">Simulador de préstamo</div>
    <div style="font-size:12.5px;color:${C.muted};margin-bottom:16px;">Calcula la cuota y la ganancia antes de prestar. Nada se guarda hasta que lo registres.</div>
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div>${lbl("Monto a prestar")}${inputHtml("f-sim-monto", "Ej. 500000", 'inputmode="numeric" value="' + esc(s.monto) + '" oninput="setSim(\'monto\', this.value)"')}</div>
      <div style="display:flex;gap:10px;">
        <div style="flex:1;">${lbl("Interés por período (%)")}${inputHtml("f-sim-tasa", "10", 'inputmode="decimal" value="' + esc(s.tasa) + '" oninput="setSim(\'tasa\', this.value)"')}</div>
        <div style="flex:1;">${lbl("N° de cuotas")}${inputHtml("f-sim-n", "4", 'inputmode="numeric" value="' + esc(s.n) + '" oninput="setSim(\'n\', this.value)"')}</div>
      </div>
      <div style="display:flex;gap:10px;">
        <div style="flex:1;">${lbl("Cada cuánto paga")}<select id="f-sim-freq" onchange="setSim('freq', this.value)" style="${selStyle}">
          <option value="semanal" ${s.freq === "semanal" ? "selected" : ""}>Semanal</option>
          <option value="quincenal" ${s.freq === "quincenal" ? "selected" : ""}>Quincenal</option>
          <option value="mensual" ${s.freq === "mensual" ? "selected" : ""}>Mensual</option>
        </select></div>
        <div style="flex:1;">${lbl("Primera cuota")}${inputHtml("f-sim-primera", "", 'type="date" value="' + esc(s.primera) + '" oninput="setSim(\'primera\', this.value)"')}</div>
      </div>
    </div>`, "margin-bottom:20px;");

  if (!r) { html += `<div style="color:${C.dMuted};font-size:13px;">Escribe el monto y el número de cuotas para ver el resultado.</div>`; return html; }

  html += card(`
    <div style="font-size:14px;font-weight:700;color:${C.text};margin-bottom:18px;">Resultado</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px 20px;">
      ${stat("Valor de cada cuota", cop(r.cuota), C.green)}
      ${stat("Total a recibir", cop(r.total))}
      ${stat("Interés por período", cop(r.interesPeriodo), C.gold)}
      ${stat("Tu ganancia", cop(r.ganancia), C.green)}
    </div>
    <div style="margin-top:14px;font-size:12px;color:${C.muted};">Prestas ${cop(r.monto)} y recibes ${cop(r.total)} en ${r.n} cuota${r.n === 1 ? "" : "s"}.</div>`, "margin-bottom:20px;");

  html += `${seccion("Calendario de pagos")}
    <div style="background:${C.surface};border-radius:18px;overflow:hidden;margin-bottom:14px;">
    <div style="display:grid;grid-template-columns:.4fr 1fr 1fr 1fr;padding:11px 12px;font-size:12px;font-weight:600;color:${C.muted};border-bottom:1px solid ${C.border};"><div>Cuota</div><div>Fecha</div><div>Valor</div><div>Pendiente</div></div>
    ${r.filas.map((f) => `<div style="display:grid;grid-template-columns:.4fr 1fr 1fr 1fr;padding:10px 12px;font-size:12.5px;border-bottom:1px solid ${C.surface2};"><div style="color:${C.muted};font-weight:700;">${f.n}</div><div>${fechaCorta(f.fecha)}</div><div style="font-variant-numeric:tabular-nums;color:${C.green};">${cop(f.cuota)}</div><div style="font-variant-numeric:tabular-nums;">${cop(f.pendiente)}</div></div>`).join("")}
    </div>`;
  html += primaryBtn("Registrar este préstamo", "usarSimulacion()").replace("padding:10px 18px", "padding:12px 18px;width:100%");
  return html;
}

// ---------- Papelera (deshacer borrados) ----------
// Guarda lo último borrado por 8 segundos para poder restaurarlo. Se
// pierde si recargas la página, pero cubre el caso más común: "me
// equivoqué de botón".
let papelera = null;
let papeleraTimer = null;
function guardarPapelera(tipo, payload, mensaje) {
  papelera = { tipo, payload, mensaje };
  clearTimeout(papeleraTimer);
  papeleraTimer = setTimeout(() => { papelera = null; render(); }, 8000);
}
function deshacerBorrado() {
  if (!papelera) return;
  const { tipo, payload } = papelera;
  if (tipo === "cliente") {
    state.clientes.push(payload.cliente);
    state.movimientos.push(...payload.movimientos);
  } else if (tipo === "pagoCap") {
    const cl = state.clientes.find((c) => c.id === payload.clienteId);
    if (cl) cl.cuotasCapital.push(payload.pago);
    if (payload.mov) state.movimientos.push(payload.mov);
  } else if (tipo === "pagoCapGrupo") {
    const cl = state.clientes.find((c) => c.id === payload.clienteId);
    if (cl) { cl.cuotasCapital.push(...payload.pagos); sincronizarProxima(cl); }
    state.movimientos.push(...payload.movs);
  } else if (tipo === "pagoInt") {
    const cl = state.clientes.find((c) => c.id === payload.clienteId);
    if (cl) { cl.cuotasInteres.push(payload.pago); if (payload.pago.refCuota && !payload.pago.periodo) cl.periodosCorridos = (cl.periodosCorridos || 0) + 1; sincronizarProxima(cl); }
    if (payload.mov) state.movimientos.push(payload.mov);
  } else if (tipo === "movimiento") {
    state.movimientos.push(payload.mov);
  } else if (tipo === "cierre") {
    state.movimientos = state.movimientos.filter((m) => !payload.nuevosIds.includes(m.id));
    state.movimientos.push(...payload.borrados);
  }
  clearTimeout(papeleraTimer);
  papelera = null;
  save(); render();
}
function renderPapelera() {
  if (!papelera) return "";
  return `<div style="position:fixed;left:50%;bottom:86px;transform:translateX(-50%);background:${C.surface};border-radius:999px;padding:8px 8px 8px 18px;display:flex;align-items:center;gap:14px;box-shadow:0 4px 18px rgba(0,0,0,.4);z-index:50;max-width:90vw;">
    <span style="font-size:12.5px;color:${C.text};">${esc(papelera.mensaje)}</span>
    <button onclick="deshacerBorrado()" style="background:${C.gold};color:${C.bg};border:none;border-radius:999px;padding:8px 16px;font-weight:700;font-size:12.5px;font-family:inherit;cursor:pointer;white-space:nowrap;">Deshacer</button>
  </div>`;
}

function estadoVacio() { return { clientes: [], movimientos: [], meta: {} }; }
function load() {
  try {
    const raw = localStorage.getItem(CLAVE_ACTIVA);
    if (raw) { state = JSON.parse(raw); }
    else if (MODO_DEMO) { state = crearSeed(); save(); }   // demo: datos de ejemplo en almacenamiento aparte
    else { state = estadoVacio(); }                        // uso real: empieza vacío
  } catch (e) { state = MODO_DEMO ? crearSeed() : estadoVacio(); }
  // Protección: si faltan listas (datos viejos o dañados), se crean vacías
  if (!state || typeof state !== "object") state = estadoVacio();
  if (!Array.isArray(state.clientes)) state.clientes = [];
  if (!Array.isArray(state.movimientos)) state.movimientos = [];
  if (!state.meta || typeof state.meta !== "object") state.meta = {};
  if (state.clientes.length) ui.selectedCliente = state.clientes[0].id;
}
function save() {
  try { localStorage.setItem(CLAVE_ACTIVA, JSON.stringify(state)); } catch (e) { /* ignore */ }
}

// ---------- Calendario de cuotas (se calcula solo, no se guarda) ----------
// Cada préstamo tiene N cuotas con fecha de vencimiento. Las fechas salen del
// "Periodo de pago" (ej. "6 y 21" = días 6 y 21 de cada mes; "15 y 30" = quincenal).
// Si el periodo no trae números, se usa cada 15 días desde la fecha del préstamo.
// Los pagos se aplican SIEMPRE a la cuota más antigua que falte: se suma todo lo
// pagado a capital y se reparte en orden (por eso no hace falta migrar datos viejos).
function pad2(n) { return String(n).padStart(2, "0"); }
function dm(iso) { if (!iso) return ""; const [, m, d] = iso.split("-"); return d + "/" + m; }
function diasEntreISO(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
function diasDePeriodo(txt) {
  const m = String(txt || "").match(/\d{1,2}/g) || [];
  return [...new Set(m.map(Number).filter((d) => d >= 1 && d <= 31))].sort((a, b) => a - b);
}
// Secuencia base de fechas según el "Periodo de pago" (sin saltar ninguna)
function secuenciaFechas(cl, count) {
  const out = [];
  if (!cl.fechaInicio || count < 1) return out;
  const dias = diasDePeriodo(cl.periodoPago);
  if (!dias.length) {
    for (let i = 1; i <= count; i++) out.push(sumarDias(cl.fechaInicio, 15 * i));
    return out;
  }
  let [y, m] = cl.fechaInicio.split("-").map(Number);
  let guard = 0;
  while (out.length < count && guard++ < 1200) {
    const ult = new Date(y, m, 0).getDate();
    for (const d of dias) {
      const iso = y + "-" + pad2(m) + "-" + pad2(Math.min(d, ult));
      if (iso > cl.fechaInicio && out.length < count && out[out.length - 1] !== iso) out.push(iso);
    }
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}
// Períodos en los que se pagó SOLO el interés (no llevan número de cuota).
// Cada pago de interés guarda "periodo" (la fecha que cubre). Los pagos viejos
// (sin "periodo") usan periodosCorridos: los primeros N períodos del calendario.
function periodosCubiertos(cl) {
  const mapa = new Map();
  const sumar = (fecha, monto) => mapa.set(fecha, (mapa.get(fecha) || 0) + (monto || 0));
  const viejos = cl.cuotasInteres.filter((p) => p.refCuota && !p.periodo).sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  secuenciaFechas(cl, cl.periodosCorridos || 0).forEach((f, i) => sumar(f, viejos[i] ? viejos[i].monto : 0));
  cl.cuotasInteres.filter((p) => p.periodo).forEach((p) => sumar(p.periodo, p.monto));
  return [...mapa.entries()].map(([fecha, interes]) => ({ fecha, interes })).sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
}
// Fechas de las cuotas reales (salta los períodos donde solo se pagó interés)
function fechasCuotas(cl) {
  const cub = new Set(periodosCubiertos(cl).map((x) => x.fecha));
  const n = Math.max(1, cl.numeroCuotas || 1);
  return secuenciaFechas(cl, n + cub.size).filter((f) => !cub.has(f)).slice(0, n);
}
function calendarioCuotas(cl) {
  const v = cl.valorCuota || 0, hoy = hoyISO();
  let resto = cl.cuotasCapital.reduce((s, p) => s + p.monto, 0);
  const filas = fechasCuotas(cl).map((fecha, i) => {
    const abono = v > 0 ? Math.min(v, Math.max(resto, 0)) : 0;
    resto -= abono;
    const saldo = Math.max(v - abono, 0);
    const completa = v > 0 && saldo <= 0;
    const vencida = !completa && fecha < hoy;
    return { tipo: "cuota", n: i + 1, fecha, abono, saldo, completa, parcial: !completa && abono > 0, vencida, diasAtraso: vencida ? diasEntreISO(fecha, hoy) : 0 };
  });
  const corridas = periodosCubiertos(cl).map((x) => ({ tipo: "int", fecha: x.fecha, interes: x.interes }));
  // Todo junto, ordenado por la fecha del período
  const mezcla = [...filas, ...corridas].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  return { filas, corridas, mezcla, aFavor: Math.max(resto, 0) };
}
// Simula a qué cuotas iría un pago (sin guardarlo todavía).
function aplicacionPago(cl, monto) {
  const cal = calendarioCuotas(cl);
  let resto = monto;
  const partes = [];
  for (const f of cal.filas) {
    if (f.completa) continue;
    if (resto <= 0) break;
    const aplica = Math.min(resto, f.saldo);
    resto -= aplica;
    partes.push({ n: f.n, fecha: f.fecha, aplica, completa: aplica >= f.saldo, vencida: f.vencida });
  }
  return { partes, sobrante: resto };
}
function textoAplicacion(ap) {
  const t = ap.partes.map((x) => (x.completa ? "cuota " : "abono a cuota ") + dm(x.fecha));
  if (ap.sobrante > 0) t.push(ap.partes.length ? "sobra " + cop(ap.sobrante) + " a favor" : "abono extra");
  return t.join(" + ");
}
function detalleCaja(ap) {
  const t = ap.partes.map((x) => (x.completa ? "cuota " : "abono cuota ") + dm(x.fecha));
  if (ap.sobrante > 0 && !t.length) t.push("abono extra");
  return t.join(" + ");
}
// Deja "Próxima fecha de pago" apuntando a la primera cuota que falta.
// (Préstamos de 1 sola cuota no se tocan: ahí la fecha se maneja con los intereses.)
function sincronizarProxima(cl) {
  if (!cl || (cl.numeroCuotas || 1) <= 1) return;
  const sig = calendarioCuotas(cl).filas.find((f) => !f.completa);
  if (sig) cl.proximaFechaPago = sig.fecha;
}
function numDe(id) { const el = document.getElementById(id); return Number(((el && el.value) || "").replace(/[^\d]/g, "")) || 0; }

// ---------- Intereses por mora (fechas extra después de la última cuota) ----------
// Devuelve un array de { fecha, monto } con los períodos de interés que se
// generaron DESPUÉS de la última cuota del préstamo y hasta hoy, siempre que
// el cliente todavía tenga capital adeudado.
function interesesMora(cl) {
  if (!cl.fechaInicio || !cl.numeroCuotas || cl.numeroCuotas < 1) return [];
  const hoy = hoyISO();
  const fechas = fechasCuotas(cl);
  const ultimaFecha = fechas[fechas.length - 1];
  if (!ultimaFecha) return [];
  // Solo aplica si ya pasó la fecha de la última cuota
  if (ultimaFecha >= hoy) return [];
  // Solo aplica si aún hay capital adeudado
  const capitalPagado = cl.cuotasCapital.reduce((s, c) => s + c.monto, 0);
  const totalPagar = (cl.valorCuota || 0) * cl.numeroCuotas;
  if (capitalPagado >= totalPagar) return [];
  // Generar fechas extra siguiendo el mismo patrón de períodos
  const dias = diasDePeriodo(cl.periodoPago);
  if (!dias.length) return [];
  const extra = [];
  let [y, m] = ultimaFecha.split("-").map(Number);
  let guard = 0;
  while (guard++ < 600) {
    // Avanzar al siguiente mes para empezar a generar después de ultimaFecha
    m++; if (m > 12) { m = 1; y++; }
    const ult = new Date(y, m, 0).getDate();
    for (const d of dias) {
      const iso = y + "-" + pad2(m) + "-" + pad2(Math.min(d, ult));
      if (iso <= ultimaFecha) continue;
      if (iso > hoy) return extra;
      extra.push({ fecha: iso, monto: cl.interes || 0 });
    }
  }
  return extra;
}

// ---------- 4. Cálculos ----------
function calcCliente(cl) {
  const totalPagar = cl.valorCuota * cl.numeroCuotas;
  const capitalPagado = cl.cuotasCapital.reduce((s, c) => s + c.monto, 0);
  const capitalAdeudado = totalPagar - capitalPagado;
  const interesPagado = cl.cuotasInteres.reduce((s, c) => s + c.monto, 0);
  const cuotasPagadas = Math.min(cl.numeroCuotas, cl.valorCuota > 0 ? Math.floor(capitalPagado / cl.valorCuota + 1e-9) : cl.cuotasCapital.length);
  const cuotasPendientes = cl.numeroCuotas - cuotasPagadas;
  const hoy = new Date(hoyISO());
  const proxima = cl.proximaFechaPago ? new Date(cl.proximaFechaPago) : null;
  let diasAtraso = 0, estado = "AL DIA", diasRestantes = null;
  if (proxima) {
    const diff = Math.round((hoy - proxima) / 86400000);
    if (diff > 0) { estado = "ATRASADO"; diasAtraso = diff; }
    else { diasRestantes = -diff; } // 0 = hoy, 1 = mañana, etc.
  }
  // "En riesgo": lleva un mes o más sin pagar nada de esa cuenta.
  const enRiesgo = estado === "ATRASADO" && diasAtraso >= 30;
  const mora = interesesMora(cl);
  const interesMoraPendiente = mora.reduce((s, x) => s + x.monto, 0) - cl.cuotasInteres.filter((p) => mora.some((x) => x.fecha === p.fecha)).reduce((s, p) => s + p.monto, 0);
  return { totalPagar, capitalPagado, capitalAdeudado, interesPagado, cuotasPagadas, cuotasPendientes, estado, diasAtraso, diasRestantes, enRiesgo, interesMoraPendiente };
}

// ---------- 5. Acciones ----------
function setTab(t) { ui.tab = t; ui.showAddCliente = false; ui.showAddMov = false; render(); }
function selectCliente(id) { ui.selectedCliente = id; ui.editPrestamo = false; ui.showAddPagoCap = false; ui.showAddPagoInt = false; ui.editPagoCapId = null; ui.editPagoIntId = null; render(); }
function toggleAddCliente() { if (!ui.showAddCliente && !puedeAgregarCliente()) return; ui.showAddCliente = !ui.showAddCliente; if (!ui.showAddCliente) ui.prefill = null; render(); if (ui.showAddCliente) setTimeout(() => { const el = document.getElementById("f-cl-nombre"); if (el) el.scrollIntoView({ block: "center" }); }, 50); }
function toggleEditPrestamo() { ui.editPrestamo = !ui.editPrestamo; render(); }
function toggleAddPagoCap() { ui.showAddPagoCap = !ui.showAddPagoCap; render(); }
function toggleAddPagoInt() { ui.showAddPagoInt = !ui.showAddPagoInt; render(); }
function toggleAddMov() { ui.showAddMov = !ui.showAddMov; render(); }
function toggleEditMov(id) { ui.editMovId = ui.editMovId === id ? null : id; render(); }
function setFiltroMes(val) { ui.filtroMes = val; render(); }
function mesLabel(key) {
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const [y, m] = key.split("-");
  return meses[parseInt(m, 10) - 1] + " " + y;
}

function submitAddCliente() {
  if (!puedeAgregarCliente()) return;
  const nombre = document.getElementById("f-cl-nombre").value.trim();
  const telefono = document.getElementById("f-cl-tel").value.trim();
  const fechaInicio = document.getElementById("f-cl-fecha").value || hoyISO();
  const monto = Number(document.getElementById("f-cl-monto").value.replace(/[^\d]/g, "")) || 0;
  const cuota = Number(document.getElementById("f-cl-cuota").value.replace(/[^\d]/g, "")) || 0;
  const interes = Number(document.getElementById("f-cl-interes").value.replace(/[^\d]/g, "")) || 0;
  const tasa = Number(document.getElementById("f-cl-tasa").value.replace(/[^\d.]/g, "")) || 0;
  const periodo = document.getElementById("f-cl-periodo").value.trim();
  const nCuotas = Number(document.getElementById("f-cl-ncuotas").value.replace(/[^\d]/g, "")) || 1;
  const proxima = document.getElementById("f-cl-proxima").value || fechaInicio;
  const medioPago = document.getElementById("f-cl-medio").value || "efectivo";
  if (!nombre || !monto) return;
  // movId liga este préstamo con su movimiento de salida en Caja, para
  // poder editarlo/borrarlo junto con el cliente más adelante.
  const movId = uid();
  const nuevo = { id: uid(), nombre, telefono, fechaInicio, montoPrestado: monto, valorCuota: cuota || monto, interes, tasaInteres: tasa, periodoPago: periodo, numeroCuotas: nCuotas, proximaFechaPago: proxima, cuotasCapital: [], cuotasInteres: [], movId };
  state.clientes.push(nuevo);
  state.movimientos.push({ id: movId, fecha: fechaInicio, concepto: "PRESTAMO", gasto: monto, ingreso: 0, obs: nombre, medioPago });
  save();
  ui.selectedCliente = nuevo.id; ui.showAddCliente = false; ui.prefill = null; ui.tab = "clientes";
  render();
}

function removeCliente(id) {
  const cl = state.clientes.find((c) => c.id === id);
  if (!cl) return;
  if (!confirm(`¿Eliminar el préstamo de "${cl.nombre}" y todo su historial de pagos? Esta acción no se puede deshacer. También se borrarán sus movimientos en Caja.`)) return;
  // Se borran también los movimientos de Caja ligados a este cliente
  // (el préstamo original y cada pago), porque se está eliminando todo
  // su historial.
  const idsMov = new Set([cl.movId, ...cl.cuotasCapital.map((p) => p.movId), ...cl.cuotasInteres.map((p) => p.movId)].filter(Boolean));
  const movsBorrados = state.movimientos.filter((m) => idsMov.has(m.id));
  state.movimientos = state.movimientos.filter((m) => !idsMov.has(m.id));
  state.clientes = state.clientes.filter((c) => c.id !== id);
  if (ui.selectedCliente === id) ui.selectedCliente = state.clientes.length ? state.clientes[0].id : null;
  guardarPapelera("cliente", { cliente: cl, movimientos: movsBorrados }, `Préstamo de "${cl.nombre}" eliminado.`);
  save(); render();
}

// Cuando un cliente ya pagó todas sus cuotas, se puede marcar el préstamo
// como cancelado: esto lo saca de la lista de clientes activos porque ya
// no debe nada. No borra el historial de movimientos en Caja: ese dinero
// ya entró y debe seguir apareciendo en la caja.
function cancelarCliente(id) {
  const cl = state.clientes.find((c) => c.id === id);
  if (!cl) return;
  if (!confirm(`"${cl.nombre}" ya pagó todo lo que debía. ¿Marcar el préstamo como cancelado y quitarlo de la lista de clientes?`)) return;
  state.clientes = state.clientes.filter((c) => c.id !== id);
  if (ui.selectedCliente === id) ui.selectedCliente = state.clientes.length ? state.clientes[0].id : null;
  save(); render();
}

function savePrestamo() {
  const cl = state.clientes.find((c) => c.id === ui.selectedCliente);
  const nuevoNombre = document.getElementById("f-p-nombre").value.trim();
  cl.nombre = nuevoNombre || cl.nombre;
  cl.telefono = document.getElementById("f-p-tel").value.trim();
  cl.fechaInicio = document.getElementById("f-p-fecha").value || cl.fechaInicio;
  cl.montoPrestado = Number(document.getElementById("f-p-monto").value.replace(/[^\d]/g, "")) || 0;
  cl.valorCuota = Number(document.getElementById("f-p-cuota").value.replace(/[^\d]/g, "")) || 0;
  cl.interes = Number(document.getElementById("f-p-interes").value.replace(/[^\d]/g, "")) || 0;
  cl.tasaInteres = Number(document.getElementById("f-p-tasa").value.replace(/[^\d.]/g, "")) || 0;
  cl.periodoPago = document.getElementById("f-p-periodo").value.trim();
  cl.numeroCuotas = Number(document.getElementById("f-p-ncuotas").value.replace(/[^\d]/g, "")) || 1;
  cl.proximaFechaPago = document.getElementById("f-p-proxima").value || cl.proximaFechaPago;
  // Si el monto prestado cambió, se refleja también en el movimiento de
  // Caja que se creó cuando se registró el préstamo.
  if (cl.movId) {
    const m = state.movimientos.find((x) => x.id === cl.movId);
    if (m) { m.gasto = cl.montoPrestado; m.obs = cl.nombre; m.fecha = cl.fechaInicio; const sel = document.getElementById("f-p-medio"); if (sel) m.medioPago = sel.value || "efectivo"; }
  }
  save(); ui.editPrestamo = false; render();
}

function vistaPagoHtml(cl, efe, tra) {
  const total = efe + tra;
  if (!total) return `<div style="font-size:12.5px;color:${C.muted};">Escribe cuánto paga y por qué medio.</div>`;
  const ap = aplicacionPago(cl, total);
  const lineas = ap.partes.map((x) => `<div style="display:flex;justify-content:space-between;gap:8px;"><span>Cuota ${dm(x.fecha)}${x.vencida ? " (vencida)" : ""}</span><b style="color:${x.completa ? C.green : C.goldText};">${x.completa ? "queda pagada" : "parcial · " + cop(x.aplica)}</b></div>`).join("");
  const sobra = ap.sobrante > 0 ? `<div style="margin-top:4px;color:${C.goldText};">${ap.partes.length ? "Sobran " + cop(ap.sobrante) + ": " : ""}${ap.partes.length ? "no hay más cuotas pendientes." : "Este préstamo no tiene cuotas pendientes; se guardará como abono extra."}</div>` : "";
  return `<div style="font-size:12px;font-weight:600;color:${C.muted};margin-bottom:6px;">Total ${cop(total)} · se aplica a:</div><div style="display:flex;flex-direction:column;gap:4px;font-size:13px;">${lineas}</div>${sobra}`;
}
function actualizarVistaPago() {
  const cl = state.clientes.find((c) => c.id === ui.selectedCliente);
  const el = document.getElementById("pc-preview");
  if (cl && el) el.innerHTML = vistaPagoHtml(cl, numDe("f-pc-efe"), numDe("f-pc-tra"));
}
function submitPagoCap() {
  const cl = state.clientes.find((c) => c.id === ui.selectedCliente);
  if (!cl) return;
  const fecha = document.getElementById("f-pc-fecha").value || hoyISO();
  const efe = numDe("f-pc-efe"), tra = numDe("f-pc-tra");
  const total = efe + tra;
  if (!total) return;
  const adeudado = calcCliente(cl).capitalAdeudado;
  if (total > adeudado && !confirm(`El pago (${cop(total)}) es mayor que lo que debe (${cop(Math.max(adeudado, 0))}). ¿Registrarlo igual?`)) return;
  // Se calcula ANTES de guardar, para saber a qué cuotas va.
  const ap = aplicacionPago(cl, total);
  const detalle = detalleCaja(ap);
  const grupoId = uid();
  [["efectivo", efe], ["transferencia", tra]].forEach(([medioPago, monto]) => {
    if (!monto) return;
    const movId = uid();
    cl.cuotasCapital.push({ id: uid(), grupoId, fecha, monto, movId, medioPago, detalle });
    state.movimientos.push({ id: movId, fecha, concepto: "PAGARON", gasto: 0, ingreso: monto, obs: cl.nombre, medioPago, detalle });
  });
  sincronizarProxima(cl);
  save(); ui.showAddPagoCap = false;
  const atrasadas = calendarioCuotas(cl).filas.filter((f) => f.vencida).map((f) => dm(f.fecha));
  ui.modalPago = { clienteId: cl.id, resumen: textoAplicacion(ap), atrasadas };
  render();
}
function toggleEditPagoCap(gk) { ui.editPagoCapId = ui.editPagoCapId === gk ? null : gk; render(); }
// Un "pago" puede tener varias partes (efectivo + transferencia). Se editan juntas.
function partesPago(cl, gk) { return cl.cuotasCapital.filter((p) => (p.grupoId || p.id) === gk); }
function savePagoCap(clId, gk) {
  const cl = state.clientes.find((c) => c.id === clId);
  if (!cl) return;
  const partes = partesPago(cl, gk);
  if (!partes.length) return;
  const fecha = document.getElementById("f-epc-fecha-" + gk).value || partes[0].fecha;
  partes.forEach((p) => {
    const monto = numDe("f-epc-monto-" + p.id) || p.monto;
    const selM = document.getElementById("f-epc-medio-" + p.id);
    const medio = selM ? selM.value : (p.medioPago || "efectivo");
    const cambios = [];
    if (medio !== (p.medioPago || "efectivo")) cambios.push(`medio: ${medioTexto(p.medioPago)} → ${medioTexto(medio)}`);
    if (monto !== p.monto) cambios.push(`monto: ${cop(p.monto)} → ${cop(monto)}`);
    if (fecha !== p.fecha) cambios.push(`fecha: ${fechaCorta(p.fecha)} → ${fechaCorta(fecha)}`);
    if (cambios.length) { p.ajustes = p.ajustes || []; p.ajustes.push({ cuando: hoyISO(), texto: cambios.join(", ") }); }
    p.fecha = fecha; p.monto = monto; p.medioPago = medio;
    if (p.movId) {
      const m = state.movimientos.find((x) => x.id === p.movId);
      if (m) { m.fecha = fecha; m.ingreso = monto; m.medioPago = medio; }
    }
  });
  sincronizarProxima(cl);
  ui.editPagoCapId = null;
  save(); render();
}
function removePagoCap(clId, gk) {
  const cl = state.clientes.find((c) => c.id === clId);
  if (!cl) return;
  const partes = partesPago(cl, gk);
  if (!partes.length) return;
  const total = partes.reduce((s, p) => s + p.monto, 0);
  if (!confirm(`¿Eliminar este pago a capital de ${cop(total)}?`)) return;
  const ids = new Set(partes.map((p) => p.movId).filter(Boolean));
  const movs = state.movimientos.filter((m) => ids.has(m.id));
  state.movimientos = state.movimientos.filter((m) => !ids.has(m.id));
  cl.cuotasCapital = cl.cuotasCapital.filter((p) => (p.grupoId || p.id) !== gk);
  sincronizarProxima(cl);
  guardarPapelera("pagoCapGrupo", { clienteId: clId, pagos: partes, movs }, `Pago a capital de ${cop(total)} eliminado.`);
  save(); render();
}
// Avanza periodosCorridos en 1 para que fechasCuotas desplace todas las fechas un período.
function correrFechasUnPeriodo(cl) {
  cl.periodosCorridos = (cl.periodosCorridos || 0) + 1;
}
function submitPagoInt() {
  const cl = state.clientes.find((c) => c.id === ui.selectedCliente);
  const fecha = document.getElementById("f-pi-fecha").value || hoyISO();
  const monto = Number(document.getElementById("f-pi-monto").value.replace(/[^\d]/g, "")) || 0;
  const medioPago = document.getElementById("f-pi-medio").value || "efectivo";
  if (!monto) return;
  const movId = uid();
  const periodo = (document.getElementById("f-pi-periodo") || {}).value || "";
  cl.cuotasInteres.push({ id: uid(), fecha, monto, movId, medioPago, periodo: periodo || undefined });
  sincronizarProxima(cl);
  state.movimientos.push({ id: movId, fecha, concepto: "INTERESES", gasto: 0, ingreso: monto, obs: cl.nombre, medioPago });
  save(); ui.showAddPagoInt = false;
  ui.modalPago = { clienteId: cl.id, proxima: cl.proximaFechaPago };
  render();
}
// Registra un interés de mora automático como pagado (efectivo por defecto)
function registrarMora(clId, fecha, monto) {
  const cl = state.clientes.find((c) => c.id === clId);
  if (!cl) return;
  const movId = uid();
  cl.cuotasInteres.push({ id: uid(), fecha, monto, movId, medioPago: "efectivo" });
  state.movimientos.push({ id: movId, fecha: hoyISO(), concepto: "INTERESES", gasto: 0, ingreso: monto, obs: cl.nombre + " · mora " + fechaCorta(fecha), medioPago: "efectivo" });
  save(); render();
}
function removePagoInt(clId, pagoId) {
  const cl = state.clientes.find((c) => c.id === clId);
  const p = cl.cuotasInteres.find((x) => x.id === pagoId);
  if (!p) return;
  if (!confirm(`¿Eliminar este pago de interés de ${cop(p.monto)}?`)) return;
  const mov = p.movId ? state.movimientos.find((m) => m.id === p.movId) : null;
  if (p.movId) state.movimientos = state.movimientos.filter((m) => m.id !== p.movId);
  cl.cuotasInteres = cl.cuotasInteres.filter((p) => p.id !== pagoId);
  if (p.refCuota && !p.periodo && (cl.periodosCorridos || 0) > 0) cl.periodosCorridos--;
  sincronizarProxima(cl);
  guardarPapelera("pagoInt", { clienteId: clId, pago: p, mov }, `Pago de interés de ${cop(p.monto)} eliminado.`);
  save(); render();
}
function toggleEditPagoInt(id) { ui.editPagoIntId = ui.editPagoIntId === id ? null : id; render(); }
function savePagoInt(clId, pagoId) {
  const cl = state.clientes.find((c) => c.id === clId);
  const p = cl.cuotasInteres.find((x) => x.id === pagoId);
  if (!p) return;
  const fecha = document.getElementById("f-epi-fecha-" + pagoId).value || p.fecha;
  const monto = Number(document.getElementById("f-epi-monto-" + pagoId).value.replace(/[^\d]/g, "")) || 0;
  const selM = document.getElementById("f-epi-medio-" + pagoId);
  const medio = selM ? selM.value : (p.medioPago || "efectivo");
  const cambios = [];
  if (medio !== (p.medioPago || "efectivo")) cambios.push(`medio: ${medioTexto(p.medioPago)} → ${medioTexto(medio)}`);
  if (monto !== p.monto) cambios.push(`monto: ${cop(p.monto)} → ${cop(monto)}`);
  if (fecha !== p.fecha) cambios.push(`fecha: ${fechaCorta(p.fecha)} → ${fechaCorta(fecha)}`);
  if (cambios.length) { p.ajustes = p.ajustes || []; p.ajustes.push({ cuando: hoyISO(), texto: cambios.join(", ") }); }
  const elPer = document.getElementById("f-epi-periodo-" + pagoId);
  if (elPer) {
    const nuevoPer = elPer.value || undefined;
    if (nuevoPer !== p.periodo) {
      p.ajustes = p.ajustes || [];
      p.ajustes.push({ cuando: hoyISO(), texto: `período: ${p.periodo ? dm(p.periodo) : "ninguno"} → ${nuevoPer ? dm(nuevoPer) : "ninguno"}` });
      p.periodo = nuevoPer;
    }
  }
  if (elPer) { const nuevoPer = elPer.value || undefined; if (nuevoPer !== p.periodo) cambios.length || (p.ajustes = p.ajustes || []), (p.ajustes = p.ajustes || []).push({ cuando: hoyISO(), texto: `período: ${p.periodo ? dm(p.periodo) : "ninguno"} → ${nuevoPer ? dm(nuevoPer) : "ninguno"}` }), p.periodo = nuevoPer; }
  p.fecha = fecha; p.monto = monto; p.medioPago = medio;
  sincronizarProxima(cl);
  if (p.movId) {
    const m = state.movimientos.find((x) => x.id === p.movId);
    if (m) { m.fecha = fecha; m.ingreso = monto; m.medioPago = medio; }
  }
  ui.editPagoIntId = null;
  save(); render();
}

function submitAddMov() {
  const fecha = document.getElementById("f-mov-fecha").value || hoyISO();
  const concepto = document.getElementById("f-mov-concepto").value.trim();
  const monto = Number(document.getElementById("f-mov-monto").value.replace(/[^\d]/g, "")) || 0;
  const gasto = ui.movTipo === "gasto" ? monto : 0;
  const ingreso = ui.movTipo === "gasto" ? 0 : monto;
  const obs = document.getElementById("f-mov-obs").value.trim();
  const medioPago = document.getElementById("f-mov-medio").value || "efectivo";
  if (!fecha || !concepto || !monto) return;
  state.movimientos.push({ id: uid(), fecha, concepto, gasto, ingreso, obs, medioPago });
  save(); ui.showAddMov = false; render();
}
function removeMovimiento(id) {
  const mov = state.movimientos.find((m) => m.id === id);
  if (!mov) return;
  if (!confirm(`¿Eliminar el movimiento "${mov.concepto}" del ${fechaCorta(mov.fecha)}?`)) return;
  state.movimientos = state.movimientos.filter((m) => m.id !== id);
  guardarPapelera("movimiento", { mov }, `Movimiento "${mov.concepto}" eliminado.`);
  save(); render();
}
function saveMov(id) {
  const m = state.movimientos.find((x) => x.id === id);
  if (!m) return;
  const fecha = document.getElementById("f-emov-fecha-" + id).value || m.fecha;
  const concepto = document.getElementById("f-emov-concepto-" + id).value.trim();
  const gasto = Number(document.getElementById("f-emov-gasto-" + id).value.replace(/[^\d]/g, "")) || 0;
  const ingreso = Number(document.getElementById("f-emov-ingreso-" + id).value.replace(/[^\d]/g, "")) || 0;
  const obs = document.getElementById("f-emov-obs-" + id).value.trim();
  const medioSel = document.getElementById("f-emov-medio-" + id);
  m.fecha = fecha; m.concepto = concepto || m.concepto; m.gasto = gasto; m.ingreso = ingreso; m.obs = obs;
  if (medioSel) m.medioPago = medioSel.value || "efectivo";
  ui.editMovId = null;
  save(); render();
}

// ---------- 6. Exportar / importar (respaldo) ----------
function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const fecha = hoyISO();
  a.href = url; a.download = `negocio-prestamos-backup-${fecha}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  state.meta = state.meta || {};
  state.meta.lastExportISO = fecha;
  save(); render();
}
function triggerImport() { document.getElementById("f-import-file").click(); }
function importData(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const parsed = JSON.parse(e.target.result);
      if (!parsed || !Array.isArray(parsed.clientes)) { alert("El archivo no tiene un formato válido."); return; }
      if (!confirm("Esto reemplazará todos los datos actuales con los del archivo. ¿Continuar?")) return;
      state = parsed;
      if (!Array.isArray(state.movimientos)) state.movimientos = [];
      if (!state.meta || typeof state.meta !== "object") state.meta = {};
      if (state.clientes.length) ui.selectedCliente = state.clientes[0].id;
      save(); render();
      alert("Datos restaurados correctamente.");
    } catch (err) { alert("No se pudo leer el archivo. Verifica que sea un backup válido."); }
  };
  reader.readAsText(file);
  input.value = "";
}

// ---------- 7. Renderizado ----------
// Paleta de colores de la app: cambia estos valores para retocar el look
// (también actualiza theme-color en index.html y los colores en manifest.json).
// Fondo oscuro verde + tarjetas crema (mismo estilo que Negocio Comida).
const C = {
  bg: "#122018", surface: "#FBF9F0", surface2: "#F1EEDF", border: "#E3DFCB",
  text: "#1B2A21", muted: "#6F8076",
  red: "#D2543A", green: "#3F8A5F", gold: "#F2A93B", goldText: "#A8700A",
  greenSoft: "#E4F1E8", redSoft: "#FBEAE4",
  // Colores para texto que va directo sobre el fondo oscuro
  dText: "#E9F3EC", dMuted: "#9DB5A6", dLine: "#2A4437",
  redL: "#F4967B", goldL: "#F5BC57", greenL: "#79D1A0",
};
const FONT_D = 'Fraunces, Georgia, serif';

// ---------- Textos bonitos (solo para mostrar; no cambian lo guardado) ----------
function nombreBonito(s) {
  return String(s || "").trim().toLowerCase().replace(/(^|[\s\-\/.])([a-záéíóúñü])/g, (m, p, l) => p + l.toUpperCase());
}
function capital(s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); }
const CONCEPTOS = { PRESTAMO: "Préstamo", PAGARON: "Pagaron", INTERESES: "Intereses", INVERSION: "Inversión" };
function conceptoBonito(s) {
  const k = String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
  return CONCEPTOS[k] || capital(String(s || "").trim().toLowerCase());
}

// ---------- Iconos (SVG simples, sin emojis) ----------
const ICONOS = {
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  moneda: '<circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/>',
  sube: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  baja: '<path d="m7 7 10 10"/><path d="M17 7v10H7"/>',
  mas: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  inicio: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  clientes: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  corona: '<path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/>',
  candado: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  calc: '<rect width="16" height="20" x="4" y="2" rx="2"/><line x1="8" x2="16" y1="6" y2="6"/><path d="M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01M16 14v4"/>',
};
function ico(n, size, color) {
  return `<svg width="${size || 18}" height="${size || 18}" viewBox="0 0 24 24" fill="none" stroke="${color || "currentColor"}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">${ICONOS[n] || ""}</svg>`;
}

// ---------- Piezas reutilizables ----------
function badge(text, color) {
  return `<span style="display:inline-flex;align-items:center;background:${color}1F;color:${color};border-radius:999px;padding:3px 10px;font-size:11.5px;font-weight:700;white-space:nowrap;">${esc(text)}</span>`;
}
function stat(label, value, accent) {
  const col = accent === C.gold ? C.goldText : accent;
  return `<div style="min-width:0;"><div style="font-size:12px;font-weight:600;color:${C.muted};margin-bottom:3px;">${esc(label)}</div>
    <div style="font-weight:700;font-size:17px;color:${col || C.text};font-variant-numeric:tabular-nums;overflow-wrap:anywhere;">${value}</div></div>`;
}
function card(inner, extra) { return `<div style="background:${C.surface};border:1px solid ${C.surface};border-radius:20px;padding:18px;${extra || ""}">${inner}</div>`; }
function seccion(texto, color, extra) {
  return `<div style="font-size:14px;font-weight:700;color:${color || C.dText};margin:0 0 10px;${extra || ""}">${texto}</div>`;
}
function inputHtml(id, placeholder, extra) {
  return `<input id="${id}" placeholder="${esc(placeholder)}" style="background:${C.surface2};border:1.5px solid ${C.border};border-radius:12px;color:${C.text};padding:10px 12px;font-size:14px;font-family:inherit;width:100%;box-sizing:border-box;min-width:0;" ${extra || ""}/>`;
}
function primaryBtn(label, onclick) {
  return `<button onclick="${onclick}" style="background:${C.gold};color:${C.bg};border:none;border-radius:999px;padding:11px 20px;font-weight:700;font-size:14px;font-family:inherit;cursor:pointer;">${esc(label)}</button>`;
}
function ghostBtn(label, onclick, full) {
  return `<button onclick="${onclick}" style="background:${C.greenSoft};color:${C.green};border:none;border-radius:999px;padding:11px 20px;font-weight:700;font-size:14px;font-family:inherit;cursor:pointer;${full !== false ? "width:100%;" : ""}">${esc(label)}</button>`;
}
function selectMedioPago(id, value) {
  const v = value || "efectivo";
  return `<select id="${id}" style="background:${C.surface2};border:1.5px solid ${C.border};border-radius:12px;color:${C.text};padding:10px 12px;font-size:14px;font-family:inherit;width:100%;box-sizing:border-box;">
    <option value="efectivo" ${v === "efectivo" ? "selected" : ""}>Efectivo</option>
    <option value="transferencia" ${v === "transferencia" ? "selected" : ""}>Transferencia</option>
  </select>`;
}
function medioTexto(m) { return m === "transferencia" ? "Transferencia" : "Efectivo"; }
function chipEstilo(activo) {
  return `flex-shrink:0;background:${activo ? C.gold : C.surface};color:${C.bg};border:none;border-radius:999px;padding:8px 16px;font-weight:700;font-size:13px;font-family:inherit;cursor:pointer;white-space:nowrap;`;
}

function renderModalPago() {
  if (!ui.modalPago) return "";
  const cl = state.clientes.find((c) => c.id === ui.modalPago.clienteId);
  if (!cl) { ui.modalPago = null; return ""; }
  const m = ui.modalPago;
  const resumen = m.resumen ? `<div style="background:${C.surface2};border-radius:12px;padding:10px 12px;font-size:13px;margin-bottom:12px;">Se aplicó a: <b>${esc(m.resumen)}</b></div>` : "";
  const atras = m.atrasadas && m.atrasadas.length ? `<div style="font-size:12.5px;color:${C.red};margin-bottom:12px;">Todavía debe ${m.atrasadas.length === 1 ? "la cuota vencida" : "las cuotas vencidas"} del ${esc(m.atrasadas.join(", "))}.</div>` : "";
  return `<div style="position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:60;padding:20px;">
    <div style="background:${C.surface};border-radius:22px;padding:22px;max-width:340px;width:100%;">
      <div style="font-size:16px;font-weight:700;color:${C.green};margin-bottom:10px;">Pago registrado</div>
      ${resumen}${atras}
      <div style="font-size:13px;color:${C.muted};margin-bottom:8px;">Próxima fecha de pago para ${esc(nombreBonito(cl.nombre))}:</div>
      ${inputHtml("f-modal-proxima", "", 'type="date" value="' + cl.proximaFechaPago + '"')}
      <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap;">
        ${primaryBtn("Actualizar y cerrar", "guardarProximaModal()")}
        ${ghostBtn("Cerrar", "cerrarModalPago()", false)}
      </div>
    </div>
  </div>`;
}
function guardarProximaModal() {
  const cl = state.clientes.find((c) => c.id === ui.modalPago.clienteId);
  const val = document.getElementById("f-modal-proxima").value;
  if (cl && val) cl.proximaFechaPago = val;
  ui.modalPago = null;
  save(); render();
}
function cerrarModalPago() { ui.modalPago = null; render(); }

const TABS = [["dashboard", "Resumen", "inicio", "Resumen"], ["clientes", "Clientes", "clientes", "Clientes"], ["caja", "Caja", "wallet", "Libro de Caja"], ["simulador", "Simulador", "calc", "Simulador"]];
function renderTabs() {
  return `<nav style="position:fixed;left:0;right:0;bottom:0;z-index:20;background:${C.surface};border-top:1px solid ${C.border};padding-bottom:env(safe-area-inset-bottom,0px);">
    <div style="max-width:640px;margin:0 auto;display:flex;">${TABS.map(([k, l, ic]) => {
      const on = ui.tab === k;
      return `<button onclick="setTab('${k}')" style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 4px 9px;background:none;border:none;cursor:pointer;font-family:inherit;color:${on ? C.green : C.muted};">
        ${ico(ic, 21)}<span style="font-size:11px;font-weight:${on ? 700 : 500};">${l}</span></button>`;
    }).join("")}</div></nav>`;
}

function ordenarPorNombre(arr) {
  return [...arr].sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
}

function renderClienteCard(c) {
  const atrasado = c.calc.estado === "ATRASADO";
  // "Pagado" cuenta dos casos: se completaron todas las cuotas, o el
  // capital adeudado ya llegó a 0 (por ejemplo si pagó de más y quedó saldado).
  const pagado = c.calc.cuotasPendientes === 0 || c.calc.capitalAdeudado <= 0;
  const acento = atrasado ? C.red : (pagado ? C.green : (c.calc.diasRestantes !== null && c.calc.diasRestantes <= 1 ? C.gold : C.green));
  const fondo = atrasado ? "#FDECE6" : C.surface;
  const n = c.calc.cuotasPendientes;
  const redondo = (extra) => `border-radius:50%;width:30px;height:30px;border:none;cursor:pointer;font-size:14px;font-family:inherit;display:flex;align-items:center;justify-content:center;flex-shrink:0;${extra}`;
  const lateral = [
    pagado ? `<button onclick="cancelarCliente('${c.id}')" title="Ya pagó todo: marcar como cancelado" style="${redondo(`background:${C.greenSoft};color:${C.green};`)}">✓</button>` : "",
    (!pagado && (atrasado || (c.calc.diasRestantes !== null && c.calc.diasRestantes <= 1))) ? `<button onclick="cobrarWhatsApp('${c.id}')" title="Cobrar por WhatsApp" style="${redondo("background:#E3F8EA;color:#1DA851;")}">💬</button>` : "",
    `<button onclick="removeCliente('${c.id}')" title="Eliminar cliente" class="del-btn" style="${redondo(`background:${C.surface};color:${C.red};font-size:17px;`)}">×</button>`,
  ].join("");
  const estadoTxt = atrasado ? `Atrasado · ${c.calc.diasAtraso} d` : (pagado ? "Pagado" : "Al día");
  const estadoCol = atrasado ? C.red : C.green;
  const detalle = pagado
    ? `Sin saldo pendiente`
    : `Próx. pago ${fechaMuyCorta(c.proximaFechaPago)} · ${cop(c.valorCuota)} · ${n} pend.`;
  return `<div style="display:flex;align-items:center;gap:6px;">
      <button onclick="selectCliente('${c.id}');setTab('clientes')" style="flex:1;min-width:0;text-align:left;background:${fondo};border:none;border-left:5px solid ${acento};border-radius:14px;padding:9px 12px;cursor:pointer;color:${C.text};font-family:inherit;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
          <div style="font-weight:700;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(nombreBonito(c.nombre))}</div>
          <span style="font-size:11.5px;font-weight:700;color:${estadoCol};white-space:nowrap;">${estadoTxt}</span>
        </div>
        <div style="font-size:12px;color:${C.muted};margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums;">${detalle}</div>
      </button>
      <div style="display:flex;gap:5px;">${lateral}</div>
    </div>`;
}

function renderDashboard() {
  const clCalc = ordenarPorNombre(state.clientes.map((c) => ({ ...c, calc: calcCliente(c) })));
  const tot = clCalc.reduce((a, c) => ({
    capitalPrestado: a.capitalPrestado + c.montoPrestado,
    enMora: a.enMora + (c.calc.estado === "ATRASADO" ? 1 : 0),
    capitalEnCalle: a.capitalEnCalle + Math.max(c.calc.capitalAdeudado, 0),
  }), { capitalPrestado: 0, enMora: 0, capitalEnCalle: 0 });
  const saldoCaja = state.movimientos.reduce((s, m) => s + m.ingreso - m.gasto, 0);
  // Lo más útil para el día a día: cuánto debería entrar en los próximos 7 días
  // (cuotas ya vencidas + las que vencen esta semana) de los préstamos que siguen activos.
  const porCobrar7 = clCalc.filter((c) => c.calc.cuotasPendientes > 0 && c.calc.capitalAdeudado > 0 && (c.calc.estado === "ATRASADO" || (c.calc.diasRestantes !== null && c.calc.diasRestantes <= 7)))
    .reduce((s, c) => s + c.valorCuota, 0);

  // Recordatorio de respaldo: si hace más de 5 días que no se exporta.
  const meta = state.meta || {};
  let diasSinRespaldo = null;
  if (meta.lastExportISO) diasSinRespaldo = Math.round((new Date(hoyISO()) - new Date(meta.lastExportISO)) / 86400000);

  let html = "";
  if (diasSinRespaldo === null || diasSinRespaldo >= 5) {
    html += card(`<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
      <span style="font-size:12.5px;color:${C.text};">🔒 ${diasSinRespaldo === null ? "Aún no tienes una copia de seguridad." : `Hace ${diasSinRespaldo} días que no haces una copia de seguridad.`} Tus datos solo viven en este celular.</span>
      ${primaryBtn("Respaldar ahora", "exportData()")}
    </div>`, `margin-bottom:16px;background:${C.redSoft};border-color:#E8836B;`);
  }

  html += card(`
    <div style="font-size:14px;font-weight:700;color:${C.text};margin-bottom:18px;">Resumen general</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px 20px;">
      ${stat("N° de clientes", clCalc.length)}
      ${stat("Clientes en mora", tot.enMora, tot.enMora > 0 ? C.red : C.green)}
      ${stat("Capital en la calle", cop(tot.capitalEnCalle))}
      ${stat("Saldo actual", cop(saldoCaja), C.gold)}
      ${stat("Por cobrar (7 días)", cop(porCobrar7), C.gold)}
      ${stat("Capital total prestado", cop(tot.capitalPrestado))}
    </div>`, `margin-bottom:20px;${tot.enMora > 0 ? `border-color:${C.red}55;` : ""}`);


  const filtroTexto = (ui.busquedaCliente || "").trim().toLowerCase();
  const clFiltrados = filtroTexto ? clCalc.filter((c) => c.nombre.toLowerCase().includes(filtroTexto)) : clCalc;

  const masAtrasado = (a, b) => (b.calc.diasAtraso || 0) - (a.calc.diasAtraso || 0);
  const riesgo = clFiltrados.filter((c) => c.calc.enRiesgo).sort(masAtrasado);
  const atrasados = clFiltrados.filter((c) => c.calc.estado === "ATRASADO" && !c.calc.enRiesgo).sort(masAtrasado);
  const pronto = clFiltrados.filter((c) => c.calc.estado !== "ATRASADO" && c.calc.diasRestantes !== null && c.calc.diasRestantes <= 1).sort((a, b) => a.calc.diasRestantes - b.calc.diasRestantes);
  const alDia = clFiltrados.filter((c) => c.calc.estado !== "ATRASADO" && !(c.calc.diasRestantes !== null && c.calc.diasRestantes <= 1));

  const formNuevo = card(`<div style="display:flex;flex-direction:column;gap:10px;">
      ${inputHtml("f-cl-nombre", "Nombre del deudor")}
      ${inputHtml("f-cl-tel", "WhatsApp del cliente (opcional)", 'inputmode="tel"')}
      <div style="display:flex;gap:10px;"><div style="flex:1;"><div style="font-size:12px;font-weight:600;color:${C.muted};margin-bottom:4px;">Fecha del préstamo</div>${inputHtml("f-cl-fecha", "", 'type="date" value="' + hoyISO() + '"')}</div>
      <div style="flex:1;"><div style="font-size:12px;font-weight:600;color:${C.muted};margin-bottom:4px;">Próxima fecha de pago</div>${inputHtml("f-cl-proxima", "", 'type="date"' + (ui.prefill ? ' value="' + ui.prefill.proxima + '"' : ""))}</div></div>
      <div style="display:flex;gap:10px;">${inputHtml("f-cl-monto", "Monto prestado", 'inputmode="numeric"' + (ui.prefill ? ' value="' + ui.prefill.monto + '"' : ""))}${inputHtml("f-cl-cuota", "Valor cuota", 'inputmode="numeric"' + (ui.prefill ? ' value="' + ui.prefill.cuota + '"' : ""))}</div>
      <div style="display:flex;gap:10px;">${inputHtml("f-cl-interes", "Interés por período", 'inputmode="numeric"' + (ui.prefill ? ' value="' + ui.prefill.interes + '"' : ""))}${inputHtml("f-cl-tasa", "Tasa interés %", 'inputmode="decimal"' + (ui.prefill ? ' value="' + ui.prefill.tasa + '"' : ""))}</div>
      <div style="display:flex;gap:10px;">${inputHtml("f-cl-periodo", "Periodo de pago (ej. 6 y 21)", ui.prefill ? 'value="' + esc(ui.prefill.periodo) + '"' : "")}${inputHtml("f-cl-ncuotas", "N° de cuotas", 'inputmode="numeric" value="' + (ui.prefill ? ui.prefill.n : 1) + '"')}</div>
      <div><div style="font-size:12px;font-weight:600;color:${C.muted};margin-bottom:4px;">El préstamo salió por</div>${selectMedioPago("f-cl-medio", "efectivo")}</div>
      <div style="display:flex;gap:8px;">${primaryBtn("Guardar", "submitAddCliente()")}${ghostBtn("Cancelar", "toggleAddCliente()", false)}</div>
    </div>`);;
  html += `<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;">
    <div style="font-size:14px;font-weight:700;color:${C.dText};">Estado de cartera por cliente</div>
    ${ui.showAddCliente ? "" : `<button onclick="toggleAddCliente()" style="background:${C.gold};color:${C.bg};border:none;border-radius:999px;padding:7px 15px;font-weight:700;font-size:13px;font-family:inherit;cursor:pointer;">+ Nuevo</button>`}
  </div>`;
  if (ui.showAddCliente) html += `<div style="margin-bottom:16px;">${formNuevo}</div>`;
  // Barra fija: el buscador y los filtros se quedan arriba al bajar por la lista
  const chips = [["todos", "Todos", clFiltrados.length], ["riesgo", "🚨 Riesgo", riesgo.length], ["atrasados", "⚠️ Atrasados", atrasados.length], ["pronto", "🔔 Pronto", pronto.length], ["aldia", "Al día", alDia.length]];
  html += `<div style="position:sticky;top:var(--hdr,88px);z-index:10;background:${C.bg};margin:0 -18px 12px;padding:8px 18px 8px;box-shadow:0 8px 8px -8px rgba(0,0,0,.55);">
    <div style="margin-bottom:8px;">${inputHtml("f-buscar-cliente", "Buscar cliente por nombre...", 'value="' + esc(ui.busquedaCliente || "") + '" oninput="buscarCliente(this.value)"')}</div>
    <div style="display:flex;gap:8px;overflow-x:auto;">${chips.map(([k, l, n]) =>
      `<button onclick="setFiltroEstado('${k}')" style="${chipEstilo(ui.filtroEstado === k)}">${l} ${n}</button>`).join("")}</div>
  </div>`;
  const ver = (k) => ui.filtroEstado === "todos" || ui.filtroEstado === k;

  if (filtroTexto && !clFiltrados.length) html += `<div style="color:${C.dMuted};font-size:13px;margin-bottom:16px;">Ningún cliente coincide con "${esc(ui.busquedaCliente)}".</div>`;

  if (riesgo.length && ver("riesgo")) {
    html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <span style="font-size:14px;color:${C.redL};font-weight:700;">🚨 En riesgo · 30+ días sin pagar (${riesgo.length})</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:7px;margin-bottom:18px;">
      ${riesgo.map(renderClienteCard).join("")}
    </div>`;
  }

  if (atrasados.length && ver("atrasados")) {
    html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <span style="font-size:14px;color:${C.redL};font-weight:700;">⚠️ Atrasados (${atrasados.length})</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:7px;margin-bottom:18px;">
      ${atrasados.map(renderClienteCard).join("")}
    </div>`;
  }

  if (pronto.length && ver("pronto")) {
    html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <span style="font-size:14px;color:${C.goldL};font-weight:700;">🔔 Pagan pronto (${pronto.length})</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:7px;margin-bottom:18px;">
      ${pronto.map(renderClienteCard).join("")}
    </div>`;
  }

  if (alDia.length && ver("aldia")) {
    html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <span style="font-size:14px;color:${C.greenL};font-weight:700;">Al día (${alDia.length})</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:7px;margin-bottom:20px;">
      ${alDia.map(renderClienteCard).join("")}
    </div>`;
  }

  html += `<div style="margin-top:24px;">` + renderPlanCard() + card(`
    <div style="font-size:14px;font-weight:700;color:${C.text};margin-bottom:6px;">Copia de seguridad</div>
    <div style="font-size:12.5px;color:${C.muted};margin-bottom:14px;">Los datos se guardan automáticamente en este dispositivo. Descarga un archivo de respaldo para no perderlos si cambias de teléfono o borras el navegador.</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      ${primaryBtn("Descargar copia (.json)", "exportData()")}
      ${premiumBtn("Exportar a Excel (.xlsx)", "exportExcel()")}
      ${ghostBtn("Restaurar desde archivo", "triggerImport()", false)}
      ${premiumBtn("Guardar copia en Google Drive", "respaldarDrive()")}
      ${premiumBtn("Restaurar de Google Drive", "restaurarDrive()")}
    </div>
      <a href="./privacidad.html" target="_blank" rel="noopener" style="display:block;text-align:center;margin-top:14px;font-size:12px;color:${C.muted};text-decoration:underline;">Política de privacidad</a>

    <input id="f-import-file" type="file" accept="application/json" onchange="importData(this)" style="display:none;" />
  `) + `</div>`;

  return html;
}

function renderClientes() {
  const todos = ordenarPorNombre(state.clientes.map((c) => ({ ...c, calc: calcCliente(c) })));
  if (!todos.length) return `<div style="color:${C.dMuted};">No hay préstamos registrados todavía.</div>`;
  const cl = todos.find((c) => c.id === ui.selectedCliente) || todos[0];
  const atrasado = cl.calc.estado === "ATRASADO";

  let html = `<div style="margin-bottom:18px;">
    <div style="font-size:13px;font-weight:600;color:${C.dMuted};margin-bottom:6px;">Cliente</div>
    <div style="position:relative;">
      <select onchange="selectCliente(this.value)" style="width:100%;box-sizing:border-box;appearance:none;-webkit-appearance:none;background:${C.surface};border:none;border-left:5px solid ${atrasado ? C.red : C.green};border-radius:16px;padding:14px 38px 14px 14px;color:${C.text};font-family:inherit;font-weight:700;font-size:15px;cursor:pointer;">
        ${todos.map((c) => `<option value="${c.id}" ${c.id === cl.id ? "selected" : ""}>${esc(nombreBonito(c.nombre))} · ${fechaMuyCorta(c.fechaInicio)}${c.calc.estado === "ATRASADO" ? " · Atrasado" : ""}</option>`).join("")}
      </select>
      <span style="position:absolute;right:14px;top:50%;transform:translateY(-50%);color:${C.muted};pointer-events:none;font-size:11px;">▼</span>
    </div>
  </div>`;

  html += card(`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      ${badge(atrasado ? `Atrasado · ${cl.calc.diasAtraso} día${cl.calc.diasAtraso === 1 ? "" : "s"}` : "Al día", atrasado ? C.red : C.green)}
      <span style="font-size:12px;color:${C.muted};">Próx. pago: ${fechaCorta(cl.proximaFechaPago)}</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px 20px;">
      ${stat("Fecha del préstamo", fechaCorta(cl.fechaInicio))}
      ${stat("Tiempo del préstamo", textoHace(diasDesdeISO(cl.fechaInicio)) || "—")}
      ${stat("Monto prestado", cop(cl.montoPrestado))}
      ${stat("Total a pagar", cop(cl.calc.totalPagar))}
      ${stat("Valor de cuota", cop(cl.valorCuota), C.green)}
      ${stat("Número de cuotas", cl.numeroCuotas)}
      ${stat("Cuotas pendientes", cl.calc.cuotasPendientes, cl.calc.cuotasPendientes > 0 ? C.gold : C.green)}
      ${stat("Interés por período", cop(cl.interes), C.gold)}
    </div>
    ${cl.telefono ? `<div style="margin-top:14px;font-size:12.5px;color:${C.muted};">📞 ${esc(cl.telefono)}</div>` : ""}
    <div style="margin-top:16px;padding-top:16px;border-top:1px solid ${C.border};">
      ${!ui.editPrestamo
        ? `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <button onclick="toggleEditPrestamo()" style="background:${C.greenSoft};color:${C.green};border:none;border-radius:999px;padding:8px 14px;font-weight:700;font-size:12.5px;font-family:inherit;cursor:pointer;">Editar datos del préstamo</button>
            <button onclick="abrirEstadoCuenta('${cl.id}')" style="background:${C.surface2};color:${C.text};border:none;border-radius:999px;padding:8px 14px;font-weight:700;font-size:12.5px;font-family:inherit;cursor:pointer;">🧾 Estado de cuenta</button>
            ${(cl.calc.cuotasPendientes > 0 && cl.calc.capitalAdeudado > 0) ? `<button onclick="cobrarWhatsApp('${cl.id}')" style="background:#E3F8EA;color:#1DA851;border:none;border-radius:999px;padding:8px 14px;font-weight:700;font-size:12.5px;font-family:inherit;cursor:pointer;">💬 Cobrar por WhatsApp</button>` : ""}
            ${(cl.calc.cuotasPendientes === 0 || cl.calc.capitalAdeudado <= 0) ? `<button onclick="cancelarCliente('${cl.id}')" style="background:${C.greenSoft};color:${C.green};border:none;border-radius:999px;padding:8px 14px;font-weight:700;font-size:12.5px;font-family:inherit;cursor:pointer;">✓ Marcar como cancelado</button>` : ""}
          </div>`
        : `<div style="display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;align-items:center;gap:10px;"><span style="font-size:12px;color:${C.muted};width:108px;flex-shrink:0;line-height:1.25;">Nombre</span>${inputHtml("f-p-nombre", "", 'value="' + esc(cl.nombre) + '"')}</div>
            <div style="display:flex;align-items:center;gap:10px;"><span style="font-size:12px;color:${C.muted};width:108px;flex-shrink:0;line-height:1.25;">WhatsApp</span>${inputHtml("f-p-tel", "Ej. 3104721041", 'inputmode="tel" value="' + esc(cl.telefono || "") + '"')}</div>
            <div style="display:flex;align-items:center;gap:10px;"><span style="font-size:12px;color:${C.muted};width:108px;flex-shrink:0;line-height:1.25;">Fecha del préstamo</span>${inputHtml("f-p-fecha", "", 'type="date" value="' + (cl.fechaInicio || "") + '"')}</div>
            <div style="display:flex;align-items:center;gap:10px;"><span style="font-size:12px;color:${C.muted};width:108px;flex-shrink:0;line-height:1.25;">Monto prestado</span>${inputHtml("f-p-monto", "", 'inputmode="numeric" value="' + cl.montoPrestado + '"')}</div>
            <div style="display:flex;align-items:center;gap:10px;"><span style="font-size:12px;color:${C.muted};width:108px;flex-shrink:0;line-height:1.25;">Valor cuota (capital)</span>${inputHtml("f-p-cuota", "", 'inputmode="numeric" value="' + cl.valorCuota + '"')}</div>
            <div style="display:flex;align-items:center;gap:10px;"><span style="font-size:12px;color:${C.muted};width:108px;flex-shrink:0;line-height:1.25;">Interés por período</span>${inputHtml("f-p-interes", "", 'inputmode="numeric" value="' + cl.interes + '"')}</div>
            <div style="display:flex;align-items:center;gap:10px;"><span style="font-size:12px;color:${C.muted};width:108px;flex-shrink:0;line-height:1.25;">Tasa interés %</span>${inputHtml("f-p-tasa", "", 'inputmode="decimal" value="' + cl.tasaInteres + '"')}</div>
            <div style="display:flex;align-items:center;gap:10px;"><span style="font-size:12px;color:${C.muted};width:108px;flex-shrink:0;line-height:1.25;">Periodo de pago</span>${inputHtml("f-p-periodo", "", 'value="' + esc(cl.periodoPago) + '"')}</div>
            <div style="display:flex;align-items:center;gap:10px;"><span style="font-size:12px;color:${C.muted};width:108px;flex-shrink:0;line-height:1.25;">N° de cuotas</span>${inputHtml("f-p-ncuotas", "", 'inputmode="numeric" value="' + cl.numeroCuotas + '"')}</div>
            <div style="display:flex;align-items:center;gap:10px;"><span style="font-size:12px;color:${C.muted};width:108px;flex-shrink:0;line-height:1.25;">Próxima fecha pago</span>${inputHtml("f-p-proxima", "", 'type="date" value="' + cl.proximaFechaPago + '"')}</div>
            ${(() => { const mv = state.movimientos.find((x) => x.id === cl.movId); return mv ? `<div style="display:flex;align-items:center;gap:10px;"><span style="font-size:12px;color:${C.muted};width:108px;flex-shrink:0;line-height:1.25;">Salió por</span>${selectMedioPago("f-p-medio", mv.medioPago || "efectivo")}</div>` : ""; })()}
            <button onclick="savePrestamo()" style="background:${C.greenSoft};color:${C.green};border:none;border-radius:999px;padding:8px 14px;font-weight:700;font-size:12.5px;font-family:inherit;cursor:pointer;align-self:flex-start;">Listo</button>
          </div>`}
    </div>`, "margin-bottom:20px;");

  // Capital — calendario de cuotas: una fila por cuota con su fecha de
  // vencimiento y su estado (pagada / parcial / vencida / pendiente).
  // Los pagos se reparten solos, empezando por la cuota más antigua.
  const cal = calendarioCuotas(cl);
  html += `${seccion("Cuotas del préstamo")}
    <div style="background:${C.surface};border-radius:18px;overflow:hidden;margin-bottom:14px;">
    <div style="display:grid;grid-template-columns:.45fr .8fr .9fr 1.5fr;padding:11px 12px;font-size:12px;font-weight:600;color:${C.muted};border-bottom:1px solid ${C.border};">
      <div>Cuota</div><div>Vence</div><div>Pagado</div><div>Estado</div></div>`;
  cal.mezcla.forEach((f) => {
    if (f.tipo === "int") {
      html += `<div style="display:grid;grid-template-columns:.45fr .8fr .9fr 1.5fr;padding:11px 12px;font-size:12.5px;border-bottom:1px solid ${C.surface2};align-items:center;">
      <div style="color:${C.goldText};font-weight:700;">Int.</div>
      <div>${dm(f.fecha)}</div>
      <div style="font-variant-numeric:tabular-nums;color:${C.goldText};">${f.interes ? cop(f.interes) : "$ -"}</div>
      <div style="color:${C.goldText};font-weight:700;">Interés pagado</div>
    </div>`;
      return;
    }
    let estado, col;
    if (f.completa) { estado = "Pagada"; col = C.green; }
    else if (f.parcial) { estado = `Parcial · falta ${cop(f.saldo)}` + (f.vencida ? ` · ${f.diasAtraso} d` : ""); col = f.vencida ? C.red : C.goldText; }
    else if (f.vencida) { estado = `Vencida · ${f.diasAtraso} d`; col = C.red; }
    else { estado = "Pendiente"; col = C.muted; }
    html += `<div style="display:grid;grid-template-columns:.45fr .8fr .9fr 1.5fr;padding:11px 12px;font-size:12.5px;border-bottom:1px solid ${C.surface2};align-items:center;">
      <div style="color:${C.muted};font-weight:700;">${f.n}</div>
      <div>${dm(f.fecha)}</div>
      <div style="font-variant-numeric:tabular-nums;color:${f.abono ? C.green : C.muted};">${f.abono ? cop(f.abono) : "$ -"}</div>
      <div style="color:${col};font-weight:${f.completa ? 500 : 700};">${estado}</div>
    </div>`;
  });
  if (!cal.filas.length) html += `<div style="padding:12px;font-size:13px;color:${C.muted};">Pon la fecha del préstamo para ver las cuotas.</div>`;
  if (cal.aFavor > 0) html += `<div style="padding:11px 12px;font-size:12.5px;color:${C.goldText};font-weight:700;">A favor (pagado de más): ${cop(cal.aFavor)}</div>`;
  const capAbonado = cl.cuotasCapital.reduce((t, x) => t + x.monto, 0);
  html += `<div style="display:flex;gap:12px;padding:11px 12px;font-size:12.5px;color:${C.muted};">
    <div style="flex:1;">Capital abonado: <b style="color:${C.green};">${cop(capAbonado)}</b></div>
    <div style="flex:1;">Falta por pagar: <b style="color:${C.text};">${cop(Math.max(cl.calc.capitalAdeudado, 0))}</b></div>
  </div>`;
  html += `</div>`;

  if (!ui.showAddPagoCap) {
    html += ghostBtn("+ Registrar pago a capital", "toggleAddPagoCap()");
  } else {
    const sig = cal.filas.find((f) => !f.completa);
    const pend = cal.filas.filter((f) => !f.completa && (f.vencida || f === sig));
    const sugerido = sig ? sig.saldo : 0;
    html += card(`<div style="display:flex;flex-direction:column;gap:10px;">
      ${pend.length ? `<div style="background:${C.surface2};border-radius:12px;padding:10px 12px;font-size:12.5px;">
        <div style="font-weight:700;margin-bottom:4px;">Cuotas pendientes</div>
        ${pend.map((f) => `<div style="display:flex;justify-content:space-between;gap:8px;color:${f.vencida ? C.red : C.text};"><span>${dm(f.fecha)} · ${f.vencida ? "vencida " + f.diasAtraso + " d" : "próxima"}</span><b>${cop(f.saldo)}</b></div>`).join("")}
      </div>` : ""}
      <div><div style="font-size:12px;font-weight:600;color:${C.muted};margin-bottom:4px;">Fecha en que paga</div>${inputHtml("f-pc-fecha", "", 'type="date" value="' + hoyISO() + '"')}</div>
      <div style="display:flex;gap:10px;">
        ${campoEdit("En efectivo", inputHtml("f-pc-efe", "0", 'inputmode="numeric" oninput="actualizarVistaPago()" value="' + (sugerido || "") + '"'))}
        ${campoEdit("Transferencia", inputHtml("f-pc-tra", "0", 'inputmode="numeric" oninput="actualizarVistaPago()"'))}
      </div>
      <div id="pc-preview" style="background:${C.greenSoft};border-radius:12px;padding:10px 12px;">${vistaPagoHtml(cl, sugerido, 0)}</div>
      <div style="display:flex;gap:8px;">${primaryBtn("Guardar", "submitPagoCap()")}${ghostBtn("Cancelar", "toggleAddPagoCap()", false)}</div>
    </div>`);
  }

  // Historial de pagos a capital (un pago puede tener efectivo + transferencia)
  const grupos = [];
  [...cl.cuotasCapital].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0)).forEach((p) => {
    const gk = p.grupoId || p.id;
    let g = grupos.find((x) => x.gk === gk);
    if (!g) { g = { gk, fecha: p.fecha, partes: [] }; grupos.push(g); }
    g.partes.push(p);
  });
  html += `${seccion("Pagos registrados a capital", null, "margin-top:22px;")}
    <div style="background:${C.surface};border-radius:18px;overflow:hidden;margin-bottom:14px;">`;
  if (!grupos.length) html += `<div style="padding:12px 14px;font-size:13px;color:${C.muted};">Sin pagos registrados.</div>`;
  grupos.forEach((g) => {
    const total = g.partes.reduce((s, p) => s + p.monto, 0);
    if (ui.editPagoCapId === g.gk) {
      html += `<div style="padding:10px;border-bottom:1px solid ${C.surface2};background:${C.surface2};">
        <div style="display:flex;flex-direction:column;gap:8px;">
          ${campoEdit("Fecha en que pagó", inputHtml("f-epc-fecha-" + g.gk, "", 'type="date" value="' + g.fecha + '"'))}
          ${g.partes.map((p) => `<div style="display:flex;gap:8px;">${campoEdit("Monto", inputHtml("f-epc-monto-" + p.id, "Monto", 'inputmode="numeric" value="' + p.monto + '"'))}${campoEdit("Pagó por", selectMedioPago("f-epc-medio-" + p.id, p.medioPago || "efectivo"))}</div>`).join("")}
          <div style="display:flex;gap:8px;">${primaryBtn("Guardar", "savePagoCap('" + cl.id + "','" + g.gk + "')")}${ghostBtn("Cancelar", "toggleEditPagoCap('" + g.gk + "')", false)}</div>
        </div>
      </div>`;
    } else {
      const detalle = g.partes[0].detalle;
      const ajustes = g.partes.flatMap((p) => p.ajustes || []);
      const ult = ajustes.length ? ajustes[ajustes.length - 1] : null;
      html += `<div style="display:grid;grid-template-columns:1fr 22px 22px;padding:11px 12px;border-bottom:1px solid ${C.surface2};align-items:center;gap:4px;">
        <div style="min-width:0;">
          <div style="font-size:13px;"><b>${fechaCorta(g.fecha)}</b> · <span style="color:${C.green};font-weight:700;font-variant-numeric:tabular-nums;">${cop(total)}</span></div>
          <div style="font-size:12px;color:${C.muted};margin-top:2px;">${g.partes.map((p) => cop(p.monto) + " " + medioTexto(p.medioPago).toLowerCase()).join(" + ")}${detalle ? " · " + esc(detalle) : ""}</div>
          ${ult ? `<div style="font-size:11px;color:${C.goldText};margin-top:2px;">Corregido el ${fechaCorta(ult.cuando)} (${esc(ult.texto)})</div>` : ""}
        </div>
        <button onclick="toggleEditPagoCap('${g.gk}')" style="background:none;border:none;color:${C.gold};cursor:pointer;font-size:13px;">✎</button>
        <button onclick="removePagoCap('${cl.id}','${g.gk}')" style="background:none;border:none;color:${C.muted};cursor:pointer;font-size:15px;">×</button>
      </div>`;
    }
  });
  html += `</div>`;

  // Interes
  // Intereses de mora automáticos (fechas extra después de la última cuota)
  const mora = interesesMora(cl);
  const fechasPagadas = new Set(cl.cuotasInteres.map((p) => p.fecha));
  const moraPendiente = mora.filter((x) => !fechasPagadas.has(x.fecha));

  html += `${seccion("Pagos de interés", null, "margin-top:22px;")}
    <div style="background:${C.surface};border-radius:18px;overflow:hidden;margin-bottom:14px;">
    <div style="display:grid;grid-template-columns:1fr 1fr 22px 22px;padding:11px 14px;font-size:12px;font-weight:600;color:${C.muted};border-bottom:1px solid ${C.border};">
      <div>Fecha</div><div>Monto</div><div></div><div></div></div>`;
  if (!cl.cuotasInteres.length && !moraPendiente.length) html += `<div style="padding:12px 14px;font-size:13px;color:${C.muted};">Sin pagos registrados.</div>`;
  // Mostrar intereses de mora pendientes
  moraPendiente.forEach((x) => {
    html += `<div style="display:grid;grid-template-columns:1fr 1fr 22px 22px;padding:11px 14px;font-size:13.5px;border-bottom:1px solid ${C.surface2};align-items:center;">
      <div>${fechaCorta(x.fecha)}</div>
      <div style="font-variant-numeric:tabular-nums;color:${C.red};">${cop(x.monto)}<div style="font-size:11px;color:${C.red};font-weight:600;opacity:.8;">⏳ Pendiente</div></div>
      <div></div>
      <button onclick="registrarMora('${cl.id}','${x.fecha}',${x.monto})" title="Registrar como pagado" style="background:none;border:none;color:${C.green};cursor:pointer;font-size:15px;">✓</button>
    </div>`;
  });
  cl.cuotasInteres.forEach((p) => {
    if (ui.editPagoIntId === p.id) {
      html += `<div style="padding:10px 14px;border-bottom:1px solid ${C.surface2};background:${C.surface2};">
        <div style="display:flex;flex-direction:column;gap:8px;">
          <div style="display:flex;gap:8px;">${inputHtml("f-epi-fecha-" + p.id, "", 'type="date" value="' + p.fecha + '"')}${inputHtml("f-epi-monto-" + p.id, "Monto", 'inputmode="numeric" value="' + p.monto + '"')}</div>
          ${p.refCuota && !p.periodo ? "" : campoEdit("Período que cubre", inputHtml("f-epi-periodo-" + p.id, "", 'type="date" value="' + (p.periodo || "") + '"'))}
          ${selectMedioPago("f-epi-medio-" + p.id, p.medioPago || "efectivo")}
          <div style="display:flex;gap:8px;">${primaryBtn("Guardar", "savePagoInt('" + cl.id + "','" + p.id + "')")}${ghostBtn("Cancelar", "toggleEditPagoInt('" + p.id + "')", false)}</div>
        </div>
      </div>`;
    } else {
      const refTag = p.periodo ? `<div style="font-size:11px;color:${C.goldText};font-weight:600;margin-top:2px;">Cubre el período del ${dm(p.periodo)}</div>`
        : (p.refCuota ? `<div style="font-size:11px;color:${C.goldText};font-weight:600;margin-top:2px;">Cubre el período del ${dm(p.refCuota.fecha)}</div>` : "");
      html += `<div style="display:grid;grid-template-columns:1fr 1fr 22px 22px;padding:11px 14px;font-size:13.5px;border-bottom:1px solid ${C.surface2};align-items:center;">
        <div>${fechaCorta(p.fecha)}</div>
        <div style="font-variant-numeric:tabular-nums;color:${C.goldText};">${cop(p.monto)}<div style="font-size:11px;color:${C.muted};font-weight:400;">${medioTexto(p.medioPago)}${p.ajustes && p.ajustes.length ? " · corregido" : ""}</div>${refTag}</div>
        <button onclick="toggleEditPagoInt('${p.id}')" style="background:none;border:none;color:${C.goldText};cursor:pointer;font-size:13px;">✎</button>
        <button onclick="removePagoInt('${cl.id}','${p.id}')" style="background:none;border:none;color:${C.muted};cursor:pointer;font-size:15px;">×</button>
      </div>`;
    }
  });
  if (cl.cuotasInteres.length) html += `<div style="padding:11px 14px;font-size:12.5px;color:${C.muted};">Interés pagado en total: <b style="color:${C.goldText};">${cop(cl.cuotasInteres.reduce((t, x) => t + x.monto, 0))}</b></div>`;
  html += `</div>`;
  if (!ui.showAddPagoInt) {
    html += ghostBtn("+ Registrar pago de interés", "toggleAddPagoInt()");
  } else {
    html += card(`<div style="display:flex;flex-direction:column;gap:10px;">
      <div style="display:flex;gap:10px;">${inputHtml("f-pi-fecha", "", 'type="date" value="' + hoyISO() + '"')}${inputHtml("f-pi-monto", "Monto", 'inputmode="numeric"')}</div>
      <div><div style="font-size:12px;font-weight:600;color:${C.muted};margin-bottom:4px;">¿Qué período cubre este interés?</div>${inputHtml("f-pi-periodo", "", 'type="date" value="' + ((cal.filas.find((f) => !f.completa) || {}).fecha || "") + '"')}</div>
      ${selectMedioPago("f-pi-medio", "efectivo")}
      <div style="display:flex;gap:8px;">${primaryBtn("Guardar", "submitPagoInt()")}${ghostBtn("Cancelar", "toggleAddPagoInt()", false)}</div>
    </div>`);
  }

  return html;
}

// ---------- Fechas para el filtro de la Caja ----------
function fechaISODe(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function hoyMasDias(n) { const d = new Date(); d.setDate(d.getDate() + n); return fechaISODe(d); }
function inicioMesActual() { const d = new Date(); return fechaISODe(new Date(d.getFullYear(), d.getMonth(), 1)); }
function finMesActual() { const d = new Date(); return fechaISODe(new Date(d.getFullYear(), d.getMonth() + 1, 0)); }
function finMesAnterior() { const d = new Date(); return fechaISODe(new Date(d.getFullYear(), d.getMonth(), 0)); }
function setCajaRango(desde, hasta) { ui.cajaDesde = desde || ""; ui.cajaHasta = hasta || ""; render(); }
function cajaPreset(k) {
  if (k === "hoy") setCajaRango(hoyISO(), hoyISO());
  else if (k === "ayer") setCajaRango(hoyMasDias(-1), hoyMasDias(-1));
  else if (k === "mes") setCajaRango(inicioMesActual(), finMesActual());
  else setCajaRango("", "");
}
// Si el usuario no ha elegido nada, la Caja abre mostrando solo el día de hoy (Desde = Hasta = hoy).
// "Todo" guarda fechas vacías a propósito, por eso se distingue "sin elegir" (undefined) de "vacío".
function rangoCaja() {
  if (ui.cajaDesde === undefined && ui.cajaHasta === undefined) return { desde: hoyISO(), hasta: hoyISO() };
  return { desde: ui.cajaDesde || "", hasta: ui.cajaHasta || "" };
}
function cambiarCajaFecha(cual, val) {
  const r = rangoCaja();
  let d = r.desde, h = r.hasta;
  if (cual === "desde") { d = val || ""; if (val && h && val > h) h = val; }
  else { h = val || ""; if (val && d && val < d) d = val; }
  ui.cajaDesde = d; ui.cajaHasta = h;
  render();
}

function renderCaja() {
  const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase();
  const movs = state.movimientos.slice().sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  let saldo = 0;
  const filas = movs.map((m) => { saldo += m.ingreso - m.gasto; return { ...m, saldo }; });
  const saldoTotal = filas.length ? filas[filas.length - 1].saldo : 0;

  // Filtro por fechas (Desde / Hasta). Vacío = se ve todo.
  const { desde, hasta } = rangoCaja();
  const hayRango = !!(desde || hasta);
  const esHoy = desde === hoyISO() && hasta === hoyISO();
  const filasMostradas = filas.filter((m) => (!desde || m.fecha >= desde) && (!hasta || m.fecha <= hasta));

  let saldoInicial = 0;
  if (desde) {
    const antes = filas.filter((m) => m.fecha < desde);
    saldoInicial = antes.length ? antes[antes.length - 1].saldo : 0;
  }
  // Los "Saldo de cierre" (resumen de meses viejos) no cuentan como ingresos ni gastos del período.
  const reales = filasMostradas.filter((m) => !m.cierre);
  const ingresosPeriodo = reales.reduce((s, m) => s + m.ingreso, 0);
  const gastosPeriodo = reales.reduce((s, m) => s + m.gasto, 0);
  const saldoFinalPeriodo = filasMostradas.length ? filasMostradas[filasMostradas.length - 1].saldo : saldoInicial;
  // Saldo por medio de pago: se calcula sobre TODOS los movimientos (no
  // solo el período filtrado), porque representa cuánto tienes en mano
  // ahora mismo en efectivo vs. en la cuenta bancaria.
  const saldoEfectivo = filas.reduce((s, m) => s + ((m.medioPago || "efectivo") === "efectivo" ? m.ingreso - m.gasto : 0), 0);
  const saldoTransferencia = filas.reduce((s, m) => s + ((m.medioPago || "efectivo") === "transferencia" ? m.ingreso - m.gasto : 0), 0);

  // --- Saldo grande ---
  const textoRango = `${desde ? fechaMuyCorta(desde) : "el inicio"} al ${hasta ? fechaMuyCorta(hasta) : "hoy"}`;
  let html = card(`<div style="font-size:13px;font-weight:600;color:${C.muted};">Saldo actual (total)</div>
    <div style="font-size:30px;font-weight:700;margin-top:2px;color:${saldoTotal >= 0 ? C.green : C.red};font-variant-numeric:tabular-nums;">${cop(saldoTotal)}</div>
    ${hayRango ? `<div style="font-size:12px;color:${C.muted};margin-top:6px;">Del ${esc(textoRango)}: empezó con ${cop(saldoInicial)} y cerró con ${cop(saldoFinalPeriodo)}</div>` : ""}`,
    "margin-bottom:14px;border-radius:24px;padding:20px;");

  // --- Filtro por fechas: botones rápidos + Desde / Hasta ---
  const hoy = hoyISO();
  const activo = {
    hoy: desde === hoy && hasta === hoy,
    ayer: desde === hoyMasDias(-1) && hasta === hoyMasDias(-1),
    mes: desde === inicioMesActual() && hasta === finMesActual(),
    todo: !hayRango,
  };
  html += `<div style="display:flex;gap:8px;overflow-x:auto;margin-bottom:12px;padding-bottom:2px;">
    <button onclick="cajaPreset('hoy')" style="${chipEstilo(activo.hoy)}">Hoy</button>
    <button onclick="cajaPreset('ayer')" style="${chipEstilo(activo.ayer)}">Ayer</button>
    <button onclick="cajaPreset('mes')" style="${chipEstilo(activo.mes)}">Este mes</button>
    <button onclick="cajaPreset('todo')" style="${chipEstilo(activo.todo)}">Todo</button>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
    <div><div style="font-size:12.5px;font-weight:600;color:${C.dMuted};margin-bottom:5px;">Desde</div>${inputHtml("f-caja-desde", "", 'type="date" value="' + desde + '" onchange="cambiarCajaFecha(\'desde\', this.value)"')}</div>
    <div><div style="font-size:12.5px;font-weight:600;color:${C.dMuted};margin-bottom:5px;">Hasta</div>${inputHtml("f-caja-hasta", "", 'type="date" value="' + hasta + '" onchange="cambiarCajaFecha(\'hasta\', this.value)"')}</div>
  </div>`;

  // --- Ingresos y gastos del período ---
  const sufijo = esHoy ? "de hoy" : hayRango ? "del período" : "(total)";
  const mini = (label, valor, color, icono) => `<div style="background:${C.surface};border-radius:18px;padding:14px;min-width:0;display:flex;flex-direction:column;justify-content:space-between;gap:6px;">
    <div style="display:flex;align-items:center;gap:8px;">${icono || ""}<div style="font-size:12px;font-weight:600;color:${C.muted};">${label}</div></div>
    <div style="font-size:17px;font-weight:700;color:${color};font-variant-numeric:tabular-nums;overflow-wrap:anywhere;">${valor}</div></div>`;
  html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
    ${mini("Ingresos " + sufijo, cop(ingresosPeriodo), C.green)}
    ${mini("Gastos " + sufijo, cop(gastosPeriodo), C.red)}
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px;">
    ${mini("Efectivo (total)", cop(saldoEfectivo), C.text, ico("wallet", 18, C.green))}
    ${mini("Transferencias (total)", cop(saldoTransferencia), C.text, ico("moneda", 18, C.goldText))}
  </div>`;

  // --- Resumen: el período elegido o, si se ve todo, el mes actual ---
  const mesActual = hoyISO().slice(0, 7);
  const movMes = hayRango ? filasMostradas : filas.filter((m) => m.fecha.slice(0, 7) === mesActual);
  const prestadoMes = movMes.filter((m) => norm(m.concepto) === "PRESTAMO").reduce((s, m) => s + m.gasto, 0);
  const cobradoMes = movMes.filter((m) => norm(m.concepto) === "PAGARON" || norm(m.concepto) === "INTERESES").reduce((s, m) => s + m.ingreso, 0);
  const nuevosMes = state.clientes.filter((c) => hayRango ? ((!desde || (c.fechaInicio || "") >= desde) && (!hasta || (c.fechaInicio || "") <= hasta)) : (c.fechaInicio || "").slice(0, 7) === mesActual).length;
  const pagosMes = movMes.filter((m) => norm(m.concepto) === "PAGARON" || norm(m.concepto) === "INTERESES").length;
  html += card(`<div style="font-size:14px;font-weight:700;margin-bottom:14px;">${esHoy ? "Resumen de hoy" : hayRango ? "Resumen del período" : "Resumen de " + esc(mesLabel(mesActual))}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px 14px;">
        ${stat("Prestado", cop(prestadoMes), C.red)}
        ${stat("Cobrado", cop(cobradoMes), C.green)}
        ${stat("Préstamos nuevos", nuevosMes)}
        ${stat("Pagos recibidos", pagosMes)}
      </div>
      <div style="margin-top:14px;font-size:12.5px;color:${C.muted};">Cobrado − prestado: <b style="color:${cobradoMes - prestadoMes >= 0 ? C.green : C.red};">${cop(cobradoMes - prestadoMes)}</b></div>`,
    "margin-bottom:14px;");

  // --- Botones Ingreso / Gasto ---
  const btnMov = (tipo, texto, fg, bg) => `<button onclick="nuevoMov('${tipo}')" style="background:${bg};color:${fg};border:none;border-radius:999px;padding:12px;font-weight:700;font-size:15px;font-family:inherit;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;">${ico("mas", 17)} ${texto}</button>`;
  html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
    ${btnMov("ingreso", "Ingreso", C.green, "#E4F1E8")}
    ${btnMov("gasto", "Gasto", C.red, C.redSoft)}
  </div>`;

  html += `<button onclick="toggleCierre()" style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;background:${C.gold};color:${C.bg};border:none;border-radius:999px;padding:13px;font-weight:700;font-size:15px;font-family:inherit;cursor:pointer;margin:-4px 0 16px;">${ico("candado", 18)} Cierre de caja</button>`;

  if (ui.showCierre) {
    const cf = ui.cierreFecha || finMesAnterior();
    const aBorrar = filas.filter((m) => m.fecha <= cf);
    const netoMedio = (medio) => aBorrar.filter((m) => (m.medioPago || "efectivo") === medio).reduce((s, m) => s + m.ingreso - m.gasto, 0);
    html += card(`<div style="font-size:15px;font-weight:700;margin-bottom:6px;">Cierre de caja</div>
      <div style="font-size:12.5px;color:${C.muted};margin-bottom:12px;">Borra los movimientos viejos para que la Caja no se llene. <b>Tu saldo no cambia</b>: todo lo anterior queda resumido en un solo movimiento de “Saldo de cierre”.</div>
      <div style="font-size:12.5px;font-weight:600;color:${C.muted};margin-bottom:5px;">Borrar movimientos hasta (incluye ese día)</div>
      ${inputHtml("f-cierre-fecha", "", 'type="date" max="' + hoyISO() + '" value="' + cf + '" onchange="setCierreFecha(this.value)"')}
      <div style="background:${C.surface2};border-radius:14px;padding:12px;margin:12px 0;font-size:13px;line-height:1.5;">
        ${aBorrar.length
          ? `Se borrarán <b>${aBorrar.length}</b> movimiento${aBorrar.length === 1 ? "" : "s"}.<br>Quedará un saldo de cierre de <b>${cop(netoMedio("efectivo"))}</b> en efectivo y <b>${cop(netoMedio("transferencia"))}</b> en transferencias.<br>Tu saldo total sigue en <b style="color:${saldoTotal >= 0 ? C.green : C.red};">${cop(saldoTotal)}</b>.`
          : `No hay movimientos hasta esa fecha.`}
      </div>
      <label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-bottom:14px;cursor:pointer;"><input type="checkbox" ${ui.cierreBackup !== false ? "checked" : ""} onchange="setCierreBackup(this.checked)" style="width:18px;height:18px;accent-color:${C.green};" /> Descargar una copia de seguridad antes de borrar</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">${primaryBtn("Hacer cierre", "hacerCierre()")}${ghostBtn("Cancelar", "toggleCierre()", false)}</div>`, "margin-bottom:16px;");
  }

  if (ui.showAddMov) {
    const esIng = ui.movTipo !== "gasto";
    html += card(`<div style="font-size:15px;font-weight:700;margin-bottom:12px;color:${esIng ? C.green : C.red};">${esIng ? "Nuevo ingreso" : "Nuevo gasto"}</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
      <div style="display:flex;gap:10px;">${inputHtml("f-mov-fecha", "", 'type="date" value="' + hoyISO() + '"')}${inputHtml("f-mov-monto", "Monto", 'inputmode="numeric"')}</div>
      ${inputHtml("f-mov-concepto", esIng ? "Concepto (Pagaron, Intereses…)" : "Concepto (Préstamo, Inversión…)")}
      ${selectMedioPago("f-mov-medio", "efectivo")}
      ${inputHtml("f-mov-obs", "Observaciones (opcional)")}
      <div style="display:flex;gap:8px;">${primaryBtn("Guardar", "submitAddMov()")}${ghostBtn("Cancelar", "toggleAddMov()", false)}</div>
    </div>`, "margin-bottom:16px;");
  }

  // --- Lista de movimientos (lo más reciente arriba) ---
  html += `<div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:10px;gap:8px;">
    <span style="font-size:14px;font-weight:700;color:${C.dText};">Movimientos (${filasMostradas.length})</span>
    <span style="font-size:12px;color:${C.dMuted};">Toca uno para editar</span></div>`;
  if (!filasMostradas.length) html += `<div style="font-size:13px;color:${C.dMuted};">Sin movimientos en este período.</div>`;
  html += `<div style="display:flex;flex-direction:column;gap:8px;">`;
  [...filasMostradas].reverse().forEach((m) => {
    if (ui.editMovId === m.id) {
      html += card(`<div style="display:flex;flex-direction:column;gap:8px;">
          <div style="display:flex;gap:8px;">${campoEdit("Fecha", inputHtml("f-emov-fecha-" + m.id, "", 'type="date" value="' + m.fecha + '"'))}${campoEdit("Concepto", inputHtml("f-emov-concepto-" + m.id, "Concepto", 'value="' + esc(m.concepto) + '"'))}</div>
          <div style="display:flex;gap:8px;">${campoEdit("Gasto", inputHtml("f-emov-gasto-" + m.id, "Gasto", 'inputmode="numeric" value="' + (m.gasto || "") + '"'))}${campoEdit("Ingreso", inputHtml("f-emov-ingreso-" + m.id, "Ingreso", 'inputmode="numeric" value="' + (m.ingreso || "") + '"'))}</div>
          ${campoEdit("Pagado por", selectMedioPago("f-emov-medio-" + m.id, m.medioPago || "efectivo"))}
          ${campoEdit("Observaciones", inputHtml("f-emov-obs-" + m.id, "Observaciones", 'value="' + esc(m.obs || "") + '"'))}
          <div style="display:flex;gap:8px;flex-wrap:wrap;">${primaryBtn("Guardar", "saveMov('" + m.id + "')")}${ghostBtn("Cancelar", "toggleEditMov('" + m.id + "')", false)}
            <button onclick="removeMovimiento('${m.id}')" style="background:${C.redSoft};color:${C.red};border:none;border-radius:999px;padding:11px 20px;font-weight:700;font-size:14px;font-family:inherit;cursor:pointer;">Eliminar</button></div>
        </div>`, "padding:14px;");
    } else {
      const neto = m.ingreso - m.gasto;
      const esIng = neto >= 0;
      const col = m.cierre ? C.goldText : esIng ? C.green : C.red;
      html += `<button onclick="toggleEditMov('${m.id}')" style="width:100%;text-align:left;border:none;background:${C.surface};border-left:4px solid ${col};border-radius:16px;padding:12px;display:flex;align-items:center;gap:10px;cursor:pointer;font-family:inherit;color:${C.text};">
        <span style="width:32px;height:32px;border-radius:50%;background:${m.cierre ? "#FBF3E1" : esIng ? C.greenSoft : C.redSoft};display:flex;align-items:center;justify-content:center;flex-shrink:0;">${ico(m.cierre ? "candado" : esIng ? "sube" : "baja", 16, col)}</span>
        <span style="flex:1;min-width:0;">
          <span style="display:block;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(conceptoBonito(m.concepto))}${m.obs ? `<span style="font-weight:400;color:${C.muted};"> · ${esc(["PRESTAMO", "PAGARON", "INTERESES"].includes(norm(m.concepto)) ? nombreBonito(m.obs) : capital(m.obs))}</span>` : ""}</span>
          <span style="display:block;font-size:12px;color:${C.muted};margin-top:2px;">${fechaCorta(m.fecha)} · ${medioTexto(m.medioPago)}${m.detalle ? " · " + esc(m.detalle) : ""}</span>
        </span>
        <span style="text-align:right;flex-shrink:0;">
          <span style="display:block;font-size:15px;font-weight:700;color:${col};font-variant-numeric:tabular-nums;white-space:nowrap;">${esIng ? "+" : "−"}${cop(Math.abs(neto))}</span>
          <span style="display:block;font-size:11px;color:${C.muted};margin-top:2px;font-variant-numeric:tabular-nums;">Saldo ${cop(m.saldo)}</span>
        </span>
      </button>`;
    }
  });
  html += `</div>`;
  return html;
}

function toggleCierre() { ui.showCierre = !ui.showCierre; ui.cierreFecha = ""; render(); }
function setCierreFecha(v) { ui.cierreFecha = v || ""; render(); }
function setCierreBackup(v) { ui.cierreBackup = !!v; }
function hacerCierre() {
  const cf = ui.cierreFecha || finMesAnterior();
  const aBorrar = state.movimientos.filter((m) => m.fecha <= cf);
  if (!aBorrar.length) { alert("No hay movimientos hasta esa fecha."); return; }
  const neto = (medio) => aBorrar.filter((m) => (m.medioPago || "efectivo") === medio).reduce((s, m) => s + m.ingreso - m.gasto, 0);
  const saldoAntes = state.movimientos.reduce((s, m) => s + m.ingreso - m.gasto, 0);
  if (!confirm(`Se borrarán ${aBorrar.length} movimientos hasta el ${fechaCorta(cf)}. Tu saldo seguirá siendo ${cop(saldoAntes)}. ¿Hacer el cierre?`)) return;
  if (ui.cierreBackup !== false) exportData();
  const ids = new Set(aBorrar.map((m) => m.id));
  const nuevos = [];
  ["efectivo", "transferencia"].forEach((medio) => {
    const n = neto(medio);
    if (n !== 0) nuevos.push({ id: uid(), fecha: cf, concepto: "Saldo de cierre", ingreso: n > 0 ? n : 0, gasto: n < 0 ? -n : 0, obs: "Hasta " + fechaCorta(cf), medioPago: medio, cierre: true });
  });
  state.movimientos = [...nuevos, ...state.movimientos.filter((m) => !ids.has(m.id))];
  ui.showCierre = false; ui.editMovId = null;
  guardarPapelera("cierre", { borrados: aBorrar, nuevosIds: nuevos.map((n) => n.id) }, `Cierre hecho: ${aBorrar.length} movimientos resumidos.`);
  save(); render();
}

function campoEdit(titulo, html) {
  return `<div style="flex:1;min-width:0;"><div style="font-size:12px;font-weight:600;color:${C.muted};margin-bottom:4px;">${titulo}</div>${html}</div>`;
}

function nuevoMov(tipo) {
  ui.movTipo = tipo;
  ui.showAddMov = true;
  render();
  const el = document.getElementById("f-mov-monto");
  if (el) { el.focus(); el.scrollIntoView({ block: "center" }); }
}

function render() {
  // Como toda la pantalla se repinta con innerHTML, si el usuario está
  // escribiendo en un input (ej. el buscador) hay que devolverle el foco
  // y la posición del cursor después de repintar, o parecería que la
  // app "se traba" tras cada letra.
  const activo = document.activeElement;
  const activoId = activo && activo.id;
  const activoSel = activo && typeof activo.selectionStart === "number" ? activo.selectionStart : null;

  let body;
  if (ui.tab === "dashboard") body = renderDashboard();
  else if (ui.tab === "clientes") body = renderClientes();
  else if (ui.tab === "simulador") body = renderSimulador();
  else body = renderCaja();

  const subtitulo = (TABS.find((t) => t[0] === ui.tab) || TABS[2])[3];
  const fechaHoy = capital(new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" }));

  document.getElementById("root").innerHTML = `
    <header style="position:sticky;top:0;z-index:15;background:${C.bg};border-bottom:1px solid ${C.dLine};padding:calc(14px + env(safe-area-inset-top,0px)) 18px 12px;">
      <div style="max-width:640px;margin:0 auto;display:flex;align-items:flex-end;justify-content:space-between;gap:10px;">
        <div>
          <div style="font-family:${FONT_D};font-size:22px;font-weight:700;color:#F2A93B;line-height:1.1;">Negocio de préstamos</div>
          <div style="font-size:13px;color:${C.dMuted};margin-top:3px;">${subtitulo}</div>
        </div>
        <div style="font-size:12px;color:${C.dMuted};text-align:right;">${fechaHoy}</div>
      </div>
    </header>
    <main style="max-width:640px;margin:0 auto;padding:16px 18px 110px;">
      ${renderAdBanner()}
      ${body}
    </main>
    ${renderTabs()}
    ${renderPapelera()}
    ${renderModalPago()}
    ${renderPremiumModal()}
    ${renderEstadoCuenta()}`;

  const hdr = document.querySelector("header");
  if (hdr) document.documentElement.style.setProperty("--hdr", hdr.offsetHeight + "px");

  if (activoId) {
    const restaurado = document.getElementById(activoId);
    if (restaurado) {
      restaurado.focus();
      if (activoSel !== null && typeof restaurado.setSelectionRange === "function") {
        try { restaurado.setSelectionRange(activoSel, activoSel); } catch (e) { /* ignore */ }
      }
    }
  }
}

// ---------- 9. Premium (Google Play), publicidad y límite de clientes ----------
// Rellena esto cuando publiques en Play Store:
const MODO_PERSONAL = true;           // true = uso personal: todo desbloqueado, sin límite de clientes ni anuncios. Ponlo en false cuando publiques con Premium
const MAX_CLIENTES_GRATIS = 15;        // el plan gratis permite hasta este número de clientes activos
const PLAY_SKU = "premium_mensual";    // ID de la suscripción que creas en Play Console
const PLAY_PACKAGE = "com.andresaroca.prestamos"; // igual al Package ID de PWA Builder y de Play Console
const FORZAR_TIENDA = false;           // true = fuerza el "modo tienda" (solo para pruebas)
const GOOGLE_CLIENT_ID = "";           // ID de cliente OAuth (Web) de Google Cloud para la copia en Drive. Vacío = Drive usa el menú de compartir
const DRIVE_ARCHIVO = "negocio-prestamos-backup.json";
const CONTACTO_ANUNCIOS = "573104721041"; // WhatsApp (con 57) al que escriben quienes quieren poner publicidad
const PREMIUM_KEY = "negocio-prestamos-premium";
const TIENDA_KEY = "negocio-prestamos-tienda";

// ¿Estamos dentro de la app instalada desde Google Play? (referrer android-app:// o ?tienda=1 en la URL)
const esModoTienda = (() => {
  try {
    if (FORZAR_TIENDA) return true;
    const q = new URLSearchParams(window.location.search);
    if (q.get("tienda") === "1") localStorage.setItem(TIENDA_KEY, "1");
    if (document.referrer && document.referrer.startsWith("android-app://")) localStorage.setItem(TIENDA_KEY, "1");
    return localStorage.getItem(TIENDA_KEY) === "1";
  } catch (e) { return false; }
})();
const urlPlay = PLAY_PACKAGE ? "https://play.google.com/store/apps/details?id=" + PLAY_PACKAGE : "";

let premium = (() => {
  try { const p = JSON.parse(localStorage.getItem(PREMIUM_KEY) || "null"); return p && p.tienda ? p : null; } catch (e) { return null; }
})();
let premiumUI = null; // null = ventana cerrada; objeto = abierta { motivo, error, precio, cargando }
function esPremium() { return MODO_PERSONAL || !!premium; }

// Aviso corto que se ve unos segundos (no depende de render)
function mostrarAviso(texto) {
  const viejo = document.getElementById("aviso-flotante");
  if (viejo) viejo.remove();
  const d = document.createElement("div");
  d.id = "aviso-flotante";
  d.textContent = texto;
  d.style.cssText = `position:fixed;left:50%;bottom:90px;transform:translateX(-50%);background:${C.surface};color:${C.text};padding:10px 18px;border-radius:999px;font-size:13px;font-weight:600;z-index:80;box-shadow:0 4px 18px rgba(0,0,0,.35);max-width:90vw;text-align:center;`;
  document.body.appendChild(d);
  setTimeout(() => { if (d.parentNode) d.remove(); }, 3500);
}

// ---------- Google Play Billing (solo funciona en la app instalada desde Google Play) ----------
// Usa la API de bienes digitales de Chrome (TWA).
async function playService() {
  if (!("getDigitalGoodsService" in window)) throw new Error("no-dg");
  return window.getDigitalGoodsService("https://play.google.com/billing");
}
async function playDetalles() {
  const sv = await playService();
  const d = await sv.getDetails([PLAY_SKU]);
  return d && d[0] ? d[0] : null;
}
async function playComprar() {
  const sv = await playService();
  const req = new PaymentRequest([{ supportedMethods: "https://play.google.com/billing", data: { sku: PLAY_SKU } }]);
  const resp = await req.show();
  const token = resp.details && resp.details.purchaseToken;
  if (!token) { await resp.complete("fail"); throw new Error("sin-token"); }
  await sv.acknowledge(token, "onetime");
  await resp.complete("success");
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
function puedeAgregarCliente() {
  if (esPremium() || state.clientes.length < MAX_CLIENTES_GRATIS) return true;
  abrirPremium("Registrar más de " + MAX_CLIENTES_GRATIS + " clientes");
  return false;
}
function activarPremium(token) {
  premium = { tienda: true, sku: PLAY_SKU, token: token, activadoEn: new Date().toISOString() };
  try { localStorage.setItem(PREMIUM_KEY, JSON.stringify(premium)); } catch (e) { /* ignore */ }
  premiumUI = null;
  render();
  mostrarAviso("¡Premium activado!");
}
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
    if (l.length) { activarPremium(l[0].purchaseToken); return; }
    if (premiumUI) premiumUI.error = "No encontré una suscripción activa en tu cuenta de Google Play.";
  } catch (e) { if (premiumUI) premiumUI.error = "Para restaurar tu compra abre la app instalada desde Google Play."; }
  if (premiumUI) premiumUI.cargando = false;
  render();
}
// En la versión de la tienda, confirma con Google Play que la suscripción sigue activa (si se canceló, se quita Premium).
function verificarSuscripcion() {
  if (!esModoTienda || !premium) return;
  playComprasActivas().then((l) => {
    if (Array.isArray(l) && l.length === 0) { premium = null; try { localStorage.removeItem(PREMIUM_KEY); } catch (e) { /* ignore */ } render(); }
  }).catch(() => {});
}

const BENEFICIOS_PREMIUM = [
  "Clientes sin límite (gratis hasta " + MAX_CLIENTES_GRATIS + ")",
  "Exportar todo a Excel",
  "Copia de seguridad en Google Drive",
  "Cobro por WhatsApp con el mensaje ya escrito",
  "Sin publicidad",
];
function renderPremiumModal() {
  if (!premiumUI) return "";
  const u = premiumUI;
  return `<div style="position:fixed;inset:0;z-index:70;display:flex;align-items:flex-end;justify-content:center;">
    <div onclick="cerrarPremium()" style="position:absolute;inset:0;background:rgba(0,0,0,.6);"></div>
    <div style="position:relative;max-width:640px;width:100%;max-height:90vh;overflow-y:auto;box-sizing:border-box;background:${C.surface};border-radius:26px 26px 0 0;padding:22px 20px calc(22px + env(safe-area-inset-bottom,0px));">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <span style="display:flex;align-items:center;gap:8px;font-family:${FONT_D};font-size:21px;font-weight:700;color:${C.text};">${ico("corona", 22, C.goldText)} Hazte Premium</span>
        <button onclick="cerrarPremium()" style="background:none;border:none;font-size:26px;line-height:1;color:${C.muted};cursor:pointer;padding:0 4px;">×</button>
      </div>
      ${u.motivo ? `<div style="font-size:13px;font-weight:700;color:${C.red};margin-bottom:10px;">“${esc(u.motivo)}” es una función Premium.</div>` : ""}
      <div style="display:flex;flex-direction:column;gap:9px;margin:12px 0 16px;">
        ${BENEFICIOS_PREMIUM.map((b) => `<div style="display:flex;align-items:center;gap:10px;font-size:14px;color:${C.text};">${ico("check", 18, C.green)}<span>${esc(b)}</span></div>`).join("")}
      </div>
      <div style="font-size:14px;font-weight:700;color:${C.goldText};margin-bottom:12px;">${u.precio ? esc(u.precio) + " por mes" : "Suscripción mensual en Google Play"}</div>
      <button ${u.cargando ? "disabled" : ""} onclick="suscribirPremium()" style="width:100%;background:#01875F;color:#fff;border:none;border-radius:999px;padding:14px;font-weight:700;font-size:15px;font-family:inherit;cursor:pointer;margin-bottom:10px;${u.cargando ? "opacity:.5;" : ""}">${u.cargando ? "Un momento…" : "Suscribirme con Google Play"}</button>
      <button ${u.cargando ? "disabled" : ""} onclick="restaurarPremium()" style="width:100%;background:none;border:none;color:${C.muted};text-decoration:underline;font-size:13px;font-family:inherit;cursor:pointer;margin-bottom:8px;">Ya pagué: restaurar mi compra</button>
      ${u.error ? `<div style="font-size:12.5px;color:${C.red};margin-bottom:8px;">${esc(u.error)}</div>` : ""}
      ${u.error && urlPlay ? `<a href="${urlPlay}" target="_blank" rel="noopener noreferrer" style="font-size:13px;font-weight:700;color:${C.red};">Abrir la app en Google Play</a>` : ""}
      <div style="font-size:11.5px;color:${C.muted};margin-top:6px;">El pago y la cancelación se manejan desde tu cuenta de Google Play.</div>
    </div>
  </div>`;
}

// Tarjeta del plan (en la sección de copia de seguridad)
function renderPlanCard() {
  if (MODO_PERSONAL) return "";
  if (esPremium()) {
    return card(`<div style="display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700;color:${C.green};margin-bottom:4px;">${ico("corona", 18, C.green)} Premium activo</div>
      <div style="font-size:12.5px;color:${C.muted};margin-bottom:10px;">Sin publicidad y con todas las funciones.</div>
      <a href="https://play.google.com/store/account/subscriptions" target="_blank" rel="noopener noreferrer" style="font-size:12.5px;color:${C.muted};">Administrar mi suscripción en Google Play</a>`,
      `margin-bottom:16px;background:${C.greenSoft};border-color:${C.green};`);
  }
  const n = state.clientes.length;
  return card(`<div style="font-size:15px;font-weight:700;margin-bottom:4px;">Plan gratis</div>
    <div style="font-size:12.5px;color:${C.muted};margin-bottom:12px;">Tienes ${n} de ${MAX_CLIENTES_GRATIS} clientes. Con Premium: clientes sin límite, Excel, copia en Drive, cobro por WhatsApp y sin publicidad.</div>
    <button onclick="abrirPremium('')" style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;background:${C.gold};color:${C.bg};border:none;border-radius:999px;padding:12px;font-weight:700;font-size:14px;font-family:inherit;cursor:pointer;">${ico("corona", 18)} Ver Premium</button>`,
    "margin-bottom:16px;");
}
// Botón de función Premium: lleva una coronita mientras no seas Premium
function premiumBtn(label, onclick) {
  return `<button onclick="${onclick}" style="background:${C.greenSoft};color:${C.green};border:none;border-radius:999px;padding:11px 20px;font-weight:700;font-size:14px;font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:7px;">${esPremium() ? "" : ico("corona", 16)}${esc(label)}</button>`;
}

// ---------- Publicidad (se quita con Premium) ----------
// Los anuncios se leen del archivo anuncios.json: lo editas en GitHub sin tocar el código.
let anuncios = [];
let anuncioI = 0;
let anuncioTimer = null;
function enlaceSeguro(u) { return /^https?:\/\//i.test(String(u || "")) ? String(u) : ""; }
function anuncioActual() {
  if (anuncios.length) return anuncios[anuncioI % anuncios.length];
  return { titulo: "Tu publicidad aquí", texto: "Anuncia tu negocio a todos los que usan esta app. Escríbenos.", enlace: "https://wa.me/" + CONTACTO_ANUNCIOS + "?text=" + encodeURIComponent("Hola, quiero poner publicidad en la app") };
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
function renderAdBanner() {
  if (esPremium()) return "";
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

// ---------- Copia en Google Drive (Premium) ----------
function cargarGIS() {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) { resolve(); return; }
    const sc = document.createElement("script");
    sc.src = "https://accounts.google.com/gsi/client"; sc.async = true;
    sc.onload = () => resolve(); sc.onerror = () => reject(new Error("sin conexión"));
    document.head.appendChild(sc);
  });
}
async function driveToken() {
  await cargarGIS();
  return new Promise((resolve, reject) => {
    const tc = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: (r) => (r && r.access_token ? resolve(r.access_token) : reject(new Error((r && r.error) || "sin permiso"))),
      error_callback: (e) => reject(new Error((e && e.type) || "cancelado")),
    });
    tc.requestAccessToken({ prompt: "" });
  });
}
async function driveBuscar(token, nombre) {
  const q = encodeURIComponent("name='" + nombre + "' and trashed=false");
  const r = await fetch("https://www.googleapis.com/drive/v3/files?q=" + q + "&fields=files(id,name,modifiedTime)&orderBy=modifiedTime%20desc&pageSize=1", { headers: { Authorization: "Bearer " + token } });
  if (!r.ok) throw new Error("drive " + r.status);
  const d = await r.json();
  return (d.files || [])[0] || null;
}
async function driveSubir(token, nombre, contenido) {
  const ex = await driveBuscar(token, nombre);
  const limite = "nc" + uid() + uid();
  const meta = ex ? {} : { name: nombre, mimeType: "application/json" };
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
function marcarRespaldoHecho() {
  state.meta = state.meta || {};
  state.meta.lastExportISO = hoyISO();
  save(); render();
}
// Sin GOOGLE_CLIENT_ID: abre el menú de compartir del celular para elegir Drive (o descarga el archivo)
async function compartirRespaldo() {
  const nombre = "negocio-prestamos-backup-" + hoyISO() + ".json";
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  let file = null;
  try { file = new File([blob], nombre, { type: "application/json" }); } catch (e) { file = null; }
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Respaldo Negocio de préstamos" }); marcarRespaldoHecho(); mostrarAviso("Respaldo enviado"); } catch (e) { /* canceló */ }
    return;
  }
  exportData();
}
async function respaldarDrive() {
  if (!exigirPremium("Copia en Google Drive")) return;
  if (!GOOGLE_CLIENT_ID) { mostrarAviso("Elige Google Drive en el menú"); await compartirRespaldo(); return; }
  try {
    mostrarAviso("Conectando con Google Drive…");
    const token = await driveToken();
    await driveSubir(token, DRIVE_ARCHIVO, JSON.stringify(state));
    marcarRespaldoHecho();
    mostrarAviso("Copia guardada en Google Drive");
  } catch (e) { console.error(e); mostrarAviso("No se pudo guardar en Drive. Revisa tu internet."); }
}
async function restaurarDrive() {
  if (!exigirPremium("Copia en Google Drive")) return;
  if (!GOOGLE_CLIENT_ID) { mostrarAviso("Usa «Restaurar desde archivo» y elige el archivo desde tu Drive"); triggerImport(); return; }
  if (!confirm("Esto reemplaza los datos de este celular con la última copia de Google Drive. ¿Seguir?")) return;
  try {
    const token = await driveToken();
    const txt = await driveBajar(token, DRIVE_ARCHIVO);
    if (!txt) { mostrarAviso("No encontré ninguna copia en tu Drive"); return; }
    const parsed = JSON.parse(txt);
    if (!parsed || !Array.isArray(parsed.clientes)) { mostrarAviso("La copia de Drive no es válida"); return; }
    state = parsed;
    ui.selectedCliente = state.clientes.length ? state.clientes[0].id : null;
    save(); render();
    mostrarAviso("Datos restaurados desde Drive");
  } catch (e) { console.error(e); mostrarAviso("No se pudo leer la copia de Drive"); }
}

// ---------- 8. Arranque ----------
// Las funciones se cuelgan en window porque el HTML las llama con
// onclick="..." (por ejemplo onclick="setTab('caja')").
window.setTab = setTab; window.selectCliente = selectCliente; window.toggleAddCliente = toggleAddCliente;
window.submitAddCliente = submitAddCliente; window.removeCliente = removeCliente; window.cancelarCliente = cancelarCliente;
window.toggleEditPrestamo = toggleEditPrestamo; window.savePrestamo = savePrestamo;
window.toggleAddPagoCap = toggleAddPagoCap; window.submitPagoCap = submitPagoCap; window.removePagoCap = removePagoCap;
window.toggleEditPagoCap = toggleEditPagoCap; window.savePagoCap = savePagoCap;
window.toggleAddPagoInt = toggleAddPagoInt; window.submitPagoInt = submitPagoInt; window.removePagoInt = removePagoInt; window.registrarMora = registrarMora;
window.toggleEditPagoInt = toggleEditPagoInt; window.savePagoInt = savePagoInt;
window.toggleAddMov = toggleAddMov; window.setCajaRango = setCajaRango; window.cajaPreset = cajaPreset; window.cambiarCajaFecha = cambiarCajaFecha; window.toggleCierre = toggleCierre; window.setCierreFecha = setCierreFecha; window.setCierreBackup = setCierreBackup; window.hacerCierre = hacerCierre; window.abrirPremium = abrirPremium; window.cerrarPremium = cerrarPremium; window.suscribirPremium = suscribirPremium; window.restaurarPremium = restaurarPremium; window.respaldarDrive = respaldarDrive; window.restaurarDrive = restaurarDrive; window.nuevoMov = nuevoMov; window.submitAddMov = submitAddMov; window.removeMovimiento = removeMovimiento;
window.toggleEditMov = toggleEditMov; window.saveMov = saveMov; window.setFiltroMes = setFiltroMes;
window.exportData = exportData; window.triggerImport = triggerImport; window.importData = importData;
window.deshacerBorrado = deshacerBorrado; window.guardarProximaModal = guardarProximaModal; window.cerrarModalPago = cerrarModalPago;
window.buscarCliente = buscarCliente; window.setFiltroEstado = setFiltroEstado; window.cobrarWhatsApp = cobrarWhatsApp; window.abrirEstadoCuenta = abrirEstadoCuenta; window.cerrarEstadoCuenta = cerrarEstadoCuenta; window.compartirEstadoCuenta = compartirEstadoCuenta; window.copiarEstadoCuenta = copiarEstadoCuenta; window.exportExcel = exportExcel; window.setSim = setSim; window.usarSimulacion = usarSimulacion;

load();
render();
cargarAnuncios();
verificarSuscripcion();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
