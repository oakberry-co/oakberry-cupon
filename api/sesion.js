// api/sesion.js — tokens firmados para entrar a /conciliacion sin cuenta de Google.
//
// Dos clases de token, ambos sin estado (no hay base de datos detrás: la
// firma HMAC con CONCI_SECRET es la única verdad):
//   · enlace : lo que va en el correo. Vale 30 minutos. Al abrirlo, el API lo
//              cambia por una sesión.
//   · sesion : vale 30 días y vive en el localStorage del navegador. Es lo que
//              hace que el franquiciado no tenga que pedir un enlace cada vez.
//
// Un token solo dice QUIÉN es (el correo); qué tiendas ve lo decide
// api/accesos.js en cada llamada, igual que con el login de Google. Si a un
// correo se le quita el acceso, su sesión deja de servir en el acto.
//
// CONCI_SECRET: variable de entorno en Vercel (Production). Cambiarla cierra
// todas las sesiones y enlaces vivos.
import { createHmac, timingSafeEqual } from 'node:crypto';

const MIN = 60 * 1000, DIA = 24 * 60 * MIN;
export const VIDA_ENLACE = 30 * MIN;
export const VIDA_SESION = 30 * DIA;

function secreto() {
  const s = process.env.CONCI_SECRET;
  if (!s || s.length < 16) throw new Error('Falta CONCI_SECRET en Vercel');
  return s;
}

function firmar(payload) {
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const f = createHmac('sha256', secreto()).update(p).digest('base64url');
  return p + '.' + f;
}

// Devuelve el payload {e, k, x} o null si la firma no cuadra o venció.
export function abrir(token) {
  if (typeof token !== 'string' || token.length > 2000) return null;
  const i = token.indexOf('.');
  if (i < 0) return null;
  const p = token.slice(0, i), f = token.slice(i + 1);
  const esperada = createHmac('sha256', secreto()).update(p).digest();
  let dada;
  try { dada = Buffer.from(f, 'base64url'); } catch (e) { return null; }
  if (dada.length !== esperada.length || !timingSafeEqual(dada, esperada)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(p, 'base64url').toString()); } catch (e) { return null; }
  if (!payload || typeof payload.e !== 'string' || !payload.x || Date.now() > payload.x) return null;
  return payload;
}

export const tokenEnlace = email => firmar({ e: email, k: 'enlace', x: Date.now() + VIDA_ENLACE });
export const tokenSesion = email => firmar({ e: email, k: 'sesion', x: Date.now() + VIDA_SESION });
