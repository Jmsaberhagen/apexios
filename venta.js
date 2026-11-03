'use strict';
// =====================================================================
// APEX Cotizador — Venta de máquinas Haulotte
// Cálculo del plan de cuotas + PDF (misma lógica que APEX web) y pantallas del cotizador de venta.
// Requiere (cargados antes): jsPDF, config.js, logo-haulotte.js, pdf-presupuesto.js, db.js, sync.js. Se carga antes que app.js.
// =====================================================================
const LOGO_HAULOTTE_RATIO = 932/150;
const PLANES_VENTA = {
  3:  { cuotas: 3,  sinInteres: 3 },
  6:  { cuotas: 6,  sinInteres: 6 },
  7:  { cuotas: 7,  sinInteres: 6 },
  8:  { cuotas: 8,  sinInteres: 6 },
  12: { cuotas: 12, sinInteres: 6 },
};
const IVA_MAQUINAS = 10.5;
const TASA_ANUAL_DEFECTO = 8;

function calcularPlanVenta(o){
  const items = (o.items || []).filter(i => Number(i.cantidad) > 0);
  const neto = items.reduce((a, i) => a + Number(i.cantidad) * Number(i.precio_neto || 0), 0);
  const ivaPct = o.iva_pct == null ? IVA_MAQUINAS : Number(o.iva_pct);
  const iva = neto * ivaPct / 100;
  const proforma = neto + iva;
  const tc = Number(o.tc) || 0;
  const plan = PLANES_VENTA[o.plan] || { cuotas: Number(o.plan) || 12, sinInteres: Math.min(Number(o.plan) || 12, 6) };
  const tasa = (o.tasa_anual == null || o.tasa_anual === '' ? TASA_ANUAL_DEFECTO : Number(o.tasa_anual)) / 100;
  let anticipo = o.anticipo_tipo === 'usd' ? (Number(o.anticipo_valor) || 0) : proforma * (Number(o.anticipo_valor) || 0) / 100;
  anticipo = Math.min(Math.max(anticipo, 0), proforma);
  const financiado = proforma - anticipo;
  const capital = financiado / plan.cuotas;
  let saldo = financiado, interesTotal = 0;
  const cuotas = [];
  for(let k = 1; k <= plan.cuotas; k++){
    const interes = k > plan.sinInteres ? saldo * tasa / 12 : 0;
    const usd = capital + interes;
    cuotas.push({ n: k, capital, interes, usd, ars: Math.round(usd * tc), conInteres: k > plan.sinInteres });
    interesTotal += interes;
    saldo -= capital;
  }
  const anticipoArs = Math.round(anticipo * tc);
  const totalUsd = anticipo + cuotas.reduce((a, c) => a + c.usd, 0);
  const totalArs = anticipoArs + cuotas.reduce((a, c) => a + c.ars, 0);
  return { neto, iva, ivaPct, proforma, tc, proformaArs: Math.round(proforma * tc), anticipo, anticipoArs, financiado,
    plan, tasa: tasa * 100, cuotas, interesTotal, totalUsd, totalArs };
}

const vN2 = v => Number(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const vN0 = v => Number(v).toLocaleString('es-AR', { maximumFractionDigits: 0 });

function generarCotizacionVentaPDF(cot){
  const calc = calcularPlanVenta(cot);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 18;
  const R = pageWidth - marginX;
  const ROJO = [226, 35, 41], NEGRO = [24, 24, 26];
  const bannerH = pageWidth / (2475 / 406);
  const LIM = 297 - bannerH - 9;   // el contenido no puede pasar de acá (queda el pie con banner)
  const empresa = (cot.cliente && cot.cliente.razon_social) || cot.empresa_nombre || '—';
  const numero = cot.numero ? String(cot.numero).padStart(5, '0') : 'BORRADOR';
  const logoW = 56, logoH = logoW / LOGO_HAULOTTE_RATIO;

  const encabezado = () => {
    let y = 15;
    try{ doc.addImage(LOGO_HAULOTTE_BASE64, 'PNG', marginX, y, logoW, logoH); } catch(e){ console.error(e); }
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text(`PRESUPUESTO DE VENTA N° ${numero}`, R, y + 5, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(`Fecha de emisión: ${fmtDate(cot.fecha_emision)}`, R, y + 11, { align: 'right' });
    doc.text(`Válido por ${cot.validez_dias || 7} días`, R, y + 16, { align: 'right' });
    y += 24;
    doc.setDrawColor(...ROJO); doc.setLineWidth(0.9);
    doc.line(marginX, y, R, y);
    return y + 8;
  };
  const titulo = (txt, y) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(0); doc.text(txt, marginX, y); return y + 6; };
  const encTabla = (y, cols) => {
    doc.setFillColor(...NEGRO); doc.rect(marginX, y - 5, pageWidth - marginX * 2, 7, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
    cols.forEach(c => doc.text(c.t, c.x, y, c.right ? { align: 'right' } : undefined));
    doc.setTextColor(0);
    return y + 8;
  };

  let y = encabezado();

  y = titulo('DATOS DEL CLIENTE', y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.text(`Empresa: ${empresa}`, marginX, y); y += 5;
  if(cot.contacto_nombre){ doc.text(`Contacto: ${cot.contacto_nombre}`, marginX, y); y += 5; }
  if(cot.contacto_email){ doc.text(`Email: ${cot.contacto_email}`, marginX, y); y += 5; }
  if(cot.contacto_telefono){ doc.text(`Teléfono: ${cot.contacto_telefono}`, marginX, y); y += 5; }

  y += 6;
  y = titulo('EQUIPOS COTIZADOS', y) + 2;
  const cabEquipos = () => encTabla(y, [{ t: 'Equipo', x: marginX + 2 }, { t: 'Cant.', x: 112, right: true }, { t: 'Precio unit. neto', x: 152, right: true }, { t: 'Subtotal neto', x: R - 2, right: true }]);
  y = cabEquipos();
  (cot.items || []).filter(it => Number(it.cantidad) > 0).forEach(it => {
    if(y + 18 > LIM){ doc.addPage(); y = encabezado(); y = cabEquipos(); }
    const sub = Number(it.cantidad) * Number(it.precio_neto || 0);
    const top = y;
    const f = it.foto;
    const xT = f ? marginX + 28 : marginX + 2;
    if(f){
      const bw = 22, bh = 18, esc = Math.min(bw / f.w, bh / f.h), w = f.w * esc, h = f.h * esc;
      try{ doc.addImage(f.data, 'JPEG', marginX + 2 + (bw - w) / 2, y - 4 + (bh - h) / 2, w, h); } catch(e){ console.error(e); }
      doc.setDrawColor(210, 218, 230); doc.setLineWidth(0.25); doc.rect(marginX + 2, y - 4, bw, bh, 'S');
    }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
    doc.text(it.modelo || it.descripcion || '', xT, y + 1);
    if(it.descripcion && it.modelo){
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(100);
      doc.text(doc.splitTextToSize(it.descripcion, 80).slice(0, 2), xT, y + 6); doc.setTextColor(0);
    }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(String(it.cantidad), 112, y + 1, { align: 'right' });
    doc.text(fmtMoney(it.precio_neto, 'USD'), 152, y + 1, { align: 'right' });
    doc.text(fmtMoney(sub, 'USD'), R - 2, y + 1, { align: 'right' });
    y = Math.max(y + 12, top + (f ? 17 : 0));
    doc.setDrawColor(222); doc.setLineWidth(0.2); doc.line(marginX, y, R, y);
    y += 6;
  });

  // ---------- Resumen económico ----------
  if(y + 40 > LIM){ doc.addPage(); y = encabezado(); }
  y += 1;
  const bx = R - 92, bw = 92;
  const filas = [
    ['Total neto', fmtMoney(calc.neto, 'USD')],
    [`IVA ${String(calc.ivaPct).replace('.', ',')}%`, fmtMoney(calc.iva, 'USD')],
    ['Total proforma', fmtMoney(calc.proforma, 'USD'), true],
    ['Tipo de cambio de referencia', '$ ' + vN2(calc.tc)],
    ['Total proforma en pesos', '$ ' + vN0(calc.proformaArs), true],
  ];
  doc.setFillColor(244, 245, 247); doc.setDrawColor(222); doc.setLineWidth(0.2);
  doc.roundedRect(bx, y - 4, bw, filas.length * 6.4 + 4, 1.5, 1.5, 'FD');
  filas.forEach((f, i) => {
    const yy = y + i * 6.4 + 1;
    doc.setFont('helvetica', f[2] ? 'bold' : 'normal'); doc.setFontSize(f[2] ? 9.5 : 9); doc.setTextColor(f[2] ? 0 : 70);
    doc.text(f[0], bx + 4, yy);
    doc.setTextColor(0); doc.text(f[1], bx + bw - 4, yy, { align: 'right' });
  });
  y += filas.length * 6.4 + 10;

  // ---------- Plan de pago ----------
  const nFilas = calc.cuotas.length + (calc.anticipo > 0 ? 1 : 0) + 1;
  const alto = 22 + nFilas * 5.9 + 4;
  if(y + alto > LIM){ doc.addPage(); y = encabezado(); }
  y = titulo(`PLAN DE PAGO — ${calc.plan.cuotas} CUOTAS MENSUALES`, y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(70);
  const descr = calc.plan.sinInteres >= calc.plan.cuotas
    ? `Las ${calc.plan.cuotas} cuotas son sin interés.`
    : `Cuotas 1 a ${calc.plan.sinInteres} sin interés. Cuotas ${calc.plan.sinInteres + 1} a ${calc.plan.cuotas} con interés del ${String(calc.tasa).replace('.', ',')}% nominal anual sobre saldo.`;
  doc.text(descr, marginX, y); doc.setTextColor(0);
  y += 6;
  const C = { n: marginX + 2, cap: 82, int: 110, usd: 146, ars: R - 2 };
  y = encTabla(y, [{ t: 'Cuota', x: C.n }, { t: 'Capital U$D', x: C.cap, right: true }, { t: 'Interés U$D', x: C.int, right: true }, { t: 'Cuota U$D', x: C.usd, right: true }, { t: 'Cuota en $', x: C.ars, right: true }]);
  let z = 0;
  const fila = (n, cap, inte, usd, ars, negrita) => {
    if(z++ % 2 === 0){ doc.setFillColor(246, 247, 249); doc.rect(marginX, y - 4.2, pageWidth - marginX * 2, 5.7, 'F'); }
    doc.setFont('helvetica', negrita ? 'bold' : 'normal'); doc.setFontSize(8.8);
    doc.text(String(n), C.n, y);
    doc.text(cap, C.cap, y, { align: 'right' });
    doc.text(inte, C.int, y, { align: 'right' });
    doc.text(usd, C.usd, y, { align: 'right' });
    doc.text(ars, C.ars, y, { align: 'right' });
    y += 5.9;
  };
  if(calc.anticipo > 0) fila('Anticipo', vN2(calc.anticipo), '—', vN2(calc.anticipo), vN0(calc.anticipoArs));
  calc.cuotas.forEach(c => fila(c.n, vN2(c.capital), c.interes > 0 ? vN2(c.interes) : '—', vN2(c.usd), vN0(c.ars)));
  doc.setDrawColor(...NEGRO); doc.setLineWidth(0.5); doc.line(marginX, y - 4, R, y - 4);
  y += 1;
  fila('TOTAL', vN2(calc.proforma), calc.interesTotal > 0 ? vN2(calc.interesTotal) : '—', vN2(calc.totalUsd), vN0(calc.totalArs), true);
  y += 5;

  // ---------- Condiciones ----------
  const notasLs = cot.notas ? doc.splitTextToSize(cot.notas, pageWidth - marginX * 2) : [];
  if(y + 28 + (notasLs.length ? 8 + notasLs.length * 4.6 : 0) > LIM){ doc.addPage(); y = encabezado(); }
  y = titulo('CONDICIONES COMERCIALES', y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  const fechaTc = cot.tc_fecha ? ` (${fmtDate(cot.tc_fecha)})` : '';
  const conds = [
    `Los equipos se cotizan en dólares estadounidenses. El IVA (${String(calc.ivaPct).replace('.', ',')}%) está incluido en el total proforma.`,
    `El pago se realiza en pesos, al tipo de cambio de referencia de $ ${vN2(calc.tc)} por U$D${fechaTc}.`,
    'Si al momento del pago existiera diferencia de cambio, se emitirá una nota de débito por dicha diferencia.',
    `Validez de la oferta: ${cot.validez_dias || 7} días desde la fecha de emisión.`,
  ];
  conds.forEach(l => { const ls = doc.splitTextToSize('• ' + l, pageWidth - marginX * 2); doc.text(ls, marginX, y); y += ls.length * 4.6 + 0.8; });
  if(notasLs.length){
    y += 3; doc.setFont('helvetica', 'bold'); doc.text('Notas:', marginX, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.text(notasLs, marginX, y); y += notasLs.length * 4.6;
  }

  // ---------- Pie: mismo banner y dirección que los presupuestos de alquiler ----------
  const total = doc.internal.getNumberOfPages();
  for(let p = 1; p <= total; p++){
    doc.setPage(p);
    try{ doc.addImage(FOOTER_BANNER_BASE64, 'JPEG', 0, 297 - bannerH, pageWidth, bannerH); } catch(e){ console.error('No se pudo insertar el banner decorativo:', e); }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(150);
    doc.text('Haulotte Argentina — Panamericana Km. 34.300 Colectora Oeste, Ramal Escobar, Grand Bourg, Buenos Aires', marginX, 297 - bannerH - 3);
    doc.text(`Página ${p} de ${total}`, R, 297 - bannerH - 3, { align: 'right' });
    doc.setTextColor(0);
  }
  return { doc, calc, fileName: `Presupuesto_Venta_${numero}_${empresa.replace(/[^a-zA-Z0-9]/g, '_')}.pdf` };
}

// =====================================================================
// Datos locales y sincronización de las cotizaciones de venta
// (misma mecánica que los presupuestos de alquiler: se guardan en el teléfono y suben cuando hay señal)
// =====================================================================

let VE = null;                                   // editor de venta en curso
const VV = { q: '', filtro: 'todos', key: null };

const puedeAlquiler = () => puede('presupuestos', 'ver');
const puedeVenta = () => puede('haulotte_ventas', 'ver');
const puedeRepuestosApp = () => puede('haulotte_presupuestos', 'ver');
const tieneHome = () => [puedeAlquiler(), puedeVenta(), puedeRepuestosApp()].filter(Boolean).length >= 2;

async function cargarVentasLocal(){
  const all = await DB.all('ventas');
  all.sort((a, b) => {
    const la = !a.id ? 1 : 0, lb = !b.id ? 1 : 0;
    if(la !== lb) return lb - la;                                   // borradores sin número arriba
    if(!a.id && !b.id) return String(b.created_at).localeCompare(String(a.created_at));
    return (b.numero || 0) - (a.numero || 0);
  });
  S.ventas = all;
}
function pendientesVenta(){ return S.ventas.filter(v => v._pending || v._anular); }
function pendientesTodos(){ return pendientes().concat(pendientesVenta()); }

const CAMPOS_VENTA = ['cliente_id', 'empresa_nombre', 'contacto_nombre', 'contacto_email', 'contacto_telefono', 'fecha_emision', 'validez_dias',
  'iva_pct', 'tipo_cambio', 'tipo_cambio_fuente', 'tipo_cambio_fecha', 'plan', 'tasa_anual', 'anticipo_tipo', 'anticipo_valor', 'notas'];
function ventaCabecera(r){
  const o = {};
  CAMPOS_VENTA.forEach(k => { o[k] = r[k] === undefined ? null : r[k]; });
  o.updated_at = new Date().toISOString();
  return o;
}
function ventaItemsPayload(r, ventaId){
  return (r.haulotte_venta_items || []).map((it, i) => ({
    venta_id: ventaId, modelo: it.modelo, descripcion: it.descripcion || null,
    cantidad: Number(it.cantidad), precio_neto: Number(it.precio_neto) || 0, orden: i,
  }));
}

async function subirVentaUno(r){
  // 1) Crear la cabecera (el número correlativo lo asigna el servidor)
  if(r._op === 'create' && !r.id){
    let hdr = null;
    if(r._intento){
      // Si un intento anterior se cortó justo al responder, puede que ya exista: se busca por su etiqueta única
      const { data, error } = await sb.from('haulotte_ventas').select('*').eq('creado_por', r.creado_por).limit(1);
      if(error) throw error;
      hdr = data && data[0];
      if(hdr){
        const { error: eU } = await sb.from('haulotte_ventas').update(ventaCabecera(r)).eq('id', hdr.id);
        if(eU) throw eU;
      }
    }
    if(!hdr){
      r._intento = true;
      await DB.put('ventas', r);
      const { data, error } = await sb.from('haulotte_ventas').insert({ ...ventaCabecera(r), creado_por: r.creado_por }).select().single();
      if(error) throw error;
      hdr = data;
    }
    const viejaKey = r.key;
    r.id = hdr.id; r.numero = hdr.numero; r.estado = hdr.estado; r.created_at = hdr.created_at;
    r.key = 'srv:' + hdr.id;
    await DB.put('ventas', r);
    if(viejaKey !== r.key){
      await DB.del('ventas', viejaKey);
      if(VV.key === viejaKey) VV.key = r.key;
    }
  } else if(r._op === 'update' && r.id){
    const { error } = await sb.from('haulotte_ventas').update(ventaCabecera(r)).eq('id', r.id);
    if(error) throw error;
  }
  // 2) Reemplazar los ítems (igual que hace APEX web al guardar)
  if(r._pending){
    const { error: eDel } = await sb.from('haulotte_venta_items').delete().eq('venta_id', r.id);
    if(eDel) throw eDel;
    const items = ventaItemsPayload(r, r.id);
    if(items.length){
      const { error: eIns } = await sb.from('haulotte_venta_items').insert(items);
      if(eIns) throw eIns;
    }
    r._pending = false; r._op = null; r._error = null; r._intento = false;
    await DB.put('ventas', r);
  }
  // 3) Anulación hecha sin señal
  if(r._anular){
    const { error } = await sb.from('haulotte_ventas').update({ estado: 'anulado', motivo_anulacion: r._anular.motivo || null, updated_at: new Date().toISOString() }).eq('id', r.id);
    if(error) throw error;
    r.estado = 'anulado'; r.motivo_anulacion = r._anular.motivo || null; r._anular = null; r._error = null;
    await DB.put('ventas', r);
  }
}
async function subirVentas(){
  await cargarVentasLocal();
  const cola = S.ventas.filter(v => v._pending || v._anular)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const res = { ok: [], fallidos: [] };
  for(const r of cola){
    try{
      await subirVentaUno(r);
      res.ok.push(r);
    } catch(e){
      if(esErrorDeRed(e) || esErrorDeSesion(e)) throw e;            // se corta: se reintenta cuando haya señal
      console.error('Error subiendo cotización de venta', e);
      r._error = (e && e.message) || 'Error desconocido';
      await DB.put('ventas', r);
      res.fallidos.push(r);
    }
  }
  return res;
}

// Baja solo lo que cambió (nunca se borran cotizaciones: se anulan), y una vez por semana revisa todo
async function bajarVentas(completo){
  if(!puedeVenta()) return;
  const ultimoFull = (await DB.get('kv', 'ventasFull')) || 0;
  const hacerCompleto = completo || !S.ventas.some(v => v.id) || (Date.now() - ultimoFull) > 7 * 86400000;
  let desde = null;
  if(!hacerCompleto){
    const m = await DB.get('kv', 'ventasMaxUpd');
    if(m) desde = new Date(new Date(m).getTime() - 10 * 60000).toISOString();     // 10 min de solape por si se estaba guardando
  }
  let rows;
  try{
    if(desde){
      rows = await fetchTodo(() => sb.from('haulotte_ventas').select('*, clientes(razon_social), haulotte_venta_items(*)').order('numero', { ascending: false }).gt('updated_at', desde));
    } else {
      const rv = await sb.from('haulotte_ventas').select('*, clientes(razon_social), haulotte_venta_items(*)').order('numero', { ascending: false }).limit(80);
      if(rv.error) throw rv.error;
      rows = rv.data || [];                                          // solo las últimas 80
    }
  } catch(e){ if(e && e.code === '42501') return; throw e; }
  const locales = await DB.all('ventas');
  const porKey = new Map(locales.map(l => [l.key, l]));
  const nuevos = [], vistos = new Set();
  let maxUpd = (await DB.get('kv', 'ventasMaxUpd')) || '';
  for(const r of rows){
    const key = 'srv:' + r.id;
    vistos.add(key);
    if(r.updated_at && r.updated_at > maxUpd) maxUpd = r.updated_at;
    const loc = porKey.get(key);
    if(loc && (loc._pending || loc._anular)) continue;              // lo hecho sin señal manda hasta subirse
    r.haulotte_venta_items = (r.haulotte_venta_items || []).slice().sort((a, b) => (a.orden || 0) - (b.orden || 0));
    nuevos.push({ ...r, key });
  }
  if(nuevos.length) await DB.putMany('ventas', nuevos);
  if(hacerCompleto){
    for(const l of locales){
      if(l.key.startsWith('srv:') && !vistos.has(l.key) && !l._pending && !l._anular) await DB.del('ventas', l.key);
    }
    await DB.put('kv', Date.now(), 'ventasFull');
  }
  if(maxUpd) await DB.put('kv', maxUpd, 'ventasMaxUpd');
  await cargarVentasLocal();
}

// Último tipo de cambio BNA (venta, día anterior) que se pudo bajar: sirve para cotizar sin señal
async function bajarTcBna(){
  if(!puedeVenta()) return;
  try{
    const { data, error } = await sb.rpc('tc_bna_anterior', { p_fecha: hoyIso() });
    if(error) return;
    const fila = Array.isArray(data) ? data[0] : data;
    const venta = fila ? Number(fila.venta) : NaN;
    if(venta > 0 && isFinite(venta)) await DB.put('kv', { venta, fecha: fila.fecha, para: hoyIso() }, 'tcBna');
  } catch(e){ /* sin señal: se usa el que ya está guardado */ }
}

// ---------- Helpers de datos ----------
function vClienteNombre(r){
  if(r.clientes && r.clientes.razon_social) return r.clientes.razon_social;
  if(r.cliente_id){ const c = S.clientes.find(x => x.id === r.cliente_id); if(c) return c.razon_social; }
  return r.empresa_nombre || '—';
}
function vItemsOrdenados(r){ return (r.haulotte_venta_items || []).slice().sort((a, b) => (a.orden || 0) - (b.orden || 0)); }
function vCalcDe(r){
  return calcularPlanVenta({
    items: vItemsOrdenados(r).map(i => ({ cantidad: i.cantidad, precio_neto: i.precio_neto })),
    iva_pct: r.iva_pct, tc: r.tipo_cambio, plan: r.plan, tasa_anual: r.tasa_anual,
    anticipo_tipo: r.anticipo_tipo, anticipo_valor: r.anticipo_valor,
  });
}
function vActual(){ return S.ventas.find(x => x.key === VV.key); }
function vVencimiento(r){
  if(!r.fecha_emision) return '—';
  const [y, m, d] = String(r.fecha_emision).slice(0, 10).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + (Number(r.validez_dias) || 7) * 86400000);
  return `${String(dt.getUTCDate()).padStart(2, '0')}/${String(dt.getUTCMonth() + 1).padStart(2, '0')}/${dt.getUTCFullYear()}`;
}
function vListaFiltrada(){
  const q = VV.q.trim().toLowerCase();
  return S.ventas.filter(v => {
    const st = estadoVista(v);
    if(VV.filtro === 'vigente' && st !== 'vigente') return false;
    if(VV.filtro === 'vencido' && st !== 'vencido') return false;
    if(VV.filtro === 'anulado' && st !== 'anulado') return false;
    if(VV.filtro === 'pendiente' && !(v._pending || v._anular)) return false;
    if(q){
      const hay = String(v.numero || '').includes(q) || vClienteNombre(v).toLowerCase().includes(q) ||
        (v.empresa_nombre || '').toLowerCase().includes(q) || (v.contacto_nombre || '').toLowerCase().includes(q);
      if(!hay) return false;
    }
    return true;
  });
}

// ---------- Navegación ----------
function irHome(){ V.view = 'home'; E = null; VE = null; S.detailKey = null; VV.key = null; cerrarOverlay(); render(); window.scrollTo(0, 0); }
function irVLista(){ V.view = 'vlist'; E = null; VE = null; VV.key = null; cerrarOverlay(); render(); }
function irVDetalle(key){ VV.key = key; V.view = 'vdetail'; E = null; VE = null; cerrarOverlay(); render(); window.scrollTo(0, 0); }
// Pantalla de ingreso: si el usuario tiene las dos áreas ve el menú; si tiene una sola, entra directo
function irInicio(){
  if(tieneHome()) return irHome();
  if(puedeVenta() && !puedeAlquiler()) return irVLista();
  if(puedeRepuestosApp() && !puedeAlquiler()) return irRLista();
  return irLista();
}
async function salirVEditor(){
  if(VE && VE.dirty){
    const ok = await confirmar({ titulo: '¿Salir sin guardar?', texto: 'Se pierden los cambios que hiciste en esta cotización.', ok: 'Salir', cancelar: 'Seguir editando', peligro: true });
    if(!ok) return;
  }
  const rec = VE && VE.rec;
  VE = null;
  if(rec) irVDetalle(rec.key); else irVLista();
}
// El botón "atrás" de Android: lo llama atras() de app.js antes que nada
function atrasVenta(){
  if(['rlist', 'rdetail', 'reditor'].includes(V.view)) return atrasRepuestos();
  if(V.view === 'veditor'){ salirVEditor(); return true; }
  if(V.view === 'vdetail'){ irVLista(); return true; }
  if(V.view === 'vlist'){ if(tieneHome()){ irHome(); return true; } return false; }
  if(V.view === 'list' && tieneHome()){ irHome(); return true; }
  return false;
}

// ---------- Vistas ----------
function renderVenta(){
  if(V.view === 'home') return vHome();
  if(V.view === 'vlist') return vVList();
  if(V.view === 'vdetail') return vVDetail();
  if(V.view === 'veditor' && VE) return vVEditor();
  return renderRepuestos();
}
function refrescarVenta(){
  if(['rlist', 'rdetail', 'reditor'].includes(V.view)) return true;
  if(V.view === 'home' || V.view === 'vdetail'){ render(); return true; }
  if(V.view === 'vlist'){
    const h = $('#vhello-sub'); if(h) h.innerHTML = vHelloSub();
    const o = $('#offline-slot'); if(o) o.innerHTML = bannerOffline();
    const c = $('#vcards'); if(c) c.innerHTML = vCardsHtml();
    const b = $('#vchips'); if(b) b.outerHTML = vChipsRow();
    return true;
  }
  return V.view === 'veditor';
}
function barraAcciones(){
  return `<div class="bar-actions"><span id="chip-slot">${chipEstado()}</span>
    <button class="icon-btn" data-act="tema" aria-label="Cambiar tema">${ic(document.body.classList.contains('light-theme') ? 'moon' : 'sun')}</button>
    <button class="avatar" data-act="cuenta" aria-label="Mi cuenta">${esc(iniciales())}</button></div>`;
}
const plu = (n, s, p) => `${n} ${n === 1 ? s : p}`;

function vHome(){
  const nombre = nombreUsuario().split(/\s+/)[0];
  const pA = pendientes().length, pV = pendientesVenta().length;
  const tarjetas = [];
  if(puedeAlquiler()) tarjetas.push(`<button class="launch" data-act="ir-alquiler" style="--stripe:var(--accent)">
      <span class="launch-ic">${ic('rent')}</span>
      <span class="launch-tx"><b>Alquiler de equipos</b><small>Presupuestos de alquiler por día, semana o mes</small>
        <em>${plu(S.presupuestos.length, 'presupuesto', 'presupuestos')}${pA ? ` · ${pA} sin subir` : ''}</em></span>${ic('chevron')}</button>`);
  if(puedeVenta()) tarjetas.push(`<button class="launch" data-act="ir-venta" style="--stripe:#e22329">
      <span class="launch-ic">${ic('tag')}</span>
      <span class="launch-tx"><b>Venta de máquinas Haulotte</b><small>Cotizaciones en dólares con plan de cuotas</small>
        <em>${plu(S.ventas.length, 'cotización', 'cotizaciones')}${pV ? ` · ${pV} sin subir` : ''}</em></span>${ic('chevron')}</button>`);
  if(puedeRepuestosApp()) tarjetas.push(`<button class="launch" data-act="ir-repuestos" style="--stripe:#f59e0b">
      <span class="launch-ic">${ic('gear')}</span>
      <span class="launch-tx"><b>Repuestos Haulotte</b><small>Presupuestos de repuestos con margen y descuento de cliente</small>
        <em>Solo en línea</em></span>${ic('chevron')}</button>`);
  return `<div class="screen">
    <header class="appbar">${apexMark(30)}${barraAcciones()}</header>
    <main class="body">
      <section class="hello"><h1>Hola, ${esc(nombre)}</h1><p>¿Qué querés cotizar hoy?</p></section>
      <div id="offline-slot">${bannerOffline()}</div>
      <div class="launchers">${tarjetas.join('') || `<div class="empty">${ic('warn')}<b>Sin accesos</b>Tu usuario no tiene permisos para cotizar. Pedíselo al administrador.</div>`}</div>
    </main></div>`;
}

function vHelloSub(){
  const n = S.ventas.length, pend = pendientesVenta().length;
  return `${plu(n, 'cotización', 'cotizaciones')}${pend ? ` · ${pend} sin subir` : ''} · actualizado ${hace(S.lastSync)}`;
}
function vChipsRow(){
  const pend = pendientesVenta().length;
  const cuenta = f => S.ventas.filter(p => f === 'todos' ? true : f === 'pendiente' ? (p._pending || p._anular) : estadoVista(p) === f).length;
  const chips = [['todos', 'Todas'], ['vigente', 'Vigentes'], ['vencido', 'Vencidas'], ['anulado', 'Anuladas']];
  if(pend) chips.push(['pendiente', 'Sin subir']);
  return `<div class="chips" id="vchips">${chips.map(([k, l]) => `<button class="chip ${VV.filtro === k ? 'on' : ''}" data-act="vfiltro" data-v="${k}">${l}<span class="n">${cuenta(k)}</span></button>`).join('')}</div>`;
}
function vCardsHtml(){
  const list = vListaFiltrada();
  if(!list.length){
    return `<div class="empty">${ic('file')}<b>${S.ventas.length ? 'Sin resultados' : 'Todavía no hay cotizaciones de venta'}</b>
      ${S.ventas.length ? 'Probá con otro filtro o búsqueda.' : (puede('haulotte_ventas', 'crear') ? 'Tocá “Nueva cotización” para armar la primera.' : '')}</div>`;
  }
  return list.map((v, i) => {
    const st = estadoVista(v), c = vCalcDe(v), n = (v.haulotte_venta_items || []).length;
    const pend = v._pending || v._anular;
    return `<button class="card st-${st}" data-act="vabrir" data-key="${esc(v.key)}" style="animation-delay:${Math.min(i, 8) * 30}ms">
      <div class="row"><span class="num">${esc(numeroTexto(v))}</span><span class="badge st-${st}">${ESTADO_LABEL[st] || st}</span></div>
      <div class="who">${esc(vClienteNombre(v))}</div>
      <div class="row"><span class="meta">${fmtDate(v.fecha_emision)} · ${n} equipo${n === 1 ? '' : 's'} · ${v.plan} cuotas</span>
        <span class="total">${esc(fmtMoney(c.proforma, 'USD'))}</span></div>
      ${pend ? `<div class="meta" style="margin-top:6px;color:var(--warn);font-weight:600">Pendiente de subir</div>` : ''}
    </button>`;
  }).join('');
}
function vVList(){
  const nombre = nombreUsuario().split(/\s+/)[0];
  const cab = tieneHome()
    ? `<button class="icon-btn" data-act="volver" aria-label="Menú principal">${ic('back')}</button><div class="bar-title">Venta Haulotte<span class="bar-sub">Cotizaciones de máquinas</span></div>`
    : apexMark(30);
  return `<div class="screen">
    <header class="appbar">${cab}${barraAcciones()}</header>
    <main class="body">
      <section class="hello"><h1>${tieneHome() ? 'Venta de máquinas' : 'Hola, ' + esc(nombre)}</h1><p id="vhello-sub">${vHelloSub()}</p></section>
      <div id="offline-slot">${bannerOffline()}</div>
      <div class="search">${ic('search')}<input id="vq" type="search" placeholder="Buscar por N°, cliente o contacto" value="${esc(VV.q)}" autocomplete="off"></div>
      ${vChipsRow()}
      <div class="cards" id="vcards">${vCardsHtml()}</div>
    </main>
    ${puede('haulotte_ventas', 'crear') ? `<button class="fab" data-act="vnuevo">${ic('plus')}Nueva cotización</button>` : ''}
  </div>`;
}

// Tabla de cuotas (la usan el detalle y el editor)
function vCuotasHtml(c){
  const fila = (a, b, i, u, p, cls) => `<tr class="${cls || ''}"><td>${a}</td><td>${b}</td><td>${i}</td><td>${u}</td><td>${p}</td></tr>`;
  const rows = [];
  if(c.anticipo > 0) rows.push(fila('Anticipo', vN2(c.anticipo), '—', vN2(c.anticipo), vN0(c.anticipoArs), 'ant'));
  c.cuotas.forEach(q => rows.push(fila(q.n, vN2(q.capital), q.interes > 0 ? vN2(q.interes) : '—', vN2(q.usd), vN0(q.ars), q.conInteres ? 'ci' : '')));
  rows.push(fila('Total', vN2(c.proforma), c.interesTotal > 0 ? vN2(c.interesTotal) : '—', vN2(c.totalUsd), vN0(c.totalArs), 'tot'));
  return `<div class="cuotas-wrap"><table class="cuotas"><thead><tr><th>Cuota</th><th>Capital</th><th>Interés</th><th>U$D</th><th>En $</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
    <div class="hint" style="margin:6px 2px 0">${c.plan.sinInteres >= c.plan.cuotas
      ? `Las ${c.plan.cuotas} cuotas son sin interés.`
      : `Cuotas 1 a ${c.plan.sinInteres} sin interés · ${c.plan.sinInteres + 1} a ${c.plan.cuotas} con ${String(c.tasa).replace('.', ',')}% nominal anual sobre saldo (marcadas).`}</div>`;
}
function vResumenHtml(c){
  const l = (a, b, strong) => `<div class="linea"><span>${a}</span><b${strong ? ' style="font-size:15px"' : ''}>${b}</b></div>`;
  return `<div class="grupo" style="margin-top:0">
    ${l('Total neto', fmtMoney(c.neto, 'USD'))}
    ${l(`IVA ${String(c.ivaPct).replace('.', ',')}%`, fmtMoney(c.iva, 'USD'))}
    ${l('Total proforma', fmtMoney(c.proforma, 'USD'), true)}
    ${l('Proforma en pesos', '$ ' + vN0(c.proformaArs))}
    ${c.anticipo > 0 ? l('Anticipo', `${fmtMoney(c.anticipo, 'USD')} · $ ${vN0(c.anticipoArs)}`) : ''}
    ${c.interesTotal > 0 ? l('Intereses totales', fmtMoney(c.interesTotal, 'USD')) : ''}
    ${l('Total a pagar', `${fmtMoney(c.totalUsd, 'USD')} · $ ${vN0(c.totalArs)}`, true)}
  </div>`;
}

function vVDetail(){
  const v = vActual();
  if(!v) return vVList();
  const st = estadoVista(v), c = vCalcDe(v);
  const pend = v._pending || v._anular;
  const editable = puede('haulotte_ventas', 'crear') && st !== 'anulado';
  const puedeAnular = v.id && puede('haulotte_ventas', 'anular') && st !== 'anulado';
  const items = vItemsOrdenados(v).map(i => `
    <div class="grupo"><div class="gh">${thumbHtml(i.modelo)}<b>${esc(i.modelo)}</b></div>
      ${i.descripcion ? `<div class="dim" style="font-size:13px;margin:-2px 0 6px">${esc(i.descripcion)}</div>` : ''}
      <div class="linea"><span>${esc(i.cantidad)} × ${esc(fmtMoney(i.precio_neto, 'USD'))} neto</span><b>${esc(fmtMoney(Number(i.cantidad) * Number(i.precio_neto), 'USD'))}</b></div>
    </div>`).join('');
  return `<div class="screen">
    <header class="appbar"><button class="icon-btn" data-act="volver" aria-label="Volver">${ic('back')}</button>
      <div class="bar-title">${esc(numeroTexto(v))}<span class="bar-sub">${esc(vClienteNombre(v))}</span></div>
      <span id="chip-slot">${chipEstado()}</span></header>
    <main class="body">
      ${!v.id ? `<div class="banner info">${ic('info')}<div><b>Guardado en este teléfono</b>El número correlativo se asigna cuando se suba, apenas haya conexión.</div></div>` : ''}
      ${v.id && pend && !v._error ? `<div class="banner info">${ic('info')}<div><b>Cambios pendientes de subir</b>Se enviarán solos cuando haya conexión.</div></div>` : ''}
      ${v._error ? `<div class="banner danger">${ic('warn')}<div><b>No se pudo subir</b>${esc(v._error)}<div style="margin-top:8px"><button class="btn sm" data-act="sync-now">Reintentar</button></div></div></div>` : ''}
      <section class="hero st-${st}" style="--stripe:#e22329;${v._error || pend ? 'margin-top:14px' : ''}">
        <div class="top"><span class="num">${esc(numeroTexto(v))}</span><span class="badge st-${st}">${ESTADO_LABEL[st] || st}</span></div>
        <h2>${esc(vClienteNombre(v))}</h2>
        ${v.contacto_nombre ? `<div class="dim">${esc(v.contacto_nombre)}${v.contacto_telefono ? ' · ' + esc(v.contacto_telefono) : ''}</div>` : ''}
        <div class="big"><span class="dim">Total proforma</span><b>${esc(fmtMoney(c.proforma, 'USD'))}</b></div>
        <div class="dim" style="text-align:right;font-size:13px;margin-top:2px">$ ${vN0(c.proformaArs)} al TC $ ${vN2(c.tc)}</div>
        <div class="kv">
          <div><small>Emisión</small><b>${fmtDate(v.fecha_emision)}</b></div>
          <div><small>Válido hasta</small><b>${vVencimiento(v)}</b></div>
          <div><small>Plan</small><b>${v.plan} cuotas</b></div>
          <div><small>Anticipo</small><b>${c.anticipo > 0 ? esc(fmtMoney(c.anticipo, 'USD')) : 'Sin anticipo'}</b></div>
          <div style="grid-column:1/-1"><small>Tipo de cambio</small><b>$ ${vN2(c.tc)} · ${esc(v.tipo_cambio_fuente || 'Manual')}${v.tipo_cambio_fecha ? ' del ' + fmtDate(v.tipo_cambio_fecha) : ''}</b></div>
        </div>
      </section>
      ${st === 'anulado' && v.motivo_anulacion ? `<div class="banner danger" style="margin-top:12px">${ic('ban')}<div><b>Motivo de anulación</b>${esc(v.motivo_anulacion)}</div></div>` : ''}
      <div class="sec-title">Equipos</div>
      ${items || '<div class="dim">Sin equipos.</div>'}
      <div class="sec-title">Resumen</div>
      ${vResumenHtml(c)}
      <div class="sec-title">Plan de pago</div>
      ${vCuotasHtml(c)}
      ${v.notas ? `<div class="sec-title">Notas</div><div class="dim" style="white-space:pre-wrap">${esc(v.notas)}</div>` : ''}
      <div class="actions">
        <div class="actions two" style="margin:0">
          <button class="btn primary" data-act="vver-pdf">${ic('eye')}Ver PDF</button>
          <button class="btn" data-act="vpdf">${ic('share')}Compartir</button>
        </div>
        <div class="actions two" style="margin:0">
          ${editable ? `<button class="btn" data-act="veditar">${ic('edit')}Editar</button>` : ''}
          ${puedeAnular ? `<button class="btn danger" data-act="vanular">${ic('ban')}Anular</button>` : ''}
          ${!v.id ? `<button class="btn danger" data-act="vdescartar">${ic('trash')}Descartar</button>` : ''}
        </div>
      </div>
    </main></div>`;
}

// ---------- Editor ----------
const fmtTasa = n => Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
async function tcGuardado(){ return (await DB.get('kv', 'tcBna')) || null; }
async function nuevoVE(){
  const tc = await tcGuardado();
  const d = {
    cliente_id: null, cliente_nombre: '', empresa_nombre: '', contacto_nombre: '', contacto_email: '', contacto_telefono: '',
    fecha_emision: isoADmy(hoyIso()), validez_dias: '7',
    tc_txt: '', tc_fuente: null, tc_fecha: null,
    plan: 12, tasa_txt: fmtTasa(TASA_ANUAL_DEFECTO), anticipo_tipo: 'pct', anticipo_txt: '', notas: '',
  };
  // Si ya bajamos el TC de hoy, se propone directamente (se ve y se puede cambiar)
  if(tc && tc.para === hoyIso()){ d.tc_txt = fmtNumInput(tc.venta); d.tc_fuente = 'BNA venta'; d.tc_fecha = tc.fecha; }
  return { rec: null, d, items: [{ modelo: '', descripcion: '', cantidad: 1, precio_txt: '' }], dirty: false };
}
function veDesde(r){
  return {
    rec: r,
    d: {
      cliente_id: r.cliente_id || null, cliente_nombre: (r.clientes && r.clientes.razon_social) || '', empresa_nombre: r.empresa_nombre || '',
      contacto_nombre: r.contacto_nombre || '', contacto_email: r.contacto_email || '', contacto_telefono: r.contacto_telefono || '',
      fecha_emision: isoADmy(r.fecha_emision), validez_dias: String(r.validez_dias || 7),
      tc_txt: fmtNumInput(r.tipo_cambio), tc_fuente: r.tipo_cambio_fuente || 'Manual', tc_fecha: r.tipo_cambio_fecha || null,
      plan: Number(r.plan) || 12, tasa_txt: fmtTasa(r.tasa_anual), anticipo_tipo: r.anticipo_tipo || 'pct', anticipo_txt: fmtNumInput(r.anticipo_valor),
      notas: r.notas || '',
    },
    items: vItemsOrdenados(r).map(i => ({ modelo: i.modelo, descripcion: i.descripcion || '', cantidad: Number(i.cantidad) || 1, precio_txt: fmtNumInput(i.precio_neto) })),
    dirty: false,
  };
}
function veCalc(){
  const d = VE.d;
  return calcularPlanVenta({
    items: VE.items.filter(i => i.modelo).map(i => ({ cantidad: i.cantidad, precio_neto: parseNum(i.precio_txt) })),
    iva_pct: IVA_MAQUINAS, tc: parseNum(d.tc_txt), plan: Number(d.plan), tasa_anual: d.tasa_txt === '' ? TASA_ANUAL_DEFECTO : parseNum(d.tasa_txt),
    anticipo_tipo: d.anticipo_tipo, anticipo_valor: parseNum(d.anticipo_txt),
  });
}
function vfld(label, key, o){
  o = o || {};
  const val = VE.d[key] == null ? '' : VE.d[key];
  return `<div class="field"><label>${esc(label)}</label><input class="in" type="text" data-vf="${key}" value="${esc(val)}"${o.mask ? ' data-mask="date"' : ''}${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}${o.im ? ` inputmode="${o.im}"` : ''} autocomplete="${o.ac || 'off'}"></div>`;
}
function vTcHint(){
  const d = VE.d;
  if(d.tc_fuente === 'BNA venta' && d.tc_fecha) return `TC BNA venta del ${fmtDate(d.tc_fecha)} · podés cambiarlo si preferís otro valor`;
  if(d.tc_txt) return 'Valor cargado a mano';
  return 'Tocá “BNA” para traer el dólar venta del día anterior';
}
function vItemHtml(it, i){
  const sub = (Number(it.cantidad) || 0) * parseNum(it.precio_txt);
  return `<div class="item" data-i="${i}">
    <div class="item-head">${thumbHtml(it.modelo)}
      <button class="nm" data-act="vcambiar-modelo" data-i="${i}">${it.modelo
        ? `<b>${esc(it.modelo)}</b><small>Cambiar modelo</small>` : `<b class="dim">Elegir equipo…</b><small>Tocá para buscar</small>`}</button>
      <button class="icon-btn" data-act="vquitar-item" data-i="${i}" aria-label="Quitar equipo">${ic('x')}</button>
    </div>
    <div class="field" style="margin-bottom:10px"><input class="in" type="text" data-vk="descripcion" data-i="${i}" value="${esc(it.descripcion)}" placeholder="Descripción para el PDF (opcional)" autocomplete="off"></div>
    <div class="item-row">
      <div class="qty"><button type="button" data-act="vqty-" data-i="${i}" aria-label="Menos">−</button>
        <input data-i="${i}" data-vk="cantidad" inputmode="numeric" value="${esc(it.cantidad)}" aria-label="Cantidad">
        <button type="button" data-act="vqty+" data-i="${i}" aria-label="Más">+</button></div>
      <div class="dim" style="font-size:12.5px;align-self:center">Precio unitario neto, sin IVA</div>
    </div>
    <div class="item-foot">
      <div class="price" style="flex:1"><span>U$D</span><input class="in" data-i="${i}" data-vk="precio" inputmode="decimal" placeholder="0,00" value="${esc(it.precio_txt)}" aria-label="Precio unitario neto"></div>
      <div class="sub" data-vsub="${i}">${esc(fmtMoney(sub, 'USD'))}</div>
    </div>
  </div>`;
}
function vVEditor(){
  const d = VE.d, c = veCalc();
  const planInfo = PLANES_VENTA[d.plan] || { cuotas: d.plan, sinInteres: Math.min(d.plan, 6) };
  const conInteres = planInfo.sinInteres < planInfo.cuotas;
  return `<div class="screen">
    <header class="appbar"><button class="icon-btn" data-act="volver" aria-label="Volver">${ic('back')}</button>
      <div class="bar-title">${VE.rec ? 'Editar ' + esc(numeroTexto(VE.rec)) : 'Nueva cotización'}<span class="bar-sub">Venta de máquinas Haulotte</span></div>
      <button class="btn sm primary" data-act="vguardar">${ic('check')}Guardar</button></header>
    <main class="ed-body">
      <div class="sec-title" style="margin-top:4px">Cliente</div>
      <div class="field"><label>Buscar en la base</label>
        <button class="picker" data-act="vpick-cliente">${d.cliente_id
          ? `<span><b>${esc(d.cliente_nombre)}</b><small>Tocá para cambiar</small></span>`
          : `<span class="ph">Buscar cliente…</span>`}${ic('chevron')}</button>
        ${d.cliente_id ? `<button class="btn sm ghost" style="margin-top:8px" data-act="vclear-cliente">Quitar cliente (es un prospecto)</button>` : ''}</div>
      ${!d.cliente_id ? vfld('Empresa (si es prospecto nuevo)', 'empresa_nombre') : ''}
      ${vfld('Nombre del contacto', 'contacto_nombre')}
      <div class="grid2">${vfld('Email', 'contacto_email', { im: 'email' })}${vfld('Teléfono', 'contacto_telefono', { im: 'tel' })}</div>

      <div class="sec-title">Equipos</div>
      ${VE.items.map(vItemHtml).join('')}
      <button class="btn block" data-act="vadd-item">${ic('plus')}Agregar equipo</button>

      <div class="sec-title">Condiciones</div>
      <div class="grid2">${vfld('Fecha de emisión', 'fecha_emision', { mask: 1, ph: 'DD/MM/AAAA', im: 'numeric' })}${vfld('Validez (días)', 'validez_dias', { im: 'numeric' })}</div>
      <div class="field"><label>Tipo de cambio <span class="req">*</span></label>
        <div class="tc-row"><div class="price" style="flex:1"><span>$</span><input class="in" data-vf="tc_txt" inputmode="decimal" placeholder="0,00" value="${esc(d.tc_txt)}"></div>
          <button class="btn sm" data-act="vtc-bna">${ic('refresh')}BNA</button></div>
        <div class="hint" id="vtc-hint">${esc(vTcHint())}</div></div>
      <div class="field"><label>Cantidad de cuotas</label>
        <div class="seg">${[3, 6, 7, 8, 12].map(n => `<button type="button" class="${Number(d.plan) === n ? 'on' : ''}" data-act="vplan" data-v="${n}">${n}</button>`).join('')}</div>
        <div class="hint">${conInteres ? `Cuotas 1 a ${planInfo.sinInteres} sin interés; el resto con interés sobre saldo.` : 'Todas las cuotas son sin interés.'}</div></div>
      ${conInteres ? `<div class="field"><label>Tasa de interés nominal anual</label><div class="price"><span>%</span><input class="in" data-vf="tasa_txt" inputmode="decimal" placeholder="8,00" value="${esc(d.tasa_txt)}"></div></div>` : ''}
      <div class="field"><label>Anticipo</label>
        <div class="seg" style="margin-bottom:8px">${[['pct', '% del total'], ['usd', 'U$D']].map(([k, l]) => `<button type="button" class="${d.anticipo_tipo === k ? 'on' : ''}" data-act="vant-tipo" data-v="${k}">${l}</button>`).join('')}</div>
        <div class="price"><span>${d.anticipo_tipo === 'usd' ? 'U$D' : '%'}</span><input class="in" data-vf="anticipo_txt" inputmode="decimal" placeholder="0,00 (sin anticipo)" value="${esc(d.anticipo_txt)}"></div></div>
      <div class="field"><label>Notas (salen en el PDF)</label><textarea class="in" data-vf="notas" rows="3">${esc(d.notas)}</textarea></div>

      <div class="sec-title">Resumen</div>
      <div id="vr-res">${vResumenHtml(c)}</div>
      <div class="sec-title">Plan de pago</div>
      <div id="vr-cuotas">${vCuotasHtml(c)}</div>
    </main>
    <footer class="ed-foot">
      <div class="tot"><small>Total proforma</small><b id="ved-total">${esc(fmtMoney(c.proforma, 'USD'))}</b></div>
      <button class="btn primary" data-act="vguardar">${ic('check')}Guardar</button>
    </footer></div>`;
}
// Recalcula en vivo sin volver a dibujar la pantalla (así no se pierde el foco del teclado)
function vRecalc(){
  if(!VE) return;
  const c = veCalc();
  const r = $('#vr-res'); if(r) r.innerHTML = vResumenHtml(c);
  const q = $('#vr-cuotas'); if(q) q.innerHTML = vCuotasHtml(c);
  const t = $('#ved-total'); if(t) t.textContent = fmtMoney(c.proforma, 'USD');
  VE.items.forEach((it, i) => {
    const s = document.querySelector(`[data-vsub="${i}"]`);
    if(s) s.textContent = fmtMoney((Number(it.cantidad) || 0) * parseNum(it.precio_txt), 'USD');
  });
}

function vAbrirClientes(){ abrirBuscadorClientes('vsel-cliente'); }

async function vBuscarTc(){
  const hint = $('#vtc-hint'), btn = document.querySelector('[data-act="vtc-bna"]');
  const poner = (venta, fecha, fuente, msg) => {
    VE.d.tc_txt = fmtNumInput(venta); VE.d.tc_fuente = fuente; VE.d.tc_fecha = fecha; VE.dirty = true;
    const inp = document.querySelector('[data-vf="tc_txt"]'); if(inp) inp.value = VE.d.tc_txt;
    if(hint) hint.textContent = msg;
    vRecalc();
  };
  if(navigator.onLine){
    if(btn) btn.disabled = true;
    if(hint) hint.textContent = 'Consultando el TC BNA del día anterior…';
    try{
      const { data, error } = await sb.rpc('tc_bna_anterior', { p_fecha: hoyIso() });
      if(error) throw error;
      const fila = Array.isArray(data) ? data[0] : data;
      const venta = fila ? Number(fila.venta) : NaN;
      if(!venta || !isFinite(venta)) throw new Error('sin valor');
      await DB.put('kv', { venta, fecha: fila.fecha, para: hoyIso() }, 'tcBna');
      if(btn) btn.disabled = false;
      return poner(venta, fila.fecha, 'BNA venta', `TC BNA venta del ${fmtDate(fila.fecha)} · podés cambiarlo si preferís otro valor`);
    } catch(e){
      console.warn('TC BNA', e);
      if(btn) btn.disabled = false;
    }
  }
  const g = await tcGuardado();
  if(g) return poner(g.venta, g.fecha, 'BNA venta', `Sin conexión: usé el último TC guardado (BNA venta del ${fmtDate(g.fecha)}). Revisalo antes de guardar.`);
  if(hint) hint.textContent = 'No hay un TC BNA disponible: cargalo a mano.';
}

async function guardarVEditor(){
  if(!navigator.onLine) return toast('Sin conexión. Esta cotización necesita internet para guardarse.', 'err');
  const d = VE.d;
  const items = VE.items.filter(it => it.modelo && Number(it.cantidad) > 0);
  if(!items.length){ toast('Agregá al menos un equipo con modelo y cantidad', 'err'); return; }
  if(!(parseNum(d.tc_txt) > 0)){ toast('Cargá el tipo de cambio', 'err'); return; }
  if(!d.cliente_id && !d.empresa_nombre.trim()){ toast('Elegí un cliente o escribí el nombre de la empresa', 'err'); return; }
  const fe = dmyAIso(d.fecha_emision);
  if(!fe){ toast('La fecha de emisión debe ser DD/MM/AAAA', 'err'); return; }
  const base = VE.rec || { key: 'loc:' + uuid(), id: null, numero: null, estado: 'vigente', created_at: new Date().toISOString() };
  if(!base.id && !base.creado_por) base.creado_por = `${nombreUsuario()} · app ${uuid().slice(0, 8)}`;
  const rec = {
    ...base,
    cliente_id: d.cliente_id || null,
    clientes: d.cliente_id ? { razon_social: d.cliente_nombre } : null,
    empresa_nombre: d.cliente_id ? null : (d.empresa_nombre.trim() || null),
    contacto_nombre: d.contacto_nombre.trim() || null, contacto_email: d.contacto_email.trim() || null, contacto_telefono: d.contacto_telefono.trim() || null,
    fecha_emision: fe, validez_dias: parseInt(d.validez_dias, 10) || 7,
    iva_pct: IVA_MAQUINAS, tipo_cambio: parseNum(d.tc_txt), tipo_cambio_fuente: d.tc_fuente || 'Manual', tipo_cambio_fecha: d.tc_fecha || null,
    plan: Number(d.plan), tasa_anual: d.tasa_txt === '' ? TASA_ANUAL_DEFECTO : parseNum(d.tasa_txt),
    anticipo_tipo: d.anticipo_tipo, anticipo_valor: parseNum(d.anticipo_txt) || 0,
    notas: d.notas.trim() || null,
    haulotte_venta_items: items.map((it, i) => ({ modelo: it.modelo.trim(), descripcion: (it.descripcion || '').trim() || null, cantidad: Number(it.cantidad), precio_neto: parseNum(it.precio_txt), orden: i })),
    _pending: true, _op: base.id ? 'update' : 'create', _error: null,
  };
  await DB.put('ventas', rec);
  await cargarVentasLocal();
  VE = null;
  irVDetalle(rec.key);
  toast(navigator.onLine ? 'Guardado' : 'Guardado en el teléfono. Se sube cuando haya conexión.', 'ok');
  sincronizar({ silent: true });
}

function vAbrirAnular(v){
  abrirHoja('Anular cotización', `<div style="padding:0 8px">
    <p class="dim" style="margin:0 0 12px;font-size:14px"><b style="color:var(--text)">${esc(numeroTexto(v))}</b> — ${esc(vClienteNombre(v))}<br>El número no se borra: queda en el historial como anulada.</p>
    <div class="field"><label>Motivo (opcional)</label><textarea class="in" id="vanu-motivo" rows="3" placeholder="Ej: el cliente eligió otro proveedor"></textarea></div>
    <button class="btn danger block" data-act="vconfirmar-anular">${ic('ban')}Anular cotización</button></div>`);
}

// ---------- PDF ----------
async function vFotos(items){
  const fotos = {};
  await Promise.all([...new Set(items.map(it => it.modelo).filter(Boolean))].map(async m => {
    const u = fotoUrlDeModelo(m);
    if(!u) return;
    try{ fotos[m] = await fotoComoDataUrl(u); } catch(e){ console.warn('Foto no disponible para el PDF:', m, e); }
  }));
  return fotos;
}
async function vArmarCot(r){
  const items = vItemsOrdenados(r);
  const fotos = await vFotos(items);
  const cli = r.clientes || (r.cliente_id ? S.clientes.find(c => c.id === r.cliente_id) : null);
  return {
    numero: r.numero, fecha_emision: r.fecha_emision, validez_dias: r.validez_dias, cliente: cli, empresa_nombre: r.empresa_nombre,
    contacto_nombre: r.contacto_nombre, contacto_email: r.contacto_email, contacto_telefono: r.contacto_telefono,
    items: items.map(i => ({ modelo: i.modelo, descripcion: i.descripcion, cantidad: i.cantidad, precio_neto: i.precio_neto, foto: fotos[i.modelo] || null })),
    iva_pct: r.iva_pct, tc: r.tipo_cambio, tc_fecha: r.tipo_cambio_fecha,
    anticipo_tipo: r.anticipo_tipo, anticipo_valor: r.anticipo_valor, plan: r.plan, tasa_anual: r.tasa_anual, notas: r.notas,
  };
}
async function vGenerarPdf(modo){
  const v = vActual();
  if(!v) return;
  if(!v.numero){ toast('Esta cotización todavía no tiene número. Se lo asigna el sistema al subirla: conectate a internet y probá de nuevo.', 'err'); return; }
  const cerrar = busy('Generando PDF…');
  try{
    await new Promise(r => setTimeout(r, 40));
    const { doc, fileName } = generarCotizacionVentaPDF(await vArmarCot(v));
    if(modo === 'ver'){
      // El visor de PDF de la app espera un objeto con número y cliente
      await abrirVisorPdf(doc, fileName, { numero: v.numero, clientes: { razon_social: vClienteNombre(v) } });
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

// ---------- Acciones (las deriva app.js cuando no son suyas) ----------
async function accionVenta(act, el){
  const i = el && el.dataset.i !== undefined ? Number(el.dataset.i) : null;
  switch(act){
    case 'ir-home': return irHome();
    case 'ir-alquiler': return irLista();
    case 'ir-venta': return irVLista();
    case 'vfiltro': VV.filtro = el.dataset.v; return refrescarVenta();
    case 'vabrir': return irVDetalle(el.dataset.key);
    case 'vnuevo': VE = await nuevoVE(); V.view = 'veditor'; render(); window.scrollTo(0, 0); return;
    case 'veditar': { const v = vActual(); if(!v) return; VE = veDesde(v); V.view = 'veditor'; render(); window.scrollTo(0, 0); return; }
    case 'vguardar': return guardarVEditor();
    case 'vver-pdf': return vGenerarPdf('ver');
    case 'vpdf': return vGenerarPdf('compartir');
    case 'vanular': { const v = vActual(); if(v) vAbrirAnular(v); return; }
    case 'vconfirmar-anular': {
      const v = vActual(); if(!v) return;
      v._anular = { motivo: ($('#vanu-motivo') || {}).value || '' };
      await DB.put('ventas', v);
      cerrarOverlay(); await cargarVentasLocal(); render();
      if(!navigator.onLine) toast('Anulación guardada. Se enviará cuando haya conexión.', 'ok');
      return sincronizar({ silent: true });
    }
    case 'vdescartar': {
      const v = vActual(); if(!v || v.id) return;
      const ok = await confirmar({ titulo: 'Descartar borrador', texto: 'Esta cotización nunca se subió, así que no tiene número. Se elimina del teléfono.', ok: 'Descartar', peligro: true });
      if(!ok) return;
      await DB.del('ventas', v.key); await cargarVentasLocal(); return irVLista();
    }
    // --- editor
    case 'vpick-cliente': return vAbrirClientes();
    case 'vclear-cliente': VE.d.cliente_id = null; VE.d.cliente_nombre = ''; VE.dirty = true; return render();
    case 'vsel-cliente': {
      const c = S.clientes.find(x => x.id === Number(el.dataset.id));
      if(!c) return;
      VE.d.cliente_id = c.id; VE.d.cliente_nombre = c.razon_social; VE.d.empresa_nombre = '';
      VE.dirty = true; cerrarOverlay(); return render();
    }
    case 'vadd-item': return abrirModelos(m => { VE.items.push({ modelo: m, descripcion: '', cantidad: 1, precio_txt: '' }); VE.dirty = true; render(); });
    case 'vcambiar-modelo': return abrirModelos(m => { VE.items[i].modelo = m; VE.dirty = true; render(); });
    case 'vquitar-item': VE.items.splice(i, 1); if(!VE.items.length) VE.items.push({ modelo: '', descripcion: '', cantidad: 1, precio_txt: '' }); VE.dirty = true; return render();
    case 'vqty-': case 'vqty+': {
      const it = VE.items[i];
      it.cantidad = Math.max(1, (Number(it.cantidad) || 1) + (act === 'vqty+' ? 1 : -1));
      const inp = document.querySelector(`input[data-vk="cantidad"][data-i="${i}"]`); if(inp) inp.value = it.cantidad;
      VE.dirty = true; return vRecalc();
    }
    case 'vplan': VE.d.plan = Number(el.dataset.v); VE.dirty = true; return render();
    case 'vant-tipo': VE.d.anticipo_tipo = el.dataset.v; VE.dirty = true; return render();
    case 'vtc-bna': return vBuscarTc();
    default: return accionRepuestos(act, el);
  }
}

// ---------- Eventos del editor y de la lista ----------
document.addEventListener('input', e => {
  const t = e.target;
  if(t.id === 'vq'){ VV.q = t.value; const c = $('#vcards'); if(c) c.innerHTML = vCardsHtml(); return; }
  if(!VE) return;
  if(t.dataset.mask === 'date') maskDate(t);
  if(t.dataset.vf){
    VE.d[t.dataset.vf] = t.value; VE.dirty = true;
    if(t.dataset.vf === 'tc_txt'){ VE.d.tc_fuente = 'Manual'; VE.d.tc_fecha = null; const h = $('#vtc-hint'); if(h) h.textContent = vTcHint(); }
    return vRecalc();
  }
  if(t.dataset.vk){
    const it = VE.items[Number(t.dataset.i)]; if(!it) return;
    if(t.dataset.vk === 'cantidad') it.cantidad = Math.max(0, parseInt(String(t.value).replace(/\D/g, ''), 10) || 0);
    else if(t.dataset.vk === 'precio') it.precio_txt = t.value;
    else if(t.dataset.vk === 'descripcion') it.descripcion = t.value;
    VE.dirty = true; vRecalc();
  }
});
// Al salir de un campo numérico se le da formato (1.560,00)
document.addEventListener('focusout', e => {
  const t = e.target;
  if(!VE) return;
  const dar = v => { const n = parseNum(v); return n ? fmtNumInput(n) : ''; };
  if(t.dataset.vk === 'precio'){ const it = VE.items[Number(t.dataset.i)]; if(it){ it.precio_txt = dar(t.value); t.value = it.precio_txt; vRecalc(); } }
  if(t.dataset.vf === 'tasa_txt'){ VE.d.tasa_txt = t.value.trim() === '' ? '' : fmtTasa(parseNum(t.value)); t.value = VE.d.tasa_txt; vRecalc(); }
  if(t.dataset.vf === 'tc_txt' || t.dataset.vf === 'anticipo_txt'){ VE.d[t.dataset.vf] = dar(t.value); t.value = VE.d[t.dataset.vf]; vRecalc(); }
});
