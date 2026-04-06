// ============================================================
// OAKBERRY — Apps Script completo v9
// 6 estados · Reactivación · Tiendas con mapa · Email/Fingerprint/Loopy
// ============================================================

const HOJA_CODIGOS = "Códigos";
const HOJA_LINKS   = "Links";
const HOJA_TIENDAS = "Tiendas";
const HOJA_ADIDAS      = "Adidas";
const ADIDAS_PRODUCTO  = "Bowl Especial Adidas";
const ADIDAS_CAMPAÑA   = "adidas-abril-2026";
const ADIDAS_VENCE     = new Date("2026-04-30T23:59:59");

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
const COL_DESC_FINAL    = 27;
const COL_TIPO_FINAL    = 28; // AB — Tipo reconciliado (sistema + cajero) // AA — Descuento final canjeado (solo se llena al canjear)

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
  const ahora = new Date();
  let contador = 0;

  // ── Hoja Códigos (cupones normales) ──────────────────────────
  const sh    = SpreadsheetApp.getActive().getSheetByName(HOJA_CODIGOS);
  const data  = sh.getDataRange().getValues();
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
  // ── Hoja Adidas ──────────────────────────────────────────────
  const shAd = SpreadsheetApp.getActive().getSheetByName(HOJA_ADIDAS);
  if (shAd && shAd.getLastRow() > 1) {
    const dataAd = shAd.getDataRange().getValues();
    for (let i=1; i<dataAd.length; i++) {
      const est   = (dataAd[i][1]||"").toString().trim();
      const fVenc = dataAd[i][8] ? new Date(dataAd[i][8]) : null;
      if (est !== "Disponible") continue;
      if (!fVenc || isNaN(fVenc.getTime())) continue;
      if (ahora > fVenc) { shAd.getRange(i+1,2).setValue("Vencido"); contador++; }
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
const WA_TOKEN           = "EAAKrFCnuYsoBRD2VxGJvUI3mc5j56nTnZCUxByRxpPnUf1HnaebD86iy1XZBWuhPPpbD4O1Efv3fPZCBOZBGYd0ynnZCeC2pwjWSfxPVKQtXN2wO3moXa9ZB6eZCs3ZCxxQ0ZBZBh5JAJmYmUg7RiPptffYV9d9mkxqPtZAP78fLPZBA3x0O37ic9aXRK0vrXNGTWQZDZD"; // Permanente — ads_read + WA + business_management
const META_ADS_TOKEN     = "EAAKrFCnuYsoBRD2VxGJvUI3mc5j56nTnZCUxByRxpPnUf1HnaebD86iy1XZBWuhPPpbD4O1Efv3fPZCBOZBGYd0ynnZCeC2pwjWSfxPVKQtXN2wO3moXa9ZB6eZCs3ZCxxQ0ZBZBh5JAJmYmUg7RiPptffYV9d9mkxqPtZAP78fLPZBA3x0O37ic9aXRK0vrXNGTWQZDZD"; // Permanente — ads_read + WA + business_management
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

    // ── Verificar si es cliente Loopy (solo N1 reciben reactivación) ──
    const emailRea  = (data[i][COL_EMAIL-1]  ||"").toString().trim();
    const celularRea = (data[i][COL_CELULAR-1]||"").toString().trim();
    let esLoopyRea = false;

    if (emailRea) {
      esLoopyRea = existeEmailEnLoopy(emailRea);
    }
    if (!esLoopyRea && celularRea) {
      esLoopyRea = existeEnLoopy(celularRea);
    }

    if (esLoopyRea) {
      // Cliente Loopy — no recibe reactivación, marcar como Control-Loopy
      sh.getRange(i + 1, COL_GRUPO_AB).setValue("Control-Loopy");
      controles++;
      continue;
    }

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

  console.log("♻️ A/B Reactivaciones — Enviados: " + enviados + " | Control: " + controles + " (incluye Control-Loopy)");
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
    "A-30%":        { enviados:0, canjeados:0 },
    "B-40%":        { enviados:0, canjeados:0 },
    "Control":      { enviados:0, canjeados:0 },
    "Control-Loopy":{ enviados:0, canjeados:0 },
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
// ── DASHBOARD — Funciones de datos ──────────────────────────
// ============================================================

function dashboardResumen() {
  const sh   = SpreadsheetApp.getActive().getSheetByName(HOJA_CODIGOS);
  const data = sh.getDataRange().getValues();
  const r = { entregados:0,canjeados:0,vencidos:0,disponibles:0,dispRea:0,canjeadoRea:0,vencidoRea:0,n1:0,e1:0,e2:0,e3:0,e4:0 };
  for (let i=1;i<data.length;i++) {
    const est  = (data[i][COL_ESTADO-1]      ||"").toString().trim();
    const tipo = (data[i][COL_TIPO_USUARIO-1]||"").toString().trim();
    if (!est) continue;
    r.entregados++;
    if (est===ESTADO_CANJEADO)       r.canjeados++;
    if (est===ESTADO_VENCIDO)        r.vencidos++;
    if (est===ESTADO_DISPONIBLE)     r.disponibles++;
    if (est===ESTADO_DISPONIBLE_REA) r.dispRea++;
    if (est===ESTADO_CANJEADO_REA)   r.canjeadoRea++;
    if (est===ESTADO_VENCIDO_REA)    r.vencidoRea++;
    // Col Y = tipo sistema, Col AB = tipo final reconciliado
    const tipoFinal = (data[i][COL_TIPO_FINAL-1]||tipo).toString().trim();
    if (tipoFinal.startsWith("N1")) r.n1++;
    else if (tipoFinal.startsWith("E1")) r.e1++;
    else if (tipoFinal.startsWith("E2")) r.e2++;
    else if (tipoFinal.startsWith("E3")) r.e3++;
    else if (tipoFinal.startsWith("E4")) r.e4 = (r.e4||0) + 1;
    else if (tipo.startsWith("N1")) r.n1++; // fallback si col AB vacía
    else if (tipo.startsWith("E1")) r.e1++;
    else if (tipo.startsWith("E2")) r.e2++;
    else if (tipo.startsWith("E3")) r.e3++;
  }
  return { ok:true, resumen:r };
}

function dashboardCampanas() {
  const sh   = SpreadsheetApp.getActive().getSheetByName(HOJA_CODIGOS);
  const data = sh.getDataRange().getValues();
  const map  = {};
  for (let i=1;i<data.length;i++) {
    const est    = (data[i][COL_ESTADO-1] ||"").toString().trim();
    const fuente = (data[i][COL_FUENTE-1] ||"directo").toString().trim();
    if (!est) continue;
    if (!map[fuente]) map[fuente]={fuente,entregados:0,canjeados:0,vencidos:0};
    map[fuente].entregados++;
    if (est===ESTADO_CANJEADO||est===ESTADO_CANJEADO_REA) map[fuente].canjeados++;
    if (est===ESTADO_VENCIDO||est===ESTADO_VENCIDO_REA)   map[fuente].vencidos++;
  }

  // ── Meta Ads via Apps Script (evita CORS del browser) ────────
  let metaAds = [];
  try {
    const META_ADS_ACCOUNT = "act_752081110313383";
    const url = "https://graph.facebook.com/v22.0/" + META_ADS_ACCOUNT +
      "/insights?fields=campaign_name,adset_name,ad_name,impressions,reach,spend,clicks,cpc,cpm" +
      "&date_preset=last_30d&level=ad&limit=50" +
      "&access_token=" + META_ADS_TOKEN;
    const res  = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const json = JSON.parse(res.getContentText());
    if (json.data) metaAds = json.data;
  } catch(e) {
    console.log("Meta Ads error: " + e.message);
  }

  return { ok:true, campanas:Object.values(map).sort((a,b)=>b.entregados-a.entregados), metaAds };
}

function dashboardSegmentos() {
  const sh   = SpreadsheetApp.getActive().getSheetByName(HOJA_CODIGOS);
  const data = sh.getDataRange().getValues();
  const map  = {
    "N1":{ tipo:"N1 — Nuevo puro",total:0,canjeados:0 },
    "E1":{ tipo:"E1 — Ocasional", total:0,canjeados:0 },
    "E2":{ tipo:"E2 — Regular",   total:0,canjeados:0 },
    "E3":{ tipo:"E3 — Frecuente", total:0,canjeados:0 },
  };
  for (let i=1;i<data.length;i++) {
    const est  = (data[i][COL_ESTADO-1]      ||"").toString().trim();
    const tipo = (data[i][COL_TIPO_USUARIO-1]||"N1").toString().trim().slice(0,2);
    if (!est||!map[tipo]) continue;
    map[tipo].total++;
    if (est===ESTADO_CANJEADO||est===ESTADO_CANJEADO_REA) map[tipo].canjeados++;
  }
  return { ok:true, segmentos:Object.values(map) };
}

function dashboardCiudades() {
  const sh   = SpreadsheetApp.getActive().getSheetByName(HOJA_CODIGOS);
  const data = sh.getDataRange().getValues();
  const map  = {};
  for (let i=1;i<data.length;i++) {
    const est = (data[i][COL_ESTADO-1]||"").toString().trim();
    let ciudad = (data[i][COL_CIUDAD_REAL-1]||data[i][COL_CIUDAD-1]||"Desconocida").toString().trim();
    if (!ciudad||ciudad==="desconocido"||ciudad==="") ciudad="Desconocida";
    ciudad = ciudad.charAt(0).toUpperCase()+ciudad.slice(1).toLowerCase();
    if (ciudad==="Todas"||ciudad==="General") ciudad="Nacional";
    if (!est) continue;
    if (!map[ciudad]) map[ciudad]={ciudad,entregados:0,canjeados:0,vencidos:0};
    map[ciudad].entregados++;
    if (est===ESTADO_CANJEADO||est===ESTADO_CANJEADO_REA) map[ciudad].canjeados++;
    if (est===ESTADO_VENCIDO||est===ESTADO_VENCIDO_REA)   map[ciudad].vencidos++;
  }
  return { ok:true, ciudades:Object.values(map).filter(c=>c.ciudad!=="Desconocida").sort((a,b)=>b.entregados-a.entregados).slice(0,12) };
}

function dashboardReactivacion() {
  const sh   = SpreadsheetApp.getActive().getSheetByName(HOJA_CODIGOS);
  const data = sh.getDataRange().getValues();
  const d = {
    vencidosTotales:0,reactivados:0,canjeadosRea:0,dispRea:0,vencidosRea:0,
    tasaPrimer:0,tasaReactivacion:0,costoWA:0,
    abTest:{"A-30%":{total:0,canjeados:0},"B-40%":{total:0,canjeados:0},"Control":{total:0,canjeados:0}}
  };
  let totalCanjeado=0,totalPrimer=0;
  for (let i=1;i<data.length;i++) {
    const est   = (data[i][COL_ESTADO-1]  ||"").toString().trim();
    const grupo = (data[i][COL_GRUPO_AB-1]||"").toString().trim();
    const fase  = (data[i][COL_FASE-1]    ||"").toString().trim();
    if (!est) continue;
    if (est===ESTADO_VENCIDO||est===ESTADO_VENCIDO_REA) d.vencidosTotales++;
    if (est===ESTADO_DISPONIBLE_REA){d.reactivados++;d.dispRea++;}
    if (est===ESTADO_CANJEADO_REA)  {d.reactivados++;d.canjeadosRea++;}
    if (est===ESTADO_VENCIDO_REA)   d.vencidosRea++;
    if (grupo&&d.abTest[grupo]){
      d.abTest[grupo].total++;
      if (est===ESTADO_CANJEADO_REA) d.abTest[grupo].canjeados++;
    }
    if (fase!=="reactivacion"){totalPrimer++;if(est===ESTADO_CANJEADO)totalCanjeado++;}
  }
  d.tasaPrimer       = totalPrimer>0?Math.round((totalCanjeado/totalPrimer)*100):0;
  d.tasaReactivacion = d.reactivados>0?Math.round((d.canjeadosRea/d.reactivados)*100):0;
  d.costoWA          = (d.abTest["A-30%"].total+d.abTest["B-40%"].total)*275;
  return { ok:true, reactivacion:d };
}


// ============================================================
// ── GENERAR HOJA DASHBOARD ───────────────────────────────────
// ============================================================
// Corre manualmente o via trigger diario para actualizar métricas
function generarHojaDashboard() {
  const ss   = SpreadsheetApp.getActive();
  const src  = ss.getSheetByName(HOJA_CODIGOS);
  if (!src) return;

  // Crear o limpiar hoja Dashboard
  let dash = ss.getSheetByName("Dashboard");
  if (!dash) dash = ss.insertSheet("Dashboard");
  dash.clearContents();

  const data = src.getDataRange().getValues();
  const ahora = new Date();

  // ── Contadores ───────────────────────────────────────────────
  const estados = {total:0,disponible:0,canjeado:0,vencido:0,dispRea:0,canjeadoRea:0,vencidoRea:0};
  const tipos   = {N1:0,E1:0,E2:0,E3:0};
  const fuentes = {};
  const ciudades = {};
  const abTest  = {"A-30%":{enviados:0,canjeados:0},"B-40%":{enviados:0,canjeados:0},"Control":{enviados:0,canjeados:0},"Control-Loopy":{enviados:0,canjeados:0}};
  let totalPrimer=0, canjeadoPrimer=0, reactivados=0, canjeadosRea=0;

  for (let i=1; i<data.length; i++) {
    const est    = (data[i][COL_ESTADO-1]      ||"").toString().trim();
    const tipo   = (data[i][COL_TIPO_USUARIO-1]||"").toString().trim().slice(0,2);
    const fuente = (data[i][COL_FUENTE-1]      ||"directo").toString().trim();
    const grupo  = (data[i][COL_GRUPO_AB-1]    ||"").toString().trim();
    const fase   = (data[i][COL_FASE-1]        ||"").toString().trim();
    let   ciudad = (data[i][COL_CIUDAD_REAL-1] ||data[i][COL_CIUDAD-1]||"").toString().trim();
    if (!est) continue;

    // Estados
    estados.total++;
    if (est===ESTADO_DISPONIBLE)     estados.disponible++;
    if (est===ESTADO_CANJEADO)       estados.canjeado++;
    if (est===ESTADO_VENCIDO)        estados.vencido++;
    if (est===ESTADO_DISPONIBLE_REA) estados.dispRea++;
    if (est===ESTADO_CANJEADO_REA)   estados.canjeadoRea++;
    if (est===ESTADO_VENCIDO_REA)    estados.vencidoRea++;

    // Tipos
    if (tipos[tipo]!==undefined) tipos[tipo]++;

    // Fuentes
    if (!fuentes[fuente]) fuentes[fuente]={fuente,entregados:0,canjeados:0,vencidos:0};
    fuentes[fuente].entregados++;
    if (est===ESTADO_CANJEADO||est===ESTADO_CANJEADO_REA) fuentes[fuente].canjeados++;
    if (est===ESTADO_VENCIDO||est===ESTADO_VENCIDO_REA)   fuentes[fuente].vencidos++;

    // Ciudades
    if (!ciudad||ciudad==="desconocido"||ciudad==="todas"||ciudad==="general") ciudad="Nacional";
    else ciudad = ciudad.charAt(0).toUpperCase()+ciudad.slice(1).toLowerCase();
    if (!ciudades[ciudad]) ciudades[ciudad]={ciudad,entregados:0,canjeados:0,vencidos:0};
    ciudades[ciudad].entregados++;
    if (est===ESTADO_CANJEADO||est===ESTADO_CANJEADO_REA) ciudades[ciudad].canjeados++;
    if (est===ESTADO_VENCIDO||est===ESTADO_VENCIDO_REA)   ciudades[ciudad].vencidos++;

    // A/B test
    if (grupo&&abTest[grupo]) {
      abTest[grupo].enviados++;
      if (est===ESTADO_CANJEADO_REA) abTest[grupo].canjeados++;
    }

    // Reactivación vs primer impacto
    if (fase==="reactivacion") {
      if (est===ESTADO_DISPONIBLE_REA||est===ESTADO_CANJEADO_REA||est===ESTADO_VENCIDO_REA) reactivados++;
      if (est===ESTADO_CANJEADO_REA) canjeadosRea++;
    } else {
      totalPrimer++;
      if (est===ESTADO_CANJEADO) canjeadoPrimer++;
    }
  }

  const tasaPrimer = totalPrimer>0 ? (canjeadoPrimer/totalPrimer*100).toFixed(1)+"%" : "0%";
  const tasaRea    = reactivados>0 ? (canjeadosRea/reactivados*100).toFixed(1)+"%" : "0%";
  const tasaCanje  = estados.total>0 ? ((estados.canjeado+estados.canjeadoRea)/estados.total*100).toFixed(1)+"%" : "0%";
  const costoWA    = (abTest["A-30%"].enviados+abTest["B-40%"].enviados)*275;

  // ── Escribir en hoja Dashboard ───────────────────────────────
  let row = 1;

  // Encabezado
  dash.getRange(row,1,1,2).setValues([["OAKBERRY · Dashboard Cupones","Última actualización: "+Utilities.formatDate(ahora,"America/Bogota","dd/MM/yyyy HH:mm")]]);
  dash.getRange(row,1,1,2).setFontWeights([["bold","normal"]]).setFontSizes([[14,10]]);
  row += 2;

  // KPIs Globales
  dash.getRange(row,1).setValue("KPIs GLOBALES").setFontWeight("bold").setFontSize(12);
  row++;
  const kpiHeaders = ["Métrica","Total","N1 Nuevo","E1 Ocasional","E2 Regular","E3 Frecuente","Notas"];
  dash.getRange(row,1,1,7).setValues([kpiHeaders]).setFontWeight("bold").setBackground("#5F4B8B").setFontColor("#ffffff");
  row++;
  const kpiRows = [
    ["Cupones generados", estados.total, tipos.N1, tipos.E1, tipos.E2, tipos.E3, "Total en base de datos"],
    ["Canjeados", estados.canjeado+estados.canjeadoRea, "", "", "", "", "Incluye REA"],
    ["Tasa de canje", tasaCanje, "", "", "", "", ""],
    ["Disponibles activos", estados.disponible+estados.dispRea, "", "", "", "", "Pendientes de canjear"],
    ["Vencidos", estados.vencido+estados.vencidoRea, "", "", "", "", "Sin canjear"],
  ];
  dash.getRange(row,1,kpiRows.length,7).setValues(kpiRows);
  row += kpiRows.length + 2;

  // Fuentes
  dash.getRange(row,1).setValue("CUPONES POR FUENTE").setFontWeight("bold").setFontSize(12);
  row++;
  const fuenteHeaders = ["Fuente","Entregados","Canjeados","Tasa Canje","Vencidos"];
  dash.getRange(row,1,1,5).setValues([fuenteHeaders]).setFontWeight("bold").setBackground("#5F4B8B").setFontColor("#ffffff");
  row++;
  const fuenteRows = Object.values(fuentes).sort((a,b)=>b.entregados-a.entregados).map(f=>[
    f.fuente, f.entregados, f.canjeados,
    f.entregados>0?(f.canjeados/f.entregados*100).toFixed(1)+"%":"0%",
    f.vencidos
  ]);
  if (fuenteRows.length) dash.getRange(row,1,fuenteRows.length,5).setValues(fuenteRows);
  row += fuenteRows.length + 2;

  // Ciudades
  dash.getRange(row,1).setValue("CUPONES POR CIUDAD").setFontWeight("bold").setFontSize(12);
  row++;
  dash.getRange(row,1,1,5).setValues([["Ciudad","Entregados","Canjeados","Tasa Canje","Vencidos"]]).setFontWeight("bold").setBackground("#5F4B8B").setFontColor("#ffffff");
  row++;
  const ciudadRows = Object.values(ciudades).sort((a,b)=>b.entregados-a.entregados).slice(0,15).map(c=>[
    c.ciudad, c.entregados, c.canjeados,
    c.entregados>0?(c.canjeados/c.entregados*100).toFixed(1)+"%":"0%",
    c.vencidos
  ]);
  if (ciudadRows.length) dash.getRange(row,1,ciudadRows.length,5).setValues(ciudadRows);
  row += ciudadRows.length + 2;

  // A/B Test
  dash.getRange(row,1).setValue("A/B TEST REACTIVACIÓN").setFontWeight("bold").setFontSize(12);
  row++;
  dash.getRange(row,1,1,4).setValues([["Grupo","Enviados","Canjeados","Tasa"]]).setFontWeight("bold").setBackground("#5F4B8B").setFontColor("#ffffff");
  row++;
  const abRows = Object.entries(abTest).map(([g,v])=>[
    g, v.enviados, v.canjeados,
    v.enviados>0?(v.canjeados/v.enviados*100).toFixed(1)+"%":"0%"
  ]);
  dash.getRange(row,1,abRows.length,4).setValues(abRows);
  row += abRows.length + 2;

  // Reactivación vs Primer impacto
  dash.getRange(row,1).setValue("REACTIVACIÓN vs PRIMER IMPACTO").setFontWeight("bold").setFontSize(12);
  row++;
  dash.getRange(row,1,1,3).setValues([["Flujo","Tasa de canje","Observación"]]).setFontWeight("bold").setBackground("#5F4B8B").setFontColor("#ffffff");
  row++;
  dash.getRange(row,1,2,3).setValues([
    ["Primer impacto", tasaPrimer, totalPrimer+" cupones emitidos, "+canjeadoPrimer+" canjeados"],
    ["Reactivación",   tasaRea,    reactivados+" reactivados, "+canjeadosRea+" canjeados · Costo WA: $"+costoWA.toLocaleString()],
  ]);

  // Formato general
  dash.autoResizeColumns(1,7);
  dash.setFrozenRows(1);

  console.log("✅ Hoja Dashboard actualizada — " + estados.total + " registros procesados");
  return { ok:true, mensaje:"Dashboard actualizado: "+estados.total+" registros" };
}

// ── Instalar trigger diario para Dashboard ────────────────────
function instalarTriggerDashboard() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction()==="generarHojaDashboard") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("generarHojaDashboard")
    .timeBased().everyDays(1).atHour(8).inTimezone("America/Bogota").create();
  console.log("✅ Trigger Dashboard instalado — se actualiza cada día a las 8am");
}


// ── Leer hoja Dashboard para el HTML ─────────────────────────
function leerHojaDashboard() {
  const ss   = SpreadsheetApp.getActive();
  const dash = ss.getSheetByName("Dashboard");
  if (!dash) return { ok:false, mensaje:"Hoja Dashboard no encontrada. Corre generarHojaDashboard primero." };
  const data = dash.getDataRange().getValues();
  return { ok:true, rows: data };
}


// ============================================================
// ── CAMPAÑA ADIDAS — Generación de cupones ───────────────────
// ============================================================
// ADIDAS constants moved to top

// ── Generar 1500 códigos Adidas ───────────────────────────────
// Ejecutar UNA SOLA VEZ — crea la hoja y genera los códigos
function generarCodigosAdidas() {
  const ss  = SpreadsheetApp.getActive();
  let hoja  = ss.getSheetByName(HOJA_ADIDAS);

  // Si ya existe con datos, preguntar
  if (hoja && hoja.getLastRow() > 1) {
    console.log("⚠️ La hoja Adidas ya tiene " + (hoja.getLastRow()-1) + " códigos. Borra la hoja manualmente si quieres regenerar.");
    return { ok:false, mensaje:"Hoja Adidas ya existe con datos" };
  }

  // Crear hoja si no existe
  if (!hoja) hoja = ss.insertSheet(HOJA_ADIDAS);
  hoja.clearContents();

  // Encabezados
  const headers = [
    "Código","Estado","Tienda Canje","Fecha Canje","Perfil Cajero",
    "Campaña","Producto","Fecha Generación","Fecha Vencimiento"
  ];
  hoja.getRange(1,1,1,headers.length).setValues([headers])
    .setFontWeight("bold").setBackground("#000000").setFontColor("#ffffff");

  // Generar códigos únicos
  const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const usados = new Set();

  // También verificar contra hoja Códigos para evitar duplicados globales
  const shCodigos = ss.getSheetByName(HOJA_CODIGOS);
  if (shCodigos) {
    const existentes = shCodigos.getRange(2,1,shCodigos.getLastRow(),1).getValues();
    existentes.forEach(r => usados.add((r[0]||"").toString().trim().toUpperCase()));
  }

  const rows = [];
  let intentos = 0;
  while (rows.length < 1500 && intentos < 10000) {
    intentos++;
    let cod = "";
    for (let i=0;i<5;i++) cod += CHARS[Math.floor(Math.random()*CHARS.length)];
    if (usados.has(cod)) continue;
    usados.add(cod);
    rows.push([
      cod, "Disponible", "", "", "",
      ADIDAS_CAMPAÑA, ADIDAS_PRODUCTO,
      new Date(), ADIDAS_VENCE
    ]);
  }

  // Escribir en lotes de 200
  for (let i=0; i<rows.length; i+=200) {
    const lote = rows.slice(i, i+200);
    hoja.getRange(i+2, 1, lote.length, lote[0].length).setValues(lote);
  }

  // Formato fechas
  hoja.getRange(2,8,rows.length,2).setNumberFormat("dd/MM/yyyy HH:mm");
  hoja.autoResizeColumns(1, headers.length);
  hoja.setFrozenRows(1);

  console.log("✅ " + rows.length + " códigos Adidas generados");
  return { ok:true, generados:rows.length, mensaje:rows.length+" códigos generados en hoja Adidas" };
}

// ── Estadísticas campaña Adidas ───────────────────────────────
function reporteAdidas() {
  const hoja = SpreadsheetApp.getActive().getSheetByName(HOJA_ADIDAS);
  if (!hoja) return { ok:false, mensaje:"Hoja Adidas no encontrada" };
  const data = hoja.getDataRange().getValues();
  let total=0, disponibles=0, canjeados=0, vencidos=0;
  for (let i=1;i<data.length;i++) {
    const est = (data[i][1]||"").toString().trim();
    if (!est) continue;
    total++;
    if (est==="Disponible") disponibles++;
    if (est==="Canjeado")   canjeados++;
    if (est==="Vencido")    vencidos++;
  }
  console.log("════ REPORTE ADIDAS ════");
  console.log("Total:      " + total);
  console.log("Disponibles: " + disponibles);
  console.log("Canjeados:  " + canjeados + " (" + (total>0?(canjeados/total*100).toFixed(1):0) + "%)");
  console.log("Vencidos:   " + vencidos);
  return { ok:true, total, disponibles, canjeados, vencidos };
}


// ── Diagnóstico rápido de registro ───────────────────────────
function testRegistro() {
  const resultado = registrarCuponDesdeLanding({
    codigo:    "TEST1",
    celular:   "571111111111",
    nombre:    "TEST DIAGNOSTICO",
    ciudad:    "Bogota",
    tienda:    "general",
    fase:      "test",
    fuente:    "diagnostico",
    descuento: "20%",
    producto:  "Bowl Test",
    fechaGen:  new Date().toISOString(),
    fechaVence: new Date(Date.now() + 72*3600000).toISOString(),
    momentos:  "",
    linkCamp:  "",
    ciudadReal:"",
    coordenadas:"",
    fuenteGeo: "desconocido",
    email:     "",
    fingerprint:"",
    vigencia:  "72",
  });
  console.log("Resultado: " + JSON.stringify(resultado));
  // Limpiar el registro de prueba
  const sh = SpreadsheetApp.getActive().getSheetByName(HOJA_CODIGOS);
  const data = sh.getDataRange().getValues();
  for (let i=1;i<data.length;i++) {
    if ((data[i][0]||"").toString().trim()==="TEST1") {
      sh.deleteRow(i+1);
      console.log("✅ Fila de prueba eliminada");
      break;
    }
  }
}

// ============================================================
// ── RESCATE DE CUPÓN ─────────────────────────────────────────
// Cuando un cliente llega con cupón fantasma (no existe en BD)
// el cajero puede generar un código de reemplazo válido 2h
// ============================================================
function rescatarCupon(p) {
  const codigoOriginal = (p.codigoOriginal||"").toString().trim().toUpperCase();
  const celular        = (p.celular       ||"").toString().trim();
  const ciudad         = (p.ciudad        ||"Bogota").toString().trim();
  const tienda         = (p.tienda        ||"").toString().trim();

  if (!codigoOriginal || !celular || !tienda)
    return { ok:false, mensaje:"Faltan datos para procesar el rescate." };

  const ss    = SpreadsheetApp.getActive();
  const ahora = new Date();

  // ── FILTRO 1: Límite 5 rescates por tienda por día ───────────
  let shRes = ss.getSheetByName("Rescates");
  if (!shRes) {
    shRes = ss.insertSheet("Rescates");
    shRes.getRange(1,1,1,8).setValues([["Fecha","Código Original","Código Nuevo","Celular","Ciudad","Tienda","Estado","Cajero"]])
      .setFontWeight("bold").setBackground("#c0392b").setFontColor("#ffffff");
  }
  const dataRes   = shRes.getDataRange().getValues();
  const hoyStr    = Utilities.formatDate(ahora, "America/Bogota", "yyyy-MM-dd");
  const tiendaNorm = tienda.toString().toLowerCase().trim();
  let rescatesHoy = 0;
  for (let i=1; i<dataRes.length; i++) {
    const fechaFila  = dataRes[i][0] ? Utilities.formatDate(new Date(dataRes[i][0]), "America/Bogota", "yyyy-MM-dd") : "";
    const tiendaFila = (dataRes[i][5]||"").toString().toLowerCase().trim();
    if (fechaFila === hoyStr && tiendaFila === tiendaNorm) rescatesHoy++;
  }
  if (rescatesHoy >= 5)
    return { ok:false, mensaje:"⚠️ Límite alcanzado: esta tienda ya usó los 5 rescates permitidos hoy. Comunícate con el equipo Oakberry." };

  // ── FILTRO 2: Código original NO debe existir en Sheets ──────
  const shCod  = ss.getSheetByName(HOJA_CODIGOS);
  const dataCod = shCod.getDataRange().getValues();
  for (let i=1; i<dataCod.length; i++) {
    const cod = (dataCod[i][COL_CODIGO-1]||"").toString().trim().toUpperCase();
    if (cod === codigoOriginal)
      return { ok:false, mensaje:"Este código SÍ existe en el sistema. Ingresalo en el validador normal." };
  }

  // ── FILTRO 3: Celular sin cupón activo ───────────────────────
  for (let i=1; i<dataCod.length; i++) {
    const cel = (dataCod[i][COL_CELULAR-1]||"").toString().trim();
    const est = (dataCod[i][COL_ESTADO-1] ||"").toString().trim();
    if (cel === celular && (est===ESTADO_DISPONIBLE||est===ESTADO_DISPONIBLE_REA))
      return { ok:false, mensaje:"Este cliente ya tiene un cupón activo. Ingresalo en el validador normal." };
  }

  // ── FILTRO 4: Celular no puede haber sido rescatado hoy ──────
  for (let i=1; i<dataRes.length; i++) {
    const fechaFila = dataRes[i][0] ? Utilities.formatDate(new Date(dataRes[i][0]), "America/Bogota", "yyyy-MM-dd") : "";
    const celFila   = (dataRes[i][3]||"").toString().trim();
    if (fechaFila === hoyStr && celFila === celular)
      return { ok:false, mensaje:"Este celular ya recibió un rescate hoy. Solo se permite 1 rescate por cliente por día." };
  }

  // ── Generar código nuevo único ───────────────────────────────
  const CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const existentes = new Set(dataCod.slice(1).map(r=>(r[COL_CODIGO-1]||"").toString().trim().toUpperCase()));
  let codigoNuevo = "", intentos = 0;
  do {
    codigoNuevo = "";
    for (let i=0;i<5;i++) codigoNuevo += CHARS[Math.floor(Math.random()*CHARS.length)];
    intentos++;
  } while (existentes.has(codigoNuevo) && intentos < 100);
  if (!codigoNuevo) return { ok:false, mensaje:"Error generando código. Intenta de nuevo." };

  // ── Registrar en hoja Códigos (válido 10 minutos) ────────────
  const fechaVenc = new Date(ahora.getTime() + 10 * 60000);
  shCod.appendRow([
    codigoNuevo, ESTADO_DISPONIBLE, "", "", "",
    "Cliente Rescate", celular, ciudad, tienda,
    "rescate", "rescate", "20%", "Bowl 12oz",
    ahora, fechaVenc, "madrugada,desayuno,almuerzo,onces,cena,noche",
    "", "", "", "rescate",
    "", "", "Sin email", "",
    "N1 — Nuevo puro", "", "",
  ]);

  // ── Registrar en hoja Rescates para auditoría ────────────────
  shRes.appendRow([ ahora, codigoOriginal, codigoNuevo, celular, ciudad, tienda, "Rescatado", "" ]);

  // ── Resumen para el log ──────────────────────────────────────
  const rescatesRestantes = 5 - (rescatesHoy + 1);
  console.log("🚨 Rescate #" + (rescatesHoy+1) + "/5: " + codigoOriginal + " → " + codigoNuevo + " · " + tienda);
  return {
    ok: true,
    codigoNuevo,
    rescatesRestantes,
    mensaje: "Código de rescate generado. Quedan " + rescatesRestantes + " rescates disponibles hoy para esta tienda."
  };
}


// ============================================================
// ── META ADS — Sincronización desde Apps Script ──────────────
// ============================================================
function sincronizarMetaAds() {
  const ss      = SpreadsheetApp.getActive();
  const TOKEN   = META_ADS_TOKEN;
  const ACCOUNT = "act_752081110313383";

  // ── Llamar a Meta API ─────────────────────────────────────
  const url = "https://graph.facebook.com/v22.0/" + ACCOUNT +
    "/insights?fields=campaign_name,adset_name,adset_id," +
    "impressions,reach,spend,clicks,cpc,cpm,ctr,actions" +
    "&date_preset=last_30d&level=adset&limit=100" +
    "&access_token=" + TOKEN;

  let metaData = [];
  try {
    const res  = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const json = JSON.parse(res.getContentText());
    if (json.error) {
      console.log("Meta API error: " + JSON.stringify(json.error));
      return { ok:false, mensaje:"Error Meta API: " + json.error.message };
    }
    metaData = json.data || [];
    console.log("Meta Ads: " + metaData.length + " ad sets encontrados");
  } catch(e) {
    console.log("Meta fetch error: " + e.message);
    return { ok:false, mensaje:"Error conectando Meta: " + e.message };
  }

  if (!metaData.length) return { ok:false, mensaje:"No hay datos de Meta para los últimos 30 días" };

  // ── Crear/limpiar hoja Meta_Ads ───────────────────────────
  let sh = ss.getSheetByName("Meta_Ads");
  if (!sh) sh = ss.insertSheet("Meta_Ads");
  sh.clearContents();

  // Encabezados
  const headers = [
    "Campaña","Ad Set","Impresiones","Alcance","Clics","CTR %",
    "CPC","CPM","Gasto","Resultados","Costo/Resultado","Actualizado"
  ];
  sh.getRange(1,1,1,headers.length)
    .setValues([headers])
    .setFontWeight("bold")
    .setBackground("#1a1a2e")
    .setFontColor("#ffffff");

  // Procesar filas
  const ahora = new Date();
  const rows = metaData.map(ad => {
    // Extraer leads/resultados de actions
    let resultados = 0;
    if (ad.actions) {
      const lead = ad.actions.find(a => a.action_type === "lead" || a.action_type === "onsite_conversion.lead_grouped");
      if (lead) resultados = Number(lead.value) || 0;
    }
    const gasto    = Number(ad.spend||0);
    const costoPor = resultados > 0 ? (gasto/resultados).toFixed(0) : "—";
    return [
      ad.campaign_name || "—",
      ad.adset_name    || "—",
      Number(ad.impressions||0),
      Number(ad.reach||0),
      Number(ad.clicks||0),
      ad.ctr ? (Number(ad.ctr)*1).toFixed(2)+"%" : "0%",
      ad.cpc ? "$"+Number(ad.cpc).toFixed(0) : "—",
      ad.cpm ? "$"+Number(ad.cpm).toFixed(0) : "—",
      gasto,
      resultados,
      costoPor,
      ahora
    ];
  });

  if (rows.length) {
    sh.getRange(2,1,rows.length,headers.length).setValues(rows);
    // Formato gasto como moneda
    sh.getRange(2,9,rows.length,1).setNumberFormat("$#,##0");
    sh.getRange(2,12,rows.length,1).setNumberFormat("dd/MM/yyyy HH:mm");
  }

  sh.autoResizeColumns(1, headers.length);
  sh.setFrozenRows(1);

  // ── Totales al final ──────────────────────────────────────
  const totalRow = rows.length + 2;
  const totalGasto      = rows.reduce((s,r)=>s+Number(r[8]||0),0);
  const totalImpresiones = rows.reduce((s,r)=>s+Number(r[2]||0),0);
  const totalClics      = rows.reduce((s,r)=>s+Number(r[4]||0),0);
  const totalResultados = rows.reduce((s,r)=>s+Number(r[9]||0),0);
  sh.getRange(totalRow,1,1,headers.length).setValues([[
    "TOTALES","",
    totalImpresiones,"",totalClics,"","","",
    totalGasto,totalResultados,
    totalResultados>0?"$"+(totalGasto/totalResultados).toFixed(0):"—",
    ahora
  ]]).setFontWeight("bold").setBackground("#f0eef8");
  sh.getRange(totalRow,9).setNumberFormat("$#,##0");

  console.log("✅ Meta_Ads actualizada: " + rows.length + " ad sets, gasto total $" + totalGasto.toLocaleString());
  return { ok:true, adsets:rows.length, gastoTotal:totalGasto, mensaje:"Meta Ads sincronizado: "+rows.length+" ad sets" };
}

// ── Leer hoja Meta_Ads para el dashboard ─────────────────────
function leerMetaAds() {
  const sh = SpreadsheetApp.getActive().getSheetByName("Meta_Ads");
  if (!sh || sh.getLastRow() < 2)
    return { ok:false, mensaje:"No hay datos de Meta. Haz clic en Sincronizar Meta Ads." };
  const data = sh.getDataRange().getValues();
  // Separar headers, filas de datos y totales
  const headers = data[0];
  const rows    = data.slice(1, data.length-1); // sin totales
  const totales = data[data.length-1];
  return { ok:true, headers, rows, totales, actualizado: data[1]?.[11]||"" };
}

// ── Trigger diario para Meta Ads ─────────────────────────────
function instalarTriggerMetaAds() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction()==="sincronizarMetaAds") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("sincronizarMetaAds")
    .timeBased().everyDays(1).atHour(7).inTimezone("America/Bogota").create();
  console.log("✅ Trigger Meta Ads instalado — se sincroniza cada día a las 7am");
}


// ============================================================
// ── CAC — Costo de Adquisición de Clientes ───────────────────
// ============================================================
function dashboardCAC() {
  const ss      = SpreadsheetApp.getActive();
  const shCod   = ss.getSheetByName(HOJA_CODIGOS);
  const shMeta  = ss.getSheetByName("Meta_Ads");
  const PRECIO  = 25400; // Precio base bowl COP

  if (!shCod) return { ok:false, mensaje:"Hoja Códigos no encontrada" };

  const data    = shCod.getDataRange().getValues();
  const ahora   = new Date();
  const hace30  = new Date(ahora.getTime() - 30*24*3600000);

  // ── Gasto Meta desde hoja Meta_Ads ───────────────────────
  let gastoMeta = 0;
  if (shMeta && shMeta.getLastRow() > 1) {
    const dataMeta = shMeta.getDataRange().getValues();
    // Última fila es totales — col 8 (índice) = Gasto
    const filaTotal = dataMeta[dataMeta.length-1];
    gastoMeta = Number(filaTotal[8]||0);
  }

  // ── Procesar cupones ──────────────────────────────────────
  const segmentos = {
    "N1":{ total:0,canjeados:0,ingresoNeto:0,descuentos:[] },
    "E1":{ total:0,canjeados:0,ingresoNeto:0,descuentos:[] },
    "E2":{ total:0,canjeados:0,ingresoNeto:0,descuentos:[] },
    "E3":{ total:0,canjeados:0,ingresoNeto:0,descuentos:[] },
  };
  const fuentes = {};

  let totalMeta=0, canjeadosMeta=0, ingresoNetoMeta=0;
  let totalRea=0,  canjeadosRea=0,  ingresoNetoRea=0;
  let costoWA = 0;

  for (let i=1; i<data.length; i++) {
    const est     = (data[i][COL_ESTADO-1]     ||"").toString().trim();
    const fuente  = (data[i][COL_FUENTE-1]     ||"directo").toString().trim().toLowerCase();
    const tipo    = (data[i][COL_TIPO_USUARIO-1]||"N1").toString().trim().slice(0,2);
    const fase    = (data[i][COL_FASE-1]        ||"").toString().trim();
    const descRaw = (data[i][COL_DESCUENTO-1]   ||"0").toString().replace("%","").trim();
    const fechaGen = data[i][COL_FECHA_GEN-1] ? new Date(data[i][COL_FECHA_GEN-1]) : null;
    if (!est) continue;

    const descPct    = parseFloat(descRaw)||0;
    const ingresoNeto = PRECIO * (1 - descPct/100);
    const esCanjeado  = est===ESTADO_CANJEADO || est===ESTADO_CANJEADO_REA;
    const esMeta      = fuente.includes("meta") || fuente.includes("instagram") || fuente.includes("facebook");
    const esRea       = fase === "reactivacion";
    const es30d       = fechaGen && fechaGen >= hace30;

    // Por fuente
    if (!fuentes[fuente]) fuentes[fuente]={ fuente, total:0, canjeados:0, ingresoNeto:0 };
    fuentes[fuente].total++;
    if (esCanjeado) { fuentes[fuente].canjeados++; fuentes[fuente].ingresoNeto += ingresoNeto; }

    // Meta global
    if (esMeta) {
      totalMeta++;
      if (esCanjeado) { canjeadosMeta++; ingresoNetoMeta += ingresoNeto; }
    }

    // Reactivación
    if (esRea) {
      totalRea++;
      if (esCanjeado) { canjeadosRea++; ingresoNetoRea += ingresoNeto; }
    }

    // Segmentos
    if (segmentos[tipo]) {
      segmentos[tipo].total++;
      if (esCanjeado) {
        segmentos[tipo].canjeados++;
        segmentos[tipo].ingresoNeto += ingresoNeto;
        segmentos[tipo].descuentos.push(descPct);
      }
    }
  }

  // Costo WA reactivación (275 COP por mensaje enviado)
  costoWA = (totalRea * 275);

  // ── Calcular CACs ─────────────────────────────────────────
  const cacMeta     = canjeadosMeta>0  ? Math.round(gastoMeta/canjeadosMeta)       : 0;
  const roiMeta     = gastoMeta>0      ? ((ingresoNetoMeta/gastoMeta)*100).toFixed(1)+"%" : "—";
  const cacRea      = canjeadosRea>0   ? Math.round(costoWA/canjeadosRea)           : 0;
  const roiRea      = costoWA>0        ? ((ingresoNetoRea/costoWA)*100).toFixed(1)+"%" : "—";

  // CAC por segmento
  const cacSegmentos = Object.entries(segmentos).map(([seg,v]) => {
    const descProm = v.descuentos.length>0 ? (v.descuentos.reduce((a,b)=>a+b,0)/v.descuentos.length).toFixed(1)+"%" : "—";
    const cac      = v.canjeados>0 && gastoMeta>0 ? Math.round((gastoMeta * v.total / Math.max(totalMeta,1)) / v.canjeados) : 0;
    const roi      = cac>0 ? (((PRECIO*(1-parseFloat(descProm)/100))/cac)*100).toFixed(1)+"%" : "—";
    return { seg, total:v.total, canjeados:v.canjeados, ingresoNeto:Math.round(v.ingresoNeto), descProm, cac, roi };
  });

  // CAC por fuente
  const cacFuentes = Object.values(fuentes).sort((a,b)=>b.total-a.total).map(f => ({
    fuente:    f.fuente,
    total:     f.total,
    canjeados: f.canjeados,
    tasa:      f.total>0 ? (f.canjeados/f.total*100).toFixed(1)+"%" : "0%",
    ingresoNeto: Math.round(f.ingresoNeto),
    precio:    PRECIO,
  }));

  return {
    ok: true,
    gastoMeta,
    cacMeta,
    roiMeta,
    totalMeta,
    canjeadosMeta,
    ingresoNetoMeta: Math.round(ingresoNetoMeta),
    cacRea,
    roiRea,
    costoWA,
    canjeadosRea,
    ingresoNetoRea: Math.round(ingresoNetoRea),
    cacSegmentos,
    cacFuentes,
    precio: PRECIO,
  };
}

// ============================================================
// ── UTM PARSER — Cruce cupones × Links ──────────────────────
// ============================================================

// Extrae parámetros UTM de una URL
function parsearUTM(url) {
  if (!url) return {};
  try {
    // Normalizar URL
    const urlStr = url.toString().trim();
    const qIdx = urlStr.indexOf("?");
    if (qIdx === -1) return {};
    const qs = urlStr.slice(qIdx + 1);
    const params = {};
    qs.split("&").forEach(p => {
      const [k, v] = p.split("=");
      if (k && v) params[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g," "));
    });
    return params;
  } catch(e) { return {}; }
}

// Cruza todos los cupones con la hoja Links por adset + anuncio
function cruzarCuponesConLinks() {
  const ss       = SpreadsheetApp.getActive();
  const shCod    = ss.getSheetByName(HOJA_CODIGOS);
  const shLinks  = ss.getSheetByName(HOJA_LINKS);
  if (!shCod || !shLinks) return { ok:false, mensaje:"Hojas no encontradas" };

  const dataCod   = shCod.getDataRange().getValues();
  const dataLinks = shLinks.getDataRange().getValues();

  // Indexar Links por adset|anuncio
  const linksIdx = {};
  for (let i=1; i<dataLinks.length; i++) {
    const linkUrl = (dataLinks[i][11]||"").toString();
    const p = parsearUTM(linkUrl);
    const adset   = (p.adset  ||"").toLowerCase().trim();
    const anuncio = (p.anuncio||"").toLowerCase().trim();
    if (adset || anuncio) {
      const key = adset + "|||" + anuncio;
      linksIdx[key] = {
        nombre:    dataLinks[i][0]||"",
        modo:      dataLinks[i][1]||"",
        ciudad:    dataLinks[i][2]||"",
        fase:      dataLinks[i][4]||"",
        fuente:    dataLinks[i][5]||"",
        producto:  dataLinks[i][6]||"",
        descuento: dataLinks[i][7]||"",
        link:      linkUrl,
        adset,
        anuncio,
      };
    }
  }

  // Procesar cupones — cruzar con Links
  const result = {};
  let cruzados = 0, sinCruce = 0;

  for (let i=1; i<dataCod.length; i++) {
    const est      = (dataCod[i][COL_ESTADO-1]    ||"").toString().trim();
    const linkCamp = (dataCod[i][COL_LINK_CAMP-1] ||"").toString().trim();
    if (!est || !linkCamp) { sinCruce++; continue; }

    const p       = parsearUTM(linkCamp);
    const adset   = (p.adset  ||"").toLowerCase().trim();
    const anuncio = (p.anuncio||"").toLowerCase().trim();

    // Intentar cruce exacto primero, luego solo por adset
    let campInfo = linksIdx[adset+"|||"+anuncio] || linksIdx[adset+"|||"] || null;
    const campKey = campInfo ? (campInfo.nombre || adset) : (adset || p.fuente || "sin_campaña");

    if (!result[campKey]) result[campKey] = {
      nombre:    campInfo?.nombre || campKey,
      adset:     adset || "—",
      anuncio:   anuncio || "—",
      fase:      campInfo?.fase  || p.fase  || "—",
      fuente:    campInfo?.fuente || p.fuente || "—",
      descuento: campInfo?.descuento || p.descuento || "—",
      total:0, canjeados:0, disponibles:0, vencidos:0,
      cruzado: !!campInfo,
    };

    result[campKey].total++;
    if (est===ESTADO_CANJEADO||est===ESTADO_CANJEADO_REA) result[campKey].canjeados++;
    if (est===ESTADO_DISPONIBLE||est===ESTADO_DISPONIBLE_REA) result[campKey].disponibles++;
    if (est===ESTADO_VENCIDO||est===ESTADO_VENCIDO_REA) result[campKey].vencidos++;
    if (campInfo) cruzados++; else sinCruce++;
  }

  const campanas = Object.values(result).sort((a,b)=>b.total-a.total);
  console.log("🔗 Cruce cupones×Links: " + cruzados + " cruzados, " + sinCruce + " sin cruce");
  return { ok:true, campanas, cruzados, sinCruce };
}

// Dashboard campañas cruzado
function dashboardCampanasUTM() {
  const base = cruzarCuponesConLinks();
  if (!base.ok) return base;

  // Agregar gasto Meta si hay hoja Meta_Ads
  const ss = SpreadsheetApp.getActive();
  const shMeta = ss.getSheetByName("Meta_Ads");
  let metaIdx = {};
  if (shMeta && shMeta.getLastRow() > 1) {
    const dataMeta = shMeta.getDataRange().getValues();
    for (let i=1; i<dataMeta.length-1; i++) { // sin fila totales
      const adsetMeta = (dataMeta[i][1]||"").toString().toLowerCase().trim();
      if (adsetMeta) metaIdx[adsetMeta] = {
        impresiones: Number(dataMeta[i][2]||0),
        alcance:     Number(dataMeta[i][3]||0),
        clics:       Number(dataMeta[i][4]||0),
        ctr:         dataMeta[i][5]||"—",
        cpc:         dataMeta[i][6]||"—",
        gasto:       Number(dataMeta[i][8]||0),
      };
    }
  }

  // Enriquecer campañas con Meta
  const PRECIO = 25400;
  const campanas = base.campanas.map(c => {
    const meta = metaIdx[c.adset] || null;
    const descPct = parseFloat((c.descuento||"0").replace("%",""))||0;
    const ingresoNeto = c.canjeados * PRECIO * (1 - descPct/100);
    const cac = meta && c.canjeados>0 ? Math.round(meta.gasto/c.canjeados) : null;
    const roi = cac && cac>0 ? ((ingresoNeto/meta.gasto)*100).toFixed(1)+"%" : null;
    return { ...c, meta, ingresoNeto: Math.round(ingresoNeto), cac, roi };
  });

  return { ok:true, campanas, cruzados:base.cruzados, sinCruce:base.sinCruce };
}


// ============================================================
// ── RECONCILIACIÓN N1 — Sistema + Cajero ─────────────────────
// ============================================================
// Calcula el tipo final combinando col Y (sistema Loopy) con
// col E (perfil cajero en el momento del canje)
function reconciliarTipo(tipoSistema, perfilCajero) {
  const tipo   = (tipoSistema  ||"").toString().trim();
  const perfil = (perfilCajero ||"").toString().trim().toLowerCase();

  const cajeroYaConocia = perfil.includes("ya nos conocía") || perfil.includes("ya nos conocia");
  const cajeroEsNuevo   = perfil.includes("cliente nuevo") || perfil === "si";
  const esExSistema     = tipo.startsWith("E1") || tipo.startsWith("E2") || tipo.startsWith("E3");

  // ── REGLA 1: Cajero dice "Cliente nuevo" → SIEMPRE N1 ────
  // Con Loopy o Sin Loopy — le creemos al cajero
  if (cajeroEsNuevo)
    return "N1 — Confirmado";

  // ── REGLA 2: Cajero dice "Ya nos conocía" → no es N1 ─────
  if (cajeroYaConocia) {
    if (esExSistema) return tipo; // Sistema y cajero coinciden
    return "E4 — Revalidado";    // Sistema decía N1 pero ya los conocía
  }

  // ── Sin dato cajero → copiar sistema ─────────────────────
  if (tipo) return tipo;
  return "Sin clasificar";
}

// Poblar col AB con tipo reconciliado para todos los registros
// Correr manualmente desde Apps Script
function poblarTipoFinal() {
  const sh   = SpreadsheetApp.getActive().getSheetByName(HOJA_CODIGOS);
  const data = sh.getDataRange().getValues();
  const ahora = new Date();
  let procesados = 0, reconciliados = 0;

  // Agregar encabezado si no existe
  const headerAB = (data[0][COL_TIPO_FINAL-1]||"").toString().trim();
  if (!headerAB) sh.getRange(1, COL_TIPO_FINAL).setValue("Tipo Final");

  const updates = [];
  for (let i=1; i<data.length; i++) {
    const tipoSistema  = (data[i][COL_TIPO_USUARIO-1]||"").toString().trim();
    const perfilCajero = (data[i][COL_LOOPY-1]       ||"").toString().trim();
    const tipoFinal    = reconciliarTipo(tipoSistema, perfilCajero);

    updates.push([tipoFinal]);
    procesados++;
    if (tipoFinal !== tipoSistema && tipoFinal.includes("Reconciliado")) reconciliados++;
  }

  // Escribir en lote
  if (updates.length) {
    sh.getRange(2, COL_TIPO_FINAL, updates.length, 1).setValues(updates);
  }

  // Dar color a reconciliados
  for (let i=1; i<data.length; i++) {
    const val = updates[i-1]?.[0]||"";
    // Semáforo: Verde N1 · Amarillo E1 · Naranja E2 · Rojo E3 · Morado E4
    if      (val.startsWith("N1")) {
      sh.getRange(i+1, COL_TIPO_FINAL).setBackground("#d4edda").setFontColor("#155724"); // Verde
    } else if (val.startsWith("E1")) {
      sh.getRange(i+1, COL_TIPO_FINAL).setBackground("#fff3cd").setFontColor("#856404"); // Amarillo
    } else if (val.startsWith("E2")) {
      sh.getRange(i+1, COL_TIPO_FINAL).setBackground("#fde8d8").setFontColor("#7d3c00"); // Naranja
    } else if (val.startsWith("E3")) {
      sh.getRange(i+1, COL_TIPO_FINAL).setBackground("#fcd5d5").setFontColor("#7b1d1d"); // Rojo
    } else if (val.startsWith("E4")) {
      sh.getRange(i+1, COL_TIPO_FINAL).setBackground("#e8d5f5").setFontColor("#4a235a"); // Morado
    }
  }

  console.log("✅ Tipo Final poblado: " + procesados + " registros · " + reconciliados + " reconciliados");
  return { ok:true, procesados, reconciliados };
}

// Actualizar col AB al momento del canje (en tiempo real)
function actualizarTipoFinalEnCanje(fila, tipoSistema, perfilCajero) {
  try {
    const sh = SpreadsheetApp.getActive().getSheetByName(HOJA_CODIGOS);
    const tipoFinal = reconciliarTipo(tipoSistema, perfilCajero);
    sh.getRange(fila, COL_TIPO_FINAL).setValue(tipoFinal);
  } catch(e) {
    console.log("Error actualizando Tipo Final: " + e.message);
  }
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
      case "dashboardResumen":       resultado = dashboardResumen();                            break;
      case "dashboardCampanas":      resultado = dashboardCampanas();                           break;
      case "dashboardSegmentos":     resultado = dashboardSegmentos();                          break;
      case "dashboardCiudades":      resultado = dashboardCiudades();                           break;
      case "dashboardReactivacion":  resultado = dashboardReactivacion();                       break;
      case "dashboardHoja":          resultado = generarHojaDashboard();                        break;
      case "dashboardLeer":          resultado = leerHojaDashboard();                           break;
      case "generarAdidas":          resultado = generarCodigosAdidas();                        break;
      case "reporteAdidas":          resultado = reporteAdidas();                               break;
      case "rescatarCupon":          resultado = rescatarCupon(p);                              break;
      case "sincronizarMeta":        resultado = sincronizarMetaAds();                          break;
      case "leerMeta":               resultado = leerMetaAds();                                 break;
      case "dashboardCAC":           resultado = dashboardCAC();                                break;
      case "dashboardCampanasUTM":   resultado = dashboardCampanasUTM();                        break;
      case "poblarTipoFinal":        resultado = poblarTipoFinal();                             break;
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
  // ── Generar código en servidor — previene cupones fantasma ───
  const CHARS_COD = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  function genCodigoServidor() {
    const sh = SpreadsheetApp.getActive().getSheetByName(HOJA_CODIGOS);
    const existentes = new Set(
      sh.getRange(2,1,Math.max(sh.getLastRow()-1,1),1).getValues()
        .map(r=>(r[0]||"").toString().trim().toUpperCase())
    );
    let cod, intentos=0;
    do {
      cod="";
      for(let i=0;i<5;i++) cod+=CHARS_COD[Math.floor(Math.random()*CHARS_COD.length)];
      intentos++;
    } while(existentes.has(cod) && intentos<200);
    return cod;
  }
  const codigo = genCodigoServidor(); // Código generado en servidor, no en frontend

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

  if (!celular) return { ok:false, mensaje:"Faltan datos" };
  if (!codigo)  return { ok:false, mensaje:"Error generando código. Intenta de nuevo." };

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

  // Buscar en hoja Códigos Y en hoja Adidas
  const hojas = [
    { sh: SpreadsheetApp.getActive().getSheetByName(HOJA_CODIGOS),  tipo: "normal" },
    { sh: SpreadsheetApp.getActive().getSheetByName(HOJA_ADIDAS),   tipo: "adidas" },
  ].filter(h => h.sh);

  for (const { sh, tipo } of hojas) {
  const data = sh.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const colCodigo = tipo==="adidas" ? 0 : COL_CODIGO-1;
    if ((data[i][colCodigo]||"").toString().trim().toUpperCase() !== codigo) continue;

    // ── Manejo especial cupón Adidas ─────────────────────────
    if (tipo==="adidas") {
      const estAd = (data[i][1]||"").toString().trim();
      if (estAd==="Canjeado") return { ok:false, mensaje:"ya fue canjeado" };
      if (estAd==="Vencido")  return { ok:false, mensaje:"ya venció" };
      if (estAd!=="Disponible") return { ok:false, mensaje:"no existe" };
      // Verificar vencimiento
      const fVenc = data[i][8] ? new Date(data[i][8]) : ADIDAS_VENCE;
      if (new Date() > fVenc) {
        sh.getRange(i+1,2).setValue("Vencido");
        return { ok:false, mensaje:"ya venció" };
      }
      // Canjear
      sh.getRange(i+1,2).setValue("Canjeado");
      sh.getRange(i+1,3).setValue(tienda+" - "+ciudad);
      sh.getRange(i+1,4).setValue(new Date());
      sh.getRange(i+1,5).setValue(loopy);
      return { ok:true, mensaje:[
        "✅ Cupón Adidas válido",
        "🎽 Campaña: Adidas Colombia",
        "🫐 " + (data[i][6]||ADIDAS_PRODUCTO),
        "📍 " + tienda,
      ].join("\n") };
    }

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

    // Actualizar col AB con tipo reconciliado (sistema + cajero)
    actualizarTipoFinalEnCanje(i+1,
      (data[i][COL_TIPO_USUARIO-1]||"").toString().trim(),
      loopy
    );
    return { ok:true, mensaje:[
      "✅ Cupón válido" + (nuevoEstado===ESTADO_CANJEADO_REA ? " · Reactivación" : ""),
      "👤 " + nombreCli,
      "📱 " + celCli,
      "🎁 " + descFormatado + " en " + producto,
    ].join("\n") };
  }
  } // cierre for hojas
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
