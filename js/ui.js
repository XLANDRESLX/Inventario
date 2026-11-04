/**
 * ui.js - Utilidades de interfaz compartidas (sin dependencias de módulos de negocio).
 */
export function esc(t) {
  if (t === null || t === undefined) return '';
  return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmt(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d)) return esc(iso);
  return d.toLocaleString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function normalizar(t) {
  return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function toast(mensaje, tipo = 'info') {
  const el = document.getElementById('toast-notificacion');
  const cuerpo = document.getElementById('toast-mensaje');
  if (!el || !cuerpo) return;
  cuerpo.textContent = mensaje;
  const cab = el.querySelector('.toast-header');
  cab.className = 'toast-header';
  if (tipo === 'success') cab.classList.add('bg-success', 'text-white');
  if (tipo === 'danger') cab.classList.add('bg-danger', 'text-white');
  if (tipo === 'warning') cab.classList.add('bg-warning', 'text-dark');
  bootstrap.Toast.getOrCreateInstance(el, { autohide: true, delay: 4500 }).show();
}

/** Confirmación con modal Bootstrap. Resuelve true/false. */
export function confirmar(mensaje, { titulo = 'Confirmar acción', boton = 'Eliminar', estilo = 'danger' } = {}) {
  return new Promise(resolve => {
    const el = document.getElementById('modalConfirmacion');
    el.querySelector('#confirmacionTitulo').textContent = titulo;
    el.querySelector('#confirmacionMensaje').textContent = mensaje;
    const ok = el.querySelector('#btnConfirmarAccion');
    ok.textContent = boton;
    ok.className = `btn btn-${estilo}`;
    const modal = bootstrap.Modal.getOrCreateInstance(el);
    let resultado = false;
    const alOk = () => { resultado = true; modal.hide(); };
    ok.addEventListener('click', alOk, { once: true });
    el.addEventListener('hidden.bs.modal', () => { ok.removeEventListener('click', alOk); resolve(resultado); }, { once: true });
    modal.show();
  });
}

/**
 * Modal de formulario genérico (editar empresa, división, usuario, ítem).
 * campos: [{ name, label, value, type='text', required, opciones:[], ayuda, col }]
 * Resuelve con un objeto {name: valor} o null si se cancela.
 */
export function formModal({ titulo, campos, boton = 'Guardar cambios', alEnviar, grande = false }) {
  return new Promise(resolve => {
    const el = document.getElementById('modalFormulario');
    el.querySelector('.modal-title').textContent = titulo;
    const form = el.querySelector('form');
    form.classList.remove('was-validated');
    el.querySelector('.modal-dialog').classList.toggle('modal-lg', grande);
    const fotos = {};   // name -> dataURL comprimido de la imagen elegida
    form.querySelector('.campos').innerHTML = '<div class="row g-2">' + campos.map(c => {
      const id = `fm-${c.name}`;
      const attrs = `id="${id}" name="${c.name}" ${c.required ? 'required' : ''} ${c.maxlength ? `maxlength="${c.maxlength}"` : ''}`;
      let ctl;
      if (c.opciones) {
        ctl = `<select class="form-select" ${attrs}>${c.opciones.map(o => `<option ${o === c.value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
      } else if (c.type === 'textarea') {
        ctl = `<textarea class="form-control" rows="${c.rows || 3}" ${attrs}>${esc(c.value ?? '')}</textarea>`;
      } else if (c.type === 'imagen') {
        const actual = c.value ? urlFoto(c.value, 160) : '';
        ctl = `<input type="file" accept="image/*" class="form-control" id="${id}" data-imagen="${c.name}" />
          <div class="d-flex align-items-center gap-3 mt-2">
            <img class="foto-preview ${actual ? '' : 'd-none'}" alt="Vista previa" ${actual ? `src="${esc(actual)}"` : ''} />
            ${c.value ? '<div class="form-check"><input class="form-check-input" type="checkbox" name="quitar_foto" id="fm-quitar"><label class="form-check-label small" for="fm-quitar">Quitar fotografía actual</label></div>' : ''}
          </div>`;
      } else {
        const extra = c.type === 'number' ? 'min="0" step="1"' : '';
        const auto = c.type === 'password' ? 'autocomplete="new-password"' : '';
        ctl = `<input type="${c.type || 'text'}" class="form-control" ${attrs} ${extra} ${auto} value="${esc(c.value ?? '')}" />`;
      }
      return `<div class="col-md-${c.col || 12}"><label class="form-label" for="${id}">${esc(c.label)}</label>${ctl}${c.ayuda ? `<div class="form-text">${esc(c.ayuda)}</div>` : ''}<div class="invalid-feedback">Campo obligatorio</div></div>`;
    }).join('') + '</div>';
    form.querySelectorAll('input[data-imagen]').forEach(inp => {
      inp.addEventListener('change', async () => {
        const img = inp.parentElement.querySelector('.foto-preview');
        try {
          fotos[inp.dataset.imagen] = inp.files[0] ? await comprimirImagen(inp.files[0]) : '';
          if (fotos[inp.dataset.imagen]) { img.src = fotos[inp.dataset.imagen]; img.classList.remove('d-none'); }
        } catch (err) { inp.value = ''; fotos[inp.dataset.imagen] = ''; toast(err.message, 'danger'); }
      });
    });
    const btn = form.querySelector('button[type=submit]');
    btn.textContent = boton;
    const modal = bootstrap.Modal.getOrCreateInstance(el);
    let enviado = false;
    const alSubmit = async (e) => {
      e.preventDefault();
      if (!form.checkValidity()) { form.classList.add('was-validated'); return; }
      const vals = Object.fromEntries([...new FormData(form).entries()].filter(([, v]) => typeof v === 'string'));
      Object.assign(vals, fotos);
      btn.disabled = true;
      try {
        if (alEnviar) await alEnviar(vals);
        enviado = true; resolve(vals); modal.hide();
      } catch (err) { toast(err.message || 'No se pudo guardar', 'danger'); }
      finally { btn.disabled = false; }
    };
    form.addEventListener('submit', alSubmit);
    el.addEventListener('hidden.bs.modal', () => { form.removeEventListener('submit', alSubmit); if (!enviado) resolve(null); }, { once: true });
    el.addEventListener('shown.bs.modal', () => form.querySelector('input,select')?.focus(), { once: true });
    modal.show();
  });
}

/** Botón en estado "cargando". Devuelve función para restaurarlo. */
export function cargando(btn, texto = 'Procesando...') {
  if (!btn) return () => {};
  const html = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>${esc(texto)}`;
  return () => { btn.disabled = false; btn.innerHTML = html; };
}

/* ---- Estados de carga / vacío / error ---- */
export function skeletonTabla(cols = 5, filas = 5) {
  const celda = '<td><div class="skeleton-text"></div></td>';
  return `<div class="card shadow-sm"><div class="card-body"><div class="table-responsive"><table class="table mb-0"><tbody>` +
    `<tr>${celda.repeat(cols)}</tr>`.repeat(filas) + `</tbody></table></div></div></div>`;
}

export function skeletonTarjetas(n = 3) {
  const t = '<div class="col-md-4"><div class="card shadow-sm"><div class="card-body"><div class="skeleton-text mb-2" style="width:60%;height:1.4rem"></div><div class="skeleton-text" style="width:40%"></div></div></div></div>';
  return `<div class="row g-3 mb-3">${t.repeat(n)}</div>`;
}

export function estadoVacio(icono, titulo, detalle = '') {
  return `<div class="text-center py-5 text-muted"><i class="bi ${icono} estado-vacio-icono"></i><h6 class="mt-3 mb-1">${esc(titulo)}</h6>${detalle ? `<p class="small mb-0">${esc(detalle)}</p>` : ''}</div>`;
}

export function estadoError(mensaje, accion = 'reintentar') {
  return `<div class="alert alert-danger d-flex align-items-center justify-content-between flex-wrap gap-2" role="alert">
    <span><i class="bi bi-exclamation-triangle me-2"></i>${esc(mensaje)}</span>
    <button class="btn btn-sm btn-outline-danger" data-accion="${accion}"><i class="bi bi-arrow-clockwise me-1"></i>Reintentar</button></div>`;
}

export function badgeEstado(estado) {
  return `<span class="badge ${estado === 'Activo' ? 'bg-success' : 'bg-secondary'}">${esc(estado || '-')}</span>`;
}

/* ---- Búsqueda y filtros del lado del cliente (sin volver a pedir datos) ---- */
export function buscador(placeholder = 'Buscar...') {
  return `<div class="input-group input-group-sm buscador"><span class="input-group-text"><i class="bi bi-search"></i></span><input type="search" class="form-control" placeholder="${esc(placeholder)}" data-filtro="texto" aria-label="${esc(placeholder)}" /></div>`;
}

/** Filas: <tr data-buscar="texto normalizado" data-div="id_division">. */
export function activarFiltros(root) {
  if (!root) return;
  const texto = root.querySelector('[data-filtro="texto"]');
  const sel = root.querySelector('[data-filtro="division"]');
  const selEst = root.querySelector('[data-filtro="estado"]');
  const cont = root.querySelector('[data-contador]');
  const filas = [...root.querySelectorAll('tbody tr[data-buscar]')];
  const vacio = root.querySelector('tr.sin-resultados');
  if (!texto && !sel && !selEst) return;
  const aplicar = () => {
    const q = normalizar((texto && texto.value.trim()) || '');
    const d = (sel && sel.value) || '';
    const e = (selEst && selEst.value) || '';
    let n = 0;
    filas.forEach(f => {
      const ok = (!q || f.dataset.buscar.includes(q)) && (!d || f.dataset.div === d) && (!e || f.dataset.est === e);
      f.hidden = !ok; if (ok) n++;
    });
    if (vacio) vacio.hidden = n > 0 || filas.length === 0;
    if (cont) cont.textContent = `${n} ${cont.dataset.contador}${n === 1 ? '' : 's'}`;
  };
  if (texto) texto.addEventListener('input', aplicar);
  if (sel) sel.addEventListener('change', aplicar);
  if (selEst) selEst.addEventListener('change', aplicar);
  aplicar();
}

/** Cabecera de sección: título + acciones a la derecha. */
export function cabecera(icono, titulo, accionesHtml = '') {
  return `<div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3"><h5 class="mb-0"><i class="bi ${icono} me-2 text-primary"></i>${esc(titulo)}</h5><div class="d-flex flex-wrap gap-2 align-items-center">${accionesHtml}</div></div>`;
}

/** Botón de icono accesible para las tablas. */
export function btnIcono(accion, id, icono, titulo, estilo = 'outline-secondary') {
  return `<button class="btn btn-sm btn-${estilo}" data-accion="${accion}" data-id="${esc(id)}" title="${esc(titulo)}" aria-label="${esc(titulo)}"><i class="bi ${icono}"></i></button>`;
}

/* ============================ Ítems: estado, foto y ficha ============================ */
export const ESTADOS_ITEM = ['Nuevo', 'Bueno', 'Regular', 'Malo', 'En reparación', 'Dado de baja'];
const COLOR_ESTADO = { 'Nuevo': 'primary', 'Bueno': 'success', 'Regular': 'warning text-dark', 'Malo': 'danger', 'En reparación': 'info text-dark', 'Dado de baja': 'secondary' };

export function badgeEstadoItem(estado) {
  if (!estado) return '<span class="text-muted">—</span>';
  return `<span class="badge bg-${COLOR_ESTADO[estado] || 'secondary'}">${esc(estado)}</span>`;
}

/** La celda guarda el ID de Drive (o una URL completa). `ancho` = ancho de la miniatura en px. */
export function urlFoto(valor, ancho = 400) {
  const v = String(valor || '').trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v)) return v;
  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(v)}&sz=w${ancho}`;
}

/** Producto con marca/modelo y miniatura, para las tablas. */
export function celdaProducto(it) {
  const sub = [it.marca, it.modelo].filter(Boolean).map(esc).join(' · ');
  const foto = it.fotografia
    ? `<img class="foto-mini" loading="lazy" alt="" src="${esc(urlFoto(it.fotografia, 80))}" />`
    : '<span class="foto-mini foto-vacia"><i class="bi bi-image"></i></span>';
  return `<div class="d-flex align-items-center gap-2">${foto}<div><div class="fw-semibold">${esc(it.nombre_producto)}</div>${sub ? `<div class="small text-muted">${sub}</div>` : ''}</div></div>`;
}

/** Texto normalizado para el buscador de ítems (incluye marca, modelo y serie). */
export function textoBusquedaItem(it, nombreDivision) {
  return normalizar([it.codigo_sku, it.nombre_producto, it.marca, it.modelo, it.numero_serie, it.estado, nombreDivision].join(' '));
}

/** Reduce la imagen (lado mayor 1024 px, JPEG) antes de subirla: ~100-200 KB en vez de varios MB. */
export async function comprimirImagen(file, max = 1024, calidad = 0.78) {
  if (!file || !file.type.startsWith('image/')) throw new Error('El archivo debe ser una imagen');
  let bmp;
  try { bmp = await createImageBitmap(file); }
  catch (_) { throw new Error('No se pudo leer la imagen'); }
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);   // PNG con transparencia -> fondo blanco
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  if (bmp.close) bmp.close();
  return c.toDataURL('image/jpeg', calidad);
}

/** Ficha completa de un ítem (modal de solo lectura). */
export function fichaItem(it, nombreDivision) {
  const el = document.getElementById('modalDetalleItem');
  const fila = (k, v) => `<dt class="col-sm-4 text-muted fw-normal">${k}</dt><dd class="col-sm-8">${v ? esc(v) : '<span class="text-muted">—</span>'}</dd>`;
  const bloque = (k, v) => `<div class="mb-3"><div class="small text-muted mb-1">${k}</div><div class="ficha-texto">${v ? esc(v) : '<span class="text-muted">—</span>'}</div></div>`;
  el.querySelector('.modal-title').textContent = it.nombre_producto || 'Ítem';
  el.querySelector('.modal-body').innerHTML = `<div class="row g-3">
    <div class="col-md-5">${it.fotografia
      ? `<a href="${esc(urlFoto(it.fotografia, 1600))}" target="_blank" rel="noopener"><img class="ficha-foto" alt="Fotografía de ${esc(it.nombre_producto)}" src="${esc(urlFoto(it.fotografia, 800))}" /></a>`
      : '<div class="ficha-foto ficha-sin-foto"><i class="bi bi-image"></i><span class="small">Sin fotografía</span></div>'}</div>
    <div class="col-md-7"><dl class="row mb-0">
      ${fila('SKU', it.codigo_sku)}${fila('Marca', it.marca)}${fila('Modelo', it.modelo)}${fila('N.º de serie', it.numero_serie)}
      <dt class="col-sm-4 text-muted fw-normal">Estado</dt><dd class="col-sm-8">${badgeEstadoItem(it.estado)}</dd>
      ${fila('División', nombreDivision)}${fila('Cantidad', `${it.cantidad ?? ''} ${it.unidad || ''}`.trim())}${fila('Actualizado', it.fecha_actualizacion ? fmt(it.fecha_actualizacion) : '')}
    </dl></div></div>
    <hr />${bloque('Especificaciones', it.especificaciones)}${bloque('Observaciones', it.observaciones)}`;
  bootstrap.Modal.getOrCreateInstance(el).show();
}
