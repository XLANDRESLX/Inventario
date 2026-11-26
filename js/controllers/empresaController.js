import { cargarDatosEmpresa, cargarComentarios } from '../models/empresaModel.js';
import { EmpresaView } from '../views/empresaView.js';
import { fichaItem } from '../ui.js';

export class EmpresaController {
  constructor(sesion) {
    this.empresa = { id_empresa: sesion.id_empresa, nombre_empresa: sesion.nombre_empresa, id_usuario: sesion.id_usuario };
    this.view = new EmpresaView();
    this.divisiones = [];
    this.items = [];
    this.idDivisionFiltro = '';
    this.seccion = 'inicio';
    this._tok = 0;

    this.view.renderHeader(this.empresa);
    this.view.renderNav((s) => { this.idDivisionFiltro = ''; this.ir(s); });
    this.view.onVerCom = (id, nom) => window.abrirComGlobal && window.abrirComGlobal(id, nom);
    this.view.onVerFicha = (id) => {
      const it = this.items.find(x => x.id_item === id);
      const d = this.divisiones.find(x => x.id_division === (it && it.id_division));
      if (it) fichaItem(it, d ? d.nombre_division : '');
    };
    this.view.onFiltrarDiv = (idDiv) => { this.idDivisionFiltro = idDiv; this.ir('inventario'); };
    this.view.onRefrescar = () => this.ir(this.seccion, { forzar: true });
    this.ir('inicio');
  }

  /** Pinta con lo guardado al instante y repinta solo si llegan datos distintos. */
  async _cargar(tok, pedir, pintar, skeleton) {
    this.view.cargando(skeleton);
    let firma = null;
    const aplicar = (d) => {
      if (tok !== this._tok) return;
      const f = JSON.stringify(d); if (f === firma) return;
      firma = f; pintar(d);
    };
    try { aplicar(await pedir(aplicar)); }
    catch (e) { if (tok === this._tok) this.view.renderError(e.message || 'No se pudo cargar'); }
  }

  async ir(seccion, { forzar = false } = {}) {
    const tok = ++this._tok;
    this.seccion = seccion;
    this.view.setActiva(seccion);
    const id = this.empresa.id_empresa;
    const datos = (onCache) => cargarDatosEmpresa(id, { onCache, forzar });
    const guardar = (d) => { this.divisiones = d.divisiones; this.items = d.items; };

    switch (seccion) {
      case 'inicio':
        return this._cargar(tok, datos, (d) => { guardar(d); this.view.renderInicio(this.empresa, { totalDivisiones: d.divisiones.length, totalItems: d.items.length }); }, 'inicio');
      case 'divisiones':
        return this._cargar(tok, datos, (d) => {
          guardar(d);
          const conteo = d.divisiones.map(x => ({ ...x, totalItems: d.items.filter(i => i.id_division === x.id_division).length }));
          this.view.renderDivisiones(conteo);
        });
      case 'inventario':
        return this._cargar(tok, datos, (d) => { guardar(d); this.view.renderInventario(d.items, d.divisiones, this.idDivisionFiltro); });
      case 'comentarios':
        return this._cargar(tok, (onCache) => cargarComentarios(id, { onCache, forzar }),
          (cs) => this.view.renderComentarios(cs, (u) => (u === this.empresa.id_usuario ? 'Tú' : 'Usuario de la empresa')));
    }
  }

  /** Vuelve a cargar la sección activa con datos frescos del servidor (usado por sincronía automática). */
  refrescarForzado() {
    if (this.seccion) this.ir(this.seccion, { forzar: true });
  }

  destruir() { this._tok++; this.view.destruir(); }
}
