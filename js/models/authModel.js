import { guardarSesion, obtenerSesion, eliminarSesion } from '../../db.js';
import { post } from '../api.js';

export function esSuperAdmin(rol) {
  return rol === 'SuperAdmin';
}

export async function sha256(t) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  const a = Array.from(new Uint8Array(b));
  return a.map(x => x.toString(16).padStart(2, '0')).join('');
}

export async function login(usuario, password) {
  const ph = await sha256(password);
  try {
    const d = await post({ action: 'login', usuario, pass_hash: ph }, 20000);
    if (!d.success) return { success: false, error: d.error || 'Error de autenticación' };
    const sa = d.rol === 'SuperAdmin' || d.rol === 'Admin';
    const s = {
      usuario: d.usuario,
      id_usuario: d.id_usuario,
      id_empresa: sa ? '' : (d.id_empresa || ''),
      nombre_empresa: sa ? '' : (d.nombre_empresa || ''),
      rol: sa ? 'SuperAdmin' : 'Empresa',
      token: d.token,
      fecha_login: d.fecha_login
    };
    await guardarSesion(s);
    return { success: true, ...s };
  } catch (e) {
    return { success: false, error: e.message && e.message.includes('tardó') ? e.message : 'No se pudo conectar con el servidor.' };
  }
}

export async function restaurarSesion() {
  try { return await obtenerSesion(); } catch (e) { return null; }
}

export async function cerrarSesion() {
  await eliminarSesion().catch(() => {});
}
