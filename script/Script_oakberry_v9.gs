// ============================================================
// OAKBERRY — Apps Script completo v9
// 6 estados · Reactivación · Tiendas con mapa · Email/Fingerprint/Loopy
// ============================================================

const HOJA_CODIGOS = "Códigos";
const HOJA_LINKS   = "Links";
const HOJA_TIENDAS = "Tiendas";

// ── Columnas hoja Códigos ─────────────────────────────────────
const COL_CODIGO     = 1;  // A
const COL_ESTADO     = 2;  // B
const COL_TIENDA     = 3;  // C
const COL_FECHA      = 4;  // D
const COL_LOOPY      = 5;  // E
const COL_NOMBRE     = 6;  // F
const COL_CELULAR    = 7;  // G
const COL_CIUDAD     = 8;  // H
const COL_TIENDA_AN  = 9;  // I
const COL_FASE       = 10; // J
const COL_FUENTE     = 11; // K
const COL_DESCUENTO  = 12; // L
const COL_PRODUCTO   = 13; // M
const COL_FECHA_GEN  = 14; // N
const COL_FECHA_VENC = 15; // O
const COL_MOMENTOS   = 16; // P
// ── Columnas de trazabilidad (nuevas) ────────────────────────
const COL_LINK_CAMP   = 17; // Q — URL completa de la campaña de origen
const COL_CIUDAD_REAL = 18; // R — Ciudad real detectada por geo
const COL_COORDENADAS = 19; // S — lat,lng del dispositivo
const COL_FUENTE_GEO  = 20; // T — "ip" | "nominatim" | "desconocido"
const COL_EMAIL       = 21; // U — Email del cliente
const COL_FINGERPRINT = 22; // V — Fingerprint del dispositivo
const COL_EN_LOOPY    = 23; // W — "SÍ" | "NO" | "Sin email"
const COL_FECHA_VERIF   = 24; // X — Fecha verificación contra Loopy
const COL_TIPO_USUARIO  = 25; // Y — Segmento: N1 | E1 | E2 | E3
const COL_GRUPO_AB      = 26; // Z  — Grupo A/B test reactivación: "A-30%" | "B-40%" | "Control"
const COL_DESC_FINAL    = 27; // AA — Descuento final canjeado (solo se llena al canjear)

// ── 6 estados columna B ───────────────────────────────────────
const ESTADO_DISPONIBLE     = "Disponible";
const ESTADO_CANJEADO       = "Canjeado";
const ESTADO_VENCIDO        = "Vencido";
const ESTADO_DISPONIBLE_REA = "Disponible_REA";
const ESTADO_CANJEADO_REA   = "Canjeado_REA";
const ESTADO_VENCIDO_REA    = "Vencido_REA";

const ESTADOS_REACTIVABLES = [ESTADO_VENCIDO, ESTADO_VENCIDO_REA];
const ESTADOS_CANJEABLES   = [ESTADO_DISPONIBLE, ESTADO_DISPONIBLE_REA];

const CHARS_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const RANGOS_MOMENTOS = {
  madrugada: { inicio: 23, fin: 7,  nombre: "Madrugada (11pm–7am)", cruce: true },
  desayuno:  { inicio: 7,  fin: 11.5, nombre: "Desayuno (7am–11:30am)" },
  almuerzo:  { inicio: 11.5, fin: 15.5, nombre: "Almuerzo (11:30am–3:30pm)" },
  onces:     { inicio: 15.5, fin: 19, nombre: "Onces (3:30pm–7pm)" },
  cena:      { inicio: 19, fin: 23, nombre: "Cena (7pm–11pm)" },
  noche:     { inicio: 23, fin: 24, nombre: "Noche (11pm–12am)" },
};

const PRECIOS_BASE = {
  "bowl+9oz":  21900, "the+one":  21900,
  "bowl+12oz": 25400, "classic":  25400,
  "bowl+16oz": 33800, "works":    33800,
  "bowl+22oz": 39400, "the+oak":  39400,
  "smoothie":  18000,
};

const BASE_URL = "https://oakberry-cupones.com";

// ── Lista blanca de pruebas — siempre pasan como N1 sin restricciones ──
const WHITELIST_CELULARES = ["573213691318", "3213691318"];
const WHITELIST_EMAILS    = ["dzuluaga@manelfoods.com"];

// ============================================================
// ── HELPERS ───────────────────────────────────────────────────
// ============================================================
function generarCodigo() {
  let r = "";
  for (let i = 0; i < 5; i++) r += CHARS_CODIGO[Math.floor(Math.random() * CHARS_CODIGO.length)];
  return r;
}

function esCodigoValido(codigo) {
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/.test(codigo);
}

// ── Verificar si es usuario de prueba ────────────────────────
function isWhitelisted(celular, email) {
  const cel = (celular||"").toString().trim().replace(/\+/g,"").replace(/\s/g,"");
  const em  = (email||"").toString().trim().toLowerCase();
  if (WHITELIST_CELULARES.some(w => cel.endsWith(w.replace(/\+/g,"").replace(/\s/g,"").slice(-10)))) return true;
  if (WHITELIST_EMAILS.some(w => w.toLowerCase() === em)) return true;
  return false;
}

function primerNombre(nombre) {
  return (nombre || "").split(" ")[0];
}

function calcularPrecio(producto, descuentoStr) {
  const key = (producto || "").toString().toLowerCase().replace(/\s+/g, "+");
  const pct  = parseInt((descuentoStr || "0").toString().replace(/[^0-9]/g, "")) || 0;
  let base = 0;
  for (const k in PRECIOS_BASE) {
    if (key.includes(k) || k.includes(key)) { base = PRECIOS_BASE[k]; break; }
  }
  if (!base || !pct) return null;
  return Math.round(base * (1 - pct / 100) / 100) * 100;
}

function formatPrecio(n) {
  return "$" + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// ── Busca la fila de un celular ───────────────────────────────
function buscarFilaCelular(celular) {
  const celNorm = celular.toString().trim().replace(/\+/g, "");
  const sh      = SpreadsheetApp.getActive().getSheetByName(HOJA_CODIGOS);
  const data    = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const cel = (data[i][COL_CELULAR-1]||"").toString().trim().replace(/\+/g,"");
    if (cel === celNorm) return { fila: i + 1, data: data[i], sh };
  }
  return null;
}

// ============================================================
// ── MARCAR VENCIDOS ───────────────────────────────────────────
// Disponible → Vencido · Disponible_REA → Vencido_REA
// ============================================================
function marcarVencidos() {
  const sh    = SpreadsheetApp.getActive().getSheetByName(HOJA_CODIGOS);
  const data  = sh.getDataRange().getValues();
  const ahora = new Date();
  let contador = 0;
  for (let i = 1; i < data.length; i++) {
    const estado    = (data[i][COL_ESTADO-1]    || "").toString().trim();
    const fechaVenc = data[i][COL_FECHA_VENC-1];
    if (estado !== ESTADO_DISPONIBLE && estado !== ESTADO_DISPONIBLE_REA) continue;
    if (!fechaVenc) continue;
    const vence = new Date(fechaVenc);
    if (isNaN(vence.getTime())) continue;
    if (ahora > vence) {
      sh.getRange(i + 1, COL_ESTADO).setValue(
        estado === ESTADO_DISPONIBLE_REA ? ESTADO_VENCIDO_REA : ESTADO_VENCIDO
      );
      contador++;
    }
  }
  console.log("✅ marcarVencidos — " + contador + " cupones actualizados");
  return contador;
}

function instalarTriggerVencidos() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === "marcarVencidos") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("marcarVencidos").timeBased().everyHours(1).create();
  console.log("✅ Trigger instalado — marcarVencidos cada hora");
}

function resumenBase() {
  const sh   = SpreadsheetApp.getActive().getSheetByName(HOJA_CODIGOS);
  const data = sh.getDataRange().getValues();
  const c = {
    [ESTADO_DISPONIBLE]:0,[ESTADO_CANJEADO]:0,[ESTADO_VENCIDO]:0,
    [ESTADO_DISPONIBLE_REA]:0,[ESTADO_CANJEADO_REA]:0,[ESTADO_VENCIDO_REA]:0,Otro:0,
  };
  for (let i = 1; i < data.length; i++) {
    const e = (data[i][COL_ESTADO-1]||"").toString().trim();
    c.hasOwnProperty(e) ? c[e]++ : c.Otro++;
  }
  const total      = Object.values(c).reduce((a,b)=>a+b,0);
  const canjeTotal = c[ESTADO_CANJEADO] + c[ESTADO_CANJEADO_REA];
  const reaTotal   = c[ESTADO_DISPONIBLE_REA]+c[ESTADO_CANJEADO_REA]+c[ESTADO_VENCIDO_REA];
  console.log("════════════════════════════════");
  console.log("RESUMEN · " + total + " registros");
  console.log("════════════════════════════════");
  console.log("Disponible:      " + c[ESTADO_DISPONIBLE]);
  console.log("Canjeado:        " + c[ESTADO_CANJEADO]);
  console.log("Vencido:         " + c[ESTADO_VENCIDO]);
  console.log("Disponible_REA:  " + c[ESTADO_DISPONIBLE_REA]);
  console.log("Canjeado_REA:    " + c[ESTADO_CANJEADO_REA]);
  console.log("Vencido_REA:     " + c[ESTADO_VENCIDO_REA]);
  if (c.Otro > 0) console.log("Otros:           " + c.Otro);
  console.log("────────────────────────────────");
  console.log("Tasa de canje:   " + (total>0?Math.round(canjeTotal/total*100):0) + "% (" + canjeTotal + "/" + total + ")");
  console.log("Reactivados:     " + reaTotal);
}

// ============================================================
// ── CONFIG DE REACTIVACIÓN ────────────────────────────────────
// ============================================================
function getCampanaReactivacion() {
  try {
    const sh = SpreadsheetApp.getActive().getSheetByName("Config");
    if (!sh) return _defaultConfig();
    const cfg = {};
    sh.getDataRange().getValues().slice(1).forEach(r => {
      const k = (r[0]||"").toString().trim();
      const v = (r[1]||"").toString().trim();
      if (k) cfg[k] = v;
    });
    return {
      descuento: cfg["reactivacion_descuento"] || "35",
      producto:  cfg["reactivacion_producto"]  || "Bowl The One 9oz",
      vigencia:  cfg["reactivacion_vigencia"]  || "48",
      momentos:  cfg["reactivacion_momentos"]  || "",
      ciudad:    cfg["reactivacion_ciudad"]    || "todas",
      tienda:    cfg["reactivacion_tienda"]    || "general",
    };
  } catch(e) { return _defaultConfig(); }
}

function _defaultConfig() {
  return { descuento:"35", producto:"Bowl The One 9oz", vigencia:"48", momentos:"", ciudad:"todas", tienda:"general" };
}

function crearHojaConfig() {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName("Config");
  if (sh) ss.deleteSheet(sh);
  sh = ss.insertSheet("Config");
  sh.getRange("A1:C1").setValues([["Parámetro","Valor","Descripción"]])
    .setFontWeight("bold").setBackground("#5F4B8B").setFontColor("#ffffff");
  const filas = [
    ["reactivacion_descuento","35","% de descuento — solo el número"],
    ["reactivacion_producto","Bowl The One 9oz","Producto que aplica el descuento"],
    ["reactivacion_vigencia","48","Horas de vigencia del cupón"],
    ["reactivacion_momentos","almuerzo,onces","Momentos separados por coma"],
    ["reactivacion_ciudad","todas","Ciudad o 'todas'"],
    ["reactivacion_tienda","general","Tienda o 'general'"],
  ];
  sh.getRange(2,1,filas.length,3).setValues(filas);
  sh.getRange("A2:A7").setBackground("#f3f0f9").setFontColor("#5F4B8B").setFontWeight("bold");
  sh.getRange("B2:B7").setBackground("#fff8e1").setFontWeight("bold").setFontColor("#2d1b69");
  sh.getRange("C2:C7").setBackground("#fafafa").setFontColor("#999999").setFontStyle("italic");
  sh.getRange("B2").setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(["20","25","30","35","40","45","50"],true).setAllowInvalid(false).build());
  sh.getRange("B3").setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(["Bowl The One 9oz","Bowl Classic 12oz","Bowl Works 16oz","Bowl The Oak 22oz","Smoothie"],true).setAllowInvalid(false).build());
  sh.getRange("B4").setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(["24","48","72","168"],true).setAllowInvalid(false).build());
  sh.getRange("B5").setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(["todos","desayuno","almuerzo","onces","cena","desayuno,almuerzo","almuerzo,onces","onces,cena","desayuno,almuerzo,onces","almuerzo,onces,cena"],true).setAllowInvalid(false).build());
  try {
    const ciudades = [...new Set(ss.getSheetByName("Tiendas").getDataRange().getValues()
      .slice(1).map(r=>(r[1]||"").toString().trim()).filter(Boolean))].sort();
    sh.getRange("B6").setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(["todas",...ciudades],true).setAllowInvalid(false).build());
  } catch(e) {
    sh.getRange("B6").setDataValidation(SpreadsheetApp.newDataValidation()
      .requireValueInList(["todas","Bogotá","Medellín","Cali"],true).setAllowInvalid(false).build());
  }
  sh.getRange("B7").setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(["general"],true).setAllowInvalid(true).build());
  sh.getRange("A9:C9").merge()
    .setValue("⚠️ Solo edita la columna B. Los cambios aplican de inmediato al link de reactivación.")
    .setFontColor("#e67e22").setFontStyle("italic").setFontSize(11);
  sh.setColumnWidth(1,240); sh.setColumnWidth(2,200); sh.setColumnWidth(3,340);
  console.log("✅ Hoja Config creada con desplegables");
}

function testLinkReactivacion() {
  const camp = getCampanaReactivacion();
  const params = [
    "cel=3213691318",
    "descuento=" + encodeURIComponent(camp.descuento),
    "producto="  + encodeURIComponent(camp.producto),
    "vigencia="  + camp.vigencia,
    "ciudad="    + encodeURIComponent(camp.ciudad),
    "tienda="    + encodeURIComponent(camp.tienda),
    "momentos="  + encodeURIComponent(camp.momentos),
    "fase=reactivacion", "fuente=manual",
  ].join("&");
  console.log("Link:\n" + BASE_URL + "/reactivar?" + params);
  console.log("\nConfig:", JSON.stringify(camp, null, 2));
}

// ============================================================
// ── LOOPY LOYALTY ────────────────────────────────────────────
// ============================================================
const LOOPY_API_KEY    = "6z5F62u7kyT4SOTml6KXiJ";
const LOOPY_API_SECRET = "qa9IF0Pw4PHWJ4urhmRBePiHxx2OSeNrdrAo1qGqeKTTkiOkywPRPM3mK5skA62J";
const LOOPY_CID        = "CfeDg1FTyntvdqWN1hEKX";

function generarJWTLoopy() {
  const now = Math.floor(Date.now() / 1000);
  const h   = { alg:"HS256", typ:"JWT" };
  const p   = { uid:LOOPY_API_KEY, pid:LOOPY_API_KEY, exp:now+3600, iat:now-10, username:"julio@manelfoods.com" };
  function b64u(input) {
    const e = (typeof input==="string")
      ? Utilities.base64Encode(Utilities.newBlob(input).getBytes())
      : Utilities.base64Encode(input);
    return e.replace(/=+$/,"").replace(/\+/g,"-").replace(/\//g,"_");
  }
  const hh  = b64u(JSON.stringify(h));
  const pp  = b64u(JSON.stringify(p));
  const sig = Utilities.computeHmacSha256Signature(
    Utilities.newBlob(hh+"."+pp).getBytes(),
    Utilities.newBlob(LOOPY_API_SECRET).getBytes()
  );
  return hh+"."+pp+"."+b64u(sig);
}

function getCacheLoopy() {
  const cache  = CacheService.getScriptCache();
  const cached = cache.get("loopy_nums");
  if (cached) return new Set(JSON.parse(cached));
  try {
    const sh   = SpreadsheetApp.getActive().getSheetByName("Data Loopy");
    const data = sh.getRange(2,3,sh.getLastRow()-1,1).getValues();
    const nums = data
      .map(r=>(r[0]||"").toString().trim().replace(/\+/g,"").replace(/\s/g,"").slice(-10))
      .filter(n=>n.length===10);
    cache.put("loopy_nums", JSON.stringify(nums), 600);
    return new Set(nums);
  } catch(e) { return new Set(); }
}

function existeEnLoopy(celular) {
  let cel = celular.toString().trim().replace(/\+/g,"").replace(/\s/g,"");
  if (cel.startsWith("57") && cel.length===12) cel = cel.slice(2);
  cel = cel.slice(-10);
  if (getCacheLoopy().has(cel)) return true;
  try {
    const res = UrlFetchApp.fetch("https://api.loopyloyalty.com/v1/card/cid/"+LOOPY_CID, {
      method:"POST", contentType:"application/json",
      headers:{ Authorization:generarJWTLoopy() },
      payload:JSON.stringify({ dt:{ start:0, length:10, search:cel, order:{ column:"created", dir:"desc" } } }),
      muteHttpExceptions:true,
    });
    if (res.getResponseCode()!==200) return false;
    return (JSON.parse(res.getContentText()).data||[]).some(card => {
      const cd  = card.customerDetails || card.customerData || {};
      const tel = ((cd["Celular"]||cd["Contact Number"]||"")).toString().replace(/\+/g,"").replace(/\s/g,"");
      return tel.slice(-10)===cel;
    });
  } catch(e) { return false; }
}

// ── Cache de emails Loopy ────────────────────────────────────
function getCacheLoopyEmails() {
  const cache  = CacheService.getScriptCache();
  const cached = cache.get("loopy_emails");
  if (cached) return new Set(JSON.parse(cached));
  try {
    const sh   = SpreadsheetApp.getActive().getSheetByName("Data Loopy");
    const last = sh.getLastRow();
    if (last < 2) return new Set();
    const data = sh.getRange(2, 4, last - 1, 1).getValues();
    const emails = data
      .map(row => (row[0] || "").toString().trim().toLowerCase())
      .filter(e => e.includes("@"));
    cache.put("loopy_emails", JSON.stringify(emails), 600);
    return new Set(emails);
  } catch(e) { return new Set(); }
}

function existeEmailEnLoopy(email) {
  if (!email || !email.includes("@")) return false;
  const emailNorm = email.toString().trim().toLowerCase();
  if (getCacheLoopyEmails().has(emailNorm)) return true;
  try {
    const res = UrlFetchApp.fetch("https://api.loopyloyalty.com/v1/card/cid/"+LOOPY_CID, {
      method:"POST", contentType:"application/json",
      headers:{ Authorization:generarJWTLoopy() },
      payload:JSON.stringify({ dt:{ start:0, length:10, search:emailNorm, order:{ column:"created", dir:"desc" } } }),
      muteHttpExceptions:true,
    });
    if (res.getResponseCode()!==200) return false;
    return (JSON.parse(res.getContentText()).data||[]).some(card => {
      const cd = card.customerDetails || card.customerData || {};
      const em = (cd["Email address"]||cd["email"]||cd["Email"]||"").toString().trim().toLowerCase();
      return em === emailNorm;
    });
  } catch(e) { return false; }
}

// ── Poblar columna W en registros históricos (correr UNA sola vez) ──
function poblarEnLoopyHistorico() {
  const sh      = SpreadsheetApp.getActive().getSheetByName(HOJA_CODIGOS);
  const data    = sh.getDataRange().getValues();
  const total   = data.length - 1;
  let procesadas = 0, yaTeníanW = 0, sinEmail = 0, errores = 0;
  console.log("=== INICIO: Poblar En Loopy histórico === Total: " + total);
  for (let i = 1; i < data.length; i++) {
    const email    = (data[i][COL_EMAIL - 1]    || "").toString().trim();
    const yaTieneW = (data[i][COL_EN_LOOPY - 1] || "").toString().trim();
    if (yaTieneW) { yaTeníanW++; continue; }
    const fechaVerif = Utilities.formatDate(new Date(), "America/Bogota", "dd/MM/yyyy HH:mm");
    if (!email || !email.includes("@")) {
      sh.getRange(i+1, COL_EN_LOOPY).setValue("Sin email");
      sh.getRange(i+1, COL_FECHA_VERIF).setValue(fechaVerif);
      sinEmail++; continue;
    }
    try {
      const estaEnLoopy = existeEmailEnLoopy(email);
      sh.getRange(i+1, COL_EN_LOOPY).setValue(estaEnLoopy ? "SÍ" : "NO");
      sh.getRange(i+1, COL_FECHA_VERIF).setValue(fechaVerif);
      procesadas++;
      if (procesadas % 10 === 0) {
        console.log("Procesadas: " + procesadas + " | Fila: " + (i+1));
        Utilities.sleep(2000);
      }
    } catch(e) {
      sh.getRange(i+1, COL_EN_LOOPY).setValue("Error");
      sh.getRange(i+1, COL_FECHA_VERIF).setValue(Utilities.formatDate(new Date(), "America/Bogota", "dd/MM/yyyy HH:mm"));
      errores++;
    }
  }
  console.log("=== FIN === Procesadas: "+procesadas+" | Ya tenían W: "+yaTeníanW+" | Sin email: "+sinEmail+" | Errores: "+errores);
}

// ============================================================
// ── WHATSAPP CLOUD API ───────────────────────────────────────
// ============================================================
const WA_PHONE_NUMBER_ID = "1060781240452634";
const WA_TOKEN           = "EAAKrFCnuYsoBRJGOTtYRass50UoTdOLXnkglKMpYo4X0WKXrHrhUpAzZB5VCgDcYlqZCNXufYp1MY5YPSeQBSNdbD5ax6tB3huLsn2Rcq7L4ipZCaKUctZAfC8RfpbnEqKkOXNea09KyZAbZBzAnXvsheKRDm6o1Nmnd1CJd4dVCghw5iyw00hsMR7UZASGHuoWPwZDZD"; // Permanente — Never expires
const META_ADS_TOKEN     = "EAAKrFCnuYsoBRI7Rd4lUhcUW26GEvb9ensB0MiXdVr5xEEhZBpPlh37ubSdDjSZCa255IRjCSddqV3nQOqyZBK2Yl7VxcwkpENkeB1PzZAzYayDoOxmtB6JDhWs8afATNKw0UBbIBTx8ud6nn30Mvp2SbllTDIWLbxwQxThXVeu3ekj9yDJ6bZCwDjMxZB1EG98QZDZD"; // Mismo token — permisos ads_read + business_management
const WA_API_URL         = "https://graph.facebook.com/v22.0/" + WA_PHONE_NUMBER_ID + "/messages";

// ── Enviar mensaje WA via Cloud API ──────────────────────────
function enviarWA(celular, templateName, languageCode, components) {
  // Normalizar celular: asegurar formato 57XXXXXXXXXX
  let cel = celular.toString().trim().replace(/\+/g,"").replace(/\s/g,"");
  if (!cel.startsWith("57")) cel = "57" + cel.slice(-10);

  const payload = {
    messaging_product: "whatsapp",
    to: cel,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components: components || [],
    },
  };

  try {
    const res = UrlFetchApp.fetch(WA_API_URL, {
      method: "POST",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + WA_TOKEN },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    const data = JSON.parse(res.getContentText());
    if (res.getResponseCode() === 200) {
      console.log("✅ WA enviado a " + cel + " · template: " + templateName);
      return { ok: true, data };
    } else {
      console.log("❌ WA error · " + cel + " · " + JSON.stringify(data));
      return { ok: false, error: data };
    }
  } catch(e) {
    console.log("❌ WA excepción: " + e.message);
    return { ok: false, error: e.message };
  }
}

// ── FLUJO 1: Entrega del cupón al generarlo ───────────────────
// Plantilla: oakberry_cupon_nuevo
// Cuerpo: {{1}}=nombre {{2}}=codigo {{3}}=descuento {{4}}=producto {{5}}=vigencia
// Botón 1: URL estática → oakberry-cupones.com/tiendas
// Botón 2: copy_code → coupon_code = codigo
function waEnviarCupon(celular, nombre, codigo, descuento, producto, vigencia) {
  const descPct = descuento.toString().replace(/[^0-9]/g,"");
  return enviarWA(celular, "oakberry_cupon_nuevo", "en", [
    {
      type: "body",
      parameters: [
        { type:"text", text: primerNombre(nombre) },
        { type:"text", text: codigo },
        { type:"text", text: descPct + "%" },
        { type:"text", text: producto },
        { type:"text", text: vigencia.toString() },
      ],
    },
    {
      // Botón índice 1: Copy offer code — requiere coupon_code
      // (índice 1 porque el botón URL estática no necesita componente)
      type: "button",
      sub_type: "copy_code",
      index: "1",
      parameters: [
        { type: "coupon_code", coupon_code: codigo.toString().trim() },
      ],
    },
  ]);
}

// ── FLUJO 2: Recordatorio 24h antes de vencer ────────────────
// Plantilla: _oakberry_recordatorio (activa ✅)
// Variables: {{1}}=nombre {{2}}=codigo {{3}}=descuento {{4}}=producto
// Se dispara desde trigger diario a las 10am
function waEnviarRecordatorio(celular, nombre, codigo, descuento, producto) {
  const descPct = descuento.toString().replace(/[^0-9]/g,"");
  return enviarWA(celular, "_oakberry_recordatorio", "es_CO", [
    {
      type: "body",
      parameters: [
        { type:"text", text: primerNombre(nombre) },
        { type:"text", text: codigo },
        { type:"text", text: descPct + "%" },
        { type:"text", text: producto },
      ],
    },
    {
      // Botón índice 1: copy_code con el código del cupón
      type: "button",
      sub_type: "copy_code",
      index: "1",
      parameters: [
        { type: "coupon_code", coupon_code: codigo.toString().trim() },
      ],
    },
  ]);
}

// ── FLUJO 3: Segunda oportunidad al vencer ───────────────────
// Plantilla: oakberry_reactivacion
// Cuerpo: {{1}}=nombre {{2}}=vigencia
// Botón URL dinámica: {{1}}=link de reactivación (sufijo de la URL base)
function waEnviarReactivacion(celular, nombre, vigencia, linkReactivacion) {
  // La URL base de la plantilla es "https://oakberry-cupones.com/reactivar"
  // El botón dinámico recibe solo el sufijo después de la base
  // Como el link completo ya incluye la base, extraemos solo los params
  const urlBase = "https://oakberry-cupones.com/reactivar";
  const sufijo = linkReactivacion.startsWith(urlBase)
    ? linkReactivacion.slice(urlBase.length)
    : linkReactivacion;

  return enviarWA(celular, "oakberry_reactivacion", "en", [
    {
      type: "body",
      parameters: [
        { type:"text", text: primerNombre(nombre) },
        { type:"text", text: vigencia.toString() },
      ],
    },
    {
      // Botón URL dinámica "Generar mi cupon" — recibe el sufijo de la URL
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [
        { type: "text", text: sufijo },
      ],
    },
  ]);
}

// ── FLUJO 4: Agradecimiento post-canje ───────────────────────
// Plantilla: oakberry_post_canje (en revisión — activar cuando aprueben)
// Variables: {{1}}=nombre
function waEnviarPostCanje(celular, nombre) {
  return enviarWA(celular, "oakberry_post_canje", "en", [{
    type: "body",
    parameters: [
      { type:"text", text: primerNombre(nombre) },
    ],
  }]);
}

// ── TRIGGER DIARIO 10AM: Recordatorios de vencimiento ────────
// Ejecutar instalarTriggerRecordatorios() UNA SOLA VEZ para activar
function enviarRecordatoriosDiarios() {
  const sh    = SpreadsheetApp.getActive().getSheetByName(HOJA_CODIGOS);
  const data  = sh.getDataRange().getValues();
  const ahora = new Date();

  // Ventana: cupones que vencen entre las próximas 24h y 48h
  const en24h = new Date(ahora.getTime() + 24 * 3600000);
  const en48h = new Date(ahora.getTime() + 48 * 3600000);

  let enviados = 0;
  let saltados = 0;

  for (let i = 1; i < data.length; i++) {
    const estado    = (data[i][COL_ESTADO-1]    ||"").toString().trim();
    const fechaVenc = data[i][COL_FECHA_VENC-1];
    const celular   = (data[i][COL_CELULAR-1]   ||"").toString().trim();
    const nombre    = (data[i][COL_NOMBRE-1]    ||"").toString().trim();
    const codigo    = (data[i][COL_CODIGO-1]    ||"").toString().trim();
    const descuento = (data[i][COL_DESCUENTO-1] ||"").toString().trim();
    const producto  = (data[i][COL_PRODUCTO-1]  ||"").toString().trim();

    // Solo cupones disponibles (no canjeados, no vencidos)
    if (!ESTADOS_CANJEABLES.includes(estado)) { saltados++; continue; }
    if (!fechaVenc || !celular) { saltados++; continue; }

    const vence = new Date(fechaVenc);
    if (isNaN(vence.getTime())) { saltados++; continue; }

    // ¿Vence en las próximas 24–48h?
    if (vence >= en24h && vence <= en48h) {
      waEnviarRecordatorio(celular, nombre, codigo, descuento, producto);
      enviados++;
      Utilities.sleep(500); // Respetar rate limit de Meta
    }
  }

  console.log("📲 Recordatorios enviados: " + enviados + " | Saltados: " + saltados);
}

// ── TRIGGER DIARIO: Reactivaciones con A/B test ──────────────
// Grupos: A=30% descuento · B=40% descuento · Control=sin mensaje
// Asignación aleatoria 25% A / 25% B / 50% Control
// Columna Z registra el grupo asignado para análisis posterior
function enviarReactivacionesDiarias() {
  const sh    = SpreadsheetApp.getActive().getSheetByName(HOJA_CODIGOS);
  const data  = sh.getDataRange().getValues();
  const ahora = new Date();
  const camp  = getCampanaReactivacion();

  // Ventana: cupones que vencieron entre hace 2h y 26h
  const hace2h  = new Date(ahora.getTime() - 2  * 3600000);
  const hace26h = new Date(ahora.getTime() - 26 * 3600000);

  let enviados = 0;
  let controles = 0;

  for (let i = 1; i < data.length; i++) {
    const estado    = (data[i][COL_ESTADO-1]    ||"").toString().trim();
    const fechaVenc = data[i][COL_FECHA_VENC-1];
    const celular   = (data[i][COL_CELULAR-1]   ||"").toString().trim();
    const nombre    = (data[i][COL_NOMBRE-1]    ||"").toString().trim();
    const grupoYa   = (data[i][COL_GRUPO_AB-1]  ||"").toString().trim();

    // Solo estado Vencido (no Vencido_REA — ya tuvo su oportunidad)
    if (estado !== ESTADO_VENCIDO) continue;
    if (!fechaVenc || !celular) continue;
    // Si ya tiene grupo asignado, no reasignar
    if (grupoYa) continue;

    const vence = new Date(fechaVenc);
    if (isNaN(vence.getTime())) continue;

    // ¿Venció en las últimas 2–26h?
    if (vence > hace2h || vence < hace26h) continue;

    // ── Asignación aleatoria de grupo ──────────────────────────
    // rand < 0.25 → A · rand < 0.50 → B · resto → Control
    const rand = Math.random();
    let grupo, descuento;

    if (rand < 0.25) {
      grupo = "A-30%";
      descuento = "30";
    } else if (rand < 0.50) {
      grupo = "B-40%";
      descuento = "40";
    } else {
      grupo = "Control";
      descuento = null; // No recibe mensaje
    }

    // Registrar grupo en col Z siempre (incluso controles)
    sh.getRange(i + 1, COL_GRUPO_AB).setValue(grupo);

    // Solo enviar WA a grupos A y B
    if (!descuento) { controles++; continue; }

    const params = [
      "cel=" + celular.toString().replace(/\+/g,"").slice(-10),
      "descuento=" + encodeURIComponent(descuento),
      "producto="  + encodeURIComponent(camp.producto),
      "vigencia="  + camp.vigencia,
      "ciudad="    + encodeURIComponent(camp.ciudad),
      "tienda="    + encodeURIComponent(camp.tienda),
      "momentos="  + encodeURIComponent(camp.momentos),
      "fase=reactivacion",
      "fuente=wa_ab_" + grupo.toLowerCase().replace(/[^a-z0-9]/g,""),
    ].join("&");
    const linkRea = BASE_URL + "/reactivar?" + params;

    waEnviarReactivacion(celular, nombre, camp.vigencia, linkRea);
    enviados++;
    Utilities.sleep(500);
  }

  console.log("♻️ A/B Reactivaciones — Enviados: " + enviados + " | Control: " + controles);
}



// ── Diagnóstico A/B test — ver distribución real ─────────────
function diagnosticoAB() {
  const sh   = SpreadsheetApp.getActive().getSheetByName(HOJA_CODIGOS);
  const data = sh.getDataRange().getValues();
  
  const resumen = {};
  let totalConGrupo = 0;

  for (let i = 1; i < data.length; i++) {
    const estado = (data[i][COL_ESTADO-1]  ||"").toString().trim();
    const grupo  = (data[i][COL_GRUPO_AB-1]||"").toString().trim();
    if (!grupo) continue;
    totalConGrupo++;
    const key = estado + " | " + grupo;
    resumen[key] = (resumen[key] || 0) + 1;
  }

  console.log("════ DIAGNÓSTICO A/B ════");
  console.log("Total con grupo asignado: " + totalConGrupo);
  Object.keys(resumen).sort().forEach(k => {
    console.log(k + " → " + resumen[k]);
  });
  console.log("═══════════════════════");
}

// ── Limpiar col Z de registros que no son Vencido ────────────
// Borra el grupo AB de filas que no deberían tenerlo
function limpiarGruposAB() {
  const sh   = SpreadsheetApp.getActive().getSheetByName(HOJA_CODIGOS);
  const data = sh.getDataRange().getValues();
  let limpiados = 0;
  let correctos = 0;

  for (let i = 1; i < data.length; i++) {
    const estado = (data[i][COL_ESTADO-1]  ||"").toString().trim();
    const grupo  = (data[i][COL_GRUPO_AB-1]||"").toString().trim();

    if (!grupo) continue; // Sin grupo, nada que hacer

    // Solo Vencido y Vencido_REA deben tener grupo AB
    const estadosValidos = [ESTADO_VENCIDO, ESTADO_VENCIDO_REA];
    if (!estadosValidos.includes(estado)) {
      sh.getRange(i + 1, COL_GRUPO_AB).clearContent();
      limpiados++;
    } else {
      correctos++;
    }
  }

  console.log("🧹 Limpieza A/B — Borrados: " + limpiados + " | Correctos: " + correctos);
}

// ── Reporte A/B test ──────────────────────────────────────────
// Corre manualmente para ver resultados del A/B test
function reporteABTest() {
  const sh   = SpreadsheetApp.getActive().getSheetByName(HOJA_CODIGOS);
  const data = sh.getDataRange().getValues();

  const grupos = {
    "A-30%":   { enviados:0, canjeados:0 },
    "B-40%":   { enviados:0, canjeados:0 },
    "Control": { enviados:0, canjeados:0 },
  };

  for (let i = 1; i < data.length; i++) {
    const grupo  = (data[i][COL_GRUPO_AB-1] ||"").toString().trim();
    const estado = (data[i][COL_ESTADO-1]   ||"").toString().trim();
    if (!grupo || !grupos[grupo]) continue;
    grupos[grupo].enviados++;
    if (estado === ESTADO_CANJEADO_REA) grupos[grupo].canjeados++;
  }

  console.log("════════════════════════════════");
  console.log("REPORTE A/B TEST REACTIVACIÓN");
  console.log("════════════════════════════════");
  for (const g in grupos) {
    const { enviados, canjeados } = grupos[g];
    const tasa = enviados > 0 ? Math.round(canjeados / enviados * 100) : 0;
    console.log(g + " → " + canjeados + "/" + enviados + " canjeados (" + tasa + "%)");
  }
  console.log("════════════════════════════════");
}

// ── Instalar triggers diarios (ejecutar UNA SOLA VEZ) ────────
function instalarTriggersWA() {
  // Limpiar triggers WA existentes
  ScriptApp.getProjectTriggers().forEach(t => {
    const fn = t.getHandlerFunction();
    if (fn === "enviarRecordatoriosDiarios" || fn === "enviarReactivacionesDiarias") {
      ScriptApp.deleteTrigger(t);
    }
  });

  // Recordatorios: todos los días a las 10am hora Colombia
  ScriptApp.newTrigger("enviarRecordatoriosDiarios")
    .timeBased().everyDays(1).atHour(10).inTimezone("America/Bogota").create();

  // Reactivaciones: todos los días a las 11am hora Colombia
  ScriptApp.newTrigger("enviarReactivacionesDiarias")
    .timeBased().everyDays(1).atHour(11).inTimezone("America/Bogota").create();

  console.log("✅ Triggers WA instalados — recordatorios 10am · reactivaciones 11am");
}

// ── Test manual de los 4 flujos WA ───────────────────────────
function testWA() {
  const cel   = "573213691318"; // número de prueba Oakberry
  const nom   = "Julio";
  const cod   = "ABC12";
  const desc  = "30%";
  const prod  = "Bowl 12oz";
  const vig   = "48";
  const link  = BASE_URL + "/reactivar?cel=3213691317&fase=reactivacion&fuente=wa_test";

  console.log("=== TEST WA — 4 flujos ===");
  console.log("1. Cupón nuevo:");
  console.log(JSON.stringify(waEnviarCupon(cel, nom, cod, desc, prod, vig)));
  Utilities.sleep(1000);
  console.log("2. Recordatorio:");
  console.log(JSON.stringify(waEnviarRecordatorio(cel, nom, cod, desc, prod)));
  Utilities.sleep(1000);
  console.log("3. Reactivación:");
  console.log(JSON.stringify(waEnviarReactivacion(cel, nom, vig, link)));
  Utilities.sleep(1000);
  console.log("4. Post-canje:");
  console.log(JSON.stringify(waEnviarPostCanje(cel, nom)));
}

// ── Inspección de sellos Loopy (diagnóstico) ─────────────────
function inspeccionarSellosLoopy() {
  const jwt = generarJWTLoopy();
  const res = UrlFetchApp.fetch("https://api.loopyloyalty.com/v1/card/cid/"+LOOPY_CID, {
    method:"POST", contentType:"application/json",
    headers:{ Authorization:jwt },
    payload:JSON.stringify({ dt:{ start:0, length:3, search:"", order:{ column:"created", dir:"desc" } } }),
    muteHttpExceptions:true,
  });
  const cards = (JSON.parse(res.getContentText()).data||[]);
  cards.slice(0,3).forEach((card,i) => {
    console.log("━━━ Tarjeta "+(i+1)+" ━━━");
    console.log("customerDetails: "+JSON.stringify(card.customerDetails||{},null,2));
    console.log("stamps: "+JSON.stringify(card.stamps||card.currentStamps||card.stampCount||"no encontrado"));
    console.log("totalStamps: "+JSON.stringify(card.totalStamps||"no encontrado"));
    console.log("activity: "+JSON.stringify(card.activity||"no encontrado"));
    console.log("TODOS LOS KEYS: "+Object.keys(card).join(", "));
  });
}

// ── Clasificar usuario según segmento N1/E1/E2/E3 ────────────
// Busca por email y/o celular en Loopy y devuelve el segmento
// N1 = Nunca en Loopy | E1 = ≤2 sellos/mes | E2 = 2-4 | E3 = >4
function clasificarUsuarioLoopy(email, celular) {
  // Primero buscar por email (mayor cobertura)
  let card = null;

  if (email && email.includes("@")) {
    card = buscarCardEnLoopy(email);
  }

  // Si no encontró por email, buscar por celular
  if (!card && celular) {
    let cel = celular.toString().trim().replace(/\+/g,"").replace(/\s/g,"");
    if (cel.startsWith("57") && cel.length===12) cel = cel.slice(2);
    cel = cel.slice(-10);
    card = buscarCardEnLoopy(cel);
  }

  // No está en Loopy → N1 Nuevo puro
  if (!card) return "N1 — Nuevo puro";

  // Calcular sellos/mes desde fecha de inscripción
  const totalSellos = parseInt(card.totalStampsEarned || card.currentStamps || 0);
  const fechaCreado = card.created ? new Date(card.created) : null;

  if (!fechaCreado || isNaN(fechaCreado.getTime())) {
    // Sin fecha — clasificar solo por sellos actuales
    const s = parseInt(card.currentStamps || 0);
    if (s <= 2)  return "E1 — Ocasional";
    if (s <= 4)  return "E2 — Regular";
    return "E3 — Frecuente";
  }

  const ahora = new Date();
  const meses = Math.max(1,
    (ahora.getFullYear() - fechaCreado.getFullYear()) * 12 +
    (ahora.getMonth()   - fechaCreado.getMonth()) + 1
  );
  const sellosXMes = totalSellos / meses;

  if (sellosXMes <= 2)  return "E1 — Ocasional";
  if (sellosXMes <= 4)  return "E2 — Regular";
  return "E3 — Frecuente";
}

// Busca un card en Loopy por email o celular y lo retorna completo
function buscarCardEnLoopy(termino) {
  try {
    const res = UrlFetchApp.fetch("https://api.loopyloyalty.com/v1/card/cid/"+LOOPY_CID, {
      method:"POST", contentType:"application/json",
      headers:{ Authorization:generarJWTLoopy() },
      payload:JSON.stringify({ dt:{ start:0, length:5, search:termino, order:{ column:"created", dir:"desc" } } }),
      muteHttpExceptions:true,
    });
    if (res.getResponseCode()!==200) return null;
    const cards = JSON.parse(res.getContentText()).data || [];
    if (!cards.length) return null;

    // Verificar que el resultado realmente corresponde al término buscado
    for (const card of cards) {
      const cd = card.customerDetails || card.customerData || {};
      const emailCard  = (cd["Email address"]||cd["email"]||cd["Email"]||"").toString().trim().toLowerCase();
      const celCard    = (cd["Celular"]||cd["Contact Number"]||"").toString().replace(/\+/g,"").replace(/\s/g,"").slice(-10);
      const terminoNorm = termino.toString().trim().toLowerCase();
      const terminoCel  = termino.toString().replace(/\+/g,"").replace(/\s/g,"").slice(-10);

      if (emailCard === terminoNorm || celCard === terminoCel) return card;
    }
    return null;
  } catch(e) {
    console.log("Error buscarCardEnLoopy: " + e.message);
    return null;
  }
}

// ── Prueba de validación email ────────────────────────────────
function probarEmailLoopy() {
  console.log("=== PRUEBA VALIDACIÓN EMAIL LOOPY ===");
  console.log("Email en Loopy (debe ser TRUE)  → " + existeEmailEnLoopy("lparracometa@gmail.com"));
  console.log("Email nuevo (debe ser FALSE)    → " + existeEmailEnLoopy("emailquenuncahasusado@test.com"));
  console.log("Email vacío (debe ser FALSE)    → " + existeEmailEnLoopy(""));
  console.log("Email inválido (debe ser FALSE) → " + existeEmailEnLoopy("noesuncorreo"));
}

// ============================================================
// ── ROUTER ───────────────────────────────────────────────────
// ============================================================
function doGet(e) {
  const p  = e.parameter || {};
  const cb = p.callback  || "callback";
  let resultado;
  try {
    switch (p.accion || "") {
      case "ping":                   resultado = { ok:true };                                   break;
      case "login":                  resultado = loginUsuario(p);                               break;
      case "obtenerCiudades":        resultado = obtenerCiudades();                             break;
      case "obtenerTiendas":         resultado = obtenerTiendasPorCiudad(p.ciudad);             break;
      case "obtenerTodo":            resultado = obtenerTodo();                                 break;
      case "obtenerTiendasCompleto": resultado = obtenerTiendasCompleto();                      break;
      case "verificarCelular":       resultado = verificarCelular(p.celular);                   break;
      case "registrarCupon":         resultado = registrarCuponDesdeLanding(p);                break;
      case "canjearCodigo":          resultado = canjearCodigo(p);                             break;
      case "guardarLink":            resultado = guardarLink(p);                               break;
      case "resolverAlias":          resultado = resolverAlias(p.alias ? p : { alias: p.alias });break;
      case "obtenerConfig":          resultado = { ok:true, config:getCampanaReactivacion() };  break;
      default:                       resultado = { ok:false, mensaje:"Acción no reconocida" };
    }
  } catch (err) {
    resultado = { ok:false, mensaje:"Error: "+err.message };
  }
  return ContentService
    .createTextOutput(cb+"("+JSON.stringify(resultado)+")")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

// ============================================================
// ── LOGIN ─────────────────────────────────────────────────────
// ============================================================
function loginUsuario(p) {
  const usuario = (p.usuario||"").toString().trim().toLowerCase();
  const pass    = (p.pass   ||"").toString().trim();
  if (!usuario || !pass) return { ok:false, mensaje:"Completa usuario y contraseña" };
  const sh = SpreadsheetApp.getActive().getSheetByName("Usuarios");
  if (!sh) return { ok:false, mensaje:"Hoja Usuarios no encontrada" };
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][0]||"").toString().trim().toLowerCase() !== usuario) continue;
    if ((data[i][1]||"").toString().trim() !== pass) continue;
    return { ok:true, usuario,
      rol:    (data[i][2]||"cajero").toString().trim().toLowerCase(),
      tienda: (data[i][3]||"").toString().trim(),
      ciudad: (data[i][4]||"").toString().trim(),
      nombre: (data[i][5]||usuario).toString().trim() };
  }
  return { ok:false, mensaje:"Usuario o contraseña incorrectos" };
}

// ============================================================
// ── CIUDADES Y TIENDAS ────────────────────────────────────────
// ============================================================
function obtenerCiudades() {
  const sh = SpreadsheetApp.getActive().getSheetByName(HOJA_TIENDAS);
  return { ciudades:[...new Set(sh.getDataRange().getValues().slice(1)
    .map(r=>(r[1]||"").toString().trim()).filter(Boolean))].sort() };
}

function obtenerTiendasPorCiudad(ciudad) {
  if (!ciudad) return { tiendas:[] };
  const sh = SpreadsheetApp.getActive().getSheetByName(HOJA_TIENDAS);
  return { tiendas:sh.getDataRange().getValues().slice(1)
    .filter(r=>(r[1]||"").toString().trim().toLowerCase()===ciudad.toLowerCase())
    .map(r=>(r[0]||"").toString().trim()).filter(Boolean) };
}

function obtenerTodo() {
  const sh = SpreadsheetApp.getActive().getSheetByName(HOJA_TIENDAS);
  const ciudadesSet = new Set();
  const tiendas = {};
  sh.getDataRange().getValues().slice(1).forEach(r => {
    const t = (r[0]||"").toString().trim();
    const c = (r[1]||"").toString().trim();
    if (!c) return;
    ciudadesSet.add(c);
    if (!tiendas[c]) tiendas[c] = [];
    if (t) tiendas[c].push(t);
  });
  return { ciudades:[...ciudadesSet].sort(), tiendas };
}

function obtenerTiendasCompleto() {
  const sh   = SpreadsheetApp.getActive().getSheetByName(HOJA_TIENDAS);
  const data = sh.getDataRange().getValues();
  const tiendas = [];
  for (let i = 1; i < data.length; i++) {
    const nombre    = (data[i][0]||"").toString().trim();
    const ciudad    = (data[i][1]||"").toString().trim();
    const direccion = (data[i][2]||"").toString().trim();
    const mapsUrl   = (data[i][3]||"").toString().trim();
    const horario   = (data[i][4]||"").toString().trim();
    if (!nombre) continue;
    tiendas.push({ nombre, ciudad, direccion, mapsUrl, horario });
  }
  return { ok:true, tiendas };
}

// ============================================================
// ── VERIFICAR CELULAR ─────────────────────────────────────────
// ============================================================
function verificarCelular(celular) {
  if (!celular) return { existe:false };
  const resultado = buscarFilaCelular(celular);
  if (!resultado) return { existe:false };
  const { data } = resultado;
  return {
    existe:     true,
    codigo:     data[COL_CODIGO-1],
    estado:     data[COL_ESTADO-1],
    fechaVence: data[COL_FECHA_VENC-1]
      ? new Date(data[COL_FECHA_VENC-1]).toISOString() : null,
  };
}

// ============================================================
// ── REGISTRAR CUPÓN ───────────────────────────────────────────
// ============================================================
function registrarCuponDesdeLanding(p) {
  const codigo   = (p.codigo   ||"").toString().trim().toUpperCase();
  const celular  = (p.celular  ||"").toString().trim();
  const nombre   = (p.nombre   ||"").toString().trim();
  const ciudad   = (p.ciudad   ||"No especificada").toString().trim();
  const tienda   = (p.tienda   ||"No especificada").toString().trim();
  const fase     = (p.fase     ||"organico").toString().trim();
  const fuente   = (p.fuente   ||"directo").toString().trim();
  const producto = (p.producto ||"").toString().trim();
  const momentos = (p.momentos ||"").toString().trim();
  const email    = (p.email    ||"").toString().trim().toLowerCase();
  // ── Trazabilidad ─────────────────────────────────────────
  const linkCamp    = (p.linkCamp    ||"").toString().trim();
  const ciudadReal  = (p.ciudadReal  ||"").toString().trim();
  const coordenadas = (p.coordenadas ||"").toString().trim();
  const fuenteGeo   = (p.fuenteGeo   ||"desconocido").toString().trim();

  let descuento = (p.descuento||"").toString().trim();
  if (descuento && !descuento.includes("%") && descuento !== "sorteo") descuento += "%";

  if (!codigo || !celular) return { ok:false, mensaje:"Faltan datos" };
  if (!esCodigoValido(codigo)) return { ok:false, mensaje:"Formato de código inválido" };

  const fechaGen  = p.fechaGen   ? new Date(p.fechaGen)   : new Date();
  const fechaVenc = p.fechaVence ? new Date(p.fechaVence) : "";

  // ── FLUJO REACTIVACIÓN ────────────────────────────────────
  if (fase === "reactivacion") {
    const existente = buscarFilaCelular(celular);
    if (existente) {
      const estadoActual = (existente.data[COL_ESTADO-1]||"").toString().trim();
      if (estadoActual === ESTADO_DISPONIBLE_REA)
        return { ok:true, existe:true, codigo:existente.data[COL_CODIGO-1],
          fechaVence:existente.data[COL_FECHA_VENC-1]?new Date(existente.data[COL_FECHA_VENC-1]).toISOString():null };
      if (estadoActual === ESTADO_CANJEADO_REA)
        return { ok:false, mensaje:"Este cupón de reactivación ya fue canjeado." };
      if (ESTADOS_REACTIVABLES.includes(estadoActual)) {
        const sh  = existente.sh;
        const row = existente.fila;
        sh.getRange(row, COL_CODIGO).setValue(codigo);
        sh.getRange(row, COL_ESTADO).setValue(ESTADO_DISPONIBLE_REA);
        sh.getRange(row, COL_TIENDA).setValue("");
        sh.getRange(row, COL_FECHA).setValue("");
        sh.getRange(row, COL_LOOPY).setValue("");
        sh.getRange(row, COL_CIUDAD).setValue(ciudad!=="No especificada"?ciudad:existente.data[COL_CIUDAD-1]);
        sh.getRange(row, COL_FASE).setValue(fase);
        sh.getRange(row, COL_FUENTE).setValue(fuente);
        // Col L mantiene el descuento original — solo actualizar si era vacío
        const descOriginal = (existente.data[COL_DESCUENTO-1]||"").toString().trim();
        if (!descOriginal) sh.getRange(row, COL_DESCUENTO).setValue(descuento);
        // Guardar el descuento de reactivación en col AA para comparación
        sh.getRange(row, COL_DESC_FINAL).setValue(descuento + " (REA)");
        sh.getRange(row, COL_PRODUCTO).setValue(producto||existente.data[COL_PRODUCTO-1]);
        sh.getRange(row, COL_FECHA_GEN).setValue(fechaGen);
        sh.getRange(row, COL_FECHA_VENC).setValue(fechaVenc);
        sh.getRange(row, COL_MOMENTOS).setValue(momentos);
        return { ok:true, existe:false, codigo };
      }
    }
    // No encontró fila → crear nueva fila REA
    const sh = SpreadsheetApp.getActive().getSheetByName(HOJA_CODIGOS);
    sh.appendRow([
      codigo, ESTADO_DISPONIBLE_REA, "", "", "",
      nombre, celular, ciudad, tienda,
      fase, fuente, descuento, producto,
      fechaGen, fechaVenc, momentos,
      linkCamp, ciudadReal, coordenadas, fuenteGeo,
      email, (p.fingerprint||""), "Sin email", "",
    ]);
    return { ok:true, existe:false, codigo };
  }

  // ── FLUJO NORMAL ──────────────────────────────────────────
  // Usuario de prueba — saltar todas las verificaciones
  const esWhitelisted = isWhitelisted(celular, email);

  if (!esWhitelisted) {
    // Verificar Loopy por celular
    const celNorm    = celular.toString().replace(/\+/g,"").replace(/\s/g,"");
    const esColombia = celNorm.length===10||(celNorm.startsWith("57")&&celNorm.length===12);
    if (esColombia && existeEnLoopy(celular)) {
      return { ok:false, esLoopy:true, mensaje:"Esta campaña es exclusiva para clientes nuevos. Ya tienes una cuenta Oakberry registrada." };
    }

    // Verificar cupón activo (no vencido)
    const check = verificarCelular(celular);
    if (check.existe && !ESTADOS_REACTIVABLES.includes(check.estado)) {
      return { ok:true, existe:true, codigo:check.codigo, fechaVence:check.fechaVence, estado:check.estado };
    }
  }

  // ── Verificar email en Loopy, clasificar segmento ───────────
  const fechaVerif = Utilities.formatDate(new Date(), "America/Bogota", "dd/MM/yyyy HH:mm");
  let enLoopy    = "Sin email";
  let tipoUsuario = "";

  if (esWhitelisted) {
    // Usuario de prueba — siempre N1
    tipoUsuario = "N1 — Nuevo puro";
  } else {
    if (email) {
      const estaEnLoopy = existeEmailEnLoopy(email);
      enLoopy = estaEnLoopy ? "SÍ" : "NO";
    }
    // Clasificar segmento N1/E1/E2/E3 — usa email y celular
    tipoUsuario = clasificarUsuarioLoopy(email, celular);
  }

  // Crear fila nueva con todas las columnas Q–Y
  const sh = SpreadsheetApp.getActive().getSheetByName(HOJA_CODIGOS);
  sh.appendRow([
    // A–P
    codigo, ESTADO_DISPONIBLE, "", "", "",
    nombre, celular, ciudad, tienda,
    fase, fuente, descuento, producto,
    fechaGen, fechaVenc, momentos,
    // Q–Y
    linkCamp,             // Q
    ciudadReal,           // R
    coordenadas,          // S
    fuenteGeo,            // T
    email,                // U
    (p.fingerprint||""),  // V
    enLoopy,              // W
    fechaVerif,           // X
    tipoUsuario,          // Y — N1 | E1 | E2 | E3
  ]);
  // ── Enviar cupón por WA (Flujo 1) ───────────────────────────
  // Plantilla oakberry_cupon_nuevo — activa cuando Meta apruebe
  try {
    waEnviarCupon(celular, nombre, codigo, descuento, producto, p.vigencia || "72");
  } catch(e) {
    console.log("WA cupón fallido (no bloquea el registro): " + e.message);
  }

  return { ok:true, existe:false, codigo };
}

// ============================================================
// ── CANJEAR CÓDIGO ────────────────────────────────────────────
// ============================================================
function canjearCodigo(p) {
  const codigo = (p.codigo||"").toString().trim().toUpperCase();
  const tienda = (p.tienda||"").toString().trim();
  const ciudad = (p.ciudad||"").toString().trim();
  const loopy  = (p.loopy ||"").toString().trim();

  if (!codigo || !tienda || !ciudad) return { ok:false, mensaje:"Faltan datos" };
  if (!esCodigoValido(codigo)) return { ok:false, mensaje:"❌ Formato de código inválido\nDebe ser 5 caracteres (ej: A3K7P)" };

  const sh   = SpreadsheetApp.getActive().getSheetByName(HOJA_CODIGOS);
  const data = sh.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if ((data[i][COL_CODIGO-1]||"").toString().trim().toUpperCase() !== codigo) continue;

    const estadoActual = (data[i][COL_ESTADO-1]||"").toString().trim();

    if (estadoActual===ESTADO_CANJEADO||estadoActual===ESTADO_CANJEADO_REA)
      return { ok:false, mensaje:"ya fue canjeado" };
    if (estadoActual===ESTADO_VENCIDO||estadoActual===ESTADO_VENCIDO_REA)
      return { ok:false, mensaje:"ya venció" };
    if (!ESTADOS_CANJEABLES.includes(estadoActual))
      return { ok:false, mensaje:"❌ Cupón no válido" };

    const ciudadCupon = (data[i][COL_CIUDAD-1]   ||"").toString().trim().toLowerCase();
    const descuento   = (data[i][COL_DESCUENTO-1]||"").toString().trim();
    const producto    = (data[i][COL_PRODUCTO-1] ||"").toString().trim();
    const momentos    = (data[i][COL_MOMENTOS-1] ||"").toString().trim().toLowerCase();
    const nombreCli   = (data[i][COL_NOMBRE-1]   ||"").toString().trim();
    const celCli      = (data[i][COL_CELULAR-1]  ||"").toString().trim();

    // Validar ciudad
    if (ciudadCupon && !["no especificada","todas","general"].includes(ciudadCupon)) {
      const cc = ciudad.toLowerCase();
      if (!cc.includes(ciudadCupon) && !ciudadCupon.includes(cc))
        return { ok:false, mensaje:"Ciudad incorrecta\nválido en: "+data[i][COL_CIUDAD-1] };
    }

    // Validar momento (soporte cruce de medianoche para madrugada)
    if (momentos) {
      const ahora = new Date();
      const hora  = ahora.getHours() + ahora.getMinutes()/60;
      const lista = momentos.split(",").map(m=>m.trim()).filter(Boolean);
      const valido = lista.some(m => {
        const r = RANGOS_MOMENTOS[m];
        if (!r) return false;
        if (r.cruce) return hora >= r.inicio || hora < r.fin;
        return hora >= r.inicio && hora < r.fin;
      });
      if (!valido)
        return { ok:false, mensaje:"fuera de horario\nSolo válido en:\n"
          +lista.map(m=>RANGOS_MOMENTOS[m]?.nombre||m).join(", ") };
    }

    // Fix descuento: normalizar decimal a % — declarar ANTES de usar
    const descFormatado = (() => {
      if (descuento.includes("%")) return descuento;
      const n = parseFloat(descuento);
      if (!isNaN(n) && n > 0 && n <= 1) return Math.round(n*100)+"%";
      if (!isNaN(n)) return Math.round(n)+"%";
      return descuento;
    })();

    const nuevoEstado = estadoActual===ESTADO_DISPONIBLE_REA ? ESTADO_CANJEADO_REA : ESTADO_CANJEADO;
    sh.getRange(i+1, COL_ESTADO).setValue(nuevoEstado);
    sh.getRange(i+1, COL_TIENDA).setValue(tienda+" - "+ciudad);
    sh.getRange(i+1, COL_FECHA).setValue(new Date());
    sh.getRange(i+1, COL_LOOPY).setValue(loopy);
    // Col AA — descuento final canjeado (permite comparar con descuento original col L)
    sh.getRange(i+1, COL_DESC_FINAL).setValue(descFormatado);

    // ── Enviar agradecimiento por WA (Flujo 4) ──────────────
    // Plantilla oakberry_post_canje — activa cuando Meta apruebe
    try {
      waEnviarPostCanje(celCli, nombreCli);
    } catch(e) {
      console.log("WA post-canje fallido (no bloquea el canje): " + e.message);
    }

    return { ok:true, mensaje:[
      "✅ Cupón válido" + (nuevoEstado===ESTADO_CANJEADO_REA ? " · Reactivación" : ""),
      "👤 " + nombreCli,
      "📱 " + celCli,
      "🎁 " + descFormatado + " en " + producto,
    ].join("\n") };
  }
  return { ok:false, mensaje:"no existe" };
}

// ============================================================
// ── GUARDAR LINK ──────────────────────────────────────────────
// ============================================================
function guardarLink(p) {
  const nombre = (p.nombre||"").toString().trim();
  if (!nombre) return { ok:false, mensaje:"Falta nombre" };
  const alias = nombre.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/\s+/g,"-").replace(/[^a-z0-9\-]/g,"").replace(/-+/g,"-");
  SpreadsheetApp.getActive().getSheetByName(HOJA_LINKS).appendRow([
    nombre, p.modo||"", p.ciudad||"", p.tienda||"",
    p.fase||"", p.fuente||"", p.producto||"",
    p.descuento||"", p.premio||"", p.vigencia||"",
    p.momentos||"", p.link||"", new Date(), alias,
  ]);
  return { ok:true, alias };
}

// ============================================================
// ── RESOLVER ALIAS ────────────────────────────────────────────
// ============================================================
function resolverAlias(p) {
  const alias = (p.alias||"").toString().trim().toLowerCase();
  if (!alias) return { ok:false, mensaje:"Falta alias" };
  const data = SpreadsheetApp.getActive().getSheetByName(HOJA_LINKS).getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][13]||"").toString().trim().toLowerCase()===alias)
      return { ok:true, link:data[i][11] };
  }
  return { ok:false, mensaje:"Alias no encontrado: "+alias };
}
