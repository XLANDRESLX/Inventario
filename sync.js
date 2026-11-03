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
  eliminarDeColaPorUuid
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
export async function sincronizarCola() {
  if (sincronizando) return { procesados: 0, mensaje: 'Ya hay una sincronización en curso' };
  if (!navigator.onLine) {
    return { procesados: 0, mensaje: 'Sin conexión: sincronización diferida' };
  }

  sincronizando = true;

  try {
    const pendientes = await obtenerColaPendiente();

    if (!pendientes || pendientes.length === 0) {
      return { procesados: 0, exitosos: 0, fallidos: 0, mensaje: 'Cola vacía' };
    }

    const comentarios = pendientes.map((p) => ({
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
        action: 'SYNC_BATCH',
        comentarios: comentarios
      })
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const resultado = await response.json();

    // Eliminar de IndexedDB los comentarios que el servidor confirmó como enviados
    if (resultado.detalles && Array.isArray(resultado.detalles)) {
      const exitosos = resultado.detalles.filter((d) => d.status === 'ok');
      for (const det of exitosos) {
        const pendiente = pendientes.find((p) => p.uuid === det.uuid);
        if (pendiente) {
          try {
            await eliminarDeCola(pendiente.id);
          } catch (_) {
            // No crítico: el registro ya pudo haber sido eliminado
          }
        }
      }
    }

    // Notificar a la aplicación que la sincronización terminó
    window.dispatchEvent(
      new CustomEvent('sync-completado', {
        detail: {
          procesados: comentarios.length,
          exitosos: resultado.exitosos || 0,
          fallidos: resultado.fallidos || 0,
          mensaje: resultado.mensaje || ''
        }
      })
    );

    return {
      procesados: comentarios.length,
      exitosos: resultado.exitosos || 0,
      fallidos: resultado.fallidos || 0,
      mensaje: resultado.mensaje || ''
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