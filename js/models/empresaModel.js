import { leerVarios, leer, Q } from '../api.js';

/** Divisiones + inventario en paralelo, con caché. */
export async function cargarDatosEmpresa(idEmpresa, opts = {}) {
  const wrap = opts.onCache ? { ...opts, onCache: (r) => opts.onCache(normalizar(r)) } : opts;
  return normalizar(await leerVarios([Q.divisiones(idEmpresa), Q.inventario(idEmpresa)], wrap));
}

function normalizar([dv, inv]) {
  return { divisiones: dv.divisiones || [], items: inv.items || [] };
}

/** Todos los comentarios de la empresa en UNA sola petición. */
export async function cargarComentarios(idEmpresa, opts = {}) {
  const wrap = opts.onCache ? { ...opts, onCache: (d) => opts.onCache(d.comentarios || []) } : opts;
  const d = await leer(Q.comentarios(idEmpresa), wrap);
  return d.comentarios || [];
}
