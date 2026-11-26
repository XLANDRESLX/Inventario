import { AdminView } from '../views/adminView.js';
import { leer, leerVarios, precargar, escribir, enCache, Q } from '../api.js';
import { sha256 } from '../models/authModel.js';
import { toast, confirmar, formModal, cargando, fichaItem, comprimirImagen, ESTADOS_ITEM } from '../ui.js';

const TITULOS = { divisiones: 'Divisiones / Salas', usuarios: 'Usuarios', inventario: 'Inventario', comentarios: 'Comentarios' };

export class AdminController {
  constructor(sesion) {
    this.sesion = sesion;
    this.view = new AdminView();
    this.emp = null;            // empresa abierta: { id_empresa, nombre_empresa }
    this.seccion = null;
    this.divFiltro = '';        // división preseleccionada al ir a Inventario
    this.datos = { empresas: [], divisiones: [], items: [], usuarios: [], comentarios: [] };
    this._tok = 0;              // evita que una respuesta tardía pinte una vista ya abandonada
    this._sincronizandoItems = false;
    this._onClick = (e) => this._clic(e);
    this._onSubmit = (e) => this._enviar(e);
    this._onNav = (e) => this._navegar(e);
    this._onCambio = (e) => this._previsualizar(e);
    this._wire();
    this.view.renderHeader(sesion.usuario, 'SuperAdmin');
    this.irEmpresas();
  }

  /* ============================ Eventos (delegación) ============================ */
  _wire() {
    const v = this.view;
    v.main.addEventListener('click', this._onClick);
    v.main.addEventListener('submit', this._onSubmit);
    v.main.addEventListener('change', this._onCambio);
    [v.crumb, v.sidebar, v.navMovil].forEach(el => el.addEventListener('click', this._onNav));
  }

  _navegar(e) {
    const crumb = e.target.closest('[data-nav]');
    const sec = e.target.closest('[data-seccion]');
    if (crumb) {
      e.preventDefault();
      if (crumb.dataset.nav === 'empresas') this.irEmpresas();
      else if (crumb.dataset.nav === 'empresa') this.irSeccion('divisiones');
    } else if (sec) {
      this.divFiltro = '';
      this.irSeccion(sec.dataset.seccion);
    }
  }

  _clic(e) {
    const el = e.target.closest('[data-accion]');
    if (!el) return;
    const { accion, id, target } = el.dataset;
    const acciones = {
      'toggle-form': () => this.view.toggleForm(target),
      'refrescar': () => this.irSeccion(this.seccion, { forzar: true }),
      'reintentar': () => (this.emp ? this.irSeccion(this.seccion, { forzar: true }) : this.irEmpresas({ forzar: true })),
      'abrir-empresa': () => this.abrirEmpresa(id, 'divisiones'),
      'usuarios-empresa': () => this.abrirEmpresa(id, 'usuarios'),
      'editar-empresa': () => this.editarEmpresa(id),
      'eliminar-empresa': () => this.eliminarEmpresa(id),
      'ver-inventario-division': () => { this.divFiltro = id; this.irSeccion('inventario'); },
      'editar-division': () => this.editarDivision(id),
      'eliminar-division': () => this.eliminarDivision(id),
      'editar-usuario': () => this.editarUsuario(id),
      'eliminar-usuario': () => this.eliminarUsuario(id),
      'editar-item': () => this.editarItem(id),
      'eliminar-item': () => this.eliminarItem(id),
      'ver-ficha': () => this._verFicha(id),
      'duplicar-item': () => this.duplicarItem(id),
      'ver-com': () => this._verComentarios(id)
    };
    if (acciones[accion]) acciones[accion]();
  }

  /** Vista previa de la fotografía elegida en el formulario de creación. */
  async _previsualizar(e) {
    const inp = e.target.closest('input[type=file][data-preview]');
    if (!inp) return;
    const img = document.getElementById(inp.dataset.preview);
    try {
      if (!inp.files[0]) { img.classList.add('d-none'); return; }
      img.src = await comprimirImagen(inp.files[0], 200, 0.6);
      img.classList.remove('d-none');
    } catch (err) { inp.value = ''; img.classList.add('d-none'); toast(err.message, 'danger'); }
  }

  _enviar(e) {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    if (!form.checkValidity()) { form.classList.add('was-validated'); return; }
    const vals = Object.fromEntries(new FormData(form).entries());
    const crear = { 'form-empresa': this.crearEmpresa, 'form-division': this.crearDivision, 'form-usuario': this.crearUsuario, 'form-item': this.crearItem }[form.dataset.form];
    if (crear) crear.call(this, vals, form.querySelector('button[type=submit]'));
  }

  /* ============================ Carga con caché ============================ */
  async _cargar(tok, pedir, pintar) {
    let firma = null;
    const aplicar = (d) => {
      if (tok !== this._tok) return;
      const f = JSON.stringify(d);
      if (f === firma) return;           // mismo dato que ya se pintó: sin parpadeo
      firma = f; pintar(d);
    };
    try { aplicar(await pedir(aplicar)); }
    catch (err) { if (tok === this._tok) this.view.renderError(err.message || 'No se pudo cargar'); }
  }

  /* ============================ Pantallas ============================ */
  async irEmpresas({ forzar = false } = {}) {
    const tok = ++this._tok;
    this.emp = null; this.seccion = null; this.divFiltro = '';
    this.view.ocultarNavEmpresa();
    this.view.renderBreadcrumb([{ texto: 'Empresas' }]);
    this.view.cargando(5);
    await this._cargar(tok,
      (onCache) => leer(Q.empresas(), { onCache, forzar }),
      (d) => { this.datos.empresas = d.empresas || []; this.view.renderEmpresas(this.datos.empresas); });
  }

  async abrirEmpresa(idEmpresa, seccion = 'divisiones') {
    const e = this.datos.empresas.find(x => x.id_empresa === idEmpresa);
    if (!e) return;
    this.emp = { id_empresa: e.id_empresa, nombre_empresa: e.nombre_empresa };
    this.view.mostrarNavEmpresa(this.emp.nombre_empresa, seccion);
    precargar(Q.usuarios(idEmpresa));   // el apartado Usuarios queda listo antes de pulsarlo
    await this.irSeccion(seccion);
  }

  async irSeccion(seccion, { forzar = false } = {}) {
    if (!this.emp) return;
    const tok = ++this._tok;
    const id = this.emp.id_empresa;
    this.seccion = seccion;
    this.view.setNavActivo(seccion);
    this.view.renderBreadcrumb([
      { texto: 'Empresas', nav: 'empresas' },
      { texto: this.emp.nombre_empresa, nav: 'empresa' },
      { texto: TITULOS[seccion] }
    ]);
    this.view.cargando(5);

    const par = [Q.divisiones(id), Q.invAdmin(id)];
    const guardarPar = ([dv, inv]) => { this.datos.divisiones = dv.divisiones || []; this.datos.items = inv.items || []; };
    switch (seccion) {
      case 'divisiones':
        return this._cargar(tok, (onCache) => leerVarios(par, { onCache, forzar }),
          (r) => { guardarPar(r); this.view.renderDivisiones(this.datos.divisiones, this.datos.items); });
      case 'inventario':
        return this._cargar(tok, (onCache) => leerVarios(par, { onCache, forzar }),
          (r) => { guardarPar(r); this.view.renderInventario(this.datos.items, this.datos.divisiones, this.divFiltro); });
      case 'usuarios':
        return this._cargar(tok, (onCache) => leer(Q.usuarios(id), { onCache, forzar }),
          (d) => { this.datos.usuarios = d.usuarios || []; this.view.renderUsuarios(this.datos.usuarios); });
      case 'comentarios':
        return this._cargar(tok, (onCache) => leerVarios([Q.comentarios(id), Q.usuarios(id)], { onCache, forzar }),
          ([c, u]) => {
            this.datos.comentarios = c.comentarios || [];
            this.datos.usuarios = u.usuarios || [];
            const nombres = new Map(this.datos.usuarios.map(x => [x.id_usuario, x.usuario]));
            this.view.renderComentarios(this.datos.comentarios, (idU) => nombres.get(idU) || idU || '-');
          });
    }
  }

  /* ============================ Búsqueda en datos cargados ============================ */
  _item(id) { return this.datos.items.find(x => x.id_item === id); }

  /** Valida que SKU y número de serie no estén ya usados por otro ítem. Retorna mensaje de error o null. */
  _validarUnicidadItem(v, idItemExcluir = null) {
    const sku = (v.codigo_sku || '').trim();
    const serie = (v.numero_serie || '').trim();
    const skuN = sku.toLocaleUpperCase();
    const serieN = serie.toLocaleUpperCase();
    const dup = this.datos.items.find(it => {
      if (it.id_item === idItemExcluir) return false;
      if (skuN && it.codigo_sku && it.codigo_sku.trim().toLocaleUpperCase() === skuN) return true;
      if (serieN && it.numero_serie && it.numero_serie.trim().toLocaleUpperCase() === serieN) return true;
      return false;
    });
    if (dup) {
      if (sku && dup.codigo_sku && dup.codigo_sku.trim().toLocaleUpperCase() === skuN)
        return `El SKU "${sku}" ya está registrado en otro ítem.`;
      if (serie && dup.numero_serie && dup.numero_serie.trim().toLocaleUpperCase() === serieN)
        return `El número de serie "${serie}" ya está registrado en otro ítem.`;
    }
    return null;
  }

  _verFicha(id) {
    const it = this._item(id); if (!it) return;
    const d = this.datos.divisiones.find(x => x.id_division === it.id_division);
    fichaItem(it, d ? d.nombre_division : '');
  }

  _verComentarios(id) {
    const it = this._item(id);
    if (!it || !window.abrirComGlobal) return;
    const u = enCache(Q.usuarios(this.emp.id_empresa));
    const nombres = new Map(((u && u.usuarios) || []).map(x => [x.id_usuario, x.usuario]));
    window.abrirComGlobal(id, it.nombre_producto, { soloLectura: true, nombreUsuario: (idU) => nombres.get(idU) || idU || '-' });
  }

  /* ============================ Acciones ============================ */
  async _ejecutar(boton, texto, accion, mensajeOk, despues) {
    const restaurar = cargando(boton, texto);
    try {
      await accion();
      toast(mensajeOk, 'success');
      await despues();
    } catch (err) { toast(err.message || 'No se pudo completar la acción', 'danger'); }
    finally { restaurar(); }
  }

  crearEmpresa(v, btn) {
    return this._ejecutar(btn, 'Creando...', async () => escribir({
      action: 'crear_empresa',
      nombre_empresa: v.nombre_empresa.trim(),
      usuario_empresa: v.usuario_empresa.trim(),
      pass_hash_empresa: await sha256(v.password_empresa)
    }, ['listar_empresas', 'listar_usuarios']), 'Empresa creada', () => this.irEmpresas({ forzar: true }));
  }

  crearDivision(v, btn) {
    return this._ejecutar(btn, 'Creando...', () => escribir({
      action: 'crear_division', id_empresa: this.emp.id_empresa, nombre_division: v.nombre_division.trim(), ubicacion: (v.ubicacion || '').trim()
    }, ['obtener_divisiones']), 'División creada', () => this.irSeccion('divisiones', { forzar: true }));
  }

  crearUsuario(v, btn) {
    return this._ejecutar(btn, 'Creando...', async () => escribir({
      action: 'crear_usuario', id_empresa: this.emp.id_empresa, usuario: v.usuario.trim(), pass_hash: await sha256(v.password)
    }, ['listar_usuarios', 'listar_empresas']), 'Usuario creado', () => this.irSeccion('usuarios', { forzar: true }));
  }

  crearItem(v, btn) {
    this.divFiltro = v.id_division;
    const error = this._validarUnicidadItem(v);
    if (error) { toast(error, 'warning'); return; }
    return this._ejecutar(btn, 'Guardando...', async () => escribir({
      action: 'crear_item', id_empresa: this.emp.id_empresa, id_division: v.id_division,
      codigo_sku: (v.codigo_sku || '').trim(), nombre_producto: v.nombre_producto.trim(),
      cantidad: Number(v.cantidad) || 0, unidad: v.unidad.trim(),
      marca: (v.marca || '').trim(), modelo: (v.modelo || '').trim(), numero_serie: (v.numero_serie || '').trim(),
      estado: v.estado, especificaciones: (v.especificaciones || '').trim(), observaciones: (v.observaciones || '').trim(),
      foto_base64: v.foto && v.foto.size ? await comprimirImagen(v.foto) : ''
    }, ['obtener_inventario_admin', 'obtener_inventario']), 'Ítem creado', () => this.irSeccion('inventario', { forzar: true }));
  }

  /** Duplica un ítem existente abriendo el formulario precargado con sus datos. */
  async duplicarItem(id) {
    const it = this._item(id); if (!it) return;
    const r = await formModal({
      titulo: 'Duplicar ítem', grande: true,
      campos: [
        { name: 'nombre_producto', label: 'Producto', value: it.nombre_producto + ' (copia)', required: true, col: 8 },
        { name: 'codigo_sku', label: 'SKU (déjalo vacío para autogenerar)', value: '', col: 4 },
        { name: 'marca', label: 'Marca', value: it.marca, maxlength: 100, col: 4 },
        { name: 'modelo', label: 'Modelo', value: it.modelo, maxlength: 100, col: 4 },
        { name: 'numero_serie', label: 'N.º de serie', value: '', maxlength: 100, col: 4 },
        { name: 'estado', label: 'Estado', value: it.estado || 'Bueno', opciones: ESTADOS_ITEM, col: 4 },
        { name: 'cantidad', label: 'Cantidad', type: 'number', value: it.cantidad, required: true, col: 4 },
        { name: 'unidad', label: 'Unidad', value: it.unidad, required: true, col: 4 },
        { name: 'especificaciones', label: 'Especificaciones', type: 'textarea', value: it.especificaciones, maxlength: 2000 },
        { name: 'observaciones', label: 'Observaciones', type: 'textarea', value: it.observaciones, maxlength: 2000, rows: 2 },
        { name: 'foto_base64', label: 'Fotografía', type: 'imagen', value: it.fotografia }
      ],
      alEnviar: (v) => {
        const error = this._validarUnicidadItem(v);
        if (error) throw new Error(error);
        const body = {
          action: 'crear_item', id_empresa: this.emp.id_empresa, id_division: it.id_division,
          codigo_sku: (v.codigo_sku || '').trim(), nombre_producto: v.nombre_producto.trim(),
          marca: v.marca.trim(), modelo: v.modelo.trim(), numero_serie: v.numero_serie.trim(), estado: v.estado,
          cantidad: Number(v.cantidad), unidad: v.unidad.trim(), especificaciones: v.especificaciones.trim(), observaciones: v.observaciones.trim()
        };
        if (v.quitar_foto) body.quitar_foto = true;
        else if (v.foto_base64) body.foto_base64 = v.foto_base64;
        else if (it.fotografia) body.foto_base64 = it.fotografia;
        return escribir(body, ['obtener_inventario_admin', 'obtener_inventario']);
      }
    });
    if (r) { toast('Ítem duplicado', 'success'); this.irSeccion('inventario', { forzar: true }); }
  }

  /** Sincroniza ítems nuevos sin recargar la vista: solo agrega al DOM los que faltan. */
  async sincronizarItemsIncremental() {
    if (!this.emp || this.seccion !== 'inventario' || this._sincronizandoItems) return;
    this._sincronizandoItems = true;
    const id = this.emp.id_empresa;
    try {
      const d = await leer(Q.invAdmin(id), { forzar: true });
      const nuevos = d.items || [];
      const existentes = new Set(this.datos.items.map(i => i.id_item));
      const nombreDiv = new Map(this.datos.divisiones.map(x => [x.id_division, x.nombre_division]));
      let agregado = false;
      for (const it of nuevos) {
        if (!existentes.has(it.id_item)) {
          this.datos.items.push(it);
          this.view.agregarFilaItem(it, nombreDiv.get(it.id_division) || '');
          agregado = true;
        }
      }
    } catch (e) { /* silencioso: la próxima pasada lo intentará de nuevo */ }
    finally { this._sincronizandoItems = false; }
  }

  /** Vuelve a cargar la sección activa con datos frescos del servidor. */
  refrescarForzado() {
    if (this.seccion) this.irSeccion(this.seccion, { forzar: true });
  }

  async editarEmpresa(id) {
    const e = this.datos.empresas.find(x => x.id_empresa === id); if (!e) return;
    const r = await formModal({
      titulo: 'Editar empresa',
      campos: [
        { name: 'nombre_empresa', label: 'Nombre', value: e.nombre_empresa, required: true },
        { name: 'estado', label: 'Estado', value: e.estado || 'Activo', opciones: ['Activo', 'Inactivo'] }
      ],
      alEnviar: (v) => escribir({ action: 'actualizar_empresa', id_empresa: id, nombre_empresa: v.nombre_empresa.trim(), estado: v.estado }, ['listar_empresas'])
    });
    if (r) { toast('Empresa actualizada', 'success'); this.irEmpresas({ forzar: true }); }
  }

  async editarDivision(id) {
    const d = this.datos.divisiones.find(x => x.id_division === id); if (!d) return;
    const r = await formModal({
      titulo: 'Editar división / sala',
      campos: [
        { name: 'nombre_division', label: 'Nombre', value: d.nombre_division, required: true },
        { name: 'ubicacion', label: 'Ubicación', value: d.ubicacion }
      ],
      alEnviar: (v) => escribir({ action: 'actualizar_division', id_division: id, nombre_division: v.nombre_division.trim(), ubicacion: v.ubicacion.trim() }, ['obtener_divisiones', 'obtener_inventario'])
    });
    if (r) { toast('División actualizada', 'success'); this.irSeccion(this.seccion, { forzar: true }); }
  }

  async editarUsuario(id) {
    const u = this.datos.usuarios.find(x => x.id_usuario === id); if (!u) return;
    const r = await formModal({
      titulo: 'Editar usuario',
      campos: [
        { name: 'usuario', label: 'Usuario', value: u.usuario, required: true },
        { name: 'estado', label: 'Estado', value: u.estado || 'Activo', opciones: ['Activo', 'Inactivo'] },
        { name: 'password', label: 'Nueva contraseña', type: 'password', ayuda: 'Déjala vacía para conservar la actual.' }
      ],
      alEnviar: async (v) => {
        const body = { action: 'actualizar_usuario', id_usuario: id, usuario: v.usuario.trim(), estado: v.estado };
        if (v.password) body.pass_hash = await sha256(v.password);
        return escribir(body, ['listar_usuarios', 'listar_empresas']);
      }
    });
    if (r) { toast('Usuario actualizado', 'success'); this.irSeccion('usuarios', { forzar: true }); }
  }

  async editarItem(id) {
    const it = this._item(id); if (!it) return;
    const r = await formModal({
      titulo: 'Editar ítem', grande: true,
      campos: [
        { name: 'codigo_sku', label: 'SKU', value: it.codigo_sku, required: true, col: 4 },
        { name: 'nombre_producto', label: 'Producto', value: it.nombre_producto, required: true, col: 8 },
        { name: 'marca', label: 'Marca', value: it.marca, maxlength: 100, col: 4 },
        { name: 'modelo', label: 'Modelo', value: it.modelo, maxlength: 100, col: 4 },
        { name: 'numero_serie', label: 'N.º de serie', value: it.numero_serie, maxlength: 100, col: 4 },
        { name: 'estado', label: 'Estado', value: it.estado || 'Bueno', opciones: ESTADOS_ITEM, col: 4 },
        { name: 'cantidad', label: 'Cantidad', type: 'number', value: it.cantidad, required: true, col: 4 },
        { name: 'unidad', label: 'Unidad', value: it.unidad, required: true, col: 4 },
        { name: 'especificaciones', label: 'Especificaciones', type: 'textarea', value: it.especificaciones, maxlength: 2000 },
        { name: 'observaciones', label: 'Observaciones', type: 'textarea', value: it.observaciones, maxlength: 2000, rows: 2 },
        { name: 'foto_base64', label: 'Fotografía', type: 'imagen', value: it.fotografia }
      ],
      alEnviar: (v) => {
        const error = this._validarUnicidadItem(v, id);
        if (error) throw new Error(error);
        const body = {
          action: 'actualizar_item', id_item: id, codigo_sku: v.codigo_sku.trim(), nombre_producto: v.nombre_producto.trim(),
          marca: v.marca.trim(), modelo: v.modelo.trim(), numero_serie: v.numero_serie.trim(), estado: v.estado,
          cantidad: Number(v.cantidad), unidad: v.unidad.trim(), especificaciones: v.especificaciones.trim(), observaciones: v.observaciones.trim()
        };
        if (v.foto_base64) body.foto_base64 = v.foto_base64;
        else if (v.quitar_foto) body.quitar_foto = true;
        return escribir(body, ['obtener_inventario_admin', 'obtener_inventario']);
      }
    });
    if (r) { toast('Ítem actualizado', 'success'); this.irSeccion('inventario', { forzar: true }); }
  }

  async _eliminar(mensaje, body, invalidar, mensajeOk, despues) {
    if (!await confirmar(mensaje)) return;
    try { await escribir(body, invalidar); toast(mensajeOk, 'success'); await despues(); }
    catch (err) { toast(err.message || 'No se pudo eliminar', 'danger'); }
  }

  eliminarEmpresa(id) {
    const e = this.datos.empresas.find(x => x.id_empresa === id); if (!e) return;
    return this._eliminar(`¿Eliminar la empresa «${e.nombre_empresa}»? También se eliminarán sus divisiones, usuarios e ítems. Esta acción no se puede deshacer.`,
      { action: 'eliminar_empresa', id_empresa: id },
      ['listar_empresas', 'obtener_divisiones', 'listar_usuarios', 'obtener_inventario_admin', 'obtener_inventario', 'obtener_comentarios_todos'],
      'Empresa eliminada', () => this.irEmpresas({ forzar: true }));
  }

  eliminarDivision(id) {
    const d = this.datos.divisiones.find(x => x.id_division === id); if (!d) return;
    const n = this.datos.items.filter(i => i.id_division === id).length;
    return this._eliminar(`¿Eliminar la división «${d.nombre_division}»?${n ? ` Tiene ${n} ítem(s) que también se eliminarán.` : ''}`,
      { action: 'eliminar_division', id_division: id }, ['obtener_divisiones', 'obtener_inventario_admin', 'obtener_inventario'],
      'División eliminada', () => this.irSeccion('divisiones', { forzar: true }));
  }

  eliminarUsuario(id) {
    const u = this.datos.usuarios.find(x => x.id_usuario === id); if (!u) return;
    return this._eliminar(`¿Eliminar el usuario «${u.usuario}»?`, { action: 'eliminar_usuario', id_usuario: id },
      ['listar_usuarios', 'listar_empresas'], 'Usuario eliminado', () => this.irSeccion('usuarios', { forzar: true }));
  }

  eliminarItem(id) {
    const it = this._item(id); if (!it) return;
    return this._eliminar(`¿Eliminar el ítem «${it.nombre_producto}»?`, { action: 'eliminar_item', id_item: id },
      ['obtener_inventario_admin', 'obtener_inventario'], 'Ítem eliminado', () => this.irSeccion('inventario', { forzar: true }));
  }

  destruir() {
    this._tok++;
    const v = this.view;
    v.main.removeEventListener('click', this._onClick);
    v.main.removeEventListener('submit', this._onSubmit);
    v.main.removeEventListener('change', this._onCambio);
    [v.crumb, v.sidebar, v.navMovil].forEach(el => el.removeEventListener('click', this._onNav));
    v.destruir();
  }
}
