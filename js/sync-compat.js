import { guardarEnCola, obtenerSesion, obtenerColaPendiente } from '../db.js';
import { initSync, estaOnline, enviarComentarioDirecto, sincronizarCola, setGASURL } from '../sync.js';
import { GAS_URL } from './config.js';
import { leer, invalidarAcciones, Q } from './api.js';
import { esc, fmt, toast } from './ui.js';

setGASURL(GAS_URL);

const ACCIONES_COMENTARIOS = ['obtener_comentarios', 'obtener_comentarios_todos'];

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}

const $ = (id) => document.getElementById(id);

function cerrarModal() {
  const m = bootstrap.Modal.getInstance($('modalComentarios'));
  if (m) m.hide();
}

function limpiarFormulario() {
  $('texto-comentario').value = '';
  $('form-comentario').classList.remove('was-validated');
}

async function encolar(com, mensaje) {
  await guardarEnCola({ uuid: uuid(), accion: 'AGREGAR_COMENTARIO', payload: com, fecha_creacion: new Date().toISOString() });
  limpiarFormulario(); cerrarModal();
  toast(mensaje, 'warning');
}

export async function enviarComentarioModal(idItem, texto) {
  const s = await obtenerSesion();
  if (!s) { toast('Sesión no encontrada', 'danger'); return; }
  const com = { id_item: idItem, id_empresa: s.id_empresa, id_usuario: s.id_usuario, nombre_usuario: s.usuario, comentario: texto, fecha_hora: new Date().toISOString() };
  const btn = $('btn-enviar-comentario');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Enviando...'; }
  try {
    if (!estaOnline()) { await encolar(com, 'Guardado localmente. Se enviará al recuperar conexión.'); return; }
    const d = await enviarComentarioDirecto(com);
    if (!d.success) throw new Error(d.error || 'Error');
    invalidarAcciones(ACCIONES_COMENTARIOS);
    limpiarFormulario(); cerrarModal();
    toast('Comentario publicado', 'success');
  } catch (e) {
    await encolar(com, 'No se pudo enviar; guardado localmente y se reintentará.');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-send me-1"></i> Publicar'; }
  }
}

function tarjetaComentario(c, estado, quien) {
  const pendiente = estado === 'pendiente';
  const badge = pendiente
    ? '<span class="badge bg-warning text-dark border border-warning"><i class="bi bi-clock me-1"></i>Pendiente</span>'
    : '<span class="badge bg-success-subtle text-success border border-success"><i class="bi bi-cloud-check me-1"></i>Enviado</span>';
  return `<div class="${pendiente ? 'comentario-pendiente' : 'comentario-enviado'} p-2 mb-2 border rounded-start">
    <div class="d-flex justify-content-between gap-2"><span>${esc(c.comentario)}</span>${badge}</div>
    <div class="d-flex justify-content-between align-items-center mt-1"><small class="text-muted">${esc(quien(c.id_usuario))}</small><small class="text-muted">${fmt(c.fecha_hora)}</small></div></div>`;
}

/**
 * Abre el modal de comentarios de un ítem.
 * opts.soloLectura: oculta el formulario (administrador).
 * opts.nombreUsuario: (id) => texto a mostrar como autor.
 */
export async function abrirComGlobal(idItem, nombreProducto, opts = {}) {
  const lista = $('lista-comentarios');
  if (!$('modalComentarios') || !lista) return;
  const s = await obtenerSesion();
  const quien = opts.nombreUsuario || ((id) => (s && id === s.id_usuario ? 'Tú' : 'Usuario de la empresa'));

  $('modalItemId').value = idItem;
  $('modalItemNombre').value = nombreProducto || '';
  $('bloque-nuevo-comentario').hidden = !!opts.soloLectura;
  limpiarFormulario();
  lista.innerHTML = '<div class="skeleton-text mb-2"></div><div class="skeleton-text" style="width:70%"></div>';
  bootstrap.Modal.getOrCreateInstance($('modalComentarios')).show();

  let pendientes = [];
  try { pendientes = (await obtenerColaPendiente()).filter(p => p.payload && p.payload.id_item === idItem).map(p => p.payload); } catch (_) {}

  const pintar = (d) => {
    if ($('modalItemId').value !== idItem) return;   // el usuario abrió otro ítem entre tanto
    const filas = [
      ...(d ? d.comentarios || [] : []).map(c => tarjetaComentario(c, 'enviado', quien)),
      ...pendientes.map(c => tarjetaComentario(c, 'pendiente', quien))
    ];
    lista.innerHTML = filas.join('') || '<div class="text-center text-muted py-3">Sin comentarios.</div>';
  };

  try {
    pintar(await leer(Q.comentariosItem(idItem), { onCache: pintar }));
  } catch (_) {
    if (pendientes.length) pintar(null);
    else lista.innerHTML = '<div class="text-center text-muted py-3"><i class="bi bi-wifi-off me-1"></i>No se pudieron cargar los comentarios.</div>';
  }
}

export { initSync, estaOnline, sincronizarCola };
