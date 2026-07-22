// api/mapa.js — datos del mapa de calor, con login de Google verificado aquí.
// NO toca el backend (Caddy comprimía la respuesta y el hop Vercel↔GCP la
// corrompía). Verifica el ID token contra Google (tokeninfo) y, si el correo
// está autorizado, devuelve el snapshot empaquetado en mapdata.js.
import { MAPDATA } from './mapdata.js';

const CLIENT_ID = '664413392517-cpjl9d2fliqsja9cr5950kel0rf4q46c.apps.googleusercontent.com';
const ALLOWLIST = ['dzuluaga@manelfoods.com'];

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  let idtoken = '';
  if (req.method === 'POST') {
    const b = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
    idtoken = b.idtoken || '';
  }
  if (!idtoken && req.query) idtoken = req.query.idtoken || '';
  if (!idtoken) return res.status(200).json({ ok: false, auth: false, mensaje: 'Falta el token.' });

  // Verificación del ID token contra Google (reachable desde Vercel).
  let info;
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idtoken));
    info = await r.json();
  } catch (e) {
    return res.status(200).json({ ok: false, mensaje: 'No se pudo verificar el login: ' + (e && e.message) });
  }

  const email = (info.email || '').toLowerCase();
  const audOk = info.aud === CLIENT_ID;
  const emailOk = info.email_verified === 'true' || info.email_verified === true;
  if (!audOk || !emailOk || !ALLOWLIST.includes(email)) {
    return res.status(200).json({ ok: false, auth: false, mensaje: 'Correo no autorizado para ver este mapa.' });
  }

  return res.status(200).json({ ok: true, auth: true, email, ...MAPDATA });
}

function safeParse(s) { try { return JSON.parse(s); } catch (e) { return {}; } }
