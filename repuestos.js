// =====================================================================
// Repuestos Haulotte — cotizador 100% ONLINE (sin base local de artículos ni de presupuestos).
// - Los artículos se buscan en el servidor (RPC buscar_repuestos_gp, 25 por vez).
// - La lista trae solo las últimas 60 cotizaciones, con columnas livianas; el detalle se baja al abrirlo.
// - Sin conexión no se puede guardar: se avisa y no queda nada pendiente.
// Requiere (antes): repuestos-core.js, config.js, db.js, sync.js, venta.js. Se carga antes que app.js.
// =====================================================================
const puedeRepuestos = () => puede('haulotte_presupuestos', 'ver');
const R = { list: [], q: '', filtro: 'todos', cargando: false, cargadoEn: 0, rec: null, ed: null, err: null };
const RLISTA_COLS = 'id,numero,cliente_id,empresa_nombre,contacto_nombre,fecha_emision,validez_dias,estado,total_usd,items_count,clientes(razon_social)';

function rNombre(p){ return (p.clientes && p.clientes.razon_social) || p.empresa_nombre || 'Sin cliente'; }
function rErrTxt(e){ return (e && e.message) || String(e); }
function rNum2(n){ return fmtMoney(n, 'USD'); }

// ---------- Datos ----------
async function cargarRLista(forzar){
  if(R.cargando) return;
  if(!forzar && R.list.length && Date.now() - R.cargadoEn < 180000) return;
  if(!navigator.onLine){ R.err = 'Sin conexión: conectate para ver los presupuestos de repuestos.'; if(V.view === 'rlist') render(); return; }
  R.cargando = true; R.err = null; if(V.view === 'rlist') refrescarRLista();
  try{
    const { data, error } = await sb.from('haulotte_presupuestos').select(RLISTA_COLS).order('numero', { ascending: false }).limit(60);
    if(error) throw error;
    R.list = data || []; R.cargadoEn = Date.now();
  } catch(e){ R.err = rErrTxt(e); }
  R.cargando = false;
  if(V.view === 'rlist') render();
}
async function traerRCompleto(id){
  const { data, error } = await sb.from('haulotte_presupuestos').select('*, clientes(razon_social), haulotte_presupuesto_items(*)').eq('id', id).single();
  if(error) throw error;
  data.haulotte_presupuesto_items = (data.haulotte_presupuesto_items || []).slice().sort((a, b) => (a.orden || 0) - (b.orden || 0));
  return data;
}
function rFiltrada(){
  const q = R.q.trim().toLowerCase();
  return R.list.filter(p => {
    const st = estadoVista(p);
    if(R.filtro !== 'todos' && st !== R.filtro) return false;
    if(!q) return true;
    return `${numeroTexto(p)} ${p.numero || ''} ${rNombre(p)} ${p.contacto_nombre || ''}`.toLowerCase().includes(q);
  });
}

// ---------- Navegación ----------
function irRLista(){ V.view = 'rlist'; E = null; VE = null; R.ed = null; R.rec = null; cerrarOverlay(); render(); window.scrollTo(0, 0); cargarRLista(false); }
async function irRDetalle(id){
  if(!navigator.onLine) return toast('Sin conexión.', 'err');
  const cerrar = busy('Abriendo presupuesto…');
  try{ R.rec = await traerRCompleto(id); V.view = 'rdetail'; R.ed = null; cerrarOverlay(); render(); window.scrollTo(0, 0); }
  catch(e){ toast('No se pudo abrir: ' + rErrTxt(e), 'err'); }
  cerrar();
}
async function salirREditor(){
  if(R.ed && R.ed.dirty){
    const ok = await confirmar({ titulo: '¿Salir sin guardar?', texto: 'Se pierden los cambios de este presupuesto.', ok: 'Salir', cancelar: 'Seguir editando', peligro: true });
    if(!ok) return;
  }
  const rec = R.ed && R.ed.rec; R.ed = null;
  if(rec){ R.rec = rec; V.view = 'rdetail'; render(); } else irRLista();
}
function atrasRepuestos(){
  if(V.view === 'reditor'){ salirREditor(); return true; }
  if(V.view === 'rdetail'){ irRLista(); return true; }
  if(V.view === 'rlist'){ if(tieneHome()){ irHome(); return true; } return false; }
  return false;
}

// ---------- Vistas ----------
function renderRepuestos(){
  if(V.view === 'rlist') return rVList();
  if(V.view === 'rdetail' && R.rec) return rVDetail();
  if(V.view === 'reditor' && R.ed) return rVEditor();
  return null;
}
function rChips(){
  const cuenta = f => R.list.filter(p => f === 'todos' ? true : estadoVista(p) === f).length;
  const chips = [['todos', 'Todos'], ['vigente', 'Vigentes'], ['confirmado', 'Confirmados'], ['facturado', 'Facturados'], ['vencido', 'Vencidos'], ['anulado', 'Anulados']];
  return `<div class="chips" id="rchips">${chips.map(([k, l]) => `<button class="chip ${R.filtro === k ? 'on' : ''}" data-act="rfiltro" data-v="${k}">${l}<span class="n">${cuenta(k)}</span></button>`).join('')}</div>`;
}
function rCards(){
  if(R.cargando && !R.list.length) return `<div class="empty"><b>Cargando…</b></div>`;
  const lista = rFiltrada();
  if(!lista.length) return `<div class="empty">${ic('file')}<b>${R.list.length ? 'Sin resultados' : 'Todavía no hay presupuestos de repuestos'}</b>${R.list.length ? 'Probá con otro filtro o búsqueda.' : (puede('haulotte_presupuestos', 'crear') ? 'Tocá “Nuevo presupuesto” para armar el primero.' : '')}</div>`;
  return lista.map((p, i) => {
    const st = estadoVista(p), n = Number(p.items_count) || 0;
    return `<button class="card st-${st}" data-act="rabrir" data-id="${p.id}" style="animation-delay:${Math.min(i, 8) * 30}ms">
      <div class="row"><span class="num">${esc(numeroTexto(p))}</span><span class="badge st-${st}">${ESTADO_LABEL[st] || st}</span></div>
      <div class="who">${esc(rNombre(p))}</div>
      <div class="row"><span class="meta">${fmtDate(p.fecha_emision)} · ${n} ítem${n === 1 ? '' : 's'}</span><span class="total">${esc(rNum2(p.total_usd))}</span></div>
    </button>`;
  }).join('');
}
function refrescarRLista(){
  const c = $('#rcards'); if(c) c.innerHTML = rCards();
  const b = $('#rchips'); if(b) b.outerHTML = rChips();
}
function rVList(){
  return `<div class="screen">
    <header class="appbar">${tieneHome() ? `<button class="icon-btn" data-act="volver" aria-label="Menú principal">${ic('back')}</button>` : ''}<div class="bar-title">Repuestos Haulotte<span class="bar-sub">Presupuestos de repuestos</span></div>
      <button class="icon-btn" data-act="rrefrescar" aria-label="Actualizar">${ic('refresh')}</button>${barraAcciones()}</header>
    <main class="body">
      <section class="hello"><h1>Repuestos</h1><p>Últimos 60 presupuestos · se consultan en línea</p></section>
      ${navigator.onLine ? '' : `<div class="banner">${ic('warn')}<div><b>Sin conexión</b>Este cotizador funciona solo con internet.</div></div>`}
      ${R.err ? `<div class="banner danger">${ic('warn')}<div><b>No se pudo cargar</b>${esc(R.err)}</div></div>` : ''}
      <div class="search">${ic('search')}<input id="rq" type="search" placeholder="Buscar por N°, cliente o contacto" value="${esc(R.q)}" autocomplete="off"></div>
      ${rChips()}
      <div class="cards" id="rcards">${rCards()}</div>
    </main>
    ${puede('haulotte_presupuestos', 'crear') ? `<button class="fab" data-act="rnuevo">${ic('plus')}Nuevo presupuesto</button>` : ''}
  </div>`;
}
function rCalcDe(p){
  const c = calcularRepuestosGuardado(p, p.haulotte_presupuesto_items);
  return c;
}
function rResumenHtml(c){
  const l = (a, b, strong) => `<div class="linea"><span>${a}</span><b${strong ? ' style="font-size:15px"' : ''}>${b}</b></div>`;
  return `<div class="grupo" style="margin-top:0">
    ${l('Subtotal (precio final)', rNum2(c.subtotal))}
    ${c.descPct > 0 ? l(`Descuento ${String(c.descPct).replace('.', ',')}% (ya aplicado, el cliente no lo ve)`, rNum2(c.descuento)) : ''}
    ${c.envio > 0 ? l('Envío', rNum2(c.envio)) : ''}
    ${l('Total (sin impuestos)', rNum2(c.total), true)}
    ${c.tc > 0 ? l('Total en pesos', '$ ' + rpN0(c.totalArs)) : ''}
  </div>`;
}
function rVDetail(){
  const p = R.rec, st = estadoVista(p), c = rCalcDe(p);
  const editable = puede('haulotte_presupuestos', 'crear') && p.estado === 'vigente';
  const confirmable = puede('haulotte_presupuestos', 'crear') && p.estado === 'vigente';
  const facturable = puede('haulotte_presupuestos', 'crear') && p.estado === 'confirmado';
  const anulable = puede('haulotte_presupuestos', 'anular') && st !== 'anulado' && p.estado !== 'facturado';
  const venc = (() => { const d = new Date(String(p.fecha_emision).slice(0, 10) + 'T12:00:00'); d.setDate(d.getDate() + (Number(p.validez_dias) || 0)); return fmtDate(d.toLocaleDateString('en-CA')); })();
  const items = p.haulotte_presupuesto_items.map(i => `<div class="grupo"><div class="gh"><b>${esc(i.codigo)}</b></div>
      <div class="dim" style="font-size:13px;margin:-2px 0 6px">${esc(i.descripcion)}</div>
      <div class="linea"><span>${esc(i.cantidad)} × ${esc(rNum2(rpR2(Number(i.precio_unitario) * (1 - c.descPct / 100))))}</span><b>${esc(rNum2(rpR2(Number(i.cantidad) * rpR2(Number(i.precio_unitario) * (1 - c.descPct / 100)))))}</b></div>
      <div class="dim" style="font-size:12.5px">Disponibilidad: ${esc(textoDisponibilidad(i.disponibilidad))}</div></div>`).join('');
  return `<div class="screen">
    <header class="appbar"><button class="icon-btn" data-act="volver" aria-label="Volver">${ic('back')}</button>
      <div class="bar-title">${esc(numeroTexto(p))}<span class="bar-sub">${esc(rNombre(p))}</span></div><span id="chip-slot">${chipEstado()}</span></header>
    <main class="body">
      <section class="hero st-${st}" style="--stripe:#e22329">
        <div class="top"><span class="num">${esc(numeroTexto(p))}</span><span class="badge st-${st}">${ESTADO_LABEL[st] || st}</span></div>
        <h2>${esc(rNombre(p))}</h2>
        ${p.contacto_nombre ? `<div class="dim">${esc(p.contacto_nombre)}${p.contacto_telefono ? ' · ' + esc(p.contacto_telefono) : ''}</div>` : ''}
        <div class="big"><span class="dim">Total</span><b>${esc(rNum2(c.total))}</b></div>
        ${c.tc > 0 ? `<div class="dim" style="text-align:right;font-size:13px;margin-top:2px">$ ${rpN0(c.totalArs)} al TC $ ${rpN2(c.tc)}</div>` : ''}
        <div class="kv"><div><small>Emisión</small><b>${fmtDate(p.fecha_emision)}</b></div><div><small>Válido hasta</small><b>${venc}</b></div>${p.confirmado_el ? `<div><small>Confirmado</small><b>${fmtDate(String(p.confirmado_el).slice(0, 10))}</b></div>` : ''}${p.factura_nro ? `<div><small>Factura</small><b>${esc(p.factura_nro)}</b></div>` : ''}</div>
      </section>
      ${st === 'anulado' && p.motivo_anulacion ? `<div class="banner danger" style="margin-top:12px">${ic('ban')}<div><b>Motivo de anulación</b>${esc(p.motivo_anulacion)}</div></div>` : ''}
      <div class="sec-title">Repuestos</div>${items || '<div class="dim">Sin ítems.</div>'}
      <div class="sec-title">Resumen</div>${rResumenHtml(c)}
      ${p.notas ? `<div class="sec-title">Notas</div><div class="dim" style="white-space:pre-wrap">${esc(p.notas)}</div>` : ''}
      <div class="actions">
        <div class="actions two" style="margin:0"><button class="btn primary" data-act="rver-pdf">${ic('eye')}Ver PDF</button><button class="btn" data-act="rpdf">${ic('share')}Compartir</button></div>
        ${confirmable ? `<button class="btn" style="border-color:var(--ok);color:var(--ok)" data-act="rconfirmar">${ic('check')}Confirmar presupuesto</button>` : ''}
        ${facturable ? `<button class="btn" data-act="rfacturado">${ic('check')}Marcar como facturado</button>` : ''}
        <div class="actions two" style="margin:0">${editable ? `<button class="btn" data-act="reditar">${ic('edit')}Editar</button>` : ''}${anulable ? `<button class="btn danger" data-act="ranular">${ic('ban')}Anular</button>` : ''}</div>
      </div>
    </main></div>`;
}

// ---------- Editor ----------
const rTxt = n => (n === null || n === undefined || n === '') ? '' : fmtNumInput(n);
function nuevoRE(){
  return { rec: null, dirty: false, descManual: false, items: [],
    d: { cliente_id: null, cliente_nombre: '', empresa_nombre: '', contacto_nombre: '', contacto_email: '', contacto_telefono: '',
      fecha_emision: isoADmy(hoyIso()), validez_dias: '7', margen_txt: String(MARGEN_REPUESTOS_DEFECTO), desc_txt: '', envio_txt: '',
      tc_txt: '', tc_fuente: null, tc_fecha: null, condicion_pago: '', notas: '' } };
}
function reDesde(p){
  return { rec: p, dirty: false, descManual: true,
    items: p.haulotte_presupuesto_items.map(i => ({ codigo: i.codigo, descripcion: i.descripcion, cantidad: Number(i.cantidad) || 1, costo: Number(i.costo_unitario) || 0, disponibilidad: i.disponibilidad || null, costoEditado: true })),
    d: { cliente_id: p.cliente_id || null, cliente_nombre: (p.clientes && p.clientes.razon_social) || '', empresa_nombre: p.empresa_nombre || '',
      contacto_nombre: p.contacto_nombre || '', contacto_email: p.contacto_email || '', contacto_telefono: p.contacto_telefono || '',
      fecha_emision: isoADmy(p.fecha_emision), validez_dias: String(p.validez_dias || 7),
      margen_txt: rTxt(p.margen_pct), desc_txt: Number(p.descuento_pct) > 0 ? rTxt(p.descuento_pct) : '', envio_txt: Number(p.envio_usd) > 0 ? rTxt(p.envio_usd) : '',
      tc_txt: rTxt(p.tipo_cambio), tc_fuente: p.tipo_cambio_fuente || null, tc_fecha: p.tipo_cambio_fecha || null,
      condicion_pago: p.condicion_pago || '', notas: p.notas || '' } };
}
function reCalc(){
  const d = R.ed.d;
  return calcularRepuestos({ items: R.ed.items, margen_pct: d.margen_txt === '' ? '' : parseNum(d.margen_txt), descuento_pct: parseNum(d.desc_txt),
    envio_usd: parseNum(d.envio_txt), tc: parseNum(d.tc_txt) });
}
function rfld(label, key, o){
  o = o || {};
  const v = R.ed.d[key] == null ? '' : R.ed.d[key];
  return `<div class="field"><label>${esc(label)}</label><input class="in" type="text" data-rf="${key}" value="${esc(v)}"${o.mask ? ' data-mask="date"' : ''}${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}${o.im ? ` inputmode="${o.im}"` : ''} autocomplete="off"></div>`;
}
function rOpcionesDisp(it){
  return '<option value="">— elegir —</option>' + opcionesDisponibilidad(it.cantidad).map(o => `<option value="${o.v}"${it.disponibilidad === o.v ? ' selected' : ''}>${esc(o.t)}</option>`).join('');
}
const rEsNacional = it => /^a-/i.test(String(it.codigo || '').trim());      // "A-": costo de lista no real, se carga a mano
const rPuedeMargen = () => puede('haulotte_presupuestos', 'margen');
function rItemHtml(it, i, calc){
  const ci = calc.items.find(x => x.codigo === it.codigo);
  const unit = ci ? ci.unit : rpR2(rpR2(rpNum(it.costo) * (1 + calc.margen / 100)) * (1 - calc.descPct / 100));
  return `<div class="item" data-i="${i}">
    <div class="item-head"><div class="nm" style="flex:1"><b>${esc(it.codigo)}</b><small>${esc(it.descripcion)}</small></div>
      <button class="icon-btn" data-act="rquitar-item" data-i="${i}" aria-label="Quitar">${ic('x')}</button></div>
    <div class="item-foot">
      <div class="qty"><button type="button" data-act="rqty-" data-i="${i}" aria-label="Menos">−</button>
        <input data-i="${i}" data-rk="cantidad" inputmode="numeric" value="${esc(it.cantidad)}" aria-label="Cantidad">
        <button type="button" data-act="rqty+" data-i="${i}" aria-label="Más">+</button></div>
      <div class="dim" style="font-size:12.5px;align-self:center;flex:1;text-align:right">${esc(rNum2(unit))} c/u</div>
      <div class="sub" data-rsub="${i}">${esc(rNum2(rpR2(unit * rpNum(it.cantidad))))}</div>
    </div>
    ${rEsNacional(it) ? `<div class="field" style="margin:10px 0 0"><label>Costo ARG (artículo nacional: cargá el costo real)</label><div class="price"><span>U$D</span><input class="in" data-rk="costo" data-i="${i}" inputmode="decimal" value="${esc(rTxt(it.costo))}" style="${it.costoEditado ? '' : 'border-color:#f59e0b'}"></div></div>` : ''}
    <div class="field" style="margin:10px 0 0"><label>Disponibilidad</label><select class="in" data-rk="disp" data-i="${i}">${rOpcionesDisp(it)}</select></div></div>`;
}
function rVEditor(){
  const d = R.ed.d, c = reCalc();
  return `<div class="screen">
    <header class="appbar"><button class="icon-btn" data-act="volver" aria-label="Volver">${ic('back')}</button>
      <div class="bar-title">${R.ed.rec ? 'Editar ' + esc(numeroTexto(R.ed.rec)) : 'Nuevo presupuesto'}<span class="bar-sub">Repuestos Haulotte</span></div>
      <button class="btn sm primary" data-act="rguardar">${ic('check')}Guardar</button></header>
    <main class="ed-body">
      <div class="sec-title" style="margin-top:4px">Cliente</div>
      <div class="field"><label>Buscar en la base</label>
        <button class="picker" data-act="rpick-cliente">${d.cliente_id ? `<span><b>${esc(d.cliente_nombre)}</b><small>Tocá para cambiar</small></span>` : `<span class="ph">Buscar cliente…</span>`}${ic('chevron')}</button>
        ${d.cliente_id ? `<button class="btn sm ghost" style="margin-top:8px" data-act="rclear-cliente">Quitar cliente (es un prospecto)</button>` : ''}</div>
      ${!d.cliente_id ? rfld('Empresa (si es prospecto nuevo)', 'empresa_nombre') : ''}
      ${rfld('Nombre del contacto', 'contacto_nombre')}
      <div class="grid2">${rfld('Email', 'contacto_email', { im: 'email' })}${rfld('Teléfono', 'contacto_telefono', { im: 'tel' })}</div>

      <div class="sec-title">Repuestos</div>
      <div id="r-items">${R.ed.items.map((it, i) => rItemHtml(it, i, c)).join('')}</div>
      <button class="btn block" data-act="radd-item">${ic('plus')}Agregar repuesto</button>

      <div class="sec-title">Condiciones</div>
      <div class="grid2">${rfld('Fecha de emisión', 'fecha_emision', { mask: 1, ph: 'DD/MM/AAAA', im: 'numeric' })}${rfld('Validez (días)', 'validez_dias', { im: 'numeric' })}</div>
      <div class="grid2">
        <div class="field"><label>Margen sobre costo</label><div class="price"><span>%</span><input class="in" data-rf="margen_txt" inputmode="decimal" value="${esc(d.margen_txt)}"${rPuedeMargen() ? '' : ' disabled'}></div>${rPuedeMargen() ? '' : '<div class="hint">Bloqueado: requiere permiso</div>'}</div>
        <div class="field"><label>Descuento cliente</label><div class="price"><span>%</span><input class="in" data-rf="desc_txt" inputmode="decimal" placeholder="Sin descuento" value="${esc(d.desc_txt)}"></div></div>
      </div>
      <div class="field"><label>Costo de envío (U$D, sin impuestos)</label><div class="price"><span>U$D</span><input class="in" data-rf="envio_txt" inputmode="decimal" placeholder="0,00" value="${esc(d.envio_txt)}"></div></div>
      <div class="field"><label>Tipo de cambio</label>
        <div class="tc-row"><div class="price" style="flex:1"><span>$</span><input class="in" data-rf="tc_txt" inputmode="decimal" placeholder="0,00" value="${esc(d.tc_txt)}"></div>
          <button class="btn sm" data-act="rtc-bna">${ic('refresh')}BNA</button></div>
        <div class="hint" id="rtc-hint">${esc(rTcHint())}</div></div>
      ${rfld('Condición de pago', 'condicion_pago')}
      <div class="field"><label>Notas (salen en el PDF)</label><textarea class="in" data-rf="notas" rows="3">${esc(d.notas)}</textarea></div>

      <div class="sec-title">Resumen</div><div id="rr-res">${rResumenHtml(c)}</div>
    </main>
    <footer class="ed-foot"><div class="tot"><small>Total</small><b id="red-total">${esc(rNum2(c.total))}</b></div>
      <button class="btn primary" data-act="rguardar">${ic('check')}Guardar</button></footer></div>`;
}
function rTcHint(){
  const d = R.ed.d;
  if(d.tc_fuente === 'BNA venta' && d.tc_fecha) return `TC BNA venta del ${fmtDate(d.tc_fecha)} · podés cambiarlo`;
  return d.tc_txt ? 'Valor cargado a mano' : 'Tocá “BNA” para traer el dólar venta del día anterior';
}
function rRecalc(){
  if(!R.ed) return;
  const c = reCalc();
  const r = $('#rr-res'); if(r) r.innerHTML = rResumenHtml(c);
  const t = $('#red-total'); if(t) t.textContent = rNum2(c.total);
  R.ed.items.forEach((it, i) => {
    const unit = rpR2(rpR2(rpNum(it.costo) * (1 + c.margen / 100)) * (1 - c.descPct / 100));
    const s = document.querySelector(`[data-rsub="${i}"]`); if(s) s.textContent = rNum2(rpR2(unit * rpNum(it.cantidad)));
    const row = document.querySelector(`.item[data-i="${i}"] .dim`); if(row) row.textContent = `${rNum2(unit)} c/u`;
  });
}
async function rBuscarTc(silencioso){
  if(!navigator.onLine){ if(!silencioso) toast('Sin conexión.', 'err'); return; }
  try{
    const { data, error } = await sb.rpc('tc_bna_anterior', { p_fecha: hoyIso() });
    if(error) throw error;
    const fila = Array.isArray(data) ? data[0] : data;
    const venta = fila ? Number(fila.venta) : NaN;
    if(!venta || !isFinite(venta)) throw new Error('sin valor');
    if(!R.ed) return;
    R.ed.d.tc_txt = fmtNumInput(venta); R.ed.d.tc_fuente = 'BNA venta'; R.ed.d.tc_fecha = fila.fecha;
    const inp = document.querySelector('[data-rf="tc_txt"]'); if(inp) inp.value = R.ed.d.tc_txt;
    const h = $('#rtc-hint'); if(h) h.textContent = rTcHint();
    rRecalc();
  } catch(e){ if(!silencioso) toast('No se pudo traer el TC: ' + rErrTxt(e), 'err'); }
}

// ---------- Selectores en línea ----------
function abrirBuscadorClientes(act){
  const filas = lista => lista.length
    ? lista.map(c => `<button class="opt" data-act="${act}" data-id="${c.id}"><div class="tx"><b>${esc(c.razon_social)}</b><small>${esc([c.cuit, c.numero_cliente ? 'N° ' + c.numero_cliente : ''].filter(Boolean).join(' · '))}</small></div></button>`).join('')
    : `<div class="empty" style="padding:24px"><b>Sin resultados</b>Si es un prospecto nuevo, cerrá esto y escribí la empresa.</div>`;
  abrirHoja('Elegir cliente', `<div class="search">${ic('search')}<input id="cli-q" type="search" placeholder="Razón social, CUIT o N° de cliente (mín. 2 letras)" autocomplete="off"></div><div id="cli-res"><div class="dim" style="text-align:center;padding:18px;font-size:13px">Escribí para buscar</div></div>`, sh => {
    const inp = $('#cli-q', sh); let t, seq = 0;
    inp.addEventListener('input', () => {
      clearTimeout(t);
      const q = inp.value.trim();
      if(q.length < 2){ $('#cli-res', sh).innerHTML = '<div class="dim" style="text-align:center;padding:18px;font-size:13px">Escribí para buscar</div>'; return; }
      t = setTimeout(async () => {
        const mi = ++seq;
        $('#cli-res', sh).innerHTML = '<div class="dim" style="text-align:center;padding:18px">Buscando…</div>';
        try{ const r = await buscarClientesSrv(q); if(mi === seq) $('#cli-res', sh).innerHTML = filas(r); }
        catch(e){ if(mi === seq) $('#cli-res', sh).innerHTML = `<div class="empty" style="padding:24px"><b>No se pudo buscar</b>${esc(navigator.onLine ? rErrTxt(e) : 'Sin conexión')}</div>`; }
      }, 350);
    });
    setTimeout(() => inp.focus(), 250);
  });
}
function abrirBuscadorRepuestos(){
  let res = [];
  abrirHoja('Agregar repuesto', `<div class="search">${ic('search')}<input id="rep-q" type="search" placeholder="Código o descripción (mín. 2 letras)" autocomplete="off"></div><button class="btn block" style="margin:8px 0 4px" data-act="rpor-modelo">🚜 No sé el código: buscar por modelo de máquina</button><div id="rep-res"><div class="dim" style="text-align:center;padding:18px;font-size:13px">Escribí para buscar</div></div>`, sh => {
    const inp = $('#rep-q', sh); let t, seq = 0;
    window.__repRes = () => res;
    inp.addEventListener('input', () => {
      clearTimeout(t);
      const q = inp.value.trim();
      if(q.length < 2){ $('#rep-res', sh).innerHTML = '<div class="dim" style="text-align:center;padding:18px;font-size:13px">Escribí para buscar</div>'; return; }
      t = setTimeout(async () => {
        const mi = ++seq;
        $('#rep-res', sh).innerHTML = '<div class="dim" style="text-align:center;padding:18px">Buscando…</div>';
        const { data, error } = await sb.rpc('buscar_repuestos_gp', { p_q: q, p_limit: 25 });
        if(mi !== seq) return;
        if(error){ $('#rep-res', sh).innerHTML = `<div class="empty" style="padding:24px"><b>No se pudo buscar</b>${esc(navigator.onLine ? rErrTxt(error) : 'Sin conexión')}</div>`; return; }
        res = data || [];
        $('#rep-res', sh).innerHTML = res.length
          ? res.map((r, i) => `<button class="opt" data-act="rsel-art" data-i="${i}"><div class="tx"><b>${esc(r.codigo)}</b><small>${esc(r.descripcion)}</small></div></button>`).join('')
          : `<div class="empty" style="padding:24px"><b>Sin resultados</b>Solo se cotizan artículos con costo cargado.</div>`;
      }, 350);
    });
    setTimeout(() => inp.focus(), 250);
  });
}

// ---------- Buscar repuestos por modelo de máquina ----------
const RPM_PAGE = 60;
let rpmModelos = null, rpmRes = [], rpmTotal = 0, rpmSeq = 0;
function rpmFilasHtml(){
  if(!rpmRes.length) return '<div class="empty" style="padding:24px"><b>Sin resultados</b>Probá con otro filtro.</div>';
  return rpmRes.map((r, i) => {
    const ya = R.ed && R.ed.items.find(x => x.codigo === r.codigo);
    return `<button class="opt" data-act="rsel-pm" data-i="${i}"><div class="tx"><b>${esc(r.codigo)}</b><small>${esc(r.descripcion)}</small></div>${ya ? `<span class="dim" style="font-size:12px;color:var(--ok)">✓ ×${esc(ya.cantidad)}</span>` : `<span class="dim" style="font-size:20px">＋</span>`}</button>`;
  }).join('');
}
async function rpmBuscar(sh, mas){
  const modelo = $('#pm-modelo', sh).value, q = $('#pm-q', sh).value.trim();
  const out = $('#pm-res', sh), info = $('#pm-info', sh), btnMas = $('#pm-mas', sh);
  if(!modelo){ rpmRes = []; rpmTotal = 0; out.innerHTML = '<div class="dim" style="text-align:center;padding:18px;font-size:13px">Elegí un modelo para ver sus repuestos</div>'; info.textContent = ''; btnMas.style.display = 'none'; return; }
  const mi = ++rpmSeq, desde = mas ? rpmRes.length : 0;
  if(!mas) out.innerHTML = '<div class="dim" style="text-align:center;padding:18px">Buscando…</div>';
  const { data, error } = await sb.rpc('repuestos_por_modelo_gp', { p_modelo: modelo, p_q: q || null, p_limit: RPM_PAGE, p_offset: desde });
  if(mi !== rpmSeq) return;
  if(error){ out.innerHTML = `<div class="empty" style="padding:24px"><b>No se pudo buscar</b>${esc(navigator.onLine ? rErrTxt(error) : 'Sin conexión')}</div>`; return; }
  rpmRes = mas ? rpmRes.concat(data || []) : (data || []);
  rpmTotal = rpmRes.length ? Number(rpmRes[0].total) : 0;
  info.textContent = rpmTotal ? `${rpmTotal} compatibles` + (rpmRes.length < rpmTotal ? ` · mostrando ${rpmRes.length}` : '') : '';
  btnMas.style.display = rpmRes.length < rpmTotal ? '' : 'none';
  out.innerHTML = rpmFilasHtml();
}
async function abrirBuscadorPorModelo(){
  abrirHoja('Repuestos por modelo', `<div class="search">${ic('search')}<input id="pm-modelo-q" type="search" placeholder="Modelo: escribí parte (HA16, HTL4017…)" autocomplete="off" disabled></div>
    <input type="hidden" id="pm-modelo">
    <div id="pm-modelo-lista" style="display:none;max-height:38vh;overflow:auto;margin:4px 0 8px"></div>
    <div class="search">${ic('search')}<input id="pm-q" type="search" placeholder="Filtrar: filtro, bomba, código…" autocomplete="off"></div>
    <div class="dim" id="pm-info" style="font-size:12px;margin:6px 2px"></div>
    <div id="pm-res"><div class="dim" style="text-align:center;padding:18px;font-size:13px">Elegí un modelo para ver sus repuestos</div></div>
    <button class="btn block" id="pm-mas" style="display:none;margin-top:8px" data-act="rpm-mas">Ver más</button>
    <button class="btn primary block" style="margin-top:10px" data-act="cerrar-ov">Listo</button>`, async sh => {
    window.__rpmSh = sh;
    let t;
    const qm = $('#pm-modelo-q', sh), lista = $('#pm-modelo-lista', sh);
    const norm = x => String(x || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const mostrar = () => {
      const toks = norm(qm.value).split(/[\s\/]+/).filter(Boolean);
      let l = (rpmModelos || []).filter(m => toks.every(k => m.clave.includes(k)));
      l = l.slice().sort((a, b) => ((toks.length && norm(a.corto).startsWith(toks[0])) ? 0 : 1) - ((toks.length && norm(b.corto).startsWith(toks[0])) ? 0 : 1) || a.corto.localeCompare(b.corto, 'es', { numeric: true }));
      lista.innerHTML = l.length ? l.slice(0, 80).map(m => `<button class="opt" data-pm-mod="${esc(m.modelo)}"><div class="tx"><b>${esc(m.corto)}</b><small>${esc(m.tipo)} · ${m.cant} repuestos</small></div></button>`).join('')
        : '<div class="dim" style="text-align:center;padding:14px;font-size:13px">Ningún modelo coincide</div>';
      lista.style.display = '';
    };
    const elegir = modelo => { $('#pm-modelo', sh).value = modelo; qm.value = modelo; lista.style.display = 'none'; qm.blur(); rpmBuscar(sh, false); };
    qm.addEventListener('focus', mostrar); qm.addEventListener('click', mostrar);
    qm.addEventListener('input', () => { $('#pm-modelo', sh).value = ''; mostrar(); rpmBuscar(sh, false); });
    lista.addEventListener('click', e => { const b = e.target.closest('[data-pm-mod]'); if(b) elegir(b.dataset.pmMod); });
    $('#pm-q', sh).addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => rpmBuscar(sh, false), 350); });
    try{
      if(!rpmModelos){
        const { data, error } = await sb.rpc('modelos_repuestos_gp');
        if(error) throw error;
        rpmModelos = (data || []).map(m => { const pt = rModeloPartes(m.modelo); return { modelo: m.modelo, cant: m.cant, corto: pt.corto, tipo: pt.tipo, clave: norm(m.modelo) }; });
      }
      qm.disabled = false; qm.placeholder = 'Modelo: escribí parte (HA16, HTL4017…)';
    } catch(e){
      qm.placeholder = 'No se pudieron cargar los modelos';
      $('#pm-info', sh).textContent = navigator.onLine ? rErrTxt(e) : 'Sin conexión';
    }
  });
}

// ---------- Guardar / anular ----------
function rValidar(){
  const d = R.ed.d;
  if(!d.cliente_id && !d.empresa_nombre.trim()){ toast('Elegí un cliente o escribí la empresa.', 'err'); return false; }
  if(!dmyAIso(d.fecha_emision)){ toast('La fecha de emisión no es válida.', 'err'); return false; }
  if(!R.ed.items.some(i => rpNum(i.cantidad) > 0)){ toast('Agregá al menos un repuesto.', 'err'); return false; }
  return true;
}
async function rGuardar(){
  if(!R.ed) return;
  if(!navigator.onLine) return toast('Sin conexión. Este cotizador necesita internet para guardar.', 'err');
  if(!rValidar()) return;
  const sinCosto = R.ed.items.filter(i => Number(i.cantidad) > 0 && !(Number(i.costo) > 0));
  if(sinCosto.length) return toast(`No se puede guardar: sin costo ARG → ${sinCosto.map(i => i.codigo).join(', ')}. En los A- se carga a mano.`, 'err');
  const d = R.ed.d, c = reCalc();
  const cab = {
    cliente_id: d.cliente_id || null, empresa_nombre: d.cliente_id ? null : (d.empresa_nombre.trim() || null),
    contacto_nombre: d.contacto_nombre.trim() || null, contacto_email: d.contacto_email.trim() || null, contacto_telefono: d.contacto_telefono.trim() || null,
    fecha_emision: dmyAIso(d.fecha_emision), validez_dias: Number(d.validez_dias) || 7, moneda: 'USD',
    margen_pct: c.margen, descuento_pct: c.descPct, envio_usd: c.envio, iva_pct: 0,
    tipo_cambio: c.tc > 0 ? c.tc : null, tipo_cambio_fuente: c.tc > 0 ? (d.tc_fuente || 'Manual') : null, tipo_cambio_fecha: c.tc > 0 ? (d.tc_fecha || null) : null,
    condicion_pago: d.condicion_pago.trim() || null, notas: d.notas.trim() || null, total_usd: c.total, items_count: c.items.length,
  };
  const items = c.items.map((it, i) => ({ codigo: it.codigo, descripcion: it.descripcion, cantidad: Number(it.cantidad), costo_unitario: it.costo, precio_unitario: it.lista, disponibilidad: it.disponibilidad || null, orden: i }));
  const cerrar = busy('Guardando…');
  try{
    let pid = R.ed.rec && R.ed.rec.id;
    if(pid){
      const { error } = await sb.from('haulotte_presupuestos').update({ ...cab, updated_at: new Date().toISOString() }).eq('id', pid);
      if(error) throw error;
      const { error: eD } = await sb.from('haulotte_presupuesto_items').delete().eq('presupuesto_id', pid);
      if(eD) throw eD;
    } else {
      const { data, error } = await sb.from('haulotte_presupuestos').insert({ ...cab, creado_por: (S.perfil && S.perfil.nombre) || null }).select('id').single();
      if(error) throw error;
      pid = data.id;
    }
    const { error: eI } = await sb.from('haulotte_presupuesto_items').insert(items.map(it => ({ ...it, presupuesto_id: pid })));
    if(eI) throw eI;
    R.rec = await traerRCompleto(pid); R.ed = null; R.cargadoEn = 0;
    V.view = 'rdetail'; render(); window.scrollTo(0, 0);
    toast('Presupuesto guardado', 'ok');
  } catch(e){ toast('No se pudo guardar: ' + rErrTxt(e), 'err'); }
  cerrar();
}
function rAbrirAnular(p){
  abrirHoja('Anular presupuesto', `<div style="padding:0 8px">
    <p class="dim" style="margin:0 0 12px;font-size:14px"><b style="color:var(--text)">${esc(numeroTexto(p))}</b> — ${esc(rNombre(p))}<br>El número no se borra: queda en el historial como anulado.</p>
    <div class="field"><label>Motivo (opcional)</label><textarea class="in" id="ranu-motivo" rows="3"></textarea></div>
    <button class="btn danger block" data-act="rconfirmar-anular">${ic('ban')}Anular presupuesto</button></div>`);
}

// ---------- PDF ----------
function rCotDesde(p){
  return { numero: p.numero, fecha_emision: p.fecha_emision, validez_dias: p.validez_dias, cliente: p.clientes, empresa_nombre: p.empresa_nombre,
    contacto_nombre: p.contacto_nombre, contacto_email: p.contacto_email, contacto_telefono: p.contacto_telefono, condicion_pago: p.condicion_pago, notas: p.notas,
    items: p.haulotte_presupuesto_items.map(i => ({ codigo: i.codigo, descripcion: i.descripcion, cantidad: i.cantidad, precio_unitario: i.precio_unitario, disponibilidad: i.disponibilidad })),
    descuento_pct: p.descuento_pct, envio_usd: p.envio_usd, tc: p.tipo_cambio, tc_fecha: p.tipo_cambio_fecha };
}
async function rGenerarPdf(modo){
  const p = R.rec; if(!p) return;
  const cerrar = busy('Generando PDF…');
  try{
    await new Promise(r => setTimeout(r, 40));
    const cot = rCotDesde(p); await rPrecargarFotos(cot.items);
    const { doc, fileName } = generarRepuestosPDF(cot);
    if(modo === 'ver'){ await abrirVisorPdf(doc, fileName, { numero: p.numero, clientes: { razon_social: rNombre(p) } }); cerrar(); }
    else { cerrar(); await compartirPdf(doc, fileName); }
  } catch(e){ cerrar(); console.error(e); toast('No se pudo generar el PDF: ' + rErrTxt(e), 'err'); }
}

// ---------- Acciones ----------
async function accionRepuestos(act, el){
  const i = el && el.dataset.i !== undefined ? Number(el.dataset.i) : null;
  switch(act){
    case 'ir-repuestos': return irRLista();
    case 'rrefrescar': return cargarRLista(true);
    case 'rfiltro': R.filtro = el.dataset.v; return refrescarRLista();
    case 'rabrir': return irRDetalle(Number(el.dataset.id));
    case 'rnuevo': R.ed = nuevoRE(); V.view = 'reditor'; render(); window.scrollTo(0, 0); rBuscarTc(true); return;
    case 'reditar': R.ed = reDesde(R.rec); V.view = 'reditor'; render(); window.scrollTo(0, 0); return;
    case 'rguardar': return rGuardar();
    case 'rver-pdf': return rGenerarPdf('ver');
    case 'rpdf': return rGenerarPdf('compartir');
    case 'ranular': return rAbrirAnular(R.rec);
    case 'rconfirmar-anular': {
      if(!navigator.onLine) return toast('Sin conexión.', 'err');
      const p = R.rec, cerrar = busy('Anulando…');
      try{
        const { error } = await sb.from('haulotte_presupuestos').update({ estado: 'anulado', motivo_anulacion: ($('#ranu-motivo') || {}).value || null, updated_at: new Date().toISOString() }).eq('id', p.id);
        if(error) throw error;
        R.rec = await traerRCompleto(p.id); R.cargadoEn = 0; cerrarOverlay(); render(); toast('Presupuesto anulado', 'ok');
      } catch(e){ toast('No se pudo anular: ' + rErrTxt(e), 'err'); }
      cerrar(); return;
    }
    case 'rpick-cliente': return abrirBuscadorClientes('rsel-cliente');
    case 'rclear-cliente': R.ed.d.cliente_id = null; R.ed.d.cliente_nombre = ''; R.ed.dirty = true; return render();
    case 'rsel-cliente': {
      const c = S.clientes.find(x => x.id === Number(el.dataset.id)); if(!c) return;
      const d = R.ed.d;
      d.cliente_id = c.id; d.cliente_nombre = c.razon_social; d.empresa_nombre = '';
      const dc = Number(c.descuento_repuestos_pct);
      if(dc > 0) d.desc_txt = fmtNumInput(dc);                      // descuento de la ficha del cliente
      else if(!R.ed.descManual) d.desc_txt = '';                    // sin descuento en la ficha: queda vacío
      R.ed.dirty = true; cerrarOverlay(); return render();
    }
    case 'radd-item': return abrirBuscadorRepuestos();
    case 'rpor-modelo': return abrirBuscadorPorModelo();
    case 'rpm-mas': return window.__rpmSh && rpmBuscar(window.__rpmSh, true);
    case 'rsel-pm': {
      const r = rpmRes[i]; if(!r || !R.ed) return;
      const ya = R.ed.items.find(x => x.codigo === r.codigo);
      if(ya) ya.cantidad = Number(ya.cantidad) + 1; else R.ed.items.push({ codigo: r.codigo, descripcion: r.descripcion, cantidad: 1, costo: rEsNacional(r) ? 0 : Number(r.costo_arg_usd) });
      R.ed.dirty = true;
      const y = window.scrollY; render(); window.scrollTo(0, y);      // el editor de atrás se actualiza; la hoja queda abierta para seguir agregando
      toast('Agregado: ' + r.codigo);
      const sh = window.__rpmSh; if(sh){ const sc = $('.sb', sh) ? $('.sb', sh).scrollTop : 0; $('#pm-res', sh).innerHTML = rpmFilasHtml(); if($('.sb', sh)) $('.sb', sh).scrollTop = sc; }
      return;
    }
    case 'rsel-art': {
      const r = (window.__repRes ? window.__repRes() : [])[i]; if(!r) return;
      const ya = R.ed.items.find(x => x.codigo === r.codigo);
      if(ya) ya.cantidad = Number(ya.cantidad) + 1; else R.ed.items.push({ codigo: r.codigo, descripcion: r.descripcion, cantidad: 1, costo: rEsNacional(r) ? 0 : Number(r.costo_arg_usd) });
      R.ed.dirty = true; cerrarOverlay(); return render();
    }
    case 'rquitar-item': R.ed.items.splice(i, 1); R.ed.dirty = true; return render();
    case 'rqty-': case 'rqty+': {
      const it = R.ed.items[i]; it.cantidad = Math.max(1, (Number(it.cantidad) || 1) + (act === 'rqty+' ? 1 : -1));
      const inp = document.querySelector(`input[data-rk="cantidad"][data-i="${i}"]`); if(inp) inp.value = it.cantidad;
      it.disponibilidad = disponibilidadValida(it.disponibilidad, it.cantidad); rRefrescarDisp(i);
      R.ed.dirty = true; return rRecalc();
    }
    case 'rtc-bna': return rBuscarTc(false);
    case 'rconfirmar': {
      const p = R.rec; if(!p) return;
      if(!navigator.onLine) return toast('Sin conexión.', 'err');
      const ok = await confirmar({ titulo: 'Confirmar presupuesto', texto: `${numeroTexto(p)} queda como pendiente de facturar y ya no se puede editar.`, ok: 'Confirmar', cancelar: 'Volver' });
      if(!ok) return;
      const cerrar = busy('Confirmando…');
      try{
        const { error } = await sb.from('haulotte_presupuestos').update({ estado: 'confirmado', confirmado_el: new Date().toISOString(), confirmado_por: (S.perfil && S.perfil.nombre) || null, updated_at: new Date().toISOString() }).eq('id', p.id).eq('estado', 'vigente');
        if(error) throw error;
        R.rec = await traerRCompleto(p.id); R.cargadoEn = 0; render(); toast('Presupuesto confirmado', 'ok');
      } catch(e){ toast('No se pudo confirmar: ' + rErrTxt(e), 'err'); }
      cerrar(); return;
    }
    case 'rfacturado': {
      const p = R.rec; if(!p) return;
      if(!navigator.onLine) return toast('Sin conexión.', 'err');
      const nro = window.prompt(`Marcar ${numeroTexto(p)} como facturado.\nN° de factura (opcional):`, '');
      if(nro === null) return;
      const cerrar = busy('Guardando…');
      try{
        const { error } = await sb.from('haulotte_presupuestos').update({ estado: 'facturado', facturado_el: new Date().toISOString(), facturado_por: (S.perfil && S.perfil.nombre) || null, factura_nro: nro.trim() || null, updated_at: new Date().toISOString() }).eq('id', p.id).eq('estado', 'confirmado');
        if(error) throw error;
        R.rec = await traerRCompleto(p.id); R.cargadoEn = 0; render(); toast('Marcado como facturado', 'ok');
      } catch(e){ toast('No se pudo guardar: ' + rErrTxt(e), 'err'); }
      cerrar(); return;
    }
  }
}
document.addEventListener('input', e => {
  const t = e.target;
  if(t.id === 'rq'){ R.q = t.value; const c = $('#rcards'); if(c) c.innerHTML = rCards(); return; }
  if(!R.ed) return;
  if(t.dataset.mask === 'date') maskDate(t);
  if(t.dataset.rf){
    R.ed.d[t.dataset.rf] = t.value; R.ed.dirty = true;
    if(t.dataset.rf === 'desc_txt') R.ed.descManual = true;
    if(t.dataset.rf === 'tc_txt'){ R.ed.d.tc_fuente = 'Manual'; R.ed.d.tc_fecha = null; const h = $('#rtc-hint'); if(h) h.textContent = rTcHint(); }
    return rRecalc();
  }
  if(t.dataset.rk === 'costo'){
    const it = R.ed.items[Number(t.dataset.i)]; if(!it) return;
    it.costo = Math.max(0, parseNum(t.value)); it.costoEditado = true; t.style.borderColor = ''; R.ed.dirty = true; rRecalc(); return;
  }
  if(t.dataset.rk === 'cantidad'){
    const it = R.ed.items[Number(t.dataset.i)]; if(!it) return;
    it.cantidad = Math.max(0, parseInt(String(t.value).replace(/\D/g, ''), 10) || 0); R.ed.dirty = true;
    it.disponibilidad = disponibilidadValida(it.disponibilidad, it.cantidad); rRefrescarDisp(Number(t.dataset.i)); rRecalc();
  }
});
function rRefrescarDisp(i){
  const sel = document.querySelector(`select[data-rk="disp"][data-i="${i}"]`); if(sel && R.ed.items[i]) sel.innerHTML = rOpcionesDisp(R.ed.items[i]);
}
document.addEventListener('change', e => {
  const t = e.target;
  if(R.ed && t.dataset && t.dataset.rk === 'disp'){ const it = R.ed.items[Number(t.dataset.i)]; if(it){ it.disponibilidad = t.value || null; R.ed.dirty = true; } }
});
document.addEventListener('focusout', e => {
  const t = e.target;
  if(!R.ed || !t.dataset.rf) return;
  if(['margen_txt', 'desc_txt', 'envio_txt', 'tc_txt'].includes(t.dataset.rf)){
    const n = parseNum(t.value); R.ed.d[t.dataset.rf] = (t.value.trim() === '' || (!n && t.dataset.rf !== 'margen_txt')) ? '' : fmtNumInput(n);
    t.value = R.ed.d[t.dataset.rf]; rRecalc();
  }
});
