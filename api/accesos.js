// api/accesos.js — quién entra a /conciliacion y qué tiendas puede ver.
//
// ESTE ARCHIVO ES EL CONTROL DE ACCESO. Vive del lado del servidor a propósito:
// el filtro por tienda lo aplica api/conciliacion.js ANTES de responder, nunca
// la página. Si el filtro viviera en el front, cualquier franquiciado abriría
// las herramientas del navegador y vería la plata de sus vecinos.
//
// `tiendas: '*'` = ve todo (interno).
// `tiendas: [...]` = ve solo esos short_code del store master.
//
// Fuente: Sheet "Correos por tienda" (Daniel, 31-ago-2026). Las llaves van en
// MINÚSCULA: accesoDe() normaliza el correo del token antes de buscar.
//
// Las tiendas de Franquicia Maestra (propias) no entran acá: no se les devuelve
// nada porque no pagan regalías ni marketing fee.

export const ACCESOS = {
  // ── Interno ────────────────────────────────────────────────────
  'dzuluaga@manelfoods.com': { tiendas: '*', nombre: 'Daniel Zuluaga' },
  'compras@manelfoods.com':  { tiendas: '*', nombre: 'Compras' },
  'julio@manelfoods.com':    { tiendas: '*', nombre: 'Julio' },

  // ── Franquiciados ──────────────────────────────────────────────
  'infoacaiplaza@gmail.com':       { nombre: 'Cristina Vega',
    tiendas: ['BAQ_FR_PlazaParque'] },

  // Nini Díaz es la misma dueña de las tres (Bucaramanga, Cañaveral y Cúcuta),
  // repartidas en dos NIT: MILNIN CO SAS y MCN COLOMBIA SAS. En el Sheet los
  // correos venían cruzados respecto a los NIT, así que en vez de adivinar cuál
  // va con cuál, sus dos correos ven las tres tiendas (Daniel, 31-ago-2026).
  'admon@mcncolombia.com':         { nombre: 'Nini Díaz',
    tiendas: ['BGA_FR_BGA', 'BGA_FR_Canaveral', 'CUC_FR_LosCaobos'] },
  'nini@milnin.com':               { nombre: 'Nini Díaz',
    tiendas: ['BGA_FR_BGA', 'BGA_FR_Canaveral', 'CUC_FR_LosCaobos'] },

  'admon.oaksyco@gmail.com':       { nombre: 'David Villota',
    tiendas: ['BOG_FR_GranEstacion'] },
  'claualdana4@gmail.com':         { nombre: 'Claudia Aldana',
    tiendas: ['BOG_FR_Salvio93'] },

  // Felipe Vernaza tiene las cinco de Cali bajo el mismo NIT (1130615580).
  // "Oakberry Cali" del Sheet es Ciudad Jardín: es la única de sus cinco que
  // no aparece con nombre propio en la lista.
  'felipe_vernaza@hotmail.com':    { nombre: 'Felipe Vernaza — Cali',
    tiendas: ['CAL_FR_CiudadJardin', 'CAL_FR_Granada', 'CAL_FR_JardinPlaza',
              'CAL_FR_MallPlaza', 'CAL_FR_Chipichape'] },

  'acaisaludable@gmail.com':       { nombre: 'Margarita Vivero — Cartagena',
    tiendas: ['CTG_FR_Bocagrande'] },
  'margaritaviveroeusse@gmail.com':{ nombre: 'Margarita Vivero — El Tesoro',
    tiendas: ['MED_FR_ElTesoro'] },
  'admon.berrycool@gmail.com':     { nombre: 'Vanessa Palacio — Oviedo',
    tiendas: ['MED_FR_Oviedo'] },
  'vibefruitadmon@gmail.com':      { nombre: 'Vanessa Palacio — Laureles',
    tiendas: ['MED_FR_Laureles'] },
  'oakberryvivaenvigado@gmail.com':{ nombre: 'Lina María Ángel',
    tiendas: ['MED_FR_VivaEnvigado'] },
  'oakberrio@gmail.com':           { nombre: 'Aeropuerto JMC',
    tiendas: ['MED_FR_JMC'] },
  'admin@evoagroup.com':           { nombre: 'Dayana Villota',
    tiendas: ['MED_FR_Llanogrande'] },
  'enjogroupsas@gmail.com':        { nombre: 'Margarita Hormaza — Jamundí',
    tiendas: ['CAL_FR_Jamundi'] },

  // Tatiana Cárcamo tiene dos ciudades: ve las dos juntas.
  'tati-carcamo@hotmail.com':      { nombre: 'Tatiana Cárcamo',
    tiendas: ['MON_FR_Monteria', 'VAL_FR_Valledupar'] },

  'saporigroupco@gmail.com':       { nombre: 'Arturo Lungo — Pereira',
    tiendas: ['PER_FR_Pereira'] },

  // Santa Marta trae dos correos en el Sheet; entran los dos.
  'invercampofood@gmail.com':      { nombre: 'Emma Carrascal',
    tiendas: ['STM_FR_SantaMarta'] },
  'emma.carrazcal@hotmail.com':    { nombre: 'Emma Carrascal',
    tiendas: ['STM_FR_SantaMarta'] },

  // PENDIENTE — Oakberry Campestre (Cali), Cristóbal Caicedo
  // 'jcristobalcaicedo@gmail.com': { tiendas: ['CAL_FR_Campestre'] },
  // Factura como CLO006 (NIT 901842659, ~$22 MM/mes) pero NO existe en el store
  // master ni llega a Toteat, así que no tenemos qué mostrarle. Darle acceso
  // hoy sería abrirle una pantalla vacía. Primero hay que meter la tienda al
  // master y conectarla al POS.

  // Arkadia (oakberryarkadia@gmail.com) cerró en abril 2026: sin acceso.
};

// Devuelve null si el correo no está autorizado.
export function accesoDe(email) {
  return ACCESOS[String(email || '').trim().toLowerCase()] || null;
}

// ¿Este acceso puede ver esta tienda?
export function puedeVer(acceso, shortCode) {
  if (!acceso) return false;
  if (acceso.tiendas === '*') return true;
  return Array.isArray(acceso.tiendas) && acceso.tiendas.includes(shortCode);
}
