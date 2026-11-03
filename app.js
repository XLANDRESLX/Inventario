/**
 * ============================================================================
 *  app.js - Frontend (Vanilla JS ES Modules + Bootstrap 5)
 *  Aplicación de Inventario Multiorganización - Offline First
 *
 *  CONFIGURACIÓN REQUERIDA:
 *  1. Reemplaza GAS_URL por la URL de tu Web App de Google Apps Script.
 *  2. Crea un Google Sheets con las pestañas: Empresas, Usuarios, Divisiones,
 *     Inventario, Comentarios (ver Code.gs).
 * ============================================================================
 */

import {
  initDB,
  guardarSesion,
  obtenerSesion,
  eliminarSesion,
  guardarEnCola,
  obtenerColaPendiente,
  eliminarDeCola
} from './db.js';

import {
  initSync,
  estaOnline,
  enviarComentarioDirecto,
  sincronizarCola,
  setGASURL
} from './sync.js';

/* -------------------------------------------------------------------------- */
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyytsf4GJ8IKYWarHXxCYTpBCSqbAMf3Mzseqbv0mOjcUKBXWjVd4anfxA-1el0dX6azA/exec';
setGASURL(GAS_URL);

/**
 * Evita que credenciales queden expuestas en la URL si alguien accede con
 * ?usuario=...&password=... en la barra de direcciones. Las limpia del historial
 * sin recargar la página.
 */
(function limpiarCredencialesEnURL() {
  try {
    const url = new URL(window.location.href);
    const tieneCredenciales = url.searchParams.has('usuario') || url.searchParams.has('password');
    if (tieneCredenciales) {
      url.searchParams.delete('usuario');
      url.searchParams.delete('password');
      window.history.replaceState({}, document.title, url.toString());
    }
  } catch (_) {
    // Si falla el parseo de URL, no hace nada.
  }
})();

/* -------------------------------------------------------------------------- */
/*  ESTADO GLOBAL                                                             */
/* -------------------------------------------------------------------------- */
let sesion = null;
let inventarioCache = [];
let inventarioCacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// Comentarios pendientes creados offline: id_item -> Array
const comentariosPendientesMap = new Map();

let modalComentariosInstance = null;

/* -------------------------------------------------------------------------- */
/*  ELEMENTOS DEL DOM                                                         */
/* -------------------------------------------------------------------------- */
const vistaLogin = document.getElementById('vista-login');
const vistaPanel = document.getElementById('vista-panel');

const formLogin = document.getElementById('form-login');
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const btnSyncNow = document.getElementById('btn-sync-now');
const badgeConexion = document.getElementById('badge-conexion');

const spanUsuario = document.getElementById('span-usuario');
const spanEmpresa = document.getElementById('span-empresa');
const spanRol = document.getElementById('span-rol');

const filtroDivision = document.getElementById('filtro-division');
const buscador = document.getElementById('buscador');
const btnLimpiarFiltros = document.getElementById('btn-limpiar-filtros');

const tbodyInventario = document.getElementById('tbody-inventario');
const contadorItems = document.getElementById('contador-items');
const alertOffline = document.getElementById('alert-offline');

const modalComentariosEl = document.getElementById('modalComentarios');
const modalItemNombre = document.getElementById('modalItemNombre');
const modalItemId = document.getElementById('modalItemId');
const listaComentarios = document.getElementById('lista-comentarios');
const formComentario = document.getElementById('form-comentario');
const textoComentario = document.getElementById('texto-comentario');
const btnEnviarComentario = document.getElementById('btn-enviar-comentario');

/* -------------------------------------------------------------------------- */
/*  UTILIDADES                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Hash SHA-256 de una cadena usando Web Crypto API.
 */
async function sha256(texto) {
  const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  const arr = Array.from(new Uint8Array(buffer));
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function generarUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function formatearFecha(iso) {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    return d.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (_) {
    return iso;
  }
}

function mostrarToast(mensaje, tipo = 'info') {
  const toastEl = document.getElementById('toast-notificacion');
  const toastBody = document.getElementById('toast-mensaje');
  toastBody.textContent = mensaje;

  const header = toastEl.querySelector('.toast-header');
  header.className = 'toast-header';
  if (tipo === 'success') header.classList.add('bg-success', 'text-white');
  if (tipo === 'danger') header.classList.add('bg-danger', 'text-white');
  if (tipo === 'warning') header.classList.add('bg-warning', 'text-dark');

  const bsToast = new bootstrap.Toast(toastEl, { autohide: true, delay: 5000 });
  bsToast.show();
}

function actualizarBadgeConexion(online) {
  if (!badgeConexion) return;
  if (online) {
    badgeConexion.className = 'badge badge-estado bg-success me-3';
    badgeConexion.innerHTML = '<i class="bi bi-wifi me-1"></i> Online';
    if (alertOffline) alertOffline.classList.add('d-none');
  } else {
    badgeConexion.className = 'badge badge-estado bg-danger me-3';
    badgeConexion.innerHTML = '<i class="bi bi-wifi-off me-1"></i> Offline';
    if (alertOffline) alertOffline.classList.remove('d-none');
  }
}

/* -------------------------------------------------------------------------- */
/*  AUTENTICACIÓN                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Intenta restaurar la sesión desde IndexedDB (permite reingreso offline).
 */
async function restaurarSesion() {
  try {
    const guardada = await obtenerSesion();
    if (guardada) {
      sesion = guardada;
      mostrarPanel();
      cargarDatosPanel();
      return;
    }
  } catch (err) {
    console.warn('No se pudo restaurar la sesión:', err);
  }
  mostrarLogin();
}

async function manejarLogin(e) {
  e.preventDefault();
  if (!formLogin.checkValidity()) {
    formLogin.classList.add('was-validated');
    return;
  }

  btnLogin.disabled = true;
  btnLogin.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Autenticando...';

  try {
    const usuario = formLogin.usuario.value.trim();
    const password = formLogin.password.value;
    const passHash = await sha256(password);

    const resp = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'login',
        usuario: usuario,
        pass_hash: passHash
      })
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();

    if (!data.success) {
      mostrarToast(data.error || 'Error de autenticación', 'danger');
      return;
    }

    sesion = {
      usuario: data.usuario,
      id_usuario: data.id_usuario,
      id_empresa: data.id_empresa,
      nombre_empresa: data.nombre_empresa,
      rol: data.rol,
      token: data.token,
      fecha_login: data.fecha_login
    };

    await guardarSesion(sesion);
    mostrarPanel();
    cargarDatosPanel();
    mostrarToast(`Bienvenido, ${sesion.usuario} (${sesion.rol})`, 'success');
  } catch (err) {
    console.error(err);
    mostrarToast('No se pudo conectar con el servidor. Verifica tu conexión.', 'danger');
  } finally {
    btnLogin.disabled = false;
    btnLogin.textContent = 'Iniciar sesión';
  }
}

function cerrarSesion() {
  sesion = null;
  eliminarSesion().catch(() => {});
  inventarioCache = [];
  comentariosPendientesMap.clear();
  formLogin.classList.remove('was-validated');
  formLogin.reset();
  mostrarLogin();
  mostrarToast('Sesión cerrada', 'info');
}

/* -------------------------------------------------------------------------- */
/*  NAVEGACIÓN DE VISTAS                                                      */
/* -------------------------------------------------------------------------- */
function mostrarLogin() {
  vistaLogin.classList.remove('d-none');
  vistaPanel.classList.add('d-none');
  document.body.classList.remove('panel-activo');
}

function mostrarPanel() {
  vistaLogin.classList.add('d-none');
  vistaPanel.classList.remove('d-none');
  document.body.classList.add('panel-activo');
}

/* -------------------------------------------------------------------------- */
/*  CARGA DE DATOS (INVENTARIO / DIVISIONES)                                  */
/* -------------------------------------------------------------------------- */

/**
 * Carga divisiones de la empresa y llena el selector de filtro.
 */
async function cargarDivisiones() {
  if (!sesion) return;
  try {
    const resp = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        action: 'obtener_divisiones',
        id_empresa: sesion.id_empresa
      })
    });
    const data = await resp.json();

    filtroDivision.innerHTML = '<option value="">Todas las divisiones</option>';
    if (data.success && data.divisiones) {
      data.divisiones.forEach((div) => {
        const opt = document.createElement('option');
        opt.value = div.id_division;
        opt.textContent = div.nombre_division + (div.ubicacion ? ` (${div.ubicacion})` : '');
        filtroDivision.appendChild(opt);
      });
    }
  } catch (err) {
    console.warn('No se pudieron cargar divisiones:', err);
  }
}

/**
 * Carga el inventario de la empresa.
 * Si hay conexión, consulta al servidor y guarda en caché (sessionStorage).
 * Si no hay conexión, usa la última caché disponible.
 */
async function cargarInventario(idDivision = '') {
  if (!sesion) return;

  const tbody = tbodyInventario;
  tbody.innerHTML = `
    <tr><td colspan="8" class="text-center py-4">
      <div class="skeleton-text" style="width:30%"></div>
      <div class="skeleton-text mt-2" style="width:60%"></div>
    </td></tr>
  `;

  const ahora = Date.now();
  const tieneCacheValida =
    inventarioCache.length > 0 && ahora - inventarioCacheTimestamp < CACHE_TTL_MS;

  try {
    if (estaOnline() || !tieneCacheValida) {
      const resp = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'obtener_inventario',
          id_empresa: sesion.id_empresa,
          id_division: idDivision
        })
      });
      const data = await resp.json();

      if (data.success) {
        inventarioCache = data.items;
        inventarioCacheTimestamp = ahora;
        // Persistir caché simple para uso offline
        try {
          sessionStorage.setItem(
            'inventario_cache',
            JSON.stringify({
              items: data.items,
              timestamp: ahora,
              empresa: sesion.id_empresa
            })
          );
        } catch (_) {}
      } else {
        throw new Error(data.error || 'Error al obtener inventario');
      }
    } else {
      // Usar caché en memoria
    }
  } catch (err) {
    console.warn('Fallo al cargar inventario del servidor:', err);
    // Recuperar de sessionStorage si existe
    try {
      const raw = sessionStorage.getItem('inventario_cache');
      if (raw) {
        const cache = JSON.parse(raw);
        if (cache.empresa === sesion.id_empresa) {
          inventarioCache = cache.items;
          inventarioCacheTimestamp = cache.timestamp || 0;
          mostrarToast('Mostrando inventario en caché (modo offline)', 'warning');
        }
      }
    } catch (_) {}
  }

  renderInventario(idDivision);
}

/**
 * Renderiza la tabla de inventario aplicando filtros locales.
 */
function renderInventario(idDivisionFiltro = '', textoBusqueda = '') {
  let items = [...inventarioCache];

  if (idDivisionFiltro) {
    items = items.filter((i) => i.id_division === idDivisionFiltro);
  }

  if (textoBusqueda) {
    const q = textoBusqueda.toLowerCase();
    items = items.filter(
      (i) =>
        (i.codigo_sku || '').toLowerCase().includes(q) ||
        (i.nombre_producto || '').toLowerCase().includes(q)
    );
  }

  tbodyInventario.innerHTML = '';
  contadorItems.textContent = items.length + ' ítem' + (items.length !== 1 ? 's' : '');

  if (items.length === 0) {
    tbodyInventario.innerHTML = `
      <tr><td colspan="8" class="text-center py-4 text-muted">No se encontraron productos.</td></tr>
    `;
    return;
  }

  items.forEach((item, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td><code>${item.codigo_sku || '-'}</code></td>
      <td>${item.nombre_producto || '-'}</td>
      <td><span class="badge bg-secondary">${item.nombre_division || '-'}</span></td>
      <td>${item.cantidad !== undefined ? item.cantidad : '-'} ${item.unidad || ''}</td>
      <td>${formatearFecha(item.fecha_actualizacion)}</td>
      <td>
        <button class="btn btn-sm btn-outline-primary btn-ver-comentarios" data-id="${item.id_item}" data-nombre="${escapeHtml(item.nombre_producto)}" title="Ver comentarios">
          <i class="bi bi-chat-text"></i>
        </button>
      </td>
    `;
    tbodyInventario.appendChild(tr);
  });

  // Asignar eventos a los botones de comentarios renderizados
  tbodyInventario.querySelectorAll('.btn-ver-comentarios').forEach((btn) => {
    btn.addEventListener('click', () => {
      abrirModalComentarios(btn.dataset.id, btn.dataset.nombre);
    });
  });
}

function escapeHtml(texto) {
  if (!texto) return '';
  const div = document.createElement('div');
  div.textContent = texto;
  return div.innerHTML;
}

/* -------------------------------------------------------------------------- */
/*  MODAL DE COMENTARIOS                                                      */
/* -------------------------------------------------------------------------- */

function initModalComentarios() {
  modalComentariosInstance = new bootstrap.Modal(modalComentariosEl, {
    backdrop: 'static',
    keyboard: true
  });

  modalComentariosEl.addEventListener('show.bs.modal', () => {
    const idItem = modalItemId.value;
    cargarComentariosModal(idItem);
  });

  formComentario.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!formComentario.checkValidity()) {
      formComentario.classList.add('was-validated');
      return;
    }
    enviarComentarioModal();
  });
}

async function cargarComentariosModal(idItem) {
  listaComentarios.innerHTML = `
    <div class="text-center text-muted py-3">
      <i class="bi bi-hourglass-bottom me-1"></i> Cargando comentarios...
    </div>
  `;

  const comentariosServidor = [];
  let servidorOk = false;

  if (estaOnline()) {
    try {
      const resp = await fetch(GAS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          action: 'obtener_comentarios',
          id_item: idItem
        })
      });
      const data = await resp.json();
      if (data.success) {
        comentariosServidor.push(...data.comentarios);
        servidorOk = true;
      }
    } catch (err) {
      console.warn('No se pudieron cargar comentarios del servidor:', err);
    }
  }

  // Comentarios pendientes creados offline
  const pendientes = comentariosPendientesMap.get(idItem) || [];

  renderListaComentarios(comentariosServidor, pendientes, servidorOk);
}

function renderListaComentarios(servidor, pendientes, servidorOk) {
  const filas = [];

  // Comentarios del servidor (enviados y confirmados)
  servidor.forEach((c) => {
    filas.push(`
      <div class="comentario-enviado p-2 mb-2 border rounded-start">
        <div class="d-flex justify-content-between">
          <small class="text-muted">${escapeHtml(c.comentario)}</small>
          <span class="badge bg-success bg-opacity-10 text-success border border-success">
            <i class="bi bi-cloud-check me-1"></i> Enviado
          </span>
        </div>
        <div class="d-flex justify-content-between align-items-center mt-1">
          <small class="text-muted">Usuario: ${escapeHtml(c.id_usuario || '-')}</small>
          <small class="text-muted">${formatearFecha(c.fecha_hora)}</small>
        </div>
      </div>
    `);
  });

  // Comentarios pendientes (offline)
  pendientes.forEach((c) => {
    filas.push(`
      <div class="comentario-pendiente p-2 mb-2 border rounded-start">
        <div class="d-flex justify-content-between">
          <small>${escapeHtml(c.comentario)}</small>
          <span class="badge bg-warning text-dark border border-warning">
            <i class="bi bi-clock me-1"></i> Pendiente de envío
          </span>
        </div>
        <div class="d-flex justify-content-between align-items-center mt-1">
          <small class="text-muted">Usuario: ${escapeHtml(c.id_usuario || '-')}</small>
          <small class="text-muted">${formatearFecha(c.fecha_hora)}</small>
        </div>
      </div>
    `);
  });

  if (filas.length === 0) {
    filas.push(`
      <div class="text-center text-muted py-3">
        <i class="bi bi-chat-square-text me-1"></i> No hay comentarios aún.
      </div>
    `);
  }

  listaComentarios.innerHTML = filas.join('');
}

async function enviarComentarioModal() {
  const idItem = modalItemId.value;
  const texto = textoComentario.value.trim();
  if (!texto || !idItem) return;

  const comentario = {
    id_item: idItem,
    id_empresa: sesion.id_empresa,
    id_usuario: sesion.id_usuario,
    nombre_usuario: sesion.usuario,
    comentario: texto,
    fecha_hora: new Date().toISOString()
  };

  btnEnviarComentario.disabled = true;
  btnEnviarComentario.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Enviando...';

  try {
    if (estaOnline()) {
      const data = await enviarComentarioDirecto(comentario);
      if (data.success) {
        textoComentario.value = '';
        formComentario.classList.remove('was-validated');
        await cargarComentariosModal(idItem);
        mostrarToast('Comentario publicado', 'success');
      } else {
        throw new Error(data.error || 'Error al publicar');
      }
    } else {
      // Offline: guardar en cola de IndexedDB y renderizar inmediatamente
      const uuid = generarUUID();
      await guardarEnCola({
        uuid: uuid,
        accion: 'AGREGAR_COMENTARIO',
        payload: comentario,
        fecha_creacion: new Date().toISOString()
      });

      const pendientes = comentariosPendientesMap.get(idItem) || [];
      pendientes.push({ uuid, ...comentario, estado: 'pendiente' });
      comentariosPendientesMap.set(idItem, pendientes);

      textoComentario.value = '';
      formComentario.classList.remove('was-validated');
      await cargarComentariosModal(idItem);
      mostrarToast('Comentario guardado localmente. Se enviará al recuperar conexión.', 'warning');
    }
  } catch (err) {
    console.error(err);
    // Fallback a offline si falla el envío aunque se declare online
    const uuid = generarUUID();
    await guardarEnCola({
      uuid: uuid,
      accion: 'AGREGAR_COMENTARIO',
      payload: comentario,
      fecha_creacion: new Date().toISOString()
    });

    const pendientes = comentariosPendientesMap.get(idItem) || [];
    pendientes.push({ uuid, ...comentario, estado: 'pendiente' });
    comentariosPendientesMap.set(idItem, pendientes);

    textoComentario.value = '';
    formComentario.classList.remove('was-validated');
    await cargarComentariosModal(idItem);
    mostrarToast('No se pudo enviar. Guardado localmente para reintento.', 'warning');
  } finally {
    btnEnviarComentario.disabled = false;
    btnEnviarComentario.innerHTML = '<i class="bi bi-send me-1"></i> Publicar comentario';
  }
}

function abrirModalComentarios(idItem, nombreProducto) {
  modalItemId.value = idItem;
  modalItemNombre.textContent = nombreProducto;
  textoComentario.value = '';
  formComentario.classList.remove('was-validated');
  if (modalComentariosInstance) {
    modalComentariosInstance.show();
  } else {
    initModalComentarios();
    modalComentariosInstance.show();
  }
}

/* -------------------------------------------------------------------------- */
/*  SINCRONIZACIÓN DE RED                                                     */
/* -------------------------------------------------------------------------- */

async function ejecutarSincronizacion() {
  if (!estaOnline()) {
    mostrarToast('Sin conexión. Los cambios se sincronizarán al recuperar red.', 'warning');
    return;
  }

  btnSyncNow.disabled = true;
  const htmlOriginal = btnSyncNow.innerHTML;
  btnSyncNow.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Procesando...';

  try {
    const resultado = await sincronizarCola();
    if (resultado.procesados > 0) {
      mostrarToast(resultado.mensaje || 'Sincronización completada', 'success');
      // Limpiar comentarios pendientes de la vista del modal si estuviera abierto
      if (modalComentariosEl.classList.contains('show')) {
        const idItem = modalItemId.value;
        if (idItem) {
          comentariosPendientesMap.delete(idItem);
          await cargarComentariosModal(idItem);
        }
      }
    } else {
      mostrarToast('No hay elementos pendientes por sincronizar', 'info');
    }
  } catch (err) {
    mostrarToast('Error al sincronizar: ' + err.message, 'danger');
  } finally {
    btnSyncNow.disabled = false;
    btnSyncNow.innerHTML = htmlOriginal;
  }
}

/* -------------------------------------------------------------------------- */
/*  INICIALIZACIÓN                                                            */
/* -------------------------------------------------------------------------- */

function init() {
  // Listeners de conexión (actualizan badge UI)
  window.addEventListener('online', () => actualizarBadgeConexion(true));
  window.addEventListener('offline', () => actualizarBadgeConexion(false));
  actualizarBadgeConexion(navigator.onLine);

  // Motor de sincronización (procesa cola al reconectar)
  initSync((online) => {
    actualizarBadgeConexion(online);
  });

  // Evento cuando el motor termina una sincronización de lote
  window.addEventListener('sync-completado', (evt) => {
    const d = evt.detail || {};
    if (d.procesados > 0) {
      mostrarToast(d.mensaje || 'Sincronización automática completada', 'success');
      // Refrescar caché de inventario por si afecta algo
      cargarInventario(filtroDivision.value);
    }
  });

  window.addEventListener('sync-error', (evt) => {
    mostrarToast('Error de sincronización: ' + (evt.detail && evt.detail.error ? evt.detail.error : 'desconocido'), 'danger');
  });

  // Botones
  btnLogout.addEventListener('click', cerrarSesion);
  btnSyncNow.addEventListener('click', ejecutarSincronizacion);

  filtroDivision.addEventListener('change', () => {
    cargarInventario(filtroDivision.value);
  });

  buscador.addEventListener('input', (e) => {
    renderInventario(filtroDivision.value, e.target.value.trim());
  });

  btnLimpiarFiltros.addEventListener('click', () => {
    filtroDivision.value = '';
    buscador.value = '';
    renderInventario('', '');
  });

  formLogin.addEventListener('submit', manejarLogin);

  // Arranque
  initDB()
    .then(() => restaurarSesion())
    .catch((err) => {
      console.error('Error inicializando IndexedDB:', err);
      mostrarLogin();
    });
}

init();