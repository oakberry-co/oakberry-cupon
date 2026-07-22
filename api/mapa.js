// api/mapa.js — proxy server-side al backend de adquisición.
// El idtoken de Google viaja en el BODY (POST) del navegador → y de aquí al
// backend por header Authorization. Así NINGÚN hop lleva el token en la URL
// (URLs largas + respuesta grande rompían el hop Vercel↔GCP con 499/HTML).
// Corre en el runtime Node de Vercel (same-origin, sin CORS). Reintenta 3x.
export default async function handler(req, res) {
  // idtoken: del body JSON (POST) o del query (?idtoken=, compatibilidad).
  let idtoken = '';
  if (req.method === 'POST') {
    const b = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
    idtoken = b.idtoken || '';
  }
  if (!idtoken && req.query) idtoken = req.query.idtoken || '';

  const backend = 'https://api.oakberry-cupones.com/?accion=mapaCalorDatos';
  res.setHeader('Cache-Control', 'no-store');
  const t0 = Date.now();
  let lastInfo = '';

  for (let attempt = 1; attempt <= 3; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 25000);
    try {
      const r = await fetch(backend, {
        method: 'GET',
        signal: ctrl.signal,
        headers: { 'Accept': 'application/json', 'Authorization': 'Bearer ' + idtoken },
      });
      clearTimeout(timer);
      const text = await r.text();
      if (r.ok) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.status(200).send(text);
      }
      lastInfo = 'backend HTTP ' + r.status;
    } catch (e) {
      clearTimeout(timer);
      lastInfo = 'fetch ' + (e && e.name === 'AbortError' ? 'timeout 25s' : (e && e.message));
    }
    await new Promise(ok => setTimeout(ok, 300 * attempt));
  }

  return res.status(200).json({
    ok: false,
    mensaje: 'No se pudo leer el backend: ' + lastInfo + ' (3 intentos, ' + (Date.now() - t0) + 'ms)',
  });
}

function safeParse(s) { try { return JSON.parse(s); } catch (e) { return {}; } }
