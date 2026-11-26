/**
 * api.js - Cliente del backend GAS con caché "stale-while-revalidate".
 *
 *  - leer():    si hay datos guardados los entrega al instante (onCache) y
 *               en paralelo pide los frescos. Sin red, devuelve lo guardado.
 *  - escribir(): POST de mutación + invalidación de las lecturas afectadas.
 *  - Las peticiones idénticas en vuelo se comparten (sin duplicados).
 *  - Contrato: POST con Content-Type text/plain (evita preflight CORS).
 */
import { GAS_URL } from './config.js';

const PREFIJO = 'inv:cache:';
const FRESCO_MS = 8 * 1000;       // dentro de este margen no se vuelve a pedir (8 s)
const CADUCA_MS = 12 * 60 * 60 * 1000; // pasado esto el dato guardado se descarta
const TIMEOUT_MS = 30 * 1000;

const memoria = new Map();
const enVuelo = new Map();
let _temporizadorSincronia = null;

const clave = (b) => {
  const { action, ...resto } = b;
  const ordenado = Object.keys(resto).sort().map(k => `${k}=${resto[k]}`).join('&');
  return `${action}|${ordenado}`;
};

function leerCache(k) {
  const m = memoria.get(k);
  if (m) return m;
  try {
    const raw = localStorage.getItem(PREFIJO + k);
    if (!raw) return null;
    const reg = JSON.parse(raw);
    if (Date.now() - reg.t > CADUCA_MS) { localStorage.removeItem(PREFIJO + k); return null; }
    memoria.set(k, reg);
    return reg;
  } catch (_) { return null; }
}

function guardarCache(k, data) {
  const reg = { t: Date.now(), data };
  memoria.set(k, reg);
  try { localStorage.setItem(PREFIJO + k, JSON.stringify(reg)); } catch (_) { /* cuota llena: queda en memoria */ }
}

export async function post(body, timeout = TIMEOUT_MS) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('El servidor tardó demasiado en responder');
    throw e;
  } finally { clearTimeout(timer); }
}

function pedir(k, body) {
  if (enVuelo.has(k)) return enVuelo.get(k);
  const p = post(body).then(d => {
    if (!d.success) throw new Error(d.error || 'Error del servidor');
    guardarCache(k, d);
    return d;
  }).finally(() => enVuelo.delete(k));
  enVuelo.set(k, p);
  return p;
}

/**
 * @param {Object} body   { action, ...params }
 * @param {Object} opts   { onCache(data), forzar:boolean }
 * @returns {Promise<Object>} respuesta del servidor (fresca o, sin red, la guardada)
 */
export async function leer(body, { onCache, forzar = false } = {}) {
  const k = clave(body);
  const c = leerCache(k);
  if (c && onCache) onCache(c.data);
  if (c && !forzar && Date.now() - c.t < FRESCO_MS) return c.data;
  try {
    return await pedir(k, body);
  } catch (e) {
    if (c) return c.data;   // offline / error: se usa lo último conocido
    throw e;
  }
}

/** Lanza la lectura en segundo plano para calentar la caché (errores ignorados). */
export function precargar(body) { leer(body).catch(() => {}); }

/** Mutación. `invalidar`: acciones de lectura cuya caché debe descartarse. */
export async function escribir(body, invalidar = []) {
  const d = await post(body);
  if (!d.success) throw new Error(d.error || 'Error del servidor');
  invalidarAcciones(invalidar);
  return d;
}

export function invalidarAcciones(acciones) {
  const pref = acciones.map(a => a + '|');
  const borrar = (k) => pref.some(p => k.startsWith(p));
  [...memoria.keys()].filter(borrar).forEach(k => memoria.delete(k));
  try {
    Object.keys(localStorage).filter(k => k.startsWith(PREFIJO) && borrar(k.slice(PREFIJO.length)))
      .forEach(k => localStorage.removeItem(k));
  } catch (_) {}
}

/** Al cerrar sesión: no dejar datos de la empresa en el navegador. */
export function limpiarCache() {
  memoria.clear();
  try { Object.keys(localStorage).filter(k => k.startsWith(PREFIJO)).forEach(k => localStorage.removeItem(k)); } catch (_) {}
}

/** Despierta la instancia de Apps Script mientras el usuario escribe sus credenciales. */
export function calentarBackend() {
  try { fetch(GAS_URL, { method: 'GET', mode: 'no-cors', cache: 'no-store' }).catch(() => {}); } catch (_) {}
}

/* ---- Lecturas con nombre (única fuente de las acciones del backend) ---- */
export const Q = {
  empresas:     ()      => ({ action: 'listar_empresas' }),
  divisiones:   (idEmp) => ({ action: 'obtener_divisiones', id_empresa: idEmp }),
  inventario:   (idEmp) => ({ action: 'obtener_inventario', id_empresa: idEmp, id_division: '' }),
  invAdmin:     (idEmp) => ({ action: 'obtener_inventario_admin', id_empresa: idEmp, id_division: '' }),
  usuarios:     (idEmp) => ({ action: 'listar_usuarios', id_empresa: idEmp }),
  comentarios:  (idEmp) => ({ action: 'obtener_comentarios_todos', id_empresa: idEmp }),
  comentariosItem: (idItem) => ({ action: 'obtener_comentarios', id_item: idItem })
};

/** Devuelve lo guardado para una consulta (o null) sin tocar la red. */
export function enCache(body) { const c = leerCache(clave(body)); return c ? c.data : null; }

/** Lecturas en paralelo (una sola espera en lugar de una tras otra). */
export async function leerVarios(bodies, { onCache, forzar = false } = {}) {
  if (onCache) {
    const cs = bodies.map(enCache);
    if (cs.every(Boolean)) onCache(cs);
  }
  return Promise.all(bodies.map(b => leer(b, { forzar })));
}

/* ============================ Sincronización automática ============================ */

/** Acciones de lectura que se revalidan periódicamente para que los ítems de un
 *  compañero aparezcan sin tener que recargar la página. */
const ACCIONES_LECTURA = [
  'listar_empresas',
  'obtener_divisiones',
  'obtener_inventario',
  'obtener_inventario_admin',
  'listar_usuarios',
  'obtener_comentarios_todos'
];

/** Invalida la caché de lectura cada `intervaloMs` si la pestaña está visible
 *  y avisa mediante evento `sincronia-datos-nuevos` para que las vistas se refresquen. */
export function iniciarSincroniaAutomatica(intervaloMs = 1000) {
  detenerSincroniaAutomatica();
  _temporizadorSincronia = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    invalidarAcciones(ACCIONES_LECTURA);
    window.dispatchEvent(new Event('sincronia-datos-nuevos'));
  }, intervaloMs);
}

export function detenerSincroniaAutomatica() {
  if (_temporizadorSincronia) {
    clearInterval(_temporizadorSincronia);
    _temporizadorSincronia = null;
  }
}
