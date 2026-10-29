'use strict';
// =====================================================================
// Conexión con Supabase + sincronización (subir lo hecho sin señal, bajar lo nuevo)
// =====================================================================
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'apex-cotizador-auth' },
});

// Estado global compartido con app.js
const S = {
  perfil: null,
  sucursales: [],
  stock: null,
  stockIdx: null,
  clientes: [],
  presupuestos: [],
  online: navigator.onLine,
  syncing: false,
  syncAgain: false,
  lastSync: null,
  lastError: null,
  onChange: () => {},     // app.js lo reemplaza para redibujar
  onNeedLogin: () => {},
  onSynced: () => {},
  detailKey: null,
};

function esErrorDeRed(err){
  if(navigator.onLine === false) return true;
  if(!err) return false;
  const m = String(err.message || err);
  return (!err.code && !err.status && /fetch|network|load failed|timeout|abort|failed to/i.test(m));
}
function esErrorDeSesion(err){
  if(!err) return false;
  const m = String(err.message || '');
  return err.status === 401 || /jwt|token.*expired|not authenticated/i.test(m) || err.code === 'PGRST301';
}

// ---------- Permisos (misma lógica que APEX web) ----------
function puede(seccion, accion){
  const p = S.perfil;
  if(!p) return false;
  if(p.rol === 'maestro') return true;
  accion = accion || 'ver';
  return !!(p.permisos && p.permisos[seccion] && p.permisos[seccion][accion]);
}

// ---------- Utilidades de fecha (siempre DD/MM/AAAA) ----------
function hoyIso(){ return new Date().toLocaleDateString('en-CA', { timeZone:'America/Argentina/Buenos_Aires' }); }
function isoADmy(iso){ const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso||'')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; }
function dmyAIso(s){
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s||'').trim());
  if(!m) return null;
  const d = +m[1], mo = +m[2], y = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if(dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}
function uuid(){
  if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c === 'x' ? r : (r&3|8)).toString(16); });
}

// ---------- Totales ----------
function totalPresupuesto(p){
  const items = p.presupuesto_items || [];
  const totalItems = items.reduce((acc, it) => acc + (Number(it.cantidad)||0) * (Number(it.precio_unitario)||0), 0);
  return totalItems + (p.flete_incluir ? (Number(p.flete_monto)||0) : 0);
}
function esVencido(p){
  if(p.estado !== 'vigente' || !p.fecha_emision) return false;
  const [y,m,d] = String(p.fecha_emision).slice(0,10).split('-').map(Number);
  const lim = Date.UTC(y, m-1, d) + (Number(p.validez_dias)||7) * 86400000;
  const [hy,hm,hd] = hoyIso().split('-').map(Number);
  return Date.UTC(hy, hm-1, hd) > lim;
}
function estadoVista(p){
  if(p.estado === 'anulado' || p._anular) return 'anulado';
  if(p._pending && !p.id) return 'borrador';
  if(esVencido(p)) return 'vencido';
  return p.estado || 'vigente';
}
function numeroTexto(p){ return p.numero ? `N° ${String(p.numero).padStart(5,'0')}` : 'Borrador'; }

// ---------- Carga inicial desde el teléfono ----------
async function cargarLocal(){
  S.perfil = (await DB.get('kv', 'perfil')) || null;
  S.sucursales = (await DB.get('kv', 'sucursales')) || [];
  catalogoTecnicoCache = (await DB.get('kv', 'catalogo')) || [];
  S.lastSync = (await DB.get('kv', 'lastSync')) || null;
  S.clientes = await DB.all('clientes');
  S.stock = (await DB.get('kv', 'stock')) || null; S.stockIdx = null;
  await cargarPresupuestosLocal();
}
async function cargarPresupuestosLocal(){
  const all = await DB.all('presupuestos');
  all.sort((a, b) => {
    const la = !a.id ? 1 : 0, lb = !b.id ? 1 : 0;
    if(la !== lb) return lb - la;                                   // borradores sin número arriba
    if(!a.id && !b.id) return String(b.created_at).localeCompare(String(a.created_at));
    return (b.numero||0) - (a.numero||0);
  });
  S.presupuestos = all;
}
function pendientes(){ return S.presupuestos.filter(p => p._pending || p._anular); }

// ---------- Bajar datos del servidor ----------
async function fetchTodo(fabrica){
  const out = [];
  for(let from = 0; ; from += 1000){
    const { data, error } = await fabrica().range(from, from + 999);
    if(error) throw error;
    out.push(...data);
    if(data.length < 1000) break;
  }
  return out;
}

async function refrescarPerfil(){
  if(!S.perfil) return;
  const { data, error } = await sb.from('perfiles').select('*').eq('id', S.perfil.id).single();
  if(error) throw error;
  if(!data.activo){ await cerrarSesion(true); throw new Error('Tu usuario está inactivo'); }
  S.perfil = data;
  await DB.put('kv', data, 'perfil');
}
async function bajarSucursales(){
  const { data, error } = await sb.from('sucursales').select('*').order('id');
  if(error) throw error;
  S.sucursales = data;
  await DB.put('kv', data, 'sucursales');
}
async function bajarCatalogo(){
  const { data, error } = await sb.from('catalogo_modelos').select('*');
  if(error){ if(error.code === '42501') return; throw error; }
  catalogoTecnicoCache = data;
  await DB.put('kv', data, 'catalogo');
}
async function bajarClientes(completo){
  const COLS = 'id,numero_cliente,razon_social,cuit,direccion,telefono,mail_envio_factura,activo,updated_at';
  const ultimoFull = (await DB.get('kv', 'clientesFull')) || 0;
  const hacerCompleto = completo || S.clientes.length === 0 || (Date.now() - ultimoFull) > 7 * 86400000;
  let maxUpd = hacerCompleto ? null : (await DB.get('kv', 'clientesMaxUpd'));
  let rows;
  try{
    rows = await fetchTodo(() => {
      let q = sb.from('clientes').select(COLS).order('id');
      if(maxUpd) q = q.gt('updated_at', maxUpd);
      return q;
    });
  } catch(e){ if(e && e.code === '42501') return; throw e; }
  if(hacerCompleto){
    await DB.clear('clientes');
    await DB.put('kv', Date.now(), 'clientesFull');
  }
  if(rows.length) await DB.putMany('clientes', rows);
  const nuevoMax = rows.reduce((m, r) => (r.updated_at && r.updated_at > m ? r.updated_at : m), maxUpd || '');
  if(nuevoMax) await DB.put('kv', nuevoMax, 'clientesMaxUpd');
  S.clientes = await DB.all('clientes');
}
// ---------- Stock por modelo y sucursal (misma lógica que la Pizarra de Flota de APEX) ----------
// Se guarda una foto en el teléfono: sin señal se usa la última, con la hora a la vista.
async function bajarStock(){
  let equipos, contratos, reservas;
  try{
    equipos = await fetchTodo(() => sb.from('equipos').select('id,modelo,sucursal_id,estado').order('id'));
    const rc = await sb.rpc('pizarra_contratos_activos');
    if(rc.error) throw rc.error;
    contratos = (rc.data || []).map(c => ({ equipo_id: c.equipo_id, es_demo: !!c.es_demo, fecha_vencimiento: c.fecha_vencimiento }));
    const rr = await sb.from('equipos_reservas').select('equipo_id,vence_el,estado').eq('estado', 'activa');
    reservas = rr.error ? [] : (rr.data || []).map(r => ({ equipo_id: r.equipo_id, vence_el: r.vence_el }));
  } catch(e){
    if(e && (e.code === '42501' || e.code === 'PGRST301')) return;        // sin permiso: la app sigue sin avisos de stock
    throw e;
  }
  const snap = { at: Date.now(), equipos: equipos.filter(e => e.estado !== 'baja'), contratos, reservas };
  await DB.put('kv', snap, 'stock');
  S.stock = snap; S.stockIdx = null;
}
function stockIndice(){
  if(S.stockIdx) return S.stockIdx;
  const idx = {};                                           // idx[modeloNormalizado][sucursal|'0'] = contadores
  const snap = S.stock;
  if(!snap){ S.stockIdx = idx; return idx; }
  const hoy = hoyIso();
  const porEquipo = {};
  snap.contratos.forEach(c => { (porEquipo[c.equipo_id] = porEquipo[c.equipo_id] || []).push(c); });
  const reservado = new Set(snap.reservas.filter(r => !r.vence_el || String(r.vence_el).slice(0, 10) >= hoy).map(r => r.equipo_id));
  snap.equipos.forEach(e => {
    const k = normalizarModelo(e.modelo);
    const s = String(e.sucursal_id || 0);
    const o = ((idx[k] = idx[k] || {})[s] = idx[k][s] || { disp: 0, res: 0, pdi: 0, vor: 0, alq: 0, demo: 0, libera: null });
    const act = porEquipo[e.id];
    if(act && act.length){
      if(act.some(c => !c.es_demo)) o.alq++; else o.demo++;
      act.forEach(c => { const f = c.fecha_vencimiento && String(c.fecha_vencimiento).slice(0, 10); if(f && (!o.libera || f < o.libera)) o.libera = f; });
    } else if(e.estado === 'vor') o.vor++;
    else if(e.estado === 'pdi') o.pdi++;
    else if(e.estado === 'demo') o.demo++;
    else { o.disp++; if(reservado.has(e.id)) o.res++; }
  });
  S.stockIdx = idx;
  return idx;
}
// Resumen de un modelo para una sucursal. null si todavía no hay datos de stock.
function stockModelo(modelo, sucId){
  if(!S.stock) return null;
  const por = stockIndice()[normalizarModelo(modelo)] || {};
  const vacio = () => ({ disp: 0, res: 0, pdi: 0, vor: 0, alq: 0, demo: 0, libera: null });
  const aqui = por[String(sucId || 0)] || vacio();
  const sinSuc = sucId ? (por['0'] || vacio()) : vacio();
  const libres = Math.max(0, aqui.disp - aqui.res) + Math.max(0, sinSuc.disp - sinSuc.res);
  const otras = [];
  Object.keys(por).forEach(s => {
    if(s === String(sucId || 0) || s === '0') return;
    const n = Math.max(0, por[s].disp - por[s].res);
    if(n) { const suc = S.sucursales.find(x => String(x.id) === s); otras.push({ nombre: suc ? suc.nombre : 'Otra sucursal', n }); }
  });
  let tipo = 'ninguno';
  if(libres > 0) tipo = 'libre';
  else if(aqui.disp + sinSuc.disp > 0) tipo = 'reservada';
  else if(aqui.pdi > 0) tipo = 'pdi';
  else if(aqui.alq + aqui.demo > 0) tipo = 'alquilada';
  else if(aqui.vor > 0) tipo = 'vor';
  const total = Object.values(por).reduce((a, o) => a + o.disp + o.pdi + o.vor + o.alq + o.demo, 0);
  return { tipo, total, libres, libresAqui: Math.max(0, aqui.disp - aqui.res), disp: aqui.disp + sinSuc.disp, res: aqui.res + sinSuc.res, resAqui: aqui.res, sinSuc: Math.max(0, sinSuc.disp - sinSuc.res),
    pdi: aqui.pdi, vor: aqui.vor, alq: aqui.alq + aqui.demo, libera: aqui.libera, otras };
}

async function bajarPresupuestos(){
  let rows;
  try{
    rows = await fetchTodo(() => sb.from('presupuestos')
      .select('*, clientes(razon_social), sucursales(nombre), presupuesto_items(*)')
      .order('numero', { ascending:false }));
  } catch(e){ if(e && e.code === '42501') return; throw e; }
  const locales = await DB.all('presupuestos');
  const porKey = new Map(locales.map(l => [l.key, l]));
  const vistos = new Set();
  const nuevos = [];
  for(const r of rows){
    const key = 'srv:' + r.id;
    vistos.add(key);
    const loc = porKey.get(key);
    if(loc && (loc._pending || loc._anular)) continue;               // lo hecho sin señal manda hasta subirse
    r.presupuesto_items = (r.presupuesto_items || []).slice().sort((a,b) => (a.orden||0) - (b.orden||0));
    nuevos.push({ ...r, key });
  }
  if(nuevos.length) await DB.putMany('presupuestos', nuevos);
  for(const l of locales){
    if(l.key.startsWith('srv:') && !vistos.has(l.key) && !l._pending && !l._anular) await DB.del('presupuestos', l.key);
  }
  await cargarPresupuestosLocal();
}

// Fotos de los modelos: se guardan en el teléfono para que el PDF salga con fotos aun sin señal
let _prefetchEnCurso = false;
async function prefetchFotos(){
  if(_prefetchEnCurso || !navigator.onLine) return;
  _prefetchEnCurso = true;
  try{
    const urls = catalogoTecnicoCache.map(c => c.imagen_url).filter(Boolean);
    const guardadas = new Set(await DB.keys('fotos'));
    for(const k of guardadas){ if(!urls.includes(k)) await DB.del('fotos', k); }
    const faltan = urls.filter(u => !guardadas.has(u));
    let i = 0;
    const worker = async () => {
      while(i < faltan.length){
        const u = faltan[i++];
        try{ await fotoComoDataUrl(u); } catch(e){ console.warn('Foto no disponible', u, e); }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    S.onChange('fotos');
  } finally { _prefetchEnCurso = false; }
}

// ---------- Subir lo hecho sin señal ----------
const CAMPOS_CABECERA = ['cliente_id','empresa_nombre','contacto_nombre','contacto_email','contacto_telefono','sucursal_id',
  'fecha_emision','validez_dias','moneda','condicion_pago','forma_pago','notas','obra','fecha_entrega','horario_entrega',
  'persona_responsable','celular_responsable','facturar_a','facturar_cuit','facturar_domicilio','facturar_tel',
  'mail_factura_electronica','flete_incluir','flete_monto','ocultar_total'];

function payloadCabecera(r){
  const o = {};
  CAMPOS_CABECERA.forEach(k => { o[k] = r[k] === undefined ? null : r[k]; });
  return o;
}
function payloadItems(r, presupuestoId){
  return (r.presupuesto_items || []).map((it, i) => ({
    presupuesto_id: presupuestoId,
    modelo: it.modelo,
    categoria: it.categoria || null,
    descripcion: it.descripcion || it.modelo,
    cantidad: Number(it.cantidad),
    periodo: it.periodo,
    precio_unitario: Number(it.precio_unitario) || 0,
    orden: i,
  }));
}

async function subirUno(r){
  // 1) Crear la cabecera (el número correlativo lo asigna el servidor)
  if(r._op === 'create' && !r.id){
    let hdr = null;
    if(r._intento){
      // Si un intento anterior se cortó justo al responder, puede que ya exista: lo buscamos por su etiqueta única
      const { data, error } = await sb.from('presupuestos').select('*').eq('creado_por', r.creado_por).limit(1);
      if(error) throw error;
      hdr = data && data[0];
      if(hdr){   // el intento anterior sí había llegado: nos aseguramos de que quede con los datos más recientes
        const { error: eU } = await sb.from('presupuestos').update(payloadCabecera(r)).eq('id', hdr.id);
        if(eU) throw eU;
      }
    }
    if(!hdr){
      r._intento = true;
      await DB.put('presupuestos', r);
      const { data, error } = await sb.from('presupuestos').insert({ ...payloadCabecera(r), creado_por: r.creado_por }).select().single();
      if(error) throw error;
      hdr = data;
    }
    const viejaKey = r.key;
    r.id = hdr.id; r.numero = hdr.numero; r.estado = hdr.estado; r.created_at = hdr.created_at;
    r.key = 'srv:' + hdr.id;
    await DB.put('presupuestos', r);
    if(viejaKey !== r.key){
      await DB.del('presupuestos', viejaKey);
      if(S.detailKey === viejaKey) S.detailKey = r.key;
    }
  } else if(r._op === 'update' && r.id){
    const { error } = await sb.from('presupuestos').update(payloadCabecera(r)).eq('id', r.id);
    if(error) throw error;
  }
  // 2) Reemplazar los ítems (igual que hace APEX web al guardar)
  if(r._pending){
    const { error: eDel } = await sb.from('presupuesto_items').delete().eq('presupuesto_id', r.id);
    if(eDel) throw eDel;
    const items = payloadItems(r, r.id);
    if(items.length){
      const { error: eIns } = await sb.from('presupuesto_items').insert(items);
      if(eIns) throw eIns;
    }
    r._pending = false; r._op = null; r._error = null; r._intento = false;
    await DB.put('presupuestos', r);
  }
  // 3) Anulación hecha sin señal
  if(r._anular){
    const { error } = await sb.from('presupuestos').update({ estado:'anulado', motivo_anulacion: r._anular.motivo || null }).eq('id', r.id);
    if(error) throw error;
    r.estado = 'anulado'; r.motivo_anulacion = r._anular.motivo || null; r._anular = null; r._error = null;
    await DB.put('presupuestos', r);
  }
}

async function subirPendientes(){
  await cargarPresupuestosLocal();
  const cola = S.presupuestos.filter(p => p._pending || p._anular)
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const res = { ok: [], fallidos: [] };
  for(const r of cola){
    const etiqueta = r.numero ? numeroTexto(r) : 'borrador';
    try{
      await subirUno(r);
      res.ok.push(r);
    } catch(e){
      if(esErrorDeRed(e) || esErrorDeSesion(e)) throw e;            // se corta: se reintenta cuando haya señal
      console.error('Error subiendo', etiqueta, e);
      r._error = (e && e.message) || 'Error desconocido';
      await DB.put('presupuestos', r);
      res.fallidos.push(r);
    }
  }
  return res;
}

// ---------- Sincronización completa ----------
async function sincronizar(opts){
  opts = opts || {};
  if(S.syncing){ S.syncAgain = true; return; }
  if(!navigator.onLine){ S.online = false; S.onChange('estado'); return; }
  S.syncing = true; S.lastError = null; S.onChange('estado');
  let resultado = null;
  try{
    resultado = await subirPendientes();
    await bajarSucursales();
    await bajarCatalogo();
    await bajarPresupuestos();
    try{ await refrescarPerfil(); } catch(e){ if(!esErrorDeRed(e)) throw e; }
    await bajarClientes(!!opts.completo);
    try{ await bajarStock(); } catch(e){ if(esErrorDeRed(e) || esErrorDeSesion(e)) throw e; console.warn('Stock', e); }
    S.lastSync = Date.now();
    await DB.put('kv', S.lastSync, 'lastSync');
    S.online = true;
    prefetchFotos();
  } catch(e){
    if(esErrorDeSesion(e)){
      try{
        const { data, error } = await sb.auth.refreshSession();
        if(error || !data.session) S.onNeedLogin();
      } catch(_){ S.onNeedLogin(); }
    } else if(esErrorDeRed(e)){
      S.online = navigator.onLine;
    } else {
      console.error('Sync', e);
      S.lastError = (e && e.message) || String(e);
    }
  } finally {
    S.syncing = false;
    await cargarPresupuestosLocal();
    S.onChange('estado');
    S.onSynced(resultado, opts);
    if(S.syncAgain){ S.syncAgain = false; sincronizar({ silent:true }); }
  }
}

// ---------- Sesión ----------
async function iniciarSesion(email, password){
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if(error) throw new Error('Email o contraseña incorrectos');
  const { data: perfil, error: eP } = await sb.from('perfiles').select('*').eq('id', data.user.id).single();
  if(eP || !perfil || !perfil.activo){
    await sb.auth.signOut();
    throw new Error('Tu usuario no tiene un perfil activo en el sistema. Pedile al administrador que te dé de alta.');
  }
  // Si entra otra persona en este teléfono, se borran los datos de la anterior (nunca se mezclan)
  const anterior = await DB.get('kv', 'perfil');
  if(anterior && anterior.id !== perfil.id){
    await Promise.all(['clientes','presupuestos','fotos','kv'].map(s => DB.clear(s)));
  }
  S.perfil = perfil;
  await DB.put('kv', perfil, 'perfil');
  return perfil;
}
async function cerrarSesion(conservarDatos){
  try{ await sb.auth.signOut(); } catch(e){}
  if(!conservarDatos){
    await Promise.all(['clientes','presupuestos','fotos','kv'].map(s => DB.clear(s)));
    S.perfil = null; S.clientes = []; S.presupuestos = []; S.sucursales = []; S.stock = null; S.stockIdx = null; catalogoTecnicoCache = [];
  }
  S.onNeedLogin();
}
