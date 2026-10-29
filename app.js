'use strict';
// =====================================================================
// APEX Cotizador — interfaz
// =====================================================================
const $ = (s, r) => (r || document).querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const ICON = {
  search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  minus:'<path d="M5 12h14"/>',
  back:'<path d="M15 5l-7 7 7 7"/>',
  check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  file:'<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  share:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.6l6.8-4M8.6 13.4l6.8 4"/>',
  edit:'<path d="M4 20h4l10.5-10.5a2.1 2.1 0 00-3-3L5 17z"/>',
  ban:'<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon:'<path d="M20 14.5A8.5 8.5 0 019.5 4 8.5 8.5 0 1020 14.5z"/>',
  copy:'<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/>',
  x:'<path d="M6 6l12 12M18 6L6 18"/>',
  chevron:'<path d="M9 5l7 7-7 7"/>',
  image:'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="1.8"/><path d="M21 16l-5-5-8 8"/>',
  warn:'<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.4"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.4"/>',
  refresh:'<path d="M4 4v6h6"/><path d="M20 20v-6h-6"/><path d="M5.6 15A8 8 0 0019 13M18.4 9A8 8 0 005 11"/>',
  eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  logout:'<path d="M9 4H5a2 2 0 00-2 2v12a2 2 0 002 2h4M16 8l4 4-4 4M20 12H9"/>',
  trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
};
const ic = n => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;
const apexMark = (px) => `<div class="apex-mark"><svg width="${px}" height="${px}" aria-hidden="true"><use href="#apex-pk"/></svg><div class="apex-word"><b>APEX</b><small>RENTAL MANAGER</small></div></div>`;

const ESTADO_LABEL = { vigente:'Vigente', aceptado:'Aceptado', vencido:'Vencido', anulado:'Anulado', borrador:'Sin subir' };

// ---------- Estado de la interfaz ----------
const V = { view:'login', last:null, filtro:'todos', q:'', thumbs:{}, loginMsg:'', soloStock:false, pdf:null };
let E = null;            // editor en curso
let OV = null;           // overlay abierto (hoja o diálogo): { cerrar }

// ---------- Números y fechas ----------
function parseNum(s){
  s = String(s == null ? '' : s).trim().replace(/[^\d.,-]/g, '');
  if(!s) return 0;
  if(s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if(/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return isFinite(n) ? n : 0;
}
function fmtNumInput(n){ n = Number(n) || 0; return n ? n.toLocaleString('es-AR', { minimumFractionDigits:2, maximumFractionDigits:2 }) : ''; }
function maskDate(el){
  const v = el.value.replace(/\D/g, '').slice(0, 8);
  el.value = v.length > 4 ? `${v.slice(0,2)}/${v.slice(2,4)}/${v.slice(4)}` : v.length > 2 ? `${v.slice(0,2)}/${v.slice(2)}` : v;
}
function hace(ts){
  if(!ts) return 'nunca';
  const m = Math.round((Date.now() - ts) / 60000);
  if(m < 1) return 'recién';
  if(m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if(h < 24) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

// ---------- Avisos, diálogos, hojas ----------
function toast(msg, kind){
  const box = $('#toasts');
  box.innerHTML = '';                                   // un solo aviso a la vez: el último reemplaza al anterior
  const t = document.createElement('div');
  t.className = 'toast ' + (kind || '');
  t.textContent = msg;
  box.appendChild(t);
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.remove(), kind === 'err' ? 5200 : 2800);
}
function busy(msg){
  const d = document.createElement('div');
  d.className = 'busy';
  d.innerHTML = `<div class="spin"></div><div>${esc(msg)}</div>`;
  document.body.appendChild(d);
  return () => d.remove();
}
function cerrarOverlay(){ if(OV){ const o = OV; OV = null; o.cerrar(); } }
function abrirHoja(titulo, cuerpoHtml, alMontar){
  cerrarOverlay();
  const root = $('#ov');
  root.innerHTML = `<div class="scrim" data-act="cerrar-ov"></div>
    <div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${titulo ? `<h3>${esc(titulo)}</h3>` : ''}<div class="sb">${cuerpoHtml}</div></div>`;
  OV = { cerrar: () => { root.innerHTML = ''; } };
  if(alMontar) alMontar($('.sheet', root));
}
function confirmar({ titulo, texto, ok, cancelar, peligro }){
  return new Promise(res => {
    cerrarOverlay();
    const root = $('#ov');
    root.innerHTML = `<div class="scrim"></div><div class="dlg" role="alertdialog" aria-modal="true">
      <h3>${esc(titulo)}</h3><p>${esc(texto || '')}</p>
      <div class="btns"><button class="btn" data-dlg="0">${esc(cancelar || 'Cancelar')}</button>
      <button class="btn ${peligro ? 'danger' : 'primary'}" data-dlg="1">${esc(ok || 'Aceptar')}</button></div></div>`;
    let hecho = false;
    const fin = v => { if(hecho) return; hecho = true; OV = null; root.innerHTML = ''; res(v); };
    OV = { cerrar: () => fin(false) };
    root.querySelectorAll('[data-dlg]').forEach(b => b.addEventListener('click', () => fin(b.dataset.dlg === '1')));
    $('.scrim', root).addEventListener('click', () => fin(false));
  });
}

// ---------- Tema ----------
function aplicarTema(){
  let claro = false;
  try{ claro = localStorage.getItem('apex-theme') === 'light'; } catch(e){}
  document.body.classList.toggle('light-theme', claro);
  const m = document.querySelector('meta[name=theme-color]');
  if(m) m.setAttribute('content', claro ? '#f3f5f8' : '#0b0b0c');
  if(window.ApexAndroid && ApexAndroid.setLightTheme){ try{ ApexAndroid.setLightTheme(claro); } catch(e){} }
}
function alternarTema(){
  const claro = !document.body.classList.contains('light-theme');
  try{ localStorage.setItem('apex-theme', claro ? 'light' : 'dark'); } catch(e){}
  aplicarTema();
  render();
}

// ---------- Datos derivados ----------
function nombreUsuario(){ const p = S.perfil || {}; return p.nombre_mostrar || p.nombre || p.email || 'Usuario'; }
function iniciales(){ return nombreUsuario().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'U'; }
function clienteNombreDe(p){
  if(p.clientes && p.clientes.razon_social) return p.clientes.razon_social;
  if(p.cliente_id){ const c = S.clientes.find(x => x.id === p.cliente_id); if(c) return c.razon_social; }
  return p.empresa_nombre || '—';
}
function fotoSrc(modelo){
  const u = fotoUrlDeModelo(modelo);
  return u ? (V.thumbs[u] || u) : '';
}
function thumbHtml(modelo){
  const src = fotoSrc(modelo);
  return `<span class="thumb">${ic('image')}${src ? `<img src="${esc(src)}" alt="" loading="lazy" onerror="this.remove()">` : ''}</span>`;
}
async function cargarThumbs(){
  try{
    for(const k of await DB.keys('fotos')){
      if(V.thumbs[k]) continue;
      const v = await DB.get('fotos', k);
      if(v && v.data) V.thumbs[k] = v.data;
    }
  } catch(e){ console.warn(e); }
}
function sucursalPorDefecto(){
  const nombre = ((S.perfil && S.perfil.sucursal) || '').toUpperCase().replace(/[^A-Z]/g, '');
  if(!nombre) return '';
  const s = S.sucursales.find(x => String(x.nombre).toUpperCase().replace(/[^A-Z]/g, '') === nombre);
  return s ? String(s.id) : '';
}

// ---------- Stock: textos y advertencias ----------
const plural = (n, a, b) => n === 1 ? a : b;
function sucNombre(id){ const s = S.sucursales.find(x => String(x.id) === String(id)); return s ? s.nombre : ''; }
function fmtFechaCorta(iso){ return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : ''; }
function stockEdad(){
  if(!S.stock) return null;
  const d = new Date(S.stock.at);
  const p2 = n => String(n).padStart(2, '0');
  return { txt: `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`, viejo: Date.now() - S.stock.at > 6 * 3600000 };
}
// Cómo se ve un modelo en la sucursal elegida: { cls, txt, sub }
function stockTexto(modelo, sucId){
  const st = stockModelo(modelo, sucId);
  if(!st) return null;
  const suc = sucNombre(sucId);
  let cls = 'bad', txt = '', sub = '';
  if(st.tipo === 'libre'){
    cls = 'ok';
    const extra = [];
    if(st.libresAqui){
      txt = `${st.libresAqui} ${plural(st.libresAqui, 'disponible', 'disponibles')} en ${suc}`;
      if(st.resAqui) extra.push(`${st.resAqui} ${plural(st.resAqui, 'reservada', 'reservadas')}`);
      if(st.sinSuc) extra.push(`+${st.sinSuc} sin sucursal asignada`);
    } else {
      txt = `${st.sinSuc} ${plural(st.sinSuc, 'disponible', 'disponibles')}, sin sucursal asignada`;
      if(st.resAqui) extra.push(`${st.resAqui} ${plural(st.resAqui, 'reservada', 'reservadas')} en ${suc}`);
    }
    if(extra.length) sub = extra.join(' · ');
  } else if(st.tipo === 'reservada'){
    cls = 'warn'; txt = `Todas reservadas en ${suc}`; sub = `${st.res} ${plural(st.res, 'reservada', 'reservadas')}`;
  } else if(st.tipo === 'pdi'){
    cls = 'warn'; txt = `${st.pdi} en PDI en ${suc}`; sub = 'Todavía no está lista para alquilar';
  } else if(st.tipo === 'alquilada'){
    cls = 'warn'; txt = `Alquilada${st.alq === 1 ? '' : 's'} en ${suc}${st.libera ? ' · se libera el ' + fmtFechaCorta(st.libera) : ''}`;
  } else if(st.tipo === 'vor'){
    cls = 'bad'; txt = `En reparación (VOR) en ${suc}`;
  } else {
    cls = 'bad'; txt = st.total ? `Sin stock en ${suc}` : 'No figura en la flota';
  }
  if(st.tipo !== 'libre' && st.otras.length) sub = (sub ? sub + ' · ' : '') + 'Hay en ' + st.otras.map(o => `${o.nombre} (${o.n})`).join(', ');
  return { cls, txt, sub, st };
}
function stockHtml(modelo, sucId, cant){
  if(!sucId || !modelo) return '';
  const t = stockTexto(modelo, sucId);
  if(!t) return '';
  let h = `<div class="stk ${t.cls}"><i></i><div>${esc(t.txt)}${t.sub ? `<small>${esc(t.sub)}</small>` : ''}</div></div>`;
  if(cant && t.st.tipo === 'libre' && Number(cant) > t.st.libres){
    h += `<div class="stk warn"><i></i><div>Pedís ${esc(cant)} y hay ${t.st.libres} ${plural(t.st.libres, 'disponible', 'disponibles')}</div></div>`;
  }
  return h;
}
// Equipos de un presupuesto (o del editor) que no tienen stock libre en su sucursal
function advertenciasStock(sucId, items){
  if(!S.stock || !sucId) return [];
  const out = [], vistos = new Set();
  (items || []).forEach(it => {
    if(!it.modelo || vistos.has(it.modelo)) return;
    vistos.add(it.modelo);
    const cant = (items || []).filter(x => x.modelo === it.modelo).reduce((a, x) => Math.max(a, Number(x.cantidad) || 0), 0);
    const t = stockTexto(it.modelo, sucId);
    if(!t) return;
    if(t.st.tipo !== 'libre') out.push({ modelo: it.modelo, msg: t.txt });
    else if(cant > t.st.libres) out.push({ modelo: it.modelo, msg: `pedís ${cant}, hay ${t.st.libres}` });
  });
  return out;
}

// ---------- Vistas ----------
function vLogin(){
  let email = '';
  try{ email = localStorage.getItem('apex-last-email') || ''; } catch(e){}
  return `<div class="screen"><div class="login"><div class="login-box">
    ${apexMark(46)}
    <p class="sub">Cotizador de alquileres para el equipo comercial.</p>
    ${V.loginMsg ? `<div class="banner info" style="margin:0 0 16px">${ic('info')}<div>${esc(V.loginMsg)}</div></div>` : ''}
    <div class="field"><label for="lg-email">Email</label><input class="in" id="lg-email" type="email" inputmode="email" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" value="${esc(email)}"></div>
    <div class="field"><label for="lg-pass">Contraseña</label><input class="in" id="lg-pass" type="password" autocomplete="current-password"></div>
    <button class="btn primary block" id="btn-login" data-act="login">Ingresar</button>
    <div class="err" id="lg-err" role="alert"></div>
  </div><div class="login-foot">APEX Rental Manager · Cotizador</div></div></div>`;
}

function chipEstado(){
  const pend = pendientes().length;
  let cls = '', txt = '';
  if(S.syncing){ cls = 'sync'; txt = 'Sincronizando…'; }
  else if(!navigator.onLine){ cls = 'off'; txt = pend ? `Sin conexión · ${pend} sin subir` : 'Sin conexión'; }
  else if(S.lastError){ cls = 'err'; txt = 'Error de sincronización'; }
  else if(pend){ cls = 'sync'; txt = `${pend} sin subir`; }
  else { txt = 'En línea'; }
  return `<button class="status-chip ${cls}" data-act="estado-chip" aria-label="Estado de conexión"><span class="dot"></span>${esc(txt)}</button>`;
}

function listaFiltrada(){
  const q = V.q.trim().toLowerCase();
  return S.presupuestos.filter(p => {
    const st = estadoVista(p);
    if(V.filtro === 'vigente' && st !== 'vigente') return false;
    if(V.filtro === 'vencido' && st !== 'vencido') return false;
    if(V.filtro === 'anulado' && st !== 'anulado') return false;
    if(V.filtro === 'pendiente' && !(p._pending || p._anular)) return false;
    if(q){
      const hay = String(p.numero || '').includes(q) || clienteNombreDe(p).toLowerCase().includes(q) ||
        (p.empresa_nombre || '').toLowerCase().includes(q) || (p.contacto_nombre || '').toLowerCase().includes(q);
      if(!hay) return false;
    }
    return true;
  });
}
function cardsHtml(){
  const list = listaFiltrada();
  if(!list.length){
    return `<div class="empty">${ic('file')}<b>${S.presupuestos.length ? 'Sin resultados' : 'Todavía no hay presupuestos'}</b>
      ${S.presupuestos.length ? 'Probá con otro filtro o búsqueda.' : 'Tocá “Nuevo presupuesto” para armar el primero.'}</div>`;
  }
  return list.map((p, i) => {
    const st = estadoVista(p);
    const n = (p.presupuesto_items || []).length;
    const pend = p._pending || p._anular;
    return `<button class="card st-${st}" data-act="abrir" data-key="${esc(p.key)}" style="animation-delay:${Math.min(i, 8) * 30}ms">
      <div class="row"><span class="num">${esc(numeroTexto(p))}</span><span class="badge st-${st}">${ESTADO_LABEL[st] || st}</span></div>
      <div class="who">${esc(clienteNombreDe(p))}</div>
      <div class="row"><span class="meta">${fmtDate(p.fecha_emision)} · ${n} ítem${n === 1 ? '' : 's'}${p.contacto_nombre ? ' · ' + esc(p.contacto_nombre) : ''}</span>
        <span class="total">${esc(fmtMoney(totalPresupuesto(p), p.moneda || 'USD'))}</span></div>
      ${pend ? `<div class="meta" style="margin-top:6px;color:var(--warn);font-weight:600">Pendiente de subir</div>` : ''}
      ${(st === 'vigente' || st === 'borrador') && advertenciasStock(p.sucursal_id, p.presupuesto_items).length ? `<div class="alerta">${ic('warn')}Sin stock completo en ${esc(sucNombre(p.sucursal_id))}</div>` : ''}
    </button>`;
  }).join('');
}
function vList(){
  const pend = pendientes().length;
  const cuenta = f => S.presupuestos.filter(p => f === 'todos' ? true : f === 'pendiente' ? (p._pending || p._anular) : estadoVista(p) === f).length;
  const chips = [['todos','Todos'],['vigente','Vigentes'],['vencido','Vencidos'],['anulado','Anulados']];
  if(pend) chips.push(['pendiente','Sin subir']);
  const nombre = nombreUsuario().split(/\s+/)[0];
  return `<div class="screen">
    <header class="appbar">${apexMark(30)}
      <div class="bar-actions"><span id="chip-slot">${chipEstado()}</span>
        <button class="icon-btn" data-act="tema" aria-label="Cambiar tema">${ic(document.body.classList.contains('light-theme') ? 'moon' : 'sun')}</button>
        <button class="avatar" data-act="cuenta" aria-label="Mi cuenta">${esc(iniciales())}</button></div>
    </header>
    <main class="body">
      <section class="hello"><h1>Hola, ${esc(nombre)}</h1><p id="hello-sub">${helloSub()}</p></section>
      <div id="offline-slot">${bannerOffline()}</div>
      <div class="search">${ic('search')}<input id="q" type="search" placeholder="Buscar por N°, cliente o contacto" value="${esc(V.q)}" autocomplete="off"></div>
      <div class="chips" id="chips">${chips.map(([k, l]) => `<button class="chip ${V.filtro === k ? 'on' : ''}" data-act="filtro" data-v="${k}">${l}<span class="n">${cuenta(k)}</span></button>`).join('')}</div>
      <div class="cards" id="cards">${cardsHtml()}</div>
    </main>
    ${puede('presupuestos', 'crear') ? `<button class="fab" data-act="nuevo">${ic('plus')}Nuevo presupuesto</button>` : ''}
  </div>`;
}
function bannerOffline(){
  return navigator.onLine ? '' : `<div class="banner">${ic('warn')}<div><b>Trabajando sin conexión</b>Podés cotizar con normalidad. Todo se sube solo cuando vuelva la señal.</div></div>`;
}
function helloSub(){
  const n = S.presupuestos.length, pend = pendientes().length;
  return `${n} presupuesto${n === 1 ? '' : 's'}${pend ? ` · ${pend} sin subir` : ''} · actualizado ${hace(S.lastSync)}`;
}

function agrupar(items){
  const grupos = [], idx = new Map();
  (items || []).slice().sort((a, b) => (a.orden || 0) - (b.orden || 0)).forEach(it => {
    const k = `${it.modelo}||${it.descripcion || ''}`;
    if(!idx.has(k)){ idx.set(k, grupos.length); grupos.push({ modelo: it.modelo, descripcion: it.descripcion, filas: [] }); }
    grupos[idx.get(k)].filas.push(it);
  });
  return grupos;
}
function vDetail(){
  const p = S.presupuestos.find(x => x.key === S.detailKey);
  if(!p) return vList();
  const st = estadoVista(p);
  const moneda = p.moneda || 'USD';
  const pend = p._pending || p._anular;
  const editable = puede('presupuestos', 'crear') && st !== 'anulado';
  const puedeAnular = p.id && puede('presupuestos', 'anular') && st !== 'anulado';
  const venceTxt = (() => {
    if(!p.fecha_emision) return '—';
    const [y, m, d] = String(p.fecha_emision).slice(0, 10).split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d) + (Number(p.validez_dias) || 7) * 86400000);
    return `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${dt.getUTCFullYear()}`;
  })();
  const grupos = agrupar(p.presupuesto_items).map(g => `
    <div class="grupo"><div class="gh">${thumbHtml(g.modelo)}<b>${esc(g.descripcion || g.modelo)}</b></div>
      ${g.filas.map(f => `<div class="linea"><span>${esc(f.cantidad)} × ${esc(f.periodo || 'Mes')}</span><b>${esc(fmtMoney(f.precio_unitario, moneda))}</b></div>`).join('')}
    </div>`).join('');
  return `<div class="screen">
    <header class="appbar"><button class="icon-btn" data-act="volver" aria-label="Volver">${ic('back')}</button>
      <div class="bar-title">${esc(numeroTexto(p))}<span class="bar-sub">${esc(clienteNombreDe(p))}</span></div>
      <span id="chip-slot">${chipEstado()}</span></header>
    <main class="body">
      ${!p.id ? `<div class="banner info">${ic('info')}<div><b>Guardado en este teléfono</b>El número correlativo se asigna cuando se suba, apenas haya conexión.</div></div>` : ''}
      ${p.id && pend && !p._error ? `<div class="banner info">${ic('info')}<div><b>Cambios pendientes de subir</b>Se enviarán solos cuando haya conexión.</div></div>` : ''}
      ${p._error ? `<div class="banner danger">${ic('warn')}<div><b>No se pudo subir</b>${esc(p._error)}<div style="margin-top:8px"><button class="btn sm" data-act="sync-now">Reintentar</button></div></div></div>` : ''}
      <section class="hero st-${st}" style="${p._error || pend ? 'margin-top:14px' : ''}">
        <div class="top"><span class="num">${esc(numeroTexto(p))}</span><span class="badge st-${st}">${ESTADO_LABEL[st] || st}</span></div>
        <h2>${esc(clienteNombreDe(p))}</h2>
        ${p.contacto_nombre ? `<div class="dim">${esc(p.contacto_nombre)}${p.contacto_telefono ? ' · ' + esc(p.contacto_telefono) : ''}</div>` : ''}
        <div class="big"><span class="dim">Total</span><b>${esc(fmtMoney(totalPresupuesto(p), moneda))}</b></div>
        ${p.ocultar_total ? `<div class="dim" style="font-size:12px;text-align:right;margin-top:2px">El total no se muestra en el PDF</div>` : ''}
        <div class="kv">
          <div><small>Emisión</small><b>${fmtDate(p.fecha_emision)}</b></div>
          <div><small>Válido hasta</small><b>${venceTxt}</b></div>
          <div><small>Moneda</small><b>${moneda}</b></div>
          <div><small>Sucursal</small><b>${esc((p.sucursales && p.sucursales.nombre) || (S.sucursales.find(s => s.id === p.sucursal_id) || {}).nombre || '—')}</b></div>
          ${p.condicion_pago ? `<div><small>Condición de pago</small><b>${esc(p.condicion_pago)}</b></div>` : ''}
          ${p.forma_pago ? `<div><small>Forma de pago</small><b>${esc(p.forma_pago)}</b></div>` : ''}
          ${p.obra ? `<div style="grid-column:1/-1"><small>Entrega en</small><b>${esc(p.obra)}</b></div>` : ''}
        </div>
      </section>
      ${(() => {
        if(st !== 'vigente' && st !== 'borrador') return '';
        const adv = advertenciasStock(p.sucursal_id, p.presupuesto_items);
        if(!adv.length) return '';
        return `<div class="banner warn" style="margin-top:12px">${ic('warn')}<div><b>Revisá el stock en ${esc(sucNombre(p.sucursal_id))}</b>${adv.map(a => `${esc(a.modelo)}: ${esc(a.msg)}`).join('<br>')}</div></div>`;
      })()}
      ${st === 'anulado' && p.motivo_anulacion ? `<div class="banner danger" style="margin-top:12px">${ic('ban')}<div><b>Motivo de anulación</b>${esc(p.motivo_anulacion)}</div></div>` : ''}
      <div class="sec-title">Equipos</div>
      ${grupos || '<div class="dim">Sin equipos.</div>'}
      ${p.flete_incluir && Number(p.flete_monto) > 0 ? `<div class="grupo"><div class="linea" style="border:0;padding:2px 0"><span>Flete</span><b>${esc(fmtMoney(p.flete_monto, moneda))}</b></div></div>` : ''}
      ${p.notas ? `<div class="sec-title">Notas</div><div class="dim" style="white-space:pre-wrap">${esc(p.notas)}</div>` : ''}
      <div class="actions">
        <div class="actions two" style="margin:0">
          <button class="btn primary" data-act="ver-pdf">${ic('eye')}Ver PDF</button>
          <button class="btn" data-act="pdf">${ic('share')}Compartir</button>
        </div>
        <div class="actions two" style="margin:0">
          ${editable ? `<button class="btn" data-act="editar">${ic('edit')}Editar</button>` : ''}
          ${puedeAnular ? `<button class="btn danger" data-act="anular">${ic('ban')}Anular</button>` : ''}
          ${!p.id ? `<button class="btn danger" data-act="descartar">${ic('trash')}Descartar</button>` : ''}
        </div>
      </div>
    </main></div>`;
}

// ---------- Editor ----------
const PASOS = ['Cliente', 'Equipos', 'Condiciones', 'Entrega'];
function nuevoEditor(){
  return {
    rec: null, step: 0, dirty: false, items: [],
    data: {
      cliente_id: null, cliente_nombre: '', empresa_nombre: '', contacto_nombre: '', contacto_email: '', contacto_telefono: '',
      sucursal_id: sucursalPorDefecto(), fecha_emision: isoADmy(hoyIso()), validez_dias: '7', moneda: 'USD',
      condicion_pago: '', forma_pago: '', notas: '', obra: '', fecha_entrega: '', horario_entrega: '', persona_responsable: '',
      celular_responsable: '', facturar_a: '', facturar_cuit: '', facturar_domicilio: '', facturar_tel: '', mail_factura_electronica: '',
      flete_incluir: false, flete_txt: '', ocultar_total: false,
    },
  };
}
function editorDesde(p){
  const e = nuevoEditor();
  e.rec = p;
  const d = e.data;
  ['empresa_nombre','contacto_nombre','contacto_email','contacto_telefono','condicion_pago','forma_pago','notas','obra','horario_entrega',
   'persona_responsable','celular_responsable','facturar_a','facturar_cuit','facturar_domicilio','facturar_tel','mail_factura_electronica']
    .forEach(k => { d[k] = p[k] || ''; });
  d.cliente_id = p.cliente_id || null;
  d.cliente_nombre = d.cliente_id ? clienteNombreDe(p) : '';
  d.sucursal_id = p.sucursal_id ? String(p.sucursal_id) : '';
  d.fecha_emision = isoADmy(p.fecha_emision) || isoADmy(hoyIso());
  d.fecha_entrega = isoADmy(p.fecha_entrega);
  d.validez_dias = String(p.validez_dias || 7);
  d.moneda = p.moneda || 'USD';
  d.flete_incluir = !!p.flete_incluir;
  d.flete_txt = fmtNumInput(p.flete_monto);
  d.ocultar_total = !!p.ocultar_total;
  e.items = (p.presupuesto_items || []).slice().sort((a, b) => (a.orden || 0) - (b.orden || 0)).map(it => ({
    modelo: it.modelo || '', categoria: it.categoria || '', descripcion: it.descripcion || it.modelo || '',
    cantidad: Number(it.cantidad) || 1, periodo: it.periodo || 'Mes', precio_txt: fmtNumInput(it.precio_unitario),
  }));
  return e;
}
function editorTotal(){
  const sub = E.items.reduce((a, it) => a + (Number(it.cantidad) || 0) * parseNum(it.precio_txt), 0);
  return sub + (E.data.flete_incluir ? parseNum(E.data.flete_txt) : 0);
}
function itemHtml(it, i){
  const mon = E.data.moneda === 'USD' ? 'U$D' : '$';
  const sub = (Number(it.cantidad) || 0) * parseNum(it.precio_txt);
  return `<div class="item" data-i="${i}">
    <div class="item-head">${thumbHtml(it.modelo)}
      <button class="nm" data-act="cambiar-modelo" data-i="${i}">${it.modelo
        ? `<b>${esc(it.modelo)}</b><small>${esc(it.categoria || 'Cambiar modelo')}</small>` : `<b class="dim">Elegir equipo…</b><small>Tocá para buscar</small>`}</button>
      <button class="icon-btn" data-act="quitar-item" data-i="${i}" aria-label="Quitar equipo">${ic('x')}</button>
    </div>
    ${it.modelo && E.data.sucursal_id && S.stock ? `<div class="stk-box" id="stk-${i}">${stockHtml(it.modelo, E.data.sucursal_id, it.cantidad)}</div>` : ''}
    <div class="item-row">
      <div class="qty"><button type="button" data-act="qty-" data-i="${i}" aria-label="Menos">−</button>
        <input data-i="${i}" data-k="cantidad" inputmode="numeric" value="${esc(it.cantidad)}" aria-label="Cantidad">
        <button type="button" data-act="qty+" data-i="${i}" aria-label="Más">+</button></div>
      <div class="seg" data-seg="${i}">${['Día', 'Semana', 'Mes'].map(p => `<button type="button" class="${it.periodo === p ? 'on' : ''}" data-act="periodo" data-i="${i}" data-v="${p}">${p}</button>`).join('')}</div>
    </div>
    <div class="item-foot">
      <div class="price" style="flex:1"><span>${mon}</span><input class="in" data-i="${i}" data-k="precio" inputmode="decimal" placeholder="0,00" value="${esc(it.precio_txt)}" aria-label="Precio unitario"></div>
      <div class="sub" data-sub="${i}">${esc(fmtMoney(sub, E.data.moneda))}</div>
    </div>
    <div class="add-row"><button type="button" class="btn sm ghost" data-act="dup-item" data-i="${i}">${ic('copy')}Cotizar otro período</button></div>
  </div>`;
}
function fld(label, key, opts){
  opts = opts || {};
  const val = E.data[key] == null ? '' : E.data[key];
  const attr = `data-f="${key}" value="${esc(val)}"${opts.mask ? ' data-mask="date"' : ''}${opts.ph ? ` placeholder="${esc(opts.ph)}"` : ''}${opts.im ? ` inputmode="${opts.im}"` : ''}${opts.ac ? ` autocomplete="${opts.ac}"` : ' autocomplete="off"'}`;
  return `<div class="field"><label>${esc(label)}</label>${opts.area
    ? `<textarea class="in" data-f="${key}" rows="3"${opts.ph ? ` placeholder="${esc(opts.ph)}"` : ''}>${esc(val)}</textarea>`
    : `<input class="in" type="text" ${attr}>`}</div>`;
}
function stockCabecera(){
  const suc = sucNombre(E.data.sucursal_id);
  const ed = stockEdad();
  if(!ed) return `<div class="banner info" style="margin-bottom:12px">${ic('info')}<div><b>Sin datos de stock todavía</b>Conectate una vez para ver la disponibilidad por sucursal. Igual podés cotizar.</div></div>`;
  return `<div class="stk-head ${ed.viejo ? 'viejo' : ''}"><div>Stock de <b>${esc(suc)}</b><small>${ed.viejo ? 'Desactualizado · ' : ''}al ${ed.txt}</small></div>
    <button class="btn sm" data-act="paso" data-v="0">Cambiar</button></div>`;
}
function pasoHtml(){
  const d = E.data;
  if(E.step === 0){
    return `<div class="sec-title" style="margin-top:4px">Cliente</div>
      <div class="field"><label>Buscar en la base</label>
        <button class="picker" data-act="pick-cliente">${d.cliente_id
          ? `<span><b>${esc(d.cliente_nombre)}</b><small>Tocá para cambiar</small></span>`
          : `<span class="ph">${S.clientes.length ? `Buscar entre ${S.clientes.length.toLocaleString('es-AR')} clientes…` : 'Base de clientes no disponible'}</span>`}${ic('chevron')}</button>
        ${d.cliente_id ? `<button class="btn sm ghost" style="margin-top:8px" data-act="clear-cliente">Quitar cliente (es un prospecto)</button>` : ''}</div>
      ${!d.cliente_id ? fld('Empresa (si es prospecto nuevo)', 'empresa_nombre', { ac:'off' }) : ''}
      <div class="sec-title">Contacto</div>
      ${fld('Nombre del contacto', 'contacto_nombre')}
      <div class="grid2">${fld('Email', 'contacto_email', { im:'email' })}${fld('Teléfono', 'contacto_telefono', { im:'tel' })}</div>
      <div class="field ${E.errSuc ? 'err' : ''}" id="f-suc"><label>Sucursal desde la que cotizás <span class="req">*</span></label>
        <div class="seg suc">${S.sucursales.map(s => `<button type="button" class="${String(s.id) === String(d.sucursal_id) ? 'on' : ''}" data-act="sucursal" data-v="${s.id}">${esc(s.nombre)}</button>`).join('')}</div>
        <div class="hint">${d.sucursal_id ? 'Al elegir equipos vas a ver el stock de esta sucursal.' : 'Obligatoria: define qué stock te mostramos al elegir equipos.'}</div></div>`;
  }
  if(E.step === 1){
    return `${stockCabecera()}<div class="field"><label>Moneda</label><div class="seg">${['USD', 'ARS'].map(m => `<button type="button" class="${d.moneda === m ? 'on' : ''}" data-act="moneda" data-v="${m}">${m}</button>`).join('')}</div></div>
      <div class="sec-title">Equipos cotizados</div>
      ${E.items.length ? E.items.map(itemHtml).join('') : `<div class="empty" style="padding:24px 10px">${ic('image')}<b>Todavía no hay equipos</b>Agregá el primero para empezar a cotizar.</div>`}
      <button class="btn block" data-act="add-item">${ic('plus')}Agregar equipo</button>
      <div class="sec-title">Opciones</div>
      <div class="switch-row"><div><b>Incluir flete</b><small>Se suma al total</small></div><label class="sw"><input type="checkbox" data-f="flete_incluir" ${d.flete_incluir ? 'checked' : ''}><i></i></label></div>
      ${d.flete_incluir ? `<div class="field"><label>Costo del flete</label><div class="price"><span>${d.moneda === 'USD' ? 'U$D' : '$'}</span><input class="in" data-f="flete_txt" data-money="1" inputmode="decimal" placeholder="0,00" value="${esc(d.flete_txt)}"></div></div>` : ''}
      <div class="switch-row"><div><b>Ocultar el total en el PDF</b><small>Útil al cotizar varias máquinas con precios por período</small></div><label class="sw"><input type="checkbox" data-f="ocultar_total" ${d.ocultar_total ? 'checked' : ''}><i></i></label></div>`;
  }
  if(E.step === 2){
    return `<div class="grid2">${fld('Fecha de emisión', 'fecha_emision', { mask:1, ph:'DD/MM/AAAA', im:'numeric' })}${fld('Validez (días)', 'validez_dias', { im:'numeric' })}</div>
      ${fld('Condición de pago', 'condicion_pago', { ph:'Ej: 30 días fecha de factura' })}
      ${fld('Forma de pago', 'forma_pago', { ph:'Ej: Transferencia bancaria' })}
      ${fld('Notas / condiciones adicionales', 'notas', { area:1 })}`;
  }
  return `<div class="sec-title" style="margin-top:4px">Lugar y fecha de entrega</div>
    ${fld('Entregar en obra (dirección)', 'obra')}
    <div class="grid2">${fld('El día', 'fecha_entrega', { mask:1, ph:'DD/MM/AAAA', im:'numeric' })}${fld('Horario', 'horario_entrega', { ph:'Ej: 9 a 13 hs' })}</div>
    ${fld('Responsable de recibir/entregar', 'persona_responsable')}
    ${fld('Celular', 'celular_responsable', { im:'tel' })}
    <div class="sec-title">Datos de facturación</div>
    ${fld('Facturar a', 'facturar_a')}
    <div class="grid2">${fld('C.U.I.T.', 'facturar_cuit', { im:'numeric' })}${fld('Teléfono / Fax', 'facturar_tel', { im:'tel' })}</div>
    ${fld('Domicilio', 'facturar_domicilio')}
    ${fld('Mail para factura electrónica', 'mail_factura_electronica', { im:'email' })}`;
}
function vEditor(){
  const ult = E.step === PASOS.length - 1;
  return `<div class="screen">
    <header class="appbar"><button class="icon-btn" data-act="volver" aria-label="Volver">${ic('back')}</button>
      <div class="bar-title">${E.rec ? 'Editar ' + esc(numeroTexto(E.rec)) : 'Nuevo presupuesto'}<span class="bar-sub">${PASOS[E.step]} · paso ${E.step + 1} de ${PASOS.length}</span></div>
      <button class="btn sm primary" data-act="guardar">${ic('check')}Guardar</button></header>
    <nav class="steps">${PASOS.map((p, i) => `<button class="step ${i === E.step ? 'on' : i < E.step ? 'done' : ''}" data-act="paso" data-v="${i}"><i></i><span>${p}</span></button>`).join('')}</nav>
    <main class="ed-body" id="ed-body">${pasoHtml()}</main>
    <footer class="ed-foot">
      ${E.step > 0 ? `<button class="icon-btn" data-act="prev" aria-label="Anterior">${ic('back')}</button>` : ''}
      <div class="tot"><small>Total${E.data.ocultar_total ? ' · oculto en PDF' : ''}</small><b id="ed-total">${esc(fmtMoney(editorTotal(), E.data.moneda))}</b></div>
      <button class="btn primary" data-act="${ult ? 'guardar' : 'next'}">${ult ? ic('check') + 'Guardar' : 'Siguiente' + ic('chevron')}</button>
    </footer></div>`;
}
function refrescarStockItem(i){
  const box = document.getElementById('stk-' + i), it = E && E.items[i];
  if(box && it) box.innerHTML = stockHtml(it.modelo, E.data.sucursal_id, it.cantidad);
}
function actualizarTotales(){
  const t = $('#ed-total'); if(t) t.textContent = fmtMoney(editorTotal(), E.data.moneda);
  E.items.forEach((it, i) => {
    const s = document.querySelector(`[data-sub="${i}"]`);
    if(s) s.textContent = fmtMoney((Number(it.cantidad) || 0) * parseNum(it.precio_txt), E.data.moneda);
  });
}

// ---------- Render general ----------
function render(){
  const root = $('#app');
  let html;
  if(V.view === 'login') html = vLogin();
  else if(V.view === 'detail') html = vDetail();
  else if(V.view === 'editor' && E) html = vEditor();
  else { V.view = 'list'; html = vList(); }
  const mismo = V.view === V.last;
  const y = mismo ? (document.scrollingElement || document.documentElement).scrollTop : 0;
  root.innerHTML = html;
  if(!mismo && root.firstElementChild) root.firstElementChild.classList.add('enter');
  V.last = V.view;
  (document.scrollingElement || document.documentElement).scrollTop = y;
}
function refrescarCromo(){
  document.querySelectorAll('#chip-slot').forEach(s => { s.innerHTML = chipEstado(); });
  if(V.view === 'list'){
    const h = $('#hello-sub'); if(h) h.innerHTML = helloSub();
    const o = $('#offline-slot'); if(o) o.innerHTML = bannerOffline();
    const c = $('#cards'); if(c) c.innerHTML = cardsHtml();
    const b = $('#chips'); if(b) b.outerHTML = chipsRow();
  } else if(V.view === 'detail'){
    render();
  }
}
function chipsRow(){
  const tmp = document.createElement('div');
  tmp.innerHTML = vList();
  return tmp.querySelector('#chips').outerHTML;
}

// ---------- Navegación ----------
function irLista(){ V.view = 'list'; E = null; S.detailKey = null; cerrarOverlay(); render(); }
function irDetalle(key){ S.detailKey = key; V.view = 'detail'; E = null; cerrarOverlay(); render(); window.scrollTo(0, 0); }
function irPaso(n){
  n = Math.max(0, Math.min(PASOS.length - 1, n));
  if(n > 0 && !E.data.sucursal_id){
    E.errSuc = true; E.step = 0; render(); window.scrollTo(0, 0);
    toast('Elegí la sucursal desde la que cotizás para continuar', 'err');
    return;
  }
  E.step = n; render(); window.scrollTo(0, 0);
}
async function salirEditor(){
  if(E && E.dirty){
    const ok = await confirmar({ titulo: '¿Salir sin guardar?', texto: 'Se pierden los cambios que hiciste en este presupuesto.', ok: 'Salir', cancelar: 'Seguir editando', peligro: true });
    if(!ok) return;
  }
  const rec = E && E.rec;
  E = null;
  if(rec) irDetalle(rec.key); else irLista();
}
function atras(){
  if(V.pdf){ cerrarVisorPdf(); return true; }
  if(OV){ cerrarOverlay(); return true; }
  if(V.view === 'editor'){ salirEditor(); return true; }
  if(V.view === 'detail'){ irLista(); return true; }
  return false;           // en la lista (o login): la app se cierra
}
window.apexBack = atras;

// ---------- Selectores (hojas) ----------
function abrirClientes(){
  if(!S.clientes.length){ toast('La base de clientes todavía no se descargó. Conectate para sincronizar.', 'err'); return; }
  const render = q => {
    q = q.trim().toLowerCase();
    const dig = q.replace(/\D/g, '');
    let res = S.clientes;
    if(q){
      res = res.filter(c => {
        if(!c._h) c._h = `${c.razon_social || ''} ${c.cuit || ''} ${(c.cuit || '').replace(/\D/g, '')} ${c.numero_cliente || ''}`.toLowerCase();
        return c._h.includes(q) || (dig.length >= 3 && c._h.includes(dig));
      });
    }
    const top = res.slice(0, 40);
    return top.length ? top.map(c => `<button class="opt" data-act="sel-cliente" data-id="${c.id}"><div class="tx"><b>${esc(c.razon_social)}</b><small>${esc([c.cuit, c.numero_cliente ? 'N° ' + c.numero_cliente : ''].filter(Boolean).join(' · ') || '—')}</small></div></button>`).join('') +
      (res.length > 40 ? `<div class="dim" style="text-align:center;padding:10px;font-size:12px">${res.length - 40} más… afiná la búsqueda</div>` : '')
      : `<div class="empty" style="padding:24px"><b>Sin resultados</b>Si es un prospecto nuevo, cerrá esto y escribí la empresa.</div>`;
  };
  abrirHoja('Elegir cliente', `<div class="search">${ic('search')}<input id="cli-q" type="search" placeholder="Razón social, CUIT o N° de cliente" autocomplete="off"></div><div id="cli-res">${render('')}</div>`, sh => {
    const inp = $('#cli-q', sh); let t;
    inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { $('#cli-res', sh).innerHTML = render(inp.value); }, 120); });
    setTimeout(() => inp.focus(), 250);
  });
}
function abrirModelos(alElegir){
  const sucId = E && E.data.sucursal_id;
  const cat = catalogoTecnicoCache.filter(c => c.especificaciones && c.especificaciones.length);
  const conStock = !!(sucId && S.stock);
  const lista = q => {
    const n = normalizarModelo(q);
    let res = cat.filter(c => !n || normalizarModelo(c.modelo).includes(n) || normalizarModelo(c.categoria || '').includes(n));
    if(conStock && V.soloStock) res = res.filter(c => { const st = stockModelo(c.modelo, sucId); return st && st.tipo === 'libre'; });
    const porCat = {};
    res.forEach(c => { (porCat[c.categoria || c.familia || 'Otros'] = porCat[c.categoria || c.familia || 'Otros'] || []).push(c); });
    let html = '';
    Object.keys(porCat).sort().forEach(k => {
      html += `<div class="opt-sep">${esc(k)}</div>` + porCat[k].sort((a, b) => a.modelo.localeCompare(b.modelo)).map(c =>
        `<button class="opt" data-act="sel-modelo" data-m="${esc(c.modelo)}">${thumbHtml(c.modelo)}<div class="tx"><b>${esc(c.modelo)}</b>${conStock ? (stockHtml(c.modelo, sucId) || `<small>${esc(c.categoria || c.familia || '')}</small>`) : `<small>${esc(c.categoria || c.familia || '')}</small>`}</div></button>`).join('');
    });
    if(q.trim() && !cat.some(c => normalizarModelo(c.modelo) === n)){
      html += `<div class="opt-sep">Otro</div><button class="opt" data-act="sel-modelo-libre" data-m="${esc(q.trim())}"><div class="tx"><b>Usar “${esc(q.trim())}”</b><small>Modelo que no está en el catálogo</small></div></button>`;
    }
    return html || `<div class="empty" style="padding:24px"><b>${conStock && V.soloStock ? 'Nada con stock' : 'Catálogo vacío'}</b>${conStock && V.soloStock ? `No hay modelos disponibles en ${esc(sucNombre(sucId))} con ese filtro.` : 'Conectate para descargar los modelos, o escribí el modelo a mano.'}</div>`;
  };
  const ed = stockEdad();
  const cab = conStock
    ? `<div class="mod-filter"><div class="seg" style="flex:1"><button type="button" class="${V.soloStock ? '' : 'on'}" data-act="solo-stock" data-v="0">Todos</button><button type="button" class="${V.soloStock ? 'on' : ''}" data-act="solo-stock" data-v="1">Con stock</button></div></div>
       <div class="hint" style="margin:-2px 6px 8px">Stock de ${esc(sucNombre(sucId))} · al ${ed.txt}${ed.viejo ? ' (desactualizado)' : ''}</div>`
    : (sucId ? `<div class="hint" style="margin:0 6px 8px">Sin datos de stock: conectate para verlos.</div>` : '');
  window._alElegirModelo = alElegir;
  window._listaModelos = lista;
  abrirHoja('Elegir equipo', `<div class="search">${ic('search')}<input id="mod-q" type="search" placeholder="Buscar modelo" autocomplete="off"></div>${cab}<div id="mod-res">${lista('')}</div>`, sh => {
    const inp = $('#mod-q', sh); let t;
    inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { $('#mod-res', sh).innerHTML = lista(inp.value); }, 100); });
  });
}
function abrirCuenta(){
  const p = S.perfil || {};
  const pend = pendientes().length;
  abrirHoja('Mi cuenta', `
    <div class="kv" style="margin:0 8px 14px">
      <div><small>Usuario</small><b>${esc(nombreUsuario())}</b></div>
      <div><small>Rol</small><b>${esc(p.rol || '—')}</b></div>
      <div style="grid-column:1/-1"><small>Email</small><b>${esc(p.email || '—')}</b></div>
      <div><small>Última sincronización</small><b>${hace(S.lastSync)}</b></div>
      <div><small>Sin subir</small><b>${pend}</b></div>
    </div>
    <div class="actions" style="margin:0 8px">
      <button class="btn" data-act="sync-now">${ic('refresh')}Sincronizar ahora</button>
      <button class="btn" data-act="sync-full">${ic('refresh')}Volver a descargar clientes</button>
      <button class="btn danger" data-act="logout">${ic('logout')}Cerrar sesión</button>
    </div><div class="version">APEX Cotizador v${esc(APP_VERSION)}</div>`);
}
function abrirAnular(p){
  abrirHoja('Anular presupuesto', `<div style="padding:0 8px">
    <p class="dim" style="margin:0 0 12px;font-size:14px"><b style="color:var(--text)">${esc(numeroTexto(p))}</b> — ${esc(clienteNombreDe(p))}<br>El número no se borra: queda en el historial como anulado.</p>
    <div class="field"><label>Motivo (opcional)</label><textarea class="in" id="anu-motivo" rows="3" placeholder="Ej: el cliente eligió otro proveedor"></textarea></div>
    <button class="btn danger block" data-act="confirmar-anular">${ic('ban')}Anular presupuesto</button></div>`);
}

// ---------- Acciones ----------
async function guardarEditor(){
  const d = E.data;
  if(!d.sucursal_id){ irPaso(1); return; }
  const items = E.items.filter(it => it.modelo && Number(it.cantidad) > 0);
  if(!items.length){ toast('Agregá al menos un equipo con modelo y cantidad', 'err'); irPaso(1); return; }
  if(!d.cliente_id && !d.empresa_nombre.trim()){ toast('Elegí un cliente o escribí el nombre de la empresa', 'err'); irPaso(0); return; }
  const fe = dmyAIso(d.fecha_emision);
  if(!fe){ toast('La fecha de emisión debe ser DD/MM/AAAA', 'err'); irPaso(2); return; }
  let fent = null;
  if(d.fecha_entrega.trim()){ fent = dmyAIso(d.fecha_entrega); if(!fent){ toast('La fecha de entrega debe ser DD/MM/AAAA', 'err'); irPaso(3); return; } }

  const base = E.rec || {
    key: 'loc:' + uuid(), id: null, numero: null, estado: 'vigente', created_at: new Date().toISOString(),
  };
  if(!base.id && !base.creado_por) base.creado_por = `${nombreUsuario()} · app ${uuid().slice(0, 8)}`;
  const suc = S.sucursales.find(s => String(s.id) === String(d.sucursal_id));
  const rec = {
    ...base,
    cliente_id: d.cliente_id || null,
    empresa_nombre: d.empresa_nombre.trim() || null,
    contacto_nombre: d.contacto_nombre.trim() || null,
    contacto_email: d.contacto_email.trim() || null,
    contacto_telefono: d.contacto_telefono.trim() || null,
    sucursal_id: d.sucursal_id ? Number(d.sucursal_id) : null,
    fecha_emision: fe,
    validez_dias: Number(d.validez_dias) || 7,
    moneda: d.moneda,
    condicion_pago: d.condicion_pago.trim() || null,
    forma_pago: d.forma_pago.trim() || null,
    notas: d.notas.trim() || null,
    obra: d.obra.trim() || null,
    fecha_entrega: fent,
    horario_entrega: d.horario_entrega.trim() || null,
    persona_responsable: d.persona_responsable.trim() || null,
    celular_responsable: d.celular_responsable.trim() || null,
    facturar_a: d.facturar_a.trim() || null,
    facturar_cuit: d.facturar_cuit.trim() || null,
    facturar_domicilio: d.facturar_domicilio.trim() || null,
    facturar_tel: d.facturar_tel.trim() || null,
    mail_factura_electronica: d.mail_factura_electronica.trim() || null,
    flete_incluir: !!d.flete_incluir,
    flete_monto: d.flete_incluir ? parseNum(d.flete_txt) : 0,
    ocultar_total: !!d.ocultar_total,
    presupuesto_items: items.map((it, i) => ({
      modelo: it.modelo, categoria: it.categoria || null, descripcion: it.modelo,
      cantidad: Number(it.cantidad), periodo: it.periodo, precio_unitario: parseNum(it.precio_txt), orden: i,
    })),
    clientes: d.cliente_id ? { razon_social: d.cliente_nombre } : null,
    sucursales: suc ? { nombre: suc.nombre } : null,
    _pending: true, _op: base.id ? 'update' : 'create', _error: null,
  };
  await DB.put('presupuestos', rec);
  await cargarPresupuestosLocal();
  E = null;
  irDetalle(rec.key);
  if(!navigator.onLine) toast('Guardado en el teléfono. Se subirá cuando haya conexión.', 'ok');
  sincronizar({ silent: true });
}

async function generarPdf(modo){
  const p = S.presupuestos.find(x => x.key === S.detailKey);
  if(!p) return;
  if(!p.numero){ toast('Este presupuesto todavía no tiene número. Se lo asigna el sistema al subirlo: conectate a internet y probá de nuevo.', 'err'); return; }
  if(modo === 'compartir' && !(await confirmarStock(p))) return;
  const cerrar = busy('Generando PDF…');
  try{
    await new Promise(r => setTimeout(r, 40));
    const { doc, fileName } = await generarPresupuestoPDF(p);
    if(modo === 'ver'){
      await abrirVisorPdf(doc, fileName, p);
      cerrar();
    } else {
      cerrar();
      await compartirPdf(doc, fileName);
    }
  } catch(e){
    cerrar();
    console.error(e);
    toast('No se pudo generar el PDF: ' + (e && e.message ? e.message : e), 'err');
  }
}
// Antes de mandárselo al cliente: si algún equipo no tiene stock libre en la sucursal, hay que confirmarlo
async function confirmarStock(p){
  const adv = advertenciasStock(p.sucursal_id, p.presupuesto_items);
  if(!adv.length) return true;
  return confirmar({
    titulo: `Sin stock completo en ${sucNombre(p.sucursal_id)}`,
    texto: adv.map(a => `${a.modelo}: ${a.msg}`).join('\n') + '\n\n¿Querés compartir el PDF igual?',
    ok: 'Compartir igual', cancelar: 'Volver',
  });
}

// ---------- Visor de PDF dentro de la app (pdf.js, funciona sin señal) ----------
async function cargarPdfJs(){
  if(window.pdfjsLib) return;
  await new Promise((ok, ko) => {
    const sc = document.createElement('script');
    sc.src = 'vendor/pdf.min.js'; sc.onload = ok; sc.onerror = () => ko(new Error('No se pudo cargar el visor de PDF'));
    document.head.appendChild(sc);
  });
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
}
const ZOOMS = [1, 1.5, 2, 3];
async function abrirVisorPdf(doc, fileName, p){
  await cargarPdfJs();
  const buf = doc.output('arraybuffer');
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  cerrarVisorPdf();
  V.pdf = { doc, fileName, p, pdf, zoom: 0, obs: null, tam: [] };
  const el = document.createElement('div');
  el.className = 'pdfv'; el.id = 'pdfv';
  el.innerHTML = `<header class="appbar"><button class="icon-btn" data-act="cerrar-pdf" aria-label="Cerrar visor">${ic('back')}</button>
      <div class="bar-title">${esc(numeroTexto(p))}<span class="bar-sub">${esc(clienteNombreDe(p))}</span></div><span class="pdfv-pgn" id="pdfv-pgn"></span></header>
    <div class="pdfv-pages" id="pdfv-pages"></div>
    <div class="pdfv-bar"><div class="zoom"><button class="icon-btn" data-act="pdf-zoom" data-v="-1" aria-label="Alejar">${ic('minus')}</button>
      <button class="icon-btn" data-act="pdf-zoom" data-v="1" aria-label="Acercar">${ic('plus')}</button></div>
      <button class="btn primary" data-act="pdf-compartir">${ic('share')}Compartir</button></div>`;
  document.body.appendChild(el);
  for(let i = 1; i <= pdf.numPages; i++){ const pg = await pdf.getPage(i); const v = pg.getViewport({ scale: 1 }); V.pdf.tam.push([v.width, v.height]); }
  montarPaginasPdf();
  $('#pdfv-pages').addEventListener('scroll', () => requestAnimationFrame(indicarPaginaPdf), { passive: true });
}
function montarPaginasPdf(){
  const v = V.pdf; if(!v) return;
  const cont = $('#pdfv-pages');
  const ratio = cont.scrollHeight > cont.clientHeight ? cont.scrollTop / cont.scrollHeight : 0;
  if(v.obs) v.obs.disconnect();
  cont.innerHTML = '';
  const ancho = (cont.clientWidth - 24) * ZOOMS[v.zoom];
  v.paginas = v.tam.map(([w, h], i) => {
    const d = document.createElement('div');
    d.className = 'pdfv-pg'; d.dataset.n = i + 1;
    d.style.width = ancho + 'px'; d.style.height = (ancho * h / w) + 'px';
    d.innerHTML = '<div class="pdfv-load">Cargando…</div>';
    cont.appendChild(d); return d;
  });
  v.obs = new IntersectionObserver(es => es.forEach(en => {
    const d = en.target;
    if(en.isIntersecting) renderPaginaPdf(d);
    else { d._tok = (d._tok || 0) + 1; d.querySelectorAll('canvas').forEach(c => { c.width = 0; c.height = 0; c.remove(); }); d._ok = false; if(!d.querySelector('.pdfv-load')) d.insertAdjacentHTML('beforeend', '<div class="pdfv-load">Cargando…</div>'); }
  }), { root: cont, rootMargin: '120% 0px' });
  v.paginas.forEach(d => v.obs.observe(d));
  cont.scrollTop = ratio * cont.scrollHeight;
  indicarPaginaPdf();
}
async function renderPaginaPdf(d){
  const v = V.pdf; if(!v || d._ok) return;
  const tok = d._tok = (d._tok || 0) + 1;
  try{
    const page = await v.pdf.getPage(Number(d.dataset.n));
    const base = page.getViewport({ scale: 1 });
    const cssW = parseFloat(d.style.width);
    const salida = Math.min(cssW * Math.min(window.devicePixelRatio || 1, 2.5), 2000);
    const vp = page.getViewport({ scale: salida / base.width });
    const cv = document.createElement('canvas');
    cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    if(tok !== d._tok || !V.pdf) return;
    d.innerHTML = ''; d.appendChild(cv); d._ok = true;
  } catch(e){ console.warn('PDF página', e); }
}
function indicarPaginaPdf(){
  const v = V.pdf; if(!v) return;
  const cont = $('#pdfv-pages'), ind = $('#pdfv-pgn'); if(!cont || !ind) return;
  const ref = cont.scrollTop + cont.clientHeight * 0.35;
  let n = 1;
  v.paginas.forEach((d, i) => { if(d.offsetTop - cont.offsetTop <= ref) n = i + 1; });
  ind.textContent = `${n} / ${v.paginas.length}`;
}
function zoomVisorPdf(dir){
  const v = V.pdf; if(!v) return;
  const z = Math.max(0, Math.min(ZOOMS.length - 1, v.zoom + dir));
  if(z === v.zoom) return;
  v.zoom = z; montarPaginasPdf();
}
function cerrarVisorPdf(){
  const v = V.pdf; if(!v) return;
  V.pdf = null;
  try{ if(v.obs) v.obs.disconnect(); v.pdf.destroy(); } catch(e){}
  const el = document.getElementById('pdfv'); if(el) el.remove();
}
async function compartirDesdeVisor(){
  const v = V.pdf; if(!v) return;
  if(!(await confirmarStock(v.p))) return;
  await compartirPdf(v.doc, v.fileName);
}
async function compartirPdf(doc, fileName){
  const uri = doc.output('datauristring');
  if(window.ApexAndroid && ApexAndroid.sharePdf){
    ApexAndroid.sharePdf(uri.slice(uri.indexOf('base64,') + 7), fileName);
    return;
  }
  const blob = doc.output('blob');
  try{
    const file = new File([blob], fileName, { type: 'application/pdf' });
    if(navigator.canShare && navigator.canShare({ files: [file] })){ await navigator.share({ files: [file], title: fileName }); return; }
  } catch(e){ if(e && e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = fileName;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

async function hacerLogin(){
  const email = $('#lg-email').value.trim(), pass = $('#lg-pass').value, err = $('#lg-err'), btn = $('#btn-login');
  err.textContent = '';
  if(!email || !pass){ err.textContent = 'Completá email y contraseña'; return; }
  if(!navigator.onLine){ err.textContent = 'El primer ingreso necesita conexión a internet.'; return; }
  btn.disabled = true; btn.textContent = 'Ingresando…';
  try{
    await iniciarSesion(email, pass);
    try{ localStorage.setItem('apex-last-email', email); } catch(e){}
    V.loginMsg = '';
    await cargarLocal();
    S.perfil = (await DB.get('kv', 'perfil')) || S.perfil;
    irLista();
    sincronizar({ silent: true });
  } catch(e){
    err.textContent = e.message || 'No se pudo ingresar';
    btn.disabled = false; btn.textContent = 'Ingresar';
  }
}

async function accion(act, el){
  const i = el && el.dataset.i !== undefined ? Number(el.dataset.i) : null;
  switch(act){
    case 'login': return hacerLogin();
    case 'cerrar-ov': return cerrarOverlay();
    case 'tema': return alternarTema();
    case 'estado-chip':
      if(S.syncing) return;
      if(!navigator.onLine) return toast('Sin conexión. Se sincroniza solo cuando vuelva la señal.');
      return sincronizar({});
    case 'cuenta': return abrirCuenta();
    case 'sync-now': cerrarOverlay(); return sincronizar({});
    case 'sync-full': cerrarOverlay(); return sincronizar({ completo: true });
    case 'logout': {
      const pend = pendientes().length;
      const ok = await confirmar({
        titulo: 'Cerrar sesión',
        texto: pend ? `Tenés ${pend} presupuesto(s) sin subir. Si cerrás sesión ahora, se pierden.` : 'Vas a tener que volver a ingresar con tu email y contraseña.',
        ok: 'Cerrar sesión', peligro: true,
      });
      if(!ok) return;
      V.loginMsg = '';
      return cerrarSesion(!pend);
    }
    case 'filtro': V.filtro = el.dataset.v; return refrescarCromo();
    case 'nuevo': E = nuevoEditor(); V.view = 'editor'; render(); window.scrollTo(0, 0); return;
    case 'abrir': return irDetalle(el.dataset.key);
    case 'volver': return atras();
    case 'editar': {
      const p = S.presupuestos.find(x => x.key === S.detailKey);
      if(!p) return;
      E = editorDesde(p); V.view = 'editor'; render(); window.scrollTo(0, 0); return;
    }
    case 'pdf': return generarPdf('compartir');
    case 'anular': { const p = S.presupuestos.find(x => x.key === S.detailKey); if(p) abrirAnular(p); return; }
    case 'confirmar-anular': {
      const p = S.presupuestos.find(x => x.key === S.detailKey);
      if(!p) return;
      p._anular = { motivo: ($('#anu-motivo') || {}).value || '' };
      await DB.put('presupuestos', p);
      cerrarOverlay(); await cargarPresupuestosLocal(); render();
      if(!navigator.onLine) toast('Anulación guardada. Se enviará cuando haya conexión.', 'ok');
      return sincronizar({ silent: true });
    }
    case 'descartar': {
      const p = S.presupuestos.find(x => x.key === S.detailKey);
      if(!p || p.id) return;
      const ok = await confirmar({ titulo: 'Descartar borrador', texto: 'Este presupuesto nunca se subió, así que no tiene número. Se elimina del teléfono.', ok: 'Descartar', peligro: true });
      if(!ok) return;
      await DB.del('presupuestos', p.key); await cargarPresupuestosLocal(); return irLista();
    }
    // --- editor
    case 'paso': return irPaso(Number(el.dataset.v));
    case 'next': return irPaso(E.step + 1);
    case 'prev': return irPaso(E.step - 1);
    case 'guardar': return guardarEditor();
    case 'pick-cliente': return abrirClientes();
    case 'clear-cliente': E.data.cliente_id = null; E.data.cliente_nombre = ''; E.dirty = true; return render();
    case 'sel-cliente': {
      const c = S.clientes.find(x => x.id === Number(el.dataset.id));
      if(!c) return;
      const d = E.data;
      d.cliente_id = c.id; d.cliente_nombre = c.razon_social; d.empresa_nombre = '';
      if(!d.facturar_a) d.facturar_a = c.razon_social || '';
      if(!d.facturar_cuit) d.facturar_cuit = c.cuit || '';
      if(!d.facturar_domicilio) d.facturar_domicilio = c.direccion || '';
      if(!d.facturar_tel) d.facturar_tel = c.telefono || '';
      if(!d.mail_factura_electronica) d.mail_factura_electronica = c.mail_envio_factura || '';
      E.dirty = true; cerrarOverlay(); return render();
    }
    case 'sucursal': E.data.sucursal_id = el.dataset.v; E.errSuc = false; E.dirty = true; return render();
    case 'solo-stock': { V.soloStock = el.dataset.v === '1'; const sh = $('.sheet'); if(sh){ sh.querySelectorAll('.mod-filter .seg button').forEach(b => b.classList.toggle('on', (b.dataset.v === '1') === V.soloStock)); const r = $('#mod-res', sh); if(r) r.innerHTML = window._listaModelos(($('#mod-q', sh) || {}).value || ''); } return; }
    case 'ver-pdf': return generarPdf('ver');
    case 'cerrar-pdf': return cerrarVisorPdf();
    case 'pdf-zoom': return zoomVisorPdf(Number(el.dataset.v));
    case 'pdf-compartir': return compartirDesdeVisor();
    case 'moneda': E.data.moneda = el.dataset.v; E.dirty = true; return render();
    case 'add-item': return abrirModelos(m => {
      const f = buscarFichaTecnica(m);
      E.items.push({ modelo: m, categoria: f ? f.categoria || '' : '', descripcion: m, cantidad: 1, periodo: 'Mes', precio_txt: '' });
      E.dirty = true; render();
    });
    case 'cambiar-modelo': return abrirModelos(m => {
      const f = buscarFichaTecnica(m);
      Object.assign(E.items[i], { modelo: m, categoria: f ? f.categoria || '' : '', descripcion: m });
      E.dirty = true; render();
    });
    case 'sel-modelo': case 'sel-modelo-libre': {
      const cb = window._alElegirModelo; window._alElegirModelo = null;
      cerrarOverlay();
      if(cb) cb(el.dataset.m);
      return;
    }
    case 'quitar-item': E.items.splice(i, 1); E.dirty = true; return render();
    case 'qty-': case 'qty+': {
      const it = E.items[i];
      it.cantidad = Math.max(1, (Number(it.cantidad) || 1) + (act === 'qty+' ? 1 : -1));
      const inp = document.querySelector(`input[data-k="cantidad"][data-i="${i}"]`); if(inp) inp.value = it.cantidad;
      E.dirty = true; refrescarStockItem(i); return actualizarTotales();
    }
    case 'periodo': {
      E.items[i].periodo = el.dataset.v; E.dirty = true;
      document.querySelectorAll(`[data-seg="${i}"] button`).forEach(b => b.classList.toggle('on', b.dataset.v === el.dataset.v));
      return;
    }
    case 'dup-item': {
      // Igual que en APEX web: sugiere el período que falta cotizar de ese mismo modelo (Mes → Semana → Día)
      const o = E.items[i];
      const usados = E.items.filter(x => (x.modelo || '').trim().toLowerCase() === (o.modelo || '').trim().toLowerCase()).map(x => x.periodo);
      const sug = ['Mes', 'Semana', 'Día'].find(p => !usados.includes(p)) || 'Mes';
      E.items.splice(i + 1, 0, { modelo: o.modelo, categoria: o.categoria, descripcion: o.descripcion, cantidad: 1, periodo: sug, precio_txt: '' });
      E.dirty = true; render();
      setTimeout(() => { const n = document.querySelector(`input[data-k="precio"][data-i="${i + 1}"]`); if(n){ n.scrollIntoView({ block: 'center', behavior: 'smooth' }); n.focus(); } }, 60);
      return;
    }
  }
}

// ---------- Eventos globales ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if(el) accion(el.dataset.act, el).catch(err => { console.error(err); toast('Ocurrió un error: ' + (err.message || err), 'err'); });
});
document.addEventListener('input', e => {
  const t = e.target;
  if(t.id === 'q'){ V.q = t.value; const c = $('#cards'); if(c) c.innerHTML = cardsHtml(); return; }
  if(!E) return;
  if(t.dataset.mask === 'date') maskDate(t);
  if(t.dataset.f){ E.data[t.dataset.f] = t.type === 'checkbox' ? t.checked : t.value; E.dirty = true; if(t.dataset.f === 'flete_txt') actualizarTotales(); return; }
  if(t.dataset.k){
    const it = E.items[Number(t.dataset.i)]; if(!it) return;
    if(t.dataset.k === 'cantidad'){ it.cantidad = Math.max(0, parseInt(String(t.value).replace(/\D/g, ''), 10) || 0); refrescarStockItem(Number(t.dataset.i)); }
    if(t.dataset.k === 'precio') it.precio_txt = t.value;
    E.dirty = true; actualizarTotales();
  }
});
document.addEventListener('change', e => {
  const t = e.target;
  if(!E || !t.dataset.f) return;
  if(t.type === 'checkbox'){
    E.data[t.dataset.f] = t.checked; E.dirty = true;
    if(t.dataset.f === 'flete_incluir') render(); else actualizarTotales();
  } else { E.data[t.dataset.f] = t.value; E.dirty = true; }
});
document.addEventListener('focusout', e => {
  const t = e.target;
  if(!E) return;
  const dar = v => { const n = parseNum(v); return n ? fmtNumInput(n) : ''; };
  if(t.dataset.k === 'precio'){ const it = E.items[Number(t.dataset.i)]; if(it){ it.precio_txt = dar(t.value); t.value = it.precio_txt; actualizarTotales(); } }
  if(t.dataset.f === 'flete_txt'){ E.data.flete_txt = dar(t.value); t.value = E.data.flete_txt; actualizarTotales(); }
});
document.addEventListener('keydown', e => {
  if(e.key === 'Enter' && (e.target.id === 'lg-pass' || e.target.id === 'lg-email')) hacerLogin();
});
window.addEventListener('online', () => { S.online = true; refrescarCromo(); sincronizar({ silent: true }); });
window.addEventListener('offline', () => { S.online = false; refrescarCromo(); });
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'visible' && S.perfil && navigator.onLine && (!S.lastSync || Date.now() - S.lastSync > 120000)) sincronizar({ silent: true });
});

// ---------- Conexión con la sincronización ----------
S.onChange = what => { if(what === 'estado') refrescarCromo(); if(what === 'fotos') cargarThumbs(); };
S.onNeedLogin = () => { E = null; cerrarOverlay(); V.view = 'login'; V.loginMsg = S.perfil ? 'Tu sesión venció. Ingresá de nuevo: lo que guardaste en el teléfono se conserva.' : ''; render(); };
S.onSynced = (res, opts) => {
  if(!res) return;
  const creados = res.ok.filter(r => r.numero);
  if(creados.length === 1) toast(`${numeroTexto(creados[0])} sincronizado`, 'ok');
  else if(creados.length > 1) toast(`${creados.length} presupuestos sincronizados`, 'ok');
  if(res.fallidos.length) toast(`${res.fallidos.length} presupuesto(s) no se pudieron subir. Revisalos para ver el motivo.`, 'err');
  if(!opts.silent && !creados.length && !res.fallidos.length && !S.lastError) toast('Todo al día', 'ok');
  if(V.view === 'list') refrescarCromo();
};

// ---------- Arranque ----------
(async function boot(){
  aplicarTema();
  try{
    await cargarLocal();
    cargarThumbs();
    let sesion = null;
    try{ const r = await sb.auth.getSession(); sesion = r && r.data && r.data.session; } catch(e){ console.warn('getSession', e); }
    if(sesion && S.perfil && S.perfil.id === sesion.user.id){
      irLista();
      sincronizar({ silent: true });
    } else if(!navigator.onLine && S.perfil){
      // Sin señal al abrir: se entra con los datos guardados en el teléfono
      irLista();
    } else if(sesion && !S.perfil){
      const { data } = await sb.from('perfiles').select('*').eq('id', sesion.user.id).single();
      if(data && data.activo){ S.perfil = data; await DB.put('kv', data, 'perfil'); irLista(); sincronizar({}); }
      else { await sb.auth.signOut(); V.view = 'login'; render(); }
    } else {
      V.view = 'login'; render();
    }
  } catch(e){
    console.error('boot', e);
    V.view = 'login'; render();
  }
  if('serviceWorker' in navigator && location.protocol === 'https:' && !window.ApexAndroid && location.hostname !== 'appassets.androidplatform.net'){
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
