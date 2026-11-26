import { esc, fmt, normalizar, skeletonTabla, estadoVacio, estadoError, badgeEstado, buscador, activarFiltros, cabecera, btnIcono, ESTADOS_ITEM, badgeEstadoItem, celdaProducto, textoBusquedaItem } from '../ui.js';

const SECCIONES = [
  { id: 'divisiones', icono: 'bi-layout-sidebar', texto: 'Divisiones' },
  { id: 'usuarios', icono: 'bi-people', texto: 'Usuarios' },
  { id: 'inventario', icono: 'bi-box', texto: 'Inventario' },
  { id: 'comentarios', icono: 'bi-chat-text', texto: 'Comentarios' }
];

const $ = (id) => document.getElementById(id);

export class AdminView {
  constructor() {
    this.main = $('admin-contenido');
    this.crumb = $('breadcrumb-admin');
    this.sidebar = $('sidebar-admin');
    this.sidebarCol = $('sidebar-admin-col');
    this.mainCol = $('admin-main');
    this.navMovil = $('nav-movil-admin');
  }

  renderHeader(usuario, rol = 'SuperAdmin') {
    const u = $('span-usuario-admin'), r = $('header-admin-rol');
    if (u) u.textContent = usuario;
    if (r) r.textContent = rol;
  }

  /* ---------- Navegación ---------- */
  renderBreadcrumb(items) {
    this.crumb.closest('nav').classList.toggle('d-none', items.length < 2);
    this.crumb.innerHTML = items.map((it, i) => {
      const ultimo = i === items.length - 1;
      return ultimo
        ? `<li class="breadcrumb-item active" aria-current="page">${esc(it.texto)}</li>`
        : `<li class="breadcrumb-item"><a href="#" data-nav="${it.nav}">${esc(it.texto)}</a></li>`;
    }).join('');
  }

  mostrarNavEmpresa(nombreEmpresa, activa) {
    this.sidebarCol.className = 'col-md-3 col-lg-2 d-none d-md-block';
    this.mainCol.className = 'col-12 col-md-9 col-lg-10';
    this.sidebar.innerHTML = `
      <div class="sidebar-header p-3 mb-3"><small class="text-white-50 d-block">Empresa</small><h6 class="mb-0 fw-bold">${esc(nombreEmpresa)}</h6></div>
      <nav class="list-group list-group-flush sidebar-nav" aria-label="Apartados de la empresa">
        ${SECCIONES.map(s => `<button class="list-group-item list-group-item-action btn-seccion" data-seccion="${s.id}"><i class="bi ${s.icono} me-2"></i>${s.texto}</button>`).join('')}
      </nav>`;
    this.navMovil.innerHTML = `<div class="nav-movil" role="tablist">${SECCIONES.map(s =>
      `<button class="btn btn-sm" data-seccion="${s.id}"><i class="bi ${s.icono} me-1"></i>${s.texto}</button>`).join('')}</div>`;
    this.setNavActivo(activa);
  }

  ocultarNavEmpresa() {
    this.sidebarCol.className = 'd-none';
    this.mainCol.className = 'col-12';
    this.sidebar.innerHTML = '';
    this.navMovil.innerHTML = '';
  }

  setNavActivo(sec) {
    this.sidebar.querySelectorAll('[data-seccion]').forEach(b => {
      const on = b.dataset.seccion === sec;
      b.classList.toggle('active', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    this.navMovil.querySelectorAll('[data-seccion]').forEach(b => {
      const on = b.dataset.seccion === sec;
      b.classList.toggle('btn-primary', on);
      b.classList.toggle('btn-outline-secondary', !on);
    });
  }

  /* ---------- Estados ---------- */
  cargando(cols = 5) { this.main.innerHTML = skeletonTabla(cols, 5); }
  renderError(msg) { this.main.innerHTML = estadoError(msg); }

  /* ---------- Plantillas ---------- */
  _formNuevo(id, titulo, campos, boton) {
    return `<div id="${id}" class="card mb-3 d-none border-primary"><div class="card-header"><h6 class="mb-0">${titulo}</h6></div><div class="card-body">
      <form data-form="${id}" novalidate><div class="row g-2 align-items-end">${campos}
      <div class="col-md-auto"><button type="submit" class="btn btn-primary w-100">${boton}</button></div></div></form></div></div>`;
  }
  _campo(cols, label, name, extra = '') {
    return `<div class="col-md-${cols}"><label class="form-label small mb-1">${label}</label><input class="form-control" name="${name}" ${extra} /></div>`;
  }
  _btnNuevo(target, texto) {
    return `<button class="btn btn-primary btn-sm" data-accion="toggle-form" data-target="${target}"><i class="bi bi-plus-lg me-1"></i>${texto}</button>`;
  }
  _tabla(thead, filas, vacioMsg, cols) {
    return `<div class="card shadow-sm"><div class="card-body p-0"><div class="table-responsive"><table class="table table-admin table-hover mb-0">
      <thead class="table-light"><tr>${thead}</tr></thead><tbody>${filas}
      <tr class="sin-resultados" hidden><td colspan="${cols}" class="text-center text-muted py-4">${vacioMsg}</td></tr></tbody></table></div></div></div>`;
  }

  /* ---------- Empresas ---------- */
  renderEmpresas(empresas) {
    const lista = empresas || [];
    const filas = lista.map(e => {
      const accesos = (e.usuarios_acceso || []).map(esc).join(', ') || '<span class="text-muted">—</span>';
      return `<tr data-buscar="${esc(normalizar(e.nombre_empresa + ' ' + e.id_empresa))}">
        <td><strong>${esc(e.nombre_empresa)}</strong><div class="small text-muted">${esc(e.id_empresa)}</div></td>
        <td class="d-none d-md-table-cell">${accesos}</td>
        <td class="d-none d-lg-table-cell">${fmt(e.fecha_creacion)}</td>
        <td>${badgeEstado(e.estado)}</td>
        <td class="acciones text-end">
          <button class="btn btn-sm btn-primary" data-accion="abrir-empresa" data-id="${esc(e.id_empresa)}"><i class="bi bi-box-arrow-in-right me-1"></i>Abrir</button>
          ${btnIcono('usuarios-empresa', e.id_empresa, 'bi-people', 'Usuarios')}
          ${btnIcono('editar-empresa', e.id_empresa, 'bi-pencil', 'Editar empresa')}
          ${btnIcono('eliminar-empresa', e.id_empresa, 'bi-trash', 'Eliminar empresa', 'outline-danger')}
        </td></tr>`;
    }).join('');
    const form = this._formNuevo('form-empresa', 'Nueva empresa',
      this._campo(4, 'Nombre de la empresa', 'nombre_empresa', 'required') +
      this._campo(3, 'Usuario de acceso', 'usuario_empresa', 'required autocomplete="off" placeholder="ej: acme"') +
      this._campo(3, 'Contraseña', 'password_empresa', 'type="password" required autocomplete="new-password"'), 'Crear empresa');
    this.main.innerHTML = cabecera('bi-buildings', 'Empresas', `<span class="badge bg-secondary" data-contador="empresa"></span>${lista.length ? buscador('Buscar empresa...') : ''}${this._btnNuevo('form-empresa', 'Nueva empresa')}`) + form +
      (lista.length
        ? this._tabla('<th>Empresa</th><th class="d-none d-md-table-cell">Usuarios de acceso</th><th class="d-none d-lg-table-cell">Creación</th><th>Estado</th><th class="text-end">Acciones</th>', filas, 'Ninguna empresa coincide con la búsqueda.', 5)
        : `<div class="card shadow-sm">${estadoVacio('bi-buildings', 'Aún no hay empresas', 'Crea la primera con el botón «Nueva empresa».')}</div>`);
    activarFiltros(this.main);
  }

  /* ---------- Divisiones ---------- */
  renderDivisiones(divisiones, items) {
    const conteo = {};
    items.forEach(i => { conteo[i.id_division] = (conteo[i.id_division] || 0) + 1; });
    const filas = divisiones.map(d => `<tr data-buscar="${esc(normalizar(d.nombre_division + ' ' + d.ubicacion))}">
      <td><strong>${esc(d.nombre_division)}</strong></td><td>${esc(d.ubicacion) || '<span class="text-muted">—</span>'}</td>
      <td><span class="badge bg-info text-dark">${conteo[d.id_division] || 0} ítems</span></td>
      <td class="acciones text-end">
        <button class="btn btn-sm btn-outline-primary" data-accion="ver-inventario-division" data-id="${esc(d.id_division)}"><i class="bi bi-box me-1"></i>Inventario</button>
        ${btnIcono('editar-division', d.id_division, 'bi-pencil', 'Editar división')}
        ${btnIcono('eliminar-division', d.id_division, 'bi-trash', 'Eliminar división', 'outline-danger')}
      </td></tr>`).join('');
    const form = this._formNuevo('form-division', 'Nueva división / sala',
      this._campo(5, 'Nombre', 'nombre_division', 'required placeholder="Ej: Sala de Sistemas"') +
      this._campo(5, 'Ubicación', 'ubicacion', 'placeholder="Piso 3, Oficina 10"'), 'Crear división');
    this.main.innerHTML = cabecera('bi-layout-sidebar', 'Divisiones / Salas', this._btnNuevo('form-division', 'Nueva división')) + form +
      (divisiones.length
        ? this._tabla('<th>Nombre</th><th>Ubicación</th><th>Ítems</th><th class="text-end">Acciones</th>', filas, '', 4)
        : `<div class="card shadow-sm">${estadoVacio('bi-layout-sidebar', 'Esta empresa no tiene divisiones', 'Crea una para poder registrar ítems de inventario.')}</div>`);
  }

  /* ---------- Usuarios ---------- */
  renderUsuarios(usuarios) {
    const filas = usuarios.map(u => `<tr data-buscar="${esc(normalizar(u.usuario))}">
      <td><i class="bi bi-person me-2 text-muted"></i><strong>${esc(u.usuario)}</strong></td>
      <td><span class="badge bg-info text-dark">${esc(u.rol)}</span></td><td>${badgeEstado(u.estado)}</td>
      <td class="acciones text-end">${btnIcono('editar-usuario', u.id_usuario, 'bi-pencil', 'Editar usuario')}${btnIcono('eliminar-usuario', u.id_usuario, 'bi-trash', 'Eliminar usuario', 'outline-danger')}</td></tr>`).join('');
    const form = this._formNuevo('form-usuario', 'Nuevo usuario (solo lectura)',
      this._campo(5, 'Usuario', 'usuario', 'required autocomplete="off"') +
      this._campo(5, 'Contraseña', 'password', 'type="password" required autocomplete="new-password"'), 'Crear usuario');
    this.main.innerHTML = cabecera('bi-people', 'Usuarios', this._btnNuevo('form-usuario', 'Nuevo usuario')) + form +
      (usuarios.length
        ? this._tabla('<th>Usuario</th><th>Rol</th><th>Estado</th><th class="text-end">Acciones</th>', filas, '', 4)
        : `<div class="card shadow-sm">${estadoVacio('bi-people', 'Esta empresa no tiene usuarios')}</div>`);
  }

  /* ---------- Inventario ---------- */
  renderInventario(items, divisiones, idDivFiltro = '') {
    const nombreDiv = new Map(divisiones.map(d => [d.id_division, d.nombre_division]));
    const opciones = divisiones.map(d => `<option value="${esc(d.id_division)}" ${d.id_division === idDivFiltro ? 'selected' : ''}>${esc(d.nombre_division)}</option>`).join('');
    const opcEstado = ESTADOS_ITEM.map(e => `<option ${e === 'Bueno' ? 'selected' : ''}>${e}</option>`).join('');
    const filas = items.map(it => this.filaItemHtml(it, nombreDiv.get(it.id_division))).join('');
    const col = (cols, label, ctl) => `<div class="col-md-${cols}"><label class="form-label small mb-1">${label}</label>${ctl}</div>`;
    const form = this._formNuevo('form-item', 'Nuevo ítem',
      col(3, 'División / Sala', `<select class="form-select" name="id_division" required><option value="">Selecciona...</option>${opciones}</select>`) +
      col(2, 'SKU <span class="text-muted">(auto)</span>', '<input class="form-control" name="codigo_sku" placeholder="SKU-0001" />') +
      col(4, 'Producto', '<input class="form-control" name="nombre_producto" required placeholder="Laptop, Mouse..." />') +
      col(3, 'Estado', `<select class="form-select" name="estado">${opcEstado}</select>`) +
      col(3, 'Marca', '<input class="form-control" name="marca" maxlength="100" />') +
      col(3, 'Modelo', '<input class="form-control" name="modelo" maxlength="100" />') +
      col(2, 'N.º de serie', '<input class="form-control" name="numero_serie" maxlength="100" />') +
      col(2, 'Cantidad', '<input class="form-control" type="number" name="cantidad" min="0" value="1" required />') +
      col(2, 'Unidad', '<input class="form-control" name="unidad" required placeholder="unidad" />') +
      col(6, 'Especificaciones', '<textarea class="form-control" name="especificaciones" rows="2" maxlength="2000" placeholder="Procesador, memoria, capacidad..."></textarea>') +
      col(6, 'Observaciones', '<textarea class="form-control" name="observaciones" rows="2" maxlength="2000"></textarea>') +
      col(6, 'Fotografía <span class="text-muted">(opcional)</span>', '<div class="d-flex align-items-center gap-3"><input class="form-control" type="file" name="foto" accept="image/*" data-preview="foto-preview-nuevo" /><img id="foto-preview-nuevo" class="foto-preview d-none" alt="Vista previa" /></div>'), 'Crear ítem');
    const filtros = divisiones.length
      ? `<select class="form-select form-select-sm" style="width:auto" data-filtro="division" aria-label="Filtrar por división"><option value="">Todas las divisiones</option>${opciones}</select>
         <select class="form-select form-select-sm" style="width:auto" data-filtro="estado" aria-label="Filtrar por estado"><option value="">Todos los estados</option>${ESTADOS_ITEM.map(e => `<option>${e}</option>`).join('')}</select>` : '';
    this.main.innerHTML = cabecera('bi-box', 'Inventario', `<span class="badge bg-secondary" data-contador="ítem"></span>${filtros}${items.length ? buscador('Buscar SKU, producto, marca, serie...') : ''}${divisiones.length ? this._btnNuevo('form-item', 'Nuevo ítem') : ''}`) +
      (divisiones.length ? form : '<div class="alert alert-warning"><i class="bi bi-info-circle me-2"></i>Primero crea una división / sala para poder registrar ítems.</div>') +
      (items.length
        ? this._tabla('<th>SKU</th><th>Producto</th><th class="d-none d-md-table-cell">División</th><th>Estado</th><th class="text-end">Cant.</th><th class="text-end">Acciones</th>', filas, 'Ningún ítem coincide con los filtros.', 6)
        : `<div class="card shadow-sm">${estadoVacio('bi-box', 'No hay ítems de inventario')}</div>`);
    activarFiltros(this.main);
  }

  /** Genera el HTML de una fila de ítem para la tabla de inventario. */
  filaItemHtml(it, nombreDiv) {
    return `<tr data-buscar="${esc(textoBusquedaItem(it, nombreDiv))}" data-div="${esc(it.id_division)}" data-est="${esc(it.estado)}">
      <td><code>${esc(it.codigo_sku)}</code></td><td>${celdaProducto(it)}</td>
      <td class="d-none d-md-table-cell"><span class="badge bg-secondary">${esc(nombreDiv || 'Sin división')}</span></td>
      <td>${badgeEstadoItem(it.estado)}</td>
      <td class="text-end">${esc(it.cantidad)} <span class="text-muted small">${esc(it.unidad)}</span></td>
      <td class="acciones text-end">${btnIcono('ver-ficha', it.id_item, 'bi-eye', 'Ver ficha completa', 'outline-secondary')}${btnIcono('ver-com', it.id_item, 'bi-chat-text', 'Ver comentarios', 'outline-primary')}${btnIcono('duplicar-item', it.id_item, 'bi-copy', 'Duplicar ítem', 'outline-info')}${btnIcono('editar-item', it.id_item, 'bi-pencil', 'Editar ítem')}${btnIcono('eliminar-item', it.id_item, 'bi-trash', 'Eliminar ítem', 'outline-danger')}</td></tr>`;
  }

  /** Agrega una fila de ítem al final de la tabla existente sin recargar toda la vista. */
  agregarFilaItem(it, nombreDiv) {
    const tabla = this.main.querySelector('table.table-admin tbody');
    if (!tabla) return;
    const vacia = tabla.querySelector('tr.sin-resultados');
    if (vacia) vacia.hidden = true;
    tabla.insertAdjacentHTML('beforeend', this.filaItemHtml(it, nombreDiv));
    const cont = this.main.querySelector('[data-contador]');
    if (cont) {
      const n = parseInt(cont.textContent) || 0;
      cont.textContent = `${n + 1} ${cont.dataset.contador}s`;
    }
    activarFiltros(this.main);
  }

  /* ---------- Comentarios ---------- */
  renderComentarios(comentarios, nombreUsuario) {
    const filas = comentarios.map(c => `<tr data-buscar="${esc(normalizar(c.nombre_producto + ' ' + c.comentario))}">
      <td>${esc(c.nombre_producto) || '<span class="text-muted">(ítem eliminado)</span>'}</td><td>${esc(c.comentario)}</td>
      <td>${esc(nombreUsuario(c.id_usuario))}</td><td class="text-nowrap">${fmt(c.fecha_hora)}</td></tr>`).join('');
    this.main.innerHTML = cabecera('bi-chat-text', 'Comentarios de productos', `<span class="badge bg-secondary" data-contador="comentario"></span>${comentarios.length ? buscador('Buscar comentario...') : ''}<button class="btn btn-outline-primary btn-sm" data-accion="refrescar"><i class="bi bi-arrow-repeat me-1"></i>Actualizar</button>`) +
      (comentarios.length
        ? this._tabla('<th>Producto</th><th>Comentario</th><th>Usuario</th><th>Fecha</th>', filas, 'Ningún comentario coincide.', 4)
        : `<div class="card shadow-sm">${estadoVacio('bi-chat-text', 'Aún no hay comentarios')}</div>`);
    activarFiltros(this.main);
  }

  /** Abre/cierra un formulario de creación y enfoca su primer campo. */
  toggleForm(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('d-none');
    if (!el.classList.contains('d-none')) { el.querySelector('input,select')?.focus(); el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }

  destruir() { this.main.innerHTML = ''; this.ocultarNavEmpresa(); this.crumb.innerHTML = ''; }
}
