// api/mapa.js — proxy server-side al backend de adquisición.
// Corre en el runtime Node de Vercel (same-origin, sin CORS, sin los timeouts
// raros de los rewrites externos). Reenvía el idtoken de Google y devuelve el
// JSON del backend tal cual. El backend verifica el token + allowlist.
export default async function handler(req, res) {
  const idtoken = (req.query && req.query.idtoken) || '';
  const backend = 'https://api.oakberry-cupones.com/?accion=mapaCalorDatos&idtoken='
    + encodeURIComponent(idtoken);

  res.setHeader('Cache-Control', 'no-store');
  try {
    const r = await fetch(backend, { method: 'GET' });
    const text = await r.text();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(r.status).send(text);
  } catch (e) {
    return res.status(502).json({ ok: false, mensaje: 'proxy error: ' + (e && e.message) });
  }
}
