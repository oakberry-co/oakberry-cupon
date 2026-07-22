// api/mapa.js — proxy server-side al backend de adquisición.
// Corre en el runtime Node de Vercel (same-origin, sin CORS). Reenvía el
// idtoken de Google; el backend verifica token + allowlist. Con reintentos
// y auto-diagnóstico: si el hop a GCP falla, devuelve el motivo real (no 499).
export default async function handler(req, res) {
  const idtoken = (req.query && req.query.idtoken) || '';
  const backend = 'https://api.oakberry-cupones.com/?accion=mapaCalorDatos&idtoken='
    + encodeURIComponent(idtoken);

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
        headers: { 'Accept': 'application/json' },
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
    // pequeño backoff antes de reintentar
    await new Promise(ok => setTimeout(ok, 300 * attempt));
  }

  return res.status(502).json({
    ok: false,
    mensaje: 'No se pudo leer el backend: ' + lastInfo + ' (3 intentos, ' + (Date.now() - t0) + 'ms)',
  });
}
