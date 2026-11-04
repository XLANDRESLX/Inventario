/**
 * ============================================================================
 *  db.js - Wrapper nativo de IndexedDB (sin librerías externas)
 *  Almacena:
 *    - usuarios_session : sesión del usuario autenticado (rehydrate offline)
 *    - cola_sincronizacion : comentarios pendientes por enviar al servidor
 * ============================================================================
 */

const DB_NAME = 'InventarioOfflineDB';
const DB_VERSION = 2;
const STORE_SESSION = 'usuarios_session';
const STORE_COLA = 'cola_sincronizacion';
const STORE_META = 'meta_sincronizacion';

let dbPromise = null;

/**
 * Inicializa la base de datos IndexedDB y crea los ObjectStores si no existen.
 * Devuelve una promesa que resuelve con la instancia de IDBDatabase.
 */
export function initDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // ObjectStore de sesión (una sola sesión activa a la vez)
      if (!db.objectStoreNames.contains(STORE_SESSION)) {
        const storeSession = db.createObjectStore(STORE_SESSION, { keyPath: 'id' });
        storeSession.createIndex('usuario', 'usuario', { unique: true });
      }

      // ObjectStore de cola de sincronización
      if (!db.objectStoreNames.contains(STORE_COLA)) {
        const storeCola = db.createObjectStore(STORE_COLA, { keyPath: 'id', autoIncrement: true });
        storeCola.createIndex('uuid', 'uuid', { unique: true });
        storeCola.createIndex('estado', 'estado', { unique: false });
      }

      // ObjectStore de metadata de sincronización (última fecha sincronizada por ítem)
      if (!db.objectStoreNames.contains(STORE_META)) {
        const storeMeta = db.createObjectStore(STORE_META, { keyPath: 'id_item' });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
    request.onblocked = () => {
      console.warn('IndexedDB bloqueado. Cierra otras pestañas de esta aplicación.');
    };
  });

  return dbPromise;
}

/**
 * Obtiene un ObjectStore en el modo indicado.
 */
function getStore(storeName, mode = 'readonly') {
  return initDB().then((db) => {
    const tx = db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  });
}

/* ----------------------------------------------------------------------------
   SESIÓN DE USUARIO (usuarios_session)
   -------------------------------------------------------------------------- */

/**
 * Guarda los datos de la sesión tras un login exitoso.
 * @param {Object} datos { usuario, id_usuario, id_empresa, nombre_empresa, rol, token, fecha_login }
 */
export function guardarSesion(datos) {
  return getStore(STORE_SESSION, 'readwrite').then((store) => {
    const registro = {
      id: 'sesion_activa', // clave fija: una sola sesión por navegador
      usuario: datos.usuario,
      id_usuario: datos.id_usuario,
      id_empresa: datos.id_empresa,
      nombre_empresa: datos.nombre_empresa,
      rol: datos.rol,
      token: datos.token,
      fecha_login: datos.fecha_login || new Date().toISOString()
    };
    const req = store.put(registro);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(registro);
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Recupera la sesión guardada (si existe).
 * @returns {Promise<Object|null>}
 */
export function obtenerSesion() {
  return getStore(STORE_SESSION, 'readonly').then((store) => {
    const req = store.get('sesion_activa');
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Elimina la sesión guardada (logout).
 */
export function eliminarSesion() {
  return getStore(STORE_SESSION, 'readwrite').then((store) => {
    const req = store.delete('sesion_activa');
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  });
}

/* ----------------------------------------------------------------------------
   COLA DE SINCRONIZACIÓN (cola_sincronizacion)
   -------------------------------------------------------------------------- */

/**
 * Guarda un elemento en la cola de sincronización (p. ej. comentario offline).
 * @param {Object} item { uuid, accion, payload, fecha_creacion?, intentos? }
 * @returns {Promise<{id, ...item}>}
 */
export function guardarEnCola(item) {
  const registro = {
    uuid: item.uuid || generarUUID(),
    accion: item.accion || 'AGREGAR_COMENTARIO',
    payload: item.payload || {},
    fecha_creacion: item.fecha_creacion || new Date().toISOString(),
    estado: 'pendiente',
    intentos: item.intentos || 0
  };

  return getStore(STORE_COLA, 'readwrite').then((store) => {
    const req = store.add(registro);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve({ ...registro, id: req.result });
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Obtiene todos los registros de la cola con estado 'pendiente'.
 * @returns {Promise<Array>}
 */
export function obtenerColaPendiente() {
  return getStore(STORE_COLA, 'readonly').then((store) => {
    const index = store.index('estado');
    const req = index.getAll('pendiente');
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Elimina un registro de la cola por su ID autoincremental.
 * @param {number} id
 * @returns {Promise<boolean>}
 */
export function eliminarDeCola(id) {
  return getStore(STORE_COLA, 'readwrite').then((store) => {
    const req = store.delete(id);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Actualiza el contador de intentos de un registro en la cola por su ID autoincremental.
 * @param {number} id
 * @param {number} intentos
 * @returns {Promise<boolean>}
 */
export function actualizarIntentosEnCola(id, intentos) {
  return getStore(STORE_COLA, 'readwrite').then((store) => {
    const req = store.get(id);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => {
        const registro = req.result;
        if (!registro) return resolve(false);
        registro.intentos = intentos;
        const putReq = store.put(registro);
        putReq.onsuccess = () => resolve(true);
        putReq.onerror = () => reject(putReq.error);
      };
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Elimina un registro de la cola por su UUID (útil tras confirmación de envío).
 * @param {string} uuid
 * @returns {Promise<boolean>}
 */
export function eliminarDeColaPorUuid(uuid) {
  return getStore(STORE_COLA, 'readonly').then((store) => {
    const index = store.index('uuid');
    const req = index.get(uuid);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => {
        const registro = req.result;
        if (!registro) return resolve(false);
        return eliminarDeCola(registro.id).then(resolve, reject);
      };
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Guarda la última fecha de sincronización de comentarios para un ítem.
 * @param {string} idItem
 * @param {string} fecha ISO string
 */
export function guardarMetaSync(idItem, fecha) {
  return getStore(STORE_META, 'readwrite').then((store) => {
    const registro = { id_item: idItem, ultima_fecha: fecha };
    const req = store.put(registro);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(registro);
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Obtiene la última fecha de sincronización de comentarios para un ítem.
 * @param {string} idItem
 * @returns {Promise<string|null>} ISO string o null si nunca se sincronizó
 */
export function obtenerMetaSync(idItem) {
  return getStore(STORE_META, 'readonly').then((store) => {
    const req = store.get(idItem);
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result ? req.result.ultima_fecha : null);
      req.onerror = () => reject(req.error);
    });
  });
}

/**
 * Limpia toda la cola de sincronización.
 */
export function limpiarCola() {
  return getStore(STORE_COLA, 'readwrite').then((store) => {
    const req = store.clear();
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  });
}

/* ----------------------------------------------------------------------------
   UTILIDADES
   -------------------------------------------------------------------------- */

/**
 * Genera un UUID v4 simplificado.
 */
function generarUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export { DB_NAME, DB_VERSION, STORE_SESSION, STORE_COLA, STORE_META };