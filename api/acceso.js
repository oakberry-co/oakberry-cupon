// api/acceso.js — "Enviarme el enlace de acceso": entrar a /conciliacion con
// cualquier correo, sin cuenta de Google.
//
// Existe porque el login de Google solo sirve a quien tiene cuenta de Google,
// y varios franquiciados entran con Hotmail o con el correo de su empresa.
// El correo tiene que estar en api/accesos.js; si no, no se manda nada.
//
// POST { email } → manda un correo con un enlace firmado (30 minutos) a esa
// misma dirección. Nadie puede pedir el enlace de otro: llega solo al dueño
// del buzón, y para verlo hay que poder abrir ese buzón.
import { accesoDe } from './accesos.js';
import { tokenEnlace, VIDA_ENLACE } from './sesion.js';
import { enviarCorreo } from './ses.js';

const PAGINA = 'https://www.oakberry-cupones.com/conciliacion';
const RESPONDER_A = 'dzuluaga@manelfoods.com';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') return res.status(405).json({ ok: false, mensaje: 'Solo POST.' });

  const b = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(200).json({ ok: false, mensaje: 'Escribí un correo válido.' });
  }
  const acceso = accesoDe(email);
  if (!acceso) {
    return res.status(200).json({ ok: false, mensaje:
      'Ese correo no está autorizado para esta conciliación. Si es el de tu tienda, ' +
      'escribile a Daniel (dzuluaga@manelfoods.com) indicando la tienda y el correo.' });
  }

  const enlace = PAGINA + '?t=' + encodeURIComponent(tokenEnlace(email));
  const minutos = Math.round(VIDA_ENLACE / 60000);
  const nombre = acceso.nombre || email;
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;background:#f6f1e4;font-family:Arial,Helvetica,sans-serif;color:#3d2b5e">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:28px 30px;border:1px solid #e3dcc9">
  <div style="font-size:20px;font-weight:800;margin-bottom:6px">Tu acceso a la conciliaci&oacute;n Oakberry</div>
  <p style="font-size:14px;line-height:1.6;color:#555;margin:0 0 18px">Hola ${esc(nombre)}. Alguien pidi&oacute; entrar a
  <b>${PAGINA.replace('https://', '')}</b> con este correo. Si fuiste vos, toc&aacute; el bot&oacute;n:</p>
  <p style="text-align:center;margin:0 0 18px"><a href="${enlace}" style="display:inline-block;background:#3d2b5e;color:#fff;
  text-decoration:none;font-weight:800;font-size:15px;padding:13px 26px;border-radius:10px">Entrar a mi conciliaci&oacute;n</a></p>
  <p style="font-size:13px;line-height:1.6;color:#555;margin:0 0 8px">El enlace sirve por <b>${minutos} minutos</b> y abre la p&aacute;gina en el
  celular o computador donde lo toques; despu&eacute;s no vas a necesitar pedirlo de nuevo por 30 d&iacute;as en ese mismo aparato.</p>
  <p style="font-size:13px;line-height:1.6;color:#555;margin:0 0 8px">Si no fuiste vos, ignor&aacute; este correo: sin el enlace nadie entra.</p>
  <p style="font-size:12px;color:#999;margin:18px 0 0">Si el bot&oacute;n no abre, copi&aacute; este enlace en el navegador:<br>
  <span style="word-break:break-all">${enlace}</span></p>
</div></body></html>`;

  try {
    await enviarCorreo({ to: [email], subject: 'Tu acceso a la conciliación Oakberry', html,
                         replyTo: RESPONDER_A });
  } catch (e) {
    console.error('acceso: no se pudo enviar', email, e && e.message);
    return res.status(200).json({ ok: false, mensaje:
      'No pudimos enviar el correo en este momento. Intentá de nuevo en un minuto o escribile a Daniel.' });
  }
  return res.status(200).json({ ok: true, mensaje: 'Listo: te enviamos el enlace a ' + email +
    '. Si no lo ves en un par de minutos, revisá la carpeta de spam.' });
}

function safeParse(s) { try { return JSON.parse(s); } catch (e) { return {}; } }
function esc(s) {
  return String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
}
