# Sistema visual de los juegos OAKBERRY RD

Contexto para reusar esta estética en otro programa. Escrito el 2026-09-23.

**Para la otra sesión: lee este archivo primero.** Está en
`/home/daniel/proyectos/oakberry-cupon/SISTEMA-VISUAL.md`.

---

## 1. Dónde vive todo

| Qué | Dónde |
|---|---|
| Frontend | `/home/daniel/proyectos/oakberry-cupon/` (NO es un repo git; se despliega por CLI) |
| Backend | `/home/daniel/proyectos/datawarehouse/crm/api/main.py` → Cloud Run `oakberry-reactivacion-api` (us-central1) |
| Datos | BigQuery `project-oakberry-colombia-dw`, dataset `crm` |
| Dominio | `https://www.oakberry-cupones.com` |

### Páginas vivas

| Ruta | Archivo | Qué es |
|---|---|---|
| `/inicio` | `inicio.html` | Pantalla estática del stand (el volante impreso en pantalla) |
| `/juegos` | `juegos.html` | Landing: se escoge juego |
| `/loro` | `loro.html` | Corredor en canvas (el loro salta palmeras) |
| `/contador` | `contador.html` | Detén el contador 00–99 |
| `/maquina` | `maquina.html` | Tragamonedas (fuera de la landing, viva por URL) |
| `/reto` | `reto.html` | Trivia de 6 preguntas (fuera de la landing, viva por URL) |
| `/centro` | `centro.html` | Centro de mando: premios, cupos, dificultad, ganadores |
| `/exacto` | `exacto.html` | **Programa aparte, de otra sesión. No tocar.** |

Parámetros que entienden todas: `?evento=slug` · `?pais=do` · `?rotar=90|270` ·
`?vertical=0|1` · `#tablero`.

---

## 2. El sistema visual

### Tipografía
Nexa Slab en tres pesos, servidas desde `/exacto-assets/fuentes/`:
`nexa-slab-regular.woff2` (400) · `nexa-slab-bold.woff2` (600–700) ·
`nexa-slab-black.woff2` (800–900).

> **Trampa:** las versiones "FREE" que circulan en Drive son demos y dibujan
> `: % - · ¡ ¿ / ( )` como una marca de agua. Estas tres son las completas.
> Ninguna trae `← ⌫ ✓ ✕`: esos glifos hay que dibujarlos con CSS (ver `.check.on::after`).

### Paleta
```css
--crema:#FBF6E9; --crema-cielo:#F5EEE0; --hueso:#EAE1CC;
--tinta:#21152A; --tinta-suave:#5C4A66;
--morado:#4B1F60; --lila:#B79CC8; --oro:#F4B223;
--coral:#E04850; --rojo:#B3261E; --verde:#2F6B3A;
```

### La regla que manda todo: 9:16 y `cqmin`
La pantalla se diseña **vertical 9:16** (tótem) y en horizontal se muestra
**la misma pantalla** centrada en un marco 9:16, no un layout distinto.

```css
body{container-type:size}          /* habilita cqmin */
/* TODO se mide en cqmin, nunca en vmin ni px */
body{font-size:3.2cqmin}
html.horizontal body{width:min(100vw, calc(100vh * 9 / 16));height:100vh;
  margin:0 auto;box-shadow:0 0 0 100vmax var(--tinta)}
```

`cqmin` y no `vmin` porque el contenedor es el `body`, no la ventana: así el
marco 9:16 en horizontal escala igual que el tótem.

### Piezas base (idénticas en los 4 juegos)
`.escena` (fondo) · `.pantalla` (columna flex, `position:absolute inset:0`) ·
`.bloque` · `.panel` · `.eyebrow` · `.btn` · `.btn-sec` · `.latido` ·
`.badge-prueba` · `.codigo-caja`.

Botones: píldora, mayúsculas, `width:88cqmin`, sombra sólida abajo
(`box-shadow:0 1.1cqmin 0 var(--tinta)`), **texto en UNA línea** (`white-space:nowrap`).

### Escenas de fondo
`/exacto-assets/`: `escena-rio.jpg` · `escena-palmas.jpg` · `escena-oak.jpg` ·
`escena-edificio.jpg` · `escena-vaso.jpg`. Más `loro-vuela.png` (el loro de
marca), `nube.png`, `pajaros.png`, `rio.png`, `sol-loro.png`.
Logo OAKBERRY: `/email-logo-purple.png` y `/email-logo-cream.png`.

Sobre fondos cargados va un panel (`--panel: rgba(...)`) para que el texto se lea.

---

## 3. Cómo reusarlo sin tropezar

El bloque base es **byte a byte idéntico** en `reto/maquina/loro/contador`.
Para arrancar una página nueva, lo más seguro es copiar `juegos.html` o
`inicio.html` completos y vaciar el cuerpo.

### Las trampas que ya nos costaron

1. **La regla `html.horizontal body` NO está junto al resto del bloque base.**
   Vive más abajo (línea ~132 en `loro.html`), después del CSS de la portada.
   Si copias "el bloque base" cortando en el comentario de PORTADA, **te la
   dejas por fuera** y en monitor horizontal la página no se encuadra en 9:16.
   Me pasó dos veces. Se nota porque el desborde en 1440×800 no cuadra con el
   de 1080×1920.

2. **`QS`, `PAIS`, `AUTORIZACION` y `orientar()`** viven en el preámbulo del
   `<script>`. Si copias solo un pedazo, revientan con `X is not defined`.

3. **Medir siempre en 4 pantallas**: 1080×1920, 1080×1700, 1440×800 y 390×844.
   La de 1080×1700 es la que más aprieta (no entra en el marco 9:16).
   Verificar con `bounding_box` que el botón principal y el último elemento
   **caben sin scroll**, y exigir **cero errores de página**.

4. **Si el contenido es mucho y fijo** (caso `/inicio`), no lo ajustes a mano
   para cada pantalla: hay un envoltorio `.ajusta` con `transform:scale(var(--k))`
   y una función `encajar()` que lo encoge solo. Ver `inicio.html`.

5. **Teclado en pantalla**: el de EXACTO solo escucha toques; en un PC el campo
   "parece bloqueado". Si reusas un teclado propio, añade `keydown`.
   (En estos juegos ya no hay teclado: el registro es por QR.)

---

## 4. Backend (si el programa nuevo necesita premios/cupos)

Rewrite: `/juego-api/:path*` → Cloud Run. Endpoints por juego:
`config` · `registrar` · `terminar`/`girar`/`parar` · `tablero`.
Más `/juego/admin/estado` y `/juego/admin/guardar` (centro de mando, PIN en
env `JUEGOS_ADMIN_PIN`).

**Tablas BQ (`crm`)**: `slot_niveles` (la escalera de premios: label, cupo/día,
cupo_total, meta_m, aciertos, segundos, velocidad) · `slot_config` ·
`juego_evento_participantes` · `juego_evento_resultados` · `slot_giros` ·
`slot_resultados` · `loro_resultados` · `contador_resultados` ·
vista `v_juego_evento`.

**Decisiones de diseño que vale la pena copiar:**

- **Un solo stock compartido** por todos los juegos. Se cuenta **por nombre de
  premio**, no por número de nivel: el cupo es una caja física de termos y esa
  caja no cambia porque el premio suba o baje en la escalera. (Contar por nivel
  hizo que reordenar la escalera le pasara los entregados de un premio a otro.)
- **El servidor manda en todo lo que decide premio**: arma y firma las rondas
  (HMAC con env `JUEGO_SECRET`), calcula el resultado y acota los tiempos. La
  pantalla solo reporta.
- **Nada se regala.** Hasta el primer premio hay que ganárselo.
- **La escalera se pinta al instante desde `localStorage`** y se corrige cuando
  contesta el servidor: con el wifi del evento esa consulta tarda segundos y la
  pantalla quedaba en blanco justo donde la gente mira.
- **Código de premio** (`_codigo_premio`): sale del id de la partida vía HMAC,
  cambia en cada ocasión, se muestra en caja. No valida nada — es para que dos
  personas no reclamen con la misma captura. Alfabeto sin `O/0` ni `I/1`.

---

## 5. Desplegar

**Frontend** (Vercel, proyecto `oakberry-cupon`, por CLI desde el working tree,
NO por git):

```bash
T=$(gcloud secrets versions access latest --secret=VERCEL_TOKEN)
~/.local/bin/vercel deploy --prod --yes --token "$T" --scope dzuluaga-1387s-projects
```

> **Antes de desplegar, comparar el working tree contra el deployment de
> producción por la API** y volver a verificar el uid justo antes de publicar.
> Este directorio lo editan varias sesiones a la vez; una vez casi reverto el
> trabajo de otra. El `uid` de los archivos en la API de Vercel es **sha1 crudo**
> del contenido (no blob de git), y vienen bajo el prefijo `src/`.

**Backend**:

```bash
cd /home/daniel/proyectos/datawarehouse/crm/api
gcloud run deploy oakberry-reactivacion-api --source=. --region=us-central1 --quiet
```

> Sin flags de env: el `deploy.sh` pasa `--set-env-vars` y borraría `JUEGO_SECRET`.

**Un deploy correcto no es un sitio público**: los 4 proyectos tienen
`ssoProtection`, así que las URLs `*.vercel.app` dan 302. **Verificar siempre
contra el dominio propio.**

---

## 6. Estado al 2026-09-23

- Evento `rd` (real) y `rd-prueba` (sin topes, para probar).
- Escalera actual de `rd`: Cupón 10% (40 m) · Cupón 15% (110) · Bowl 9 oz (200) ·
  Camisa (320) · Termo (470) · Peluche (650) · Año de açaí (1400).
- Centro de mando: `https://www.oakberry-cupones.com/centro?evento=rd` · PIN 106615.

### Pendientes abiertos
- **`crm/api/main.py` tiene cambios sin commit** (todo el trabajo de los juegos).
- El nombre "Bowl 9 oz" quedó por confirmar (se mencionó 7 oz).
- La fecha "21 de septiembre" del código de premio está en el código del
  servidor (`PREMIO_VENCE`), no en base de datos.
