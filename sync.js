/**
 * ============================================================================
 *  sync.js - Motor de Sincronización de Red (Offline-First)
 *  Gestiona los eventos online/offline y procesa la cola de IndexedDB
 *  al recuperar la conexión mediante un lote (SYNC_BATCH) a Google Apps Script.
 * ============================================================================
 */

import {
  obtenerColaPendiente,
  eliminarDeCola,
  eliminarDeColaPorUuid,
  actualizarIntentosEnCola
} from './db.js';

let GAS_URL = '';
let sincronizando = false;

/**
 * Define la URL del Web App de Google Apps Script.
 */
export function setGASURL(url) {
  GAS_URL = url;
}

/**
 * Devuelve true si el navegador reporta tener conexión.
 */
export function estaOnline() {
  return navigator.onLine === true;
}

/**
 * Inicializa los listeners de red y el motor de sincronización.
 * @param {Function} onEstadoCambio callback(recibe true=online, false=offline)
 */
export function initSync(onEstadoCambio) {
  window.addEventListener('online', () => {
    if (typeof onEstadoCambio === 'function') onEstadoCambio(true);
    sincronizarCola();
  });

  window.addEventListener('offline', () => {
    if (typeof onEstadoCambio === 'function') onEstadoCambio(false);
  });

  // Si carga con conexión, sincroniza lo pendiente (si lo hay)
  if (navigator.onLine) {
    sincronizarCola();
  }
}

/**
 * Envía un comentario directamente al backend (modo online).
 * @param {Object} comentario { id_item, id_empresa, id_usuario, comentario, ... }
 * @returns {Promise<Object>} respuesta JSON del servidor
 */
export function enviarComentarioDirecto(comentario) {
  return fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({
      action: 'agregar_comentario',
      ...comentario
    })
  }).then(async (r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });
}

/**
 * Lee la cola de IndexedDB y envía los comentarios pendientes en un lote
 * (action: 'SYNC_BATCH') a Google Apps Script. Tras confirmación HTTP 200,
 * elimina los registros enviados de la cola.
 * @returns {Promise<Object>} resumen de la sincronización
 */
// Tamaño de cada lote de sincronización (evita saturar la conexión y el servidor)
const BATCH_SIZE = 10;
// Máximo de reintentos por comentario antes de dejar de reintentarlo en este ciclo
const MAX_REINTENTOS = 5;
// Pausa breve entre lotes para no saturar el servidor ni el navegador
const PAUSA_ENTRE_LOTES_MS = 800;

function dormir(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sincronizarCola() {
  if (sincronizando) return { procesados: 0, mensaje: 'Ya hay una sincronización en curso' };
  if (!navigator.onLine) {
    return { procesados: 0, mensaje: 'Sin conexión: sincronización diferida' };
  }

  sincronizando = true;
  let totalProcesados = 0;
  let totalExitosos = 0;
  let totalFallidos = 0;

  try {
    let pendientes = await obtenerColaPendiente();

    // No reintentar indefinidamente los que ya fallaron muchas veces
    pendientes = pendientes.filter((p) => (p.intentos || 0) < MAX_REINTENTOS);

    if (!pendientes || pendientes.length === 0) {
      return { procesados: 0, exitosos: 0, fallidos: 0, mensaje: 'Cola vacía' };
    }

    // Dividir en lotes pequeños
    const lotes = [];
    for (let i = 0; i < pendientes.length; i += BATCH_SIZE) {
      lotes.push(pendientes.slice(i, i + BATCH_SIZE));
    }

    for (let li = 0; li < lotes.length; li++) {
      const lote = lotes[li];
      const comentarios = lote.map((p) => ({
        uuid: p.uuid,
        id_item: p.payload.id_item,
        id_empresa: p.payload.id_empresa,
        id_usuario: p.payload.id_usuario,
        comentario: p.payload.comentario,
        id_comentario: p.payload.id_comentario || p.uuid,
        fecha_hora: p.payload.fecha_hora || p.fecha_creacion || new Date().toISOString()
      }));

      const response = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'sync_batch',
          comentarios: comentarios
        })
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const resultado = await response.json();

      const exitososUuids = new Set();
      if (resultado.detalles && Array.isArray(resultado.detalles)) {
        const exitosos = resultado.detalles.filter((d) => d.status === 'ok');
        for (const det of exitosos) {
          exitososUuids.add(det.uuid);
          const pendiente = lote.find((p) => p.uuid === det.uuid);
          if (pendiente) {
            try {
              await eliminarDeCola(pendiente.id);
            } catch (_) {
              // No crítico: el registro ya pudo haber sido eliminado
            }
          }
        }
      }

      // Fallidos: incrementar intentos y dejar en cola para el próximo ciclo
      const fallidos = lote.filter((p) => !exitososUuids.has(p.uuid));
      for (const fallido of fallidos) {
        try {
          await actualizarIntentosEnCola(fallido.id, (fallido.intentos || 0) + 1);
        } catch (_) {}
      }

      totalProcesados += comentarios.length;
      totalExitosos += resultado.exitosos || exitososUuids.size;
      totalFallidos += fallidos.length;

      // Pausa breve entre lotes (salvo en el último)
      if (li < lotes.length - 1) {
        await dormir(PAUSA_ENTRE_LOTES_MS);
      }
    }

    // Notificar a la aplicación que la sincronización terminó
    window.dispatchEvent(
      new CustomEvent('sync-completado', {
        detail: {
          procesados: totalProcesados,
          exitosos: totalExitosos,
          fallidos: totalFallidos,
          mensaje: `Sincronización: ${totalExitosos} enviado(s), ${totalFallidos} fallido(s)`
        }
      })
    );

    return {
      procesados: totalProcesados,
      exitosos: totalExitosos,
      fallidos: totalFallidos,
      mensaje: ''
    };
  } catch (err) {
    console.error('[sync.js] Error sincronizando cola:', err);
    window.dispatchEvent(
      new CustomEvent('sync-error', { detail: { error: err.message } })
    );
    throw err;
  } finally {
    sincronizando = false;
  }
}