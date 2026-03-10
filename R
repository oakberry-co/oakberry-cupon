<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Oakberry</title>
<style>
  body { font-family: sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; background:#0e0b16; color:#fff; }
  .msg { text-align:center; }
  .spin { width:36px; height:36px; border:3px solid rgba(255,255,255,0.2); border-top-color:#F5C842; border-radius:50%; animation:spin 0.7s linear infinite; margin:0 auto 16px; }
  @keyframes spin { to { transform:rotate(360deg); } }
  p { font-size:13px; opacity:0.5; margin-top:8px; }
</style>
</head>
<body>
<div class="msg">
  <div class="spin"></div>
  <div>Cargando tu cupón...</div>
  <p id="errMsg"></p>
</div>
<script>
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxXgiwi0TVSa26VJK5M0n2YOnSBm0XvOkNn_6QXFeJQGwm6Nz8Dj8GfvA4GbKKyWX-AdQ/exec";

// El alias viene del hash: oakberry-cupones.com/r#bog-tofu-marzo
const alias = window.location.hash.replace("#","").trim();

if (!alias) {
  document.getElementById("errMsg").textContent = "Link inválido";
} else {
  const cb = "cb_r";
  const url = SCRIPT_URL + "?accion=resolverAlias&alias=" + encodeURIComponent(alias) + "&callback=" + cb;
  const s = document.createElement("script");
  window[cb] = function(data) {
    if (data && data.link) {
      window.location.replace(data.link);
    } else {
      document.getElementById("errMsg").textContent = "Link no encontrado: " + alias;
    }
  };
  s.src = url;
  document.body.appendChild(s);
}
</script>
</body>
</html>
