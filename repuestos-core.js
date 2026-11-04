// =====================================================================
// PRESUPUESTO DE REPUESTOS HAULOTTE — cálculo + PDF (lo usan APEX web y la app Android)
// Precio de lista = costo ARG × (1 + margen). El PDF muestra el precio final con el descuento ya aplicado. No se cotiza IVA.
// =====================================================================
const MARGEN_REPUESTOS_DEFECTO = 60;   // % sobre costo
const IVA_REPUESTOS = 21;              // %
const rpR2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
const rpN2 = v => Number(v).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rpN0 = v => Number(v).toLocaleString('es-AR', { maximumFractionDigits: 0 });
const rpNum = v => { const n = Number(v); return isFinite(n) ? n : 0; };

// o: { items:[{codigo, descripcion, cantidad, costo}], margen_pct, descuento_pct, envio_usd, tc }
// Lista = costo × (1 + margen). El cliente ve el precio FINAL: lista × (1 − descuento). No se cotiza IVA.
function calcularRepuestos(o){
  const margen = o.margen_pct === '' || o.margen_pct == null ? MARGEN_REPUESTOS_DEFECTO : Math.max(rpNum(o.margen_pct), 0);
  const descPct = Math.min(Math.max(rpNum(o.descuento_pct), 0), 99.99);
  const items = (o.items || []).filter(i => rpNum(i.cantidad) > 0).map(i => {
    const lista = rpR2(rpNum(i.costo) * (1 + margen / 100));
    const unit = rpR2(lista * (1 - descPct / 100));
    return { ...i, lista, unit, sub: rpR2(unit * rpNum(i.cantidad)) };
  });
  const subtotal = rpR2(items.reduce((a, i) => a + i.sub, 0));
  const bruto = rpR2(items.reduce((a, i) => a + i.lista * rpNum(i.cantidad), 0));
  const descuento = rpR2(bruto - subtotal);                       // solo para uso interno (el PDF no lo muestra)
  const envio = rpR2(Math.max(rpNum(o.envio_usd), 0));
  const neto = rpR2(subtotal + envio);
  const total = neto;
  const tc = rpNum(o.tc);
  return { items, margen, bruto, descPct, descuento, subtotal, envio, neto, ivaPct: 0, iva: 0, total, tc, totalArs: Math.round(total * tc) };
}
// Desde un presupuesto ya guardado (precio_unitario = lista): margen 0 sobre esos precios, con el descuento guardado
function calcularRepuestosGuardado(p, items){
  return calcularRepuestos({
    items: (items || []).map(i => ({ cantidad: i.cantidad, costo: i.precio_unitario })),
    margen_pct: 0, descuento_pct: p.descuento_pct, envio_usd: p.envio_usd, tc: p.tipo_cambio,
  });
}
// Disponibilidad por renglón: "disp:N" (N unidades disponibles) o "dias:N" (demora en traerlo)
const DIAS_DEMORA_REPUESTOS = [5, 10, 15, 20, 25, 30, 60, 90];
function opcionesDisponibilidad(cantidad){
  const n = Math.min(Math.max(parseInt(cantidad, 10) || 0, 0), 100);
  const o = [];
  for(let i = 1; i <= n; i++) o.push({ v: 'disp:' + i, t: 'Disponible ' + i });
  DIAS_DEMORA_REPUESTOS.forEach(d => o.push({ v: 'dias:' + d, t: d + ' días' }));
  return o;
}
function textoDisponibilidad(v){
  const m = /^(disp|dias):(\d+)$/.exec(String(v || ''));
  if(!m) return '—';
  return m[1] === 'disp' ? (m[2] === '1' ? '1 disponible' : m[2] + ' disponibles') : m[2] + ' días';
}
// Si cambia la cantidad y la opción "Disponible N" ya no entra, se descarta
function disponibilidadValida(v, cantidad){
  const m = /^disp:(\d+)$/.exec(String(v || ''));
  return m && Number(m[1]) > Number(cantidad) ? null : (v || null);
}

// ---------- Fotos para el PDF de repuestos (miniaturas) ----------
// La foto de cada artículo sale de haulotte_repuestos_gp.imagen_url. Se reduce a miniatura y se guarda en el teléfono (clave "rep:CODIGO") para verla sin señal.
const rFotoMem = {};
async function rMiniaturaDeUrl(url){
  try{
    const resp = await fetch(url); if(!resp.ok) return null;
    const blob = await resp.blob();
    const data0 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = data0; });
    const MAX = 220, esc = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * esc)), h = Math.max(1, Math.round(img.naturalHeight * esc));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(img, 0, 0, w, h);
    return { data: cv.toDataURL('image/jpeg', 0.72), w, h };
  } catch(e){ console.warn('Foto no disponible', e); return null; }
}
async function rPrecargarFotos(items){
  try{
    const codigos = [...new Set(items.map(i => i.codigo).filter(Boolean))];
    const faltan = [];
    for(const c of codigos){
      if(c in rFotoMem) continue;
      const g = (typeof fotoCacheGet === 'function') ? await fotoCacheGet('rep:' + c) : null;
      if(g){ rFotoMem[c] = g; } else faltan.push(c);
    }
    if(faltan.length && navigator.onLine){
      for(let i = 0; i < faltan.length; i += 100){
        const lote = faltan.slice(i, i + 100);
        const { data } = await sb.from('haulotte_repuestos_gp').select('codigo,imagen_url').in('codigo', lote);
        const urls = {}; (data || []).forEach(r => { urls[r.codigo] = r.imagen_url; });
        await Promise.all(lote.map(async c => {
          const f = urls[c] ? await rMiniaturaDeUrl(urls[c]) : null;
          rFotoMem[c] = f;
          if(f && typeof fotoCachePut === 'function') fotoCachePut('rep:' + c, f);
        }));
      }
    }
  } catch(e){ console.warn('No se pudieron cargar las fotos del PDF:', e); }
  await rPrecargarModelos(items);
  items.forEach(i => { i.foto = rFotoMem[i.codigo] || null; i.modelos_uso = rModMem[i.codigo] || null; });
  return items;
}

// Modelos de uso ("Aplica a: …") — se guardan en el teléfono (clave "repmod:CODIGO") para verlos sin señal.
const rModMem = {};
async function rPrecargarModelos(items){
  try{
    const codigos = [...new Set(items.map(i => i.codigo).filter(Boolean))];
    const faltan = [];
    for(const c of codigos){
      if(c in rModMem) continue;
      if(navigator.onLine){ faltan.push(c); continue; }
      const g = (typeof fotoCacheGet === 'function') ? await fotoCacheGet('repmod:' + c) : null;
      rModMem[c] = g && Array.isArray(g.m) ? g.m : null;
    }
    for(let i = 0; i < faltan.length; i += 100){
      const lote = faltan.slice(i, i + 100);
      const { data, error } = await sb.from('haulotte_repuestos_gp').select('codigo,modelos_uso').in('codigo', lote);
      if(error) throw error;
      const m = {}; (data || []).forEach(r => { m[r.codigo] = Array.isArray(r.modelos_uso) ? r.modelos_uso : null; });
      lote.forEach(c => { rModMem[c] = m[c] || null; if(typeof fotoCachePut === 'function') fotoCachePut('repmod:' + c, { m: rModMem[c] }); });
    }
  } catch(e){ console.warn('No se pudieron cargar los modelos de uso:', e); }
}
function rModeloCorto(m){
  const t = String(m || '').trim().split(/\s+/);
  const i = t.findIndex(x => /\d/.test(x));
  return (i > 0 ? t.slice(i) : t).join(' ');
}
function rLeyendaAplica(doc, modelos, ancho){
  if(!Array.isArray(modelos) || !modelos.length) return [];
  const nombres = [...new Set(modelos.map(rModeloCorto).filter(Boolean))];
  if(!nombres.length) return [];
  doc.setFont('helvetica', 'italic'); doc.setFontSize(6.5);
  let ls = [];
  for(let k = Math.min(4, nombres.length); k >= 1; k--){
    const resto = nombres.length - k;
    ls = doc.splitTextToSize('Aplica a: ' + nombres.slice(0, k).join(', ') + (resto > 0 ? ' y ' + resto + ' más' : ''), ancho);
    if(ls.length <= 2) break;
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  return ls.slice(0, 2);
}

// cot: { numero, fecha_emision, validez_dias, cliente:{razon_social}, empresa_nombre, contacto_*, condicion_pago, notas,
//        items:[{codigo, descripcion, cantidad, precio_unitario}], descuento_pct, envio_usd, iva_pct, tc, tc_fecha }
function generarRepuestosPDF(cot){
  const calc = calcularRepuestos({
    items: cot.items.map(i => ({ ...i, costo: i.precio_unitario })), margen_pct: 0,
    descuento_pct: cot.descuento_pct, envio_usd: cot.envio_usd, tc: cot.tc,
  });
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 18, R = pageWidth - marginX;
  const ROJO = [226, 35, 41], NEGRO = [24, 24, 26];
  const bannerH = pageWidth / (2475 / 406);
  const LIM = 297 - bannerH - 9;
  const empresa = (cot.cliente && cot.cliente.razon_social) || cot.empresa_nombre || '—';
  const numero = cot.numero ? String(cot.numero).padStart(5, '0') : 'BORRADOR';
  const logoW = 56, logoH = logoW / (932 / 150);

  const encabezado = () => {
    let y = 15;
    try{ doc.addImage(LOGO_HAULOTTE_BASE64, 'PNG', marginX, y, logoW, logoH); } catch(e){ console.error(e); }
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
    doc.text(`PRESUPUESTO DE REPUESTOS N° ${numero}`, R, y + 5, { align: 'right' });
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(`Fecha de emisión: ${fmtDate(cot.fecha_emision)}`, R, y + 11, { align: 'right' });
    doc.text(`Válido por ${cot.validez_dias || 7} días`, R, y + 16, { align: 'right' });
    y += 24;
    doc.setDrawColor(...ROJO); doc.setLineWidth(0.9);
    doc.line(marginX, y, R, y);
    return y + 8;
  };
  const titulo = (txt, y) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(0); doc.text(txt, marginX, y); return y + 6; };
  const X = { foto: marginX + 1, cod: marginX + 19, desc: marginX + 42, cant: 114, pu: 134, sub: 156, disp: 175 };
  const FOTO_W = 16, FOTO_H = 12.5;
  const cabTabla = y => {
    doc.setFillColor(...NEGRO); doc.rect(marginX, y - 5, pageWidth - marginX * 2, 7, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
    doc.text('Foto', X.foto, y); doc.text('Código', X.cod, y); doc.text('Descripción', X.desc, y);
    doc.text('Cant.', X.cant, y, { align: 'right' }); doc.text('P. unit. U$D', X.pu, y, { align: 'right' }); doc.text('Subtotal U$D', X.sub, y, { align: 'right' }); doc.text('Disponibilidad', X.disp, y, { align: 'center' });
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
  y = titulo('REPUESTOS COTIZADOS', y) + 2;
  y = cabTabla(y);
  let z = 0;
  calc.items.forEach(it => {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    const ls = doc.splitTextToSize(it.descripcion || "", 46).slice(0, 4);
    const leyenda = rLeyendaAplica(doc, it.modelos_uso, 46);
    const h = Math.max(ls.length * 4 + (leyenda.length ? leyenda.length * 3.1 + 1 : 0) + 2.5, FOTO_H + 4);
    if(y + h > LIM){ doc.addPage(); y = encabezado(); y = cabTabla(y); z = 0; }
    if(z++ % 2 === 1){ doc.setFillColor(246, 247, 249); doc.rect(marginX, y - 4, pageWidth - marginX * 2, h, 'F'); }
    // Miniatura (si no hay foto, recuadro gris liviano para que la tabla no quede desalineada)
    if(it.foto && it.foto.data){
      const esc = Math.min(FOTO_W / it.foto.w, FOTO_H / it.foto.h), fw = it.foto.w * esc, fh = it.foto.h * esc;
      try{ doc.addImage(it.foto.data, 'JPEG', X.foto + (FOTO_W - fw) / 2, y - 3 + (FOTO_H - fh) / 2, fw, fh); } catch(e){ console.error(e); }
    } else {
      doc.setFillColor(238, 239, 241); doc.setDrawColor(222); doc.setLineWidth(0.15);
      doc.rect(X.foto, y - 3, FOTO_W, FOTO_H, 'FD');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5); doc.setTextColor(150);
      doc.text('sin foto', X.foto + FOTO_W / 2, y - 3 + FOTO_H / 2 + 1, { align: 'center' }); doc.setTextColor(0); doc.setFontSize(8.5);
    }
    doc.setFont('helvetica', 'bold'); doc.text(String(it.codigo || ''), X.cod, y);
    doc.setFont('helvetica', 'normal'); doc.text(ls, X.desc, y);
    if(leyenda.length){
      doc.setFont('helvetica', 'italic'); doc.setFontSize(6.5); doc.setTextColor(110);
      doc.text(leyenda, X.desc, y + ls.length * 4 + 0.2);
      doc.setTextColor(0); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    }
    doc.text(String(it.cantidad), X.cant, y, { align: 'right' });
    doc.text(rpN2(it.unit), X.pu, y, { align: 'right' });
    doc.text(rpN2(it.sub), X.sub, y, { align: 'right' });
    doc.text(textoDisponibilidad(it.disponibilidad), X.disp, y, { align: 'center' });
    y += h;
  });
  doc.setDrawColor(...NEGRO); doc.setLineWidth(0.4); doc.line(marginX, y - 2.5, R, y - 2.5);

  // ---------- Resumen ----------
  const filas = [['Subtotal', 'U$D ' + rpN2(calc.subtotal)]];
  if(calc.envio > 0) filas.push(['Envío', 'U$D ' + rpN2(calc.envio)]);
  filas.push(['TOTAL U$D', 'U$D ' + rpN2(calc.total), true]);
  if(calc.tc > 0){ filas.push(['Tipo de cambio de referencia', '$ ' + rpN2(calc.tc)]); filas.push(['TOTAL EN PESOS', '$ ' + rpN0(calc.totalArs), true]); }
  const altoBox = filas.length * 6.4 + 4;
  y += 4;
  if(y + altoBox + 6 > LIM){ doc.addPage(); y = encabezado(); }
  const bx = R - 92, bw = 92;
  doc.setFillColor(244, 245, 247); doc.setDrawColor(222); doc.setLineWidth(0.2);
  doc.roundedRect(bx, y - 4, bw, altoBox, 1.5, 1.5, 'FD');
  filas.forEach((f, i) => {
    const yy = y + i * 6.4 + 1;
    doc.setFont('helvetica', f[2] ? 'bold' : 'normal'); doc.setFontSize(f[2] ? 9.5 : 9); doc.setTextColor(f[2] ? 0 : 70);
    doc.text(f[0], bx + 4, yy);
    doc.setTextColor(0); doc.text(f[1], bx + bw - 4, yy, { align: 'right' });
  });
  y += altoBox + 8;

  // ---------- Condiciones ----------
  const notasLs = cot.notas ? doc.splitTextToSize(cot.notas, pageWidth - marginX * 2) : [];
  const fechaTc = cot.tc_fecha ? ` (${fmtDate(cot.tc_fecha)})` : '';
  const conds = [
    'Precios expresados en dólares estadounidenses. Los precios no incluyen ningún impuesto (IVA ni otros).',
    calc.tc > 0 ? `El pago se realiza en pesos, al tipo de cambio de referencia de $ ${rpN2(calc.tc)} por U$D${fechaTc}. Si al momento del pago existiera diferencia de cambio, se emitirá una nota de débito por dicha diferencia.` : null,
    cot.condicion_pago ? `Condición de pago: ${cot.condicion_pago}.` : null,
    calc.envio > 0 ? 'El costo de envío está incluido en el total.' : 'El envío no está incluido en esta cotización.',
    'La disponibilidad indicada en cada ítem corresponde al momento de la cotización; los plazos en días son estimados y se cuentan desde la confirmación del pedido.',
    `Validez de la oferta: ${cot.validez_dias || 7} días desde la fecha de emisión.`,
  ].filter(Boolean);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  const lsConds = conds.map(l => doc.splitTextToSize('• ' + l, pageWidth - marginX * 2));
  const altoConds = 8 + lsConds.reduce((a, l) => a + l.length * 4.6 + 0.8, 0) + (notasLs.length ? 8 + notasLs.length * 4.6 : 0);
  if(y + altoConds > LIM){ doc.addPage(); y = encabezado(); }
  y = titulo('CONDICIONES COMERCIALES', y);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
  lsConds.forEach(ls => { doc.text(ls, marginX, y); y += ls.length * 4.6 + 0.8; });
  if(notasLs.length){
    y += 3; doc.setFont('helvetica', 'bold'); doc.text('Notas:', marginX, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.text(notasLs, marginX, y);
  }

  const total = doc.internal.getNumberOfPages();
  for(let p = 1; p <= total; p++){
    doc.setPage(p);
    try{ doc.addImage(FOOTER_BANNER_BASE64, 'JPEG', 0, 297 - bannerH, pageWidth, bannerH); } catch(e){ console.error(e); }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(150);
    doc.text('Haulotte Argentina — Panamericana Km. 34.300 Colectora Oeste, Ramal Escobar, Grand Bourg, Buenos Aires', marginX, 297 - bannerH - 3);
    doc.text(`Página ${p} de ${total}`, R, 297 - bannerH - 3, { align: 'right' });
    doc.setTextColor(0);
  }
  return { doc, calc, fileName: `Presupuesto_Repuestos_${numero}_${empresa.replace(/[^a-zA-Z0-9]/g, '_')}.pdf` };
}
