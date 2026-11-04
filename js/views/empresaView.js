import { esc, fmt, normalizar, skeletonTabla, skeletonTarjetas, estadoVacio, estadoError, buscador, activarFiltros, cabecera, ESTADOS_ITEM, badgeEstadoItem, celdaProducto, textoBusquedaItem } from '../ui.js';

const SECCIONES = [
  { id: 'inicio', icono: 'bi-house', texto: 'Inicio' },
  { id: 'divisiones', icono: 'bi-layout-sidebar', texto: 'Divisiones' },
  { id: 'inventario', icono: 'bi-box', texto: 'Inventario' },
  { id: 'comentarios', icono: 'bi-chat-text', texto: 'Comentarios' }
];

export class EmpresaView {
  constructor() {
    this.header = document.getElementById('header-empresa');
    this.sidebar = document.getElementById('sidebar-empresa');
    this.navMovil = document.getElementById('nav-movil-empresa');
    this.area = document.getElementById('area-contenido-empresa');
    this.onSeccion = null; this.onVerCom = null; this.onVerFicha = null; this.onFiltrarDiv = null; this.onRefrescar = null;
    this._clicArea = (e) => this._clic(e);
    this._clicNav = (e) => { const b = e.target.closest('[data-seccion]'); if (b && this.onSeccion) this.onSeccion(b.dataset.seccion); };
    this._clicHeader = (e) => { if (e.target.closest('[data-accion="refrescar"]') && this.onRefrescar) this.onRefrescar(); };
    // Todos los listeners se registran una sola vez y se retiran en destruir()
    this.area.addEventListener('click', this._clicArea);
    this.sidebar.addEventListener('click', this._clicNav);
    this.navMovil.addEventListener('click', this._clicNav);
    this.header.addEventListener('click', this._clicHeader);
  }

  renderHeader(empresa) {
    this.header.innerHTML = `<div class="card shadow-sm border-0 border-start border-primary border-4"><div class="card-body d-flex justify-content-between align-items-center flex-wrap gap-2">
      <div><h5 class="mb-1"><i class="bi bi-building me-2 text-primary"></i>${esc(empresa.nombre_empresa || 'Empresa')}</h5>
      <p class="mb-0 text-muted small">ID: ${esc(empresa.id_empresa || '-')} · <span class="badge bg-info text-dark">Solo lectura</span></p></div>
      <button class="btn btn-outline-primary btn-sm" data-accion="refrescar"><i class="bi bi-arrow-repeat me-1"></i>Actualizar</button></div></div>`;
  }

  renderNav(onSeccion) {
    this.onSeccion = onSeccion;
    this.sidebar.innerHTML = `<div class="sidebar-header p-3 mb-3"><h6 class="mb-0 fw-bold">Menú</h6></div>
      <nav class="list-group list-group-flush sidebar-nav" aria-label="Apartados">${SECCIONES.map(s =>
        `<button class="list-group-item list-group-item-action btn-seccion" data-seccion="${s.id}"><i class="bi ${s.icono} me-2"></i>${s.texto}</button>`).join('')}</nav>`;
    this.navMovil.innerHTML = `<div class="nav-movil">${SECCIONES.map(s =>
      `<button class="btn btn-sm" data-seccion="${s.id}"><i class="bi ${s.icono} me-1"></i>${s.texto}</button>`).join('')}</div>`;
    this.setActiva('inicio');
  }

  setActiva(sec) {
    this.sidebar.querySelectorAll('[data-seccion]').forEach(b => {
      const on = b.dataset.seccion === sec; b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    this.navMovil.querySelectorAll('[data-seccion]').forEach(b => {
      const on = b.dataset.seccion === sec;
      b.classList.toggle('btn-primary', on); b.classList.toggle('btn-outline-secondary', !on);
    });
  }

  _clic(e) {
    const el = e.target.closest('[data-accion]'); if (!el) return;
    const a = el.dataset.accion;
    if (a === 'ver-com' && this.onVerCom) this.onVerCom(el.dataset.id, el.dataset.nombre);
    else if (a === 'ver-ficha' && this.onVerFicha) this.onVerFicha(el.dataset.id);
    else if (a === 'ver-inventario-division' && this.onFiltrarDiv) this.onFiltrarDiv(el.dataset.id);
    else if (a === 'reintentar' && this.onRefrescar) this.onRefrescar();
    else if (a === 'ir' && this.onSeccion) this.onSeccion(el.dataset.seccion);
  }

  cargando(tipo = 'tabla') { this.area.innerHTML = tipo === 'inicio' ? skeletonTarjetas(3) : skeletonTabla(5, 6); }
  renderError(msg) { this.area.innerHTML = estadoError(msg); }

  renderInicio(empresa, { totalDivisiones, totalItems }) {
    const tarjeta = (color, valor, texto, icono, sec) => `<div class="col-md-4"><div class="card tarjeta-stat bg-${color} shadow-sm h-100"><div class="card-body d-flex justify-content-between align-items-center">
      <div><div class="valor">${valor}</div><div class="small opacity-75">${texto}</div></div><i class="bi ${icono} fs-1 opacity-50"></i></div>
      <button class="btn btn-sm btn-light m-3 mt-0" data-accion="ir" data-seccion="${sec}">Ver detalle</button></div></div>`;
    this.area.innerHTML = `<div class="row g-3">
      ${tarjeta('success', totalDivisiones, 'Divisiones / Salas', 'bi-layout-sidebar', 'divisiones')}
      ${tarjeta('primary', totalItems, 'Ítems en inventario', 'bi-box', 'inventario')}
      ${tarjeta('secondary', '<i class="bi bi-chat-text"></i>', 'Comentarios de productos', 'bi-chat-left-text', 'comentarios')}</div>
      <div class="alert alert-light border mt-4 mb-0"><i class="bi bi-info-circle me-2"></i>Acceso de solo lectura al inventario. Puedes dejar comentarios en cada producto, incluso sin conexión.</div>`;
  }

  renderDivisiones(divisiones) {
    const filas = divisiones.map(d => `<tr><td><strong>${esc(d.nombre_division)}</strong></td><td>${esc(d.ubicacion) || '<span class="text-muted">—</span>'}</td>
      <td><span class="badge bg-info text-dark">${d.totalItems || 0} ítems</span></td>
      <td class="text-end"><button class="btn btn-sm btn-outline-primary" data-accion="ver-inventario-division" data-id="${esc(d.id_division)}"><i class="bi bi-box me-1"></i>Ver inventario</button></td></tr>`).join('');
    this.area.innerHTML = cabecera('bi-layout-sidebar', 'Divisiones / Salas') + (divisiones.length
      ? `<div class="card shadow-sm"><div class="card-body p-0"><div class="table-responsive"><table class="table table-hover table-admin mb-0"><thead class="table-light"><tr><th>Nombre</th><th>Ubicación</th><th>Ítems</th><th></th></tr></thead><tbody>${filas}</tbody></table></div></div></div>`
      : `<div class="card shadow-sm">${estadoVacio('bi-layout-sidebar', 'No hay divisiones registradas')}</div>`);
  }

  renderInventario(items, divisiones, idDivFiltro = '') {
    const nombreDiv = new Map(divisiones.map(d => [d.id_division, d.nombre_division]));
    const opciones = divisiones.map(d => `<option value="${esc(d.id_division)}" ${d.id_division === idDivFiltro ? 'selected' : ''}>${esc(d.nombre_division)}</option>`).join('');
    const filas = items.map(it => `<tr data-buscar="${esc(textoBusquedaItem(it, nombreDiv.get(it.id_division)))}" data-div="${esc(it.id_division)}" data-est="${esc(it.estado)}">
      <td><code>${esc(it.codigo_sku || '-')}</code></td><td>${celdaProducto(it)}</td>
      <td class="d-none d-md-table-cell"><span class="badge bg-secondary">${esc(nombreDiv.get(it.id_division) || 'Sin división')}</span></td>
      <td>${badgeEstadoItem(it.estado)}</td>
      <td class="text-end">${esc(it.cantidad)} <span class="text-muted small">${esc(it.unidad)}</span></td>
      <td class="text-end text-nowrap"><button class="btn btn-sm btn-outline-secondary" data-accion="ver-ficha" data-id="${esc(it.id_item)}" title="Ver ficha completa" aria-label="Ver ficha de ${esc(it.nombre_producto)}"><i class="bi bi-eye"></i></button>
        <button class="btn btn-sm btn-outline-primary" data-accion="ver-com" data-id="${esc(it.id_item)}" data-nombre="${esc(it.nombre_producto)}" title="Comentarios" aria-label="Comentarios de ${esc(it.nombre_producto)}"><i class="bi bi-chat-text"></i></button></td></tr>`).join('');
    const filtros = (divisiones.length > 1 ? `<select class="form-select form-select-sm" style="width:auto" data-filtro="division" aria-label="Filtrar por división"><option value="">Todas las divisiones</option>${opciones}</select>` : '')
      + (items.length ? `<select class="form-select form-select-sm" style="width:auto" data-filtro="estado" aria-label="Filtrar por estado"><option value="">Todos los estados</option>${ESTADOS_ITEM.map(e => `<option>${e}</option>`).join('')}</select>` : '');
    this.area.innerHTML = cabecera('bi-box', 'Inventario', `<span class="badge bg-secondary" data-contador="ítem"></span>${filtros}${items.length ? buscador('Buscar SKU, producto, marca, serie...') : ''}`) + (items.length
      ? `<div class="card shadow-sm"><div class="card-body p-0"><div class="table-responsive"><table class="table table-inventario table-hover mb-0"><thead class="table-light"><tr><th>SKU</th><th>Producto</th><th class="d-none d-md-table-cell">División</th><th>Estado</th><th class="text-end">Cant.</th><th></th></tr></thead>
        <tbody>${filas}<tr class="sin-resultados" hidden><td colspan="6" class="text-center text-muted py-4">Ningún ítem coincide con los filtros.</td></tr></tbody></table></div></div></div>`
      : `<div class="card shadow-sm">${estadoVacio('bi-box', 'No hay productos en el inventario')}</div>`);
    activarFiltros(this.area);
  }

  renderComentarios(comentarios, quien) {
    const filas = comentarios.map(c => `<tr data-buscar="${esc(normalizar(c.nombre_producto + ' ' + c.comentario))}"><td>${esc(c.nombre_producto || '-')}</td><td>${esc(c.comentario)}</td><td>${esc(quien(c.id_usuario))}</td><td class="text-nowrap">${fmt(c.fecha_hora)}</td></tr>`).join('');
    this.area.innerHTML = cabecera('bi-chat-text', 'Comentarios de productos', `<span class="badge bg-secondary" data-contador="comentario"></span>${comentarios.length ? buscador('Buscar comentario...') : ''}`) + (comentarios.length
      ? `<div class="card shadow-sm"><div class="card-body p-0"><div class="table-responsive"><table class="table table-hover table-admin mb-0"><thead class="table-light"><tr><th>Producto</th><th>Comentario</th><th>Usuario</th><th>Fecha</th></tr></thead>
        <tbody>${filas}<tr class="sin-resultados" hidden><td colspan="4" class="text-center text-muted py-4">Ningún comentario coincide.</td></tr></tbody></table></div></div></div>`
      : `<div class="card shadow-sm">${estadoVacio('bi-chat-text', 'No hay comentarios registrados')}</div>`);
    activarFiltros(this.area);
  }

  destruir() {
    this.area.removeEventListener('click', this._clicArea);
    this.sidebar.removeEventListener('click', this._clicNav);
    this.navMovil.removeEventListener('click', this._clicNav);
    this.header.removeEventListener('click', this._clicHeader);
    this.area.innerHTML = ''; this.header.innerHTML = ''; this.sidebar.innerHTML = ''; this.navMovil.innerHTML = '';
  }
}
