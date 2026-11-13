// api/conciliacion.js — devolución del programa de adquisición a franquiciados.
// Verifica el ID token de Google acá mismo (tokeninfo) y devuelve el snapshot
// RECORTADO a las tiendas que ese correo puede ver (ver api/accesos.js).
//
// El recorte se hace acá, del lado del servidor, y no en la página: un
// franquiciado que abra las herramientas del navegador solo debe encontrar sus
// propias tiendas en la respuesta, no un filtro que pueda apagar.
//
// Mismo patrón que api/mapa.js y por la misma razón: NO toca el backend de GCP
// (Caddy comprimía la respuesta y el hop Vercel↔GCP la corrompía).
//
// El snapshot lo regenera reports/export_conciliacion_web.py el 15 de cada mes.
//
// Dos formas de decir quién sos, las dos terminan en el mismo correo y el mismo
// recorte por tienda:
//   · idtoken : "Iniciar con Google" (solo sirve a quien tiene cuenta Google).
//   · token   : enlace firmado que llegó por correo (api/acceso.js) o la sesión
//               de 30 días que ese enlace dejó en el navegador (api/sesion.js).
// En ambos casos la respuesta trae `sesion` para que la página no tenga que
// volver a pedir login por 30 días en ese aparato.
import { CONCIDATA } from './concidata.js';
import { accesoDe, puedeVer } from './accesos.js';
import { abrir, tokenSesion } from './sesion.js';

const CLIENT_ID = '664413392517-cpjl9d2fliqsja9cr5950kel0rf4q46c.apps.googleusercontent.com';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  let idtoken = '', token = '';
  if (req.method === 'POST') {
    const b = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
    idtoken = b.idtoken || '';
    token = b.token || '';
  }
  if (!idtoken && !token && req.query) idtoken = req.query.idtoken || '';
  if (!idtoken && !token) return res.status(200).json({ ok: false, auth: false, mensaje: 'Falta el token.' });

  let email, clase = 'google';
  if (token) {
    const p = abrir(token);
    if (!p) {
      return res.status(200).json({ ok: false, auth: false, vencido: true,
        mensaje: 'El enlace venció o no es válido. Pedí uno nuevo con tu correo.' });
    }
    email = p.e.toLowerCase();
    clase = p.k;
  } else {
    let info;
    try {
      const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idtoken));
      info = await r.json();
    } catch (e) {
      return res.status(200).json({ ok: false, mensaje: 'No se pudo verificar el login: ' + (e && e.message) });
    }
    email = (info.email || '').toLowerCase();
    const audOk = info.aud === CLIENT_ID;
    const emailOk = info.email_verified === 'true' || info.email_verified === true;
    if (!audOk || !emailOk) {
      return res.status(200).json({ ok: false, auth: false, mensaje: 'Correo no autorizado para ver esta conciliación.' });
    }
  }

  const acceso = accesoDe(email);
  if (!acceso) {
    return res.status(200).json({ ok: false, auth: false, mensaje: 'Correo no autorizado para ver esta conciliación.' });
  }
  // Sesión de 30 días para este navegador. Solo la emite un login "fresco"
  // (Google o el enlace del correo): una sesión no renueva otra, así que a los
  // 30 días toca volver a entrar.
  const sesion = clase === 'sesion' ? null : tokenSesion(email);

  const interno = acceso.tiendas === '*';
  const filas   = CONCIDATA.filas.filter(f => puedeVer(acceso, f.tienda));
  const detalle = CONCIDATA.detalle.filter(d => puedeVer(acceso, d.tienda));
  // Las alertas son de operación interna (facturas dobles, base que no cuadra
  // con Toteat). Un franquiciado no tiene por qué verlas.
  const alertas = interno ? CONCIDATA.alertas : [];
  // Razones sociales: a un franquiciado solo le viajan las suyas, con las
  // tiendas ya recortadas. Las filas traen `razon` y `nit_rs` por sí mismas.
  const razones = (CONCIDATA.razones || [])
    .map(r => ({ ...r, tiendas: (r.tiendas || []).filter(t => puedeVer(acceso, t)) }))
    .filter(r => interno || r.tiendas.length);

  return res.status(200).json({
    ok: true, auth: true, email, sesion,
    nombre: acceso.nombre || email,
    interno,
    generado: CONCIDATA.generado,
    meses: CONCIDATA.meses,
    mes_sin_facturar: CONCIDATA.mes_sin_facturar,
    cruce_desde: CONCIDATA.cruce_desde,
    tiendas: [...new Set(filas.map(f => f.tienda))].sort(),
    razones, filas, detalle, alertas,
  });
}

function safeParse(s) { try { return JSON.parse(s); } catch (e) { return {}; } }
