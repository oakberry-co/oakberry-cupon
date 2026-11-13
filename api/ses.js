// api/ses.js — mandar un correo por Amazon SES desde Vercel SIN dependencias.
//
// Este repo no tiene package.json a propósito (es HTML estático + funciones
// sueltas), así que en vez de meter el SDK de AWS se firma la llamada a mano
// con SigV4 usando el crypto de Node. Es la API v2 de SES (JSON), la misma
// que usa boto3 en la VM.
//
// Variables de entorno (Vercel → Production): AWS_SES_ACCESS_KEY,
// AWS_SES_SECRET_KEY, AWS_SES_REGION (us-east-2) y opcionalmente EMAIL_FROM.
// Son las mismas llaves que usa crm/senders/_common.py en el datawarehouse.
import { createHash, createHmac } from 'node:crypto';

const sha256 = s => createHash('sha256').update(s, 'utf8').digest('hex');
const hmac = (k, s) => createHmac('sha256', k).update(s, 'utf8').digest();

export async function enviarCorreo({ to, subject, html, replyTo }) {
  const key = process.env.AWS_SES_ACCESS_KEY, secret = process.env.AWS_SES_SECRET_KEY;
  const region = process.env.AWS_SES_REGION || 'us-east-2';
  const from = process.env.EMAIL_FROM || 'Oakberry <hola@oakberry-cupones.com>';
  if (!key || !secret) throw new Error('Faltan AWS_SES_ACCESS_KEY / AWS_SES_SECRET_KEY en Vercel');

  const host = `email.${region}.amazonaws.com`;
  const path = '/v2/email/outbound-emails';
  const body = JSON.stringify({
    FromEmailAddress: from,
    Destination: { ToAddresses: to },
    ReplyToAddresses: replyTo ? [replyTo] : undefined,
    Content: { Simple: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: { Html: { Data: html, Charset: 'UTF-8' } },
    } },
  });

  // ── SigV4 ──
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');  // 20260910T153000Z
  const fecha = amzDate.slice(0, 8);
  const payloadHash = sha256(body);
  const headers = { 'content-type': 'application/json', host, 'x-amz-content-sha256': payloadHash,
                    'x-amz-date': amzDate };
  const firmados = Object.keys(headers).sort();
  const canonica = ['POST', path, '', ...firmados.map(h => `${h}:${headers[h]}`), '',
                    firmados.join(';'), payloadHash].join('\n');
  const alcance = `${fecha}/${region}/ses/aws4_request`;
  const aFirmar = ['AWS4-HMAC-SHA256', amzDate, alcance, sha256(canonica)].join('\n');
  const kFirma = hmac(hmac(hmac(hmac('AWS4' + secret, fecha), region), 'ses'), 'aws4_request');
  const firma = createHmac('sha256', kFirma).update(aFirmar, 'utf8').digest('hex');
  const authorization = `AWS4-HMAC-SHA256 Credential=${key}/${alcance}, ` +
                        `SignedHeaders=${firmados.join(';')}, Signature=${firma}`;

  const r = await fetch(`https://${host}${path}`, {
    method: 'POST', body,
    headers: { 'content-type': headers['content-type'], 'x-amz-date': amzDate,
               'x-amz-content-sha256': payloadHash, authorization },
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`SES ${r.status}: ${txt.slice(0, 300)}`);
  return (JSON.parse(txt) || {}).MessageId || '';
}
