/* flyer.js — flyers OAKBERRY con QR (centro de control y creador de franquiciados).
 *
 * Estilo "Oakers" (referencia de Daniel, 16-oct-2026: flyer de Jamundí "Recibe dos
 * sellos"): fondo morado, logo arriba, una línea pequeña + un titular grande en
 * crema, el bowl recortado al centro con los sellos encima, la tarjeta crema del
 * QR asomando detrás del bowl, ubicación, línea y letra pequeña con redes.
 *
 * Se dibuja en <canvas> en el navegador. Todo lo que pinta es del mismo dominio
 * (/cc-assets, /exacto-assets) o trae CORS (logo del aliado desde la API) para
 * que el PNG se pueda descargar.
 *
 *   await OakFlyer.dibujar(canvas, d, 'afiche' | 'post' | 'historia')
 *   d = { arriba, titular, lema, sellos (0-2), qrTexto, url,
 *         ubicTitulo, ubicTexto, letra, redes, aliado, logo, foto }
 */
(function () {
  const C = { crema: '#F6EFE0', morado: '#4A1F5F', lila: '#B79CC8', oro: '#F4B223', tinta: '#21152A',
              arena: '#E5D3AE', blanco: '#ffffff' };
  const FORMATOS = { afiche: [1080, 1680], post: [1080, 1350], historia: [1080, 1920] };
  // Posiciones relativas por formato (fracciones de alto).
  const L = {
    afiche:   { logo: .055, arriba: .125, tit: .205, bowlTop: .30, bowlH: .50, qrY: .51, ubic: .855, linea: .935 },
    post:     { logo: .06,  arriba: .14,  tit: .225, bowlTop: .30, bowlH: .47, qrY: .50, ubic: .83,  linea: .925 },
    historia: { logo: .07,  arriba: .135, tit: .205, bowlTop: .29, bowlH: .48, qrY: .49, ubic: .835, linea: .93 },
  };
  let fuentes = null;
  function cargarFuentes() {
    if (fuentes) return fuentes;
    const f = [['400', 'nexa-slab-regular'], ['700', 'nexa-slab-bold'], ['900', 'nexa-slab-black']]
      .map(([w, n]) => new FontFace('NexaFlyer', `url(/exacto-assets/fuentes/${n}.woff2)`, { weight: w }));
    fuentes = Promise.all(f.map(x => x.load().then(y => document.fonts.add(y)))).catch(() => null);
    return fuentes;
  }
  function img(src) {
    return new Promise(ok => {
      if (!src) return ok(null);
      const i = new Image();
      if (/^https?:/.test(src) && !src.startsWith(location.origin)) i.crossOrigin = 'anonymous';
      i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src;
    });
  }
  function qr(url, px) {
    return new Promise(ok => {
      const d = document.createElement('div');
      new QRCode(d, { text: url, width: px, height: px, colorDark: '#000000', colorLight: C.crema,
                      correctLevel: QRCode.CorrectLevel.M });
      setTimeout(() => ok(d.querySelector('canvas')), 30);
    });
  }
  function redondo(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function fuente(size, weight) { return `${weight} ${size}px NexaFlyer, Georgia, serif`; }
  // Texto centrado que se achica hasta caber; devuelve el tamaño usado.
  function centrado(g, t, x, y, size, weight, color, maxW) {
    let s = size; g.font = fuente(s, weight);
    while (g.measureText(t).width > maxW && s > 14) { s -= 2; g.font = fuente(s, weight); }
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillText(t, x, y);
    return s;
  }
  function lineas(g, t, maxW) {
    const out = []; let l = '';
    for (const p of String(t || '').split(/\s+/).filter(Boolean)) {
      const prueba = l ? l + ' ' + p : p;
      if (g.measureText(prueba).width > maxW && l) { out.push(l); l = p; } else l = prueba;
    }
    if (l) out.push(l);
    return out;
  }
  function parrafo(g, t, x, y, maxW, size, lh, color, weight = 400, align = 'center') {
    g.font = fuente(size, weight); g.fillStyle = color; g.textAlign = align;
    const ls = lineas(g, t, maxW);
    ls.forEach((l, i) => g.fillText(l, x, y + i * lh));
    return y + (ls.length - 1) * lh;
  }
  // Titular: primero intenta UNA línea achicando hasta 84 px (como la
  // referencia); si no cabe, pasa a dos líneas.
  function titular(g, t, cx, y, size, maxW) {
    let s = size, ls;
    g.font = fuente(s, 900);
    while (g.measureText(t).width > maxW && s > 84) { s -= 2; g.font = fuente(s, 900); }
    if (g.measureText(t).width <= maxW) ls = [t];
    else for (s = size;;) {
      g.font = fuente(s, 900); ls = lineas(g, t, maxW);
      if (ls.length <= 2 && ls.every(l => g.measureText(l).width <= maxW)) break;
      if (s <= 40) break; s -= 4;
    }
    g.fillStyle = C.crema; g.textAlign = 'center';
    ls.forEach((l, i) => g.fillText(l, cx, y + i * s * 0.98));
    return y + (ls.length - 1) * s * 0.98;
  }
  function redes(g, handle, xDer, y) {
    g.font = fuente(24, 700); g.textAlign = 'right'; g.fillStyle = C.crema;
    const w = g.measureText(handle).width;
    g.fillText(handle, xDer, y + 8);
    // Íconos simples: Instagram (cuadro redondeado + círculo) y TikTok (nota).
    const xT = xDer - w - 26, xI = xT - 50;
    g.strokeStyle = C.crema; g.lineWidth = 3;
    redondo(g, xI - 16, y - 16, 32, 32, 9); g.stroke();
    g.beginPath(); g.arc(xI, y, 7, 0, 2 * Math.PI); g.stroke();
    g.beginPath(); g.arc(xI + 9, y - 9, 2, 0, 2 * Math.PI); g.fillStyle = C.crema; g.fill();
    g.fillRect(xT - 26, y - 14, 2, 28);
    g.font = fuente(34, 900); g.textAlign = 'center'; g.fillText('♪', xT, y + 12);
  }

  async function dibujar(canvas, d, formato = 'afiche') {
    const [W, H] = FORMATOS[formato] || FORMATOS.afiche, P = L[formato] || L.afiche;
    canvas.width = W; canvas.height = H;
    const g = canvas.getContext('2d');
    await cargarFuentes();
    const [bowl, logoOak, sello, logoAliado, codigoQR] = await Promise.all([
      img(`/cc-assets/${d.foto || 'bowl-clasico'}.webp`), img('/cc-assets/logo-cream.png'),
      img('/cc-assets/sello.png'), img(d.logo), qr(d.url || 'https://www.oakberry-cupones.com', 600)]);

    g.fillStyle = C.morado; g.fillRect(0, 0, W, H);
    const cx = W / 2;

    // Logo (y aliado)
    if (logoOak) {
      const lw = d.aliado ? 380 : 470, lh = lw * logoOak.height / logoOak.width, y = H * P.logo;
      if (d.aliado) {
        const anchoAliado = 300, total = lw + 70 + anchoAliado, x0 = (W - total) / 2;
        g.drawImage(logoOak, x0, y - lh / 2, lw, lh);
        g.font = fuente(48, 400); g.fillStyle = C.lila; g.textAlign = 'center'; g.fillText('×', x0 + lw + 35, y + 16);
        const xA = x0 + lw + 70;
        if (logoAliado) {
          g.fillStyle = C.crema; redondo(g, xA, y - 48, anchoAliado, 96, 20); g.fill();
          const s = Math.min((anchoAliado - 36) / logoAliado.width, 72 / logoAliado.height);
          g.drawImage(logoAliado, xA + (anchoAliado - logoAliado.width * s) / 2, y - logoAliado.height * s / 2,
                      logoAliado.width * s, logoAliado.height * s);
        } else {
          let s = 46; g.font = fuente(s, 900);
          while (g.measureText(d.aliado.toUpperCase()).width > anchoAliado && s > 20) { s -= 2; g.font = fuente(s, 900); }
          g.fillStyle = C.crema; g.textAlign = 'left'; g.fillText(d.aliado.toUpperCase(), xA, y + s / 3);
        }
      } else {
        g.drawImage(logoOak, (W - lw) / 2, y - lh / 2, lw, lh);
      }
    }

    // Línea pequeña + titular
    if (d.arriba) centrado(g, d.arriba, cx, H * P.arriba, 50, 900, C.crema, W - 120);
    const finTit = titular(g, (d.titular || '').toUpperCase(), cx, H * P.tit, 128, W - 90);

    // Zona central, entre el titular y la ubicación: QR detrás, bowl adelante,
    // sellos encima del borde del vaso, lema al lado.
    const n = Math.max(0, Math.min(2, Number(d.sellos) || 0));
    const ss = W * 0.17, zonaArriba = finTit + 34, zonaAbajo = H * P.ubic - 74;
    const rimY = zonaArriba + (n === 2 ? ss * 1.4 : n === 1 ? ss * 0.9 : (zonaAbajo - zonaArriba) * 0.12);
    let bowlH = Math.min((zonaAbajo - rimY) / 0.89, H * 0.56);
    let bowlW = bowl ? bowlH * bowl.width / bowl.height : 0;
    if (bowlW > W * 0.5) { bowlW = W * 0.5; bowlH = bowlW * bowl.height / bowl.width; }
    const bcx = W * 0.36, bx = bcx - bowlW / 2, by = rimY - 0.11 * bowlH;
    const qs = W * 0.32, qx = Math.min(bx + bowlW * 0.86, W * 0.92 - qs);
    const qy = Math.min(rimY + (zonaAbajo - rimY) * 0.3, zonaAbajo - qs - 40);
    g.fillStyle = C.crema; redondo(g, qx, qy, qs, qs, 30); g.fill();
    if (codigoQR) { g.imageSmoothingEnabled = false; const pad = qs * 0.1, off = qs * .05; g.drawImage(codigoQR, qx + pad + off, qy + pad, qs - 2 * pad - off * .4, qs - 2 * pad - off * .4); g.imageSmoothingEnabled = true; }
    if (bowl) {
      g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 40; g.shadowOffsetY = 24;
      g.drawImage(bowl, bx, by, bowlW, bowlH); g.restore();
    }
    if (d.qrTexto) centrado(g, d.qrTexto, qx + qs / 2 + qs * .05, qy + qs + 56, 42, 400, C.crema, W - qx - 20);
    if (sello && n >= 1) g.drawImage(sello, bcx - ss * 0.62, rimY - ss * 0.88, ss, ss);
    if (sello && n >= 2) g.drawImage(sello, bcx + ss * 0.12, rimY - ss * 1.38, ss, ss);
    if (d.lema) {
      g.font = fuente(38, 900); g.fillStyle = C.crema; g.textAlign = 'left';
      const xl = n === 2 ? bcx + ss * 1.22 : (n === 1 ? bcx + ss * 0.55 : qx), maxL = W - xl - 40;
      const ls = lineas(g, d.lema, maxL), yl = n === 2 ? rimY - ss * 0.15 - (ls.length - 1) * 44 : n === 1 ? rimY - ss * 0.45 - (ls.length - 1) * 44 : qy - 30 - (ls.length - 1) * 44;
      ls.forEach((l, k) => g.fillText(l, xl, yl + k * 44));
    }

    // Ubicación
    let y = H * P.ubic;
    if (d.ubicTitulo) { centrado(g, d.ubicTitulo, cx, y, 44, 400, C.crema, W - 140); y += 52; }
    if (d.ubicTexto) {                       // máx. 2 líneas: si no cabe, se achica
      let s = 40; g.font = fuente(s, 400);
      while (lineas(g, d.ubicTexto, W - 180).length > 2 && s > 24) { s -= 2; g.font = fuente(s, 400); }
      parrafo(g, d.ubicTexto, cx, y, W - 180, s, s * 1.2, C.crema, 400);
    }

    // Línea + letra pequeña + redes
    const yl = H * P.linea;
    g.fillStyle = 'rgba(246,239,224,.55)'; g.fillRect(40, yl, W - 80, 2);
    const conRedes = d.redes !== '';
    if (d.letra) parrafo(g, d.letra, conRedes ? (W - 300) / 2 + 10 : cx, yl + 44, conRedes ? W - 380 : W - 120, 23, 29, C.crema, 400);
    if (conRedes) redes(g, d.redes || '@oakberrycol', W - 40, yl + 58);
    return canvas;
  }

  window.OakFlyer = { dibujar, FORMATOS };
})();
