/**
 * app.js - Entry point MVC (solo routing e init)
 */
import { login, restaurarSesion, cerrarSesion, esSuperAdmin } from './models/authModel.js';
import { EmpresaController } from './controllers/empresaController.js';
import { AdminController } from './controllers/adminController.js';
import { initSync, estaOnline, sincronizarCola, enviarComentarioModal, abrirComGlobal } from './sync-compat.js';
import { limpiarCache, invalidarAcciones, calentarBackend, iniciarSincroniaAutomatica } from './api.js';
import { toast, cargando } from './ui.js';

let empresaCtrl = null;
let adminCtrl = null;

window.abrirComGlobal = abrirComGlobal;

const $ = (id) => document.getElementById(id);

function mostrarVista(cual) {
  $('vista-login').classList.toggle('d-none', cual !== 'login');
  $('vista-panel').classList.toggle('d-none', cual !== 'empresa');
  $('vista-admin').classList.toggle('d-none', cual !== 'admin');
}

function verLogin() {
  mostrarVista('login');
  calentarBackend();   // despierta Apps Script mientras el usuario escribe sus credenciales
  const f = $('form-login');
  if (f) { f.reset(); f.classList.remove('was-validated'); f.usuario.focus(); }
}

function destruirControladores() {
  if (empresaCtrl) empresaCtrl.destruir();
  if (adminCtrl) adminCtrl.destruir();
  empresaCtrl = adminCtrl = null;
}

function iniciarEmpresa(s) {
  destruirControladores();
  const span = $('span-usuario'); if (span) span.textContent = s.usuario;
  mostrarVista('empresa');
  empresaCtrl = new EmpresaController(s);
}

function iniciarAdmin(s) {
  destruirControladores();
  mostrarVista('admin');
  adminCtrl = new AdminController(s);
}

function entrar(s) { return esSuperAdmin(s.rol) ? iniciarAdmin(s) : iniciarEmpresa(s); }

async function manejarLogin(e) {
  e.preventDefault();
  const form = $('form-login');
  if (!form.checkValidity()) { form.classList.add('was-validated'); return; }
  const restaurar = cargando($('btn-login'), 'Autenticando...');
  try {
    const r = await login(form.usuario.value.trim(), form.password.value);
    if (!r.success) { toast(r.error || 'Error de autenticación', 'danger'); return; }
    form.reset();
    entrar(r);
    toast(`Bienvenido, ${r.usuario}`, 'success');
  } catch (err) {
    console.error(err);
    toast(err.message || 'No se pudo conectar con el servidor.', 'danger');
  } finally { restaurar(); }
}

async function hacerLogout() {
  await cerrarSesion();
  limpiarCache();            // no dejar datos de la empresa en el navegador
  destruirControladores();
  verLogin();
  toast('Sesión cerrada', 'info');
}

function botonSync(id) {
  const btn = $(id);
  if (!btn) return;
  btn.addEventListener('click', async () => {
    if (!estaOnline()) { toast('Sin conexión', 'warning'); return; }
    const restaurar = cargando(btn, 'Procesando...');
    try {
      const r = await sincronizarCola();
      toast(r.procesados > 0 ? (r.mensaje || 'Sincronizado') : 'No hay comentarios pendientes', r.procesados > 0 ? 'success' : 'info');
    } catch (e) { toast('Error: ' + e.message, 'danger'); }
    finally { restaurar(); }
  });
}

function pintarConexion(online) {
  [['badge-conexion'], ['badge-conexion-admin']].forEach(([id]) => {
    const b = $(id); if (!b) return;
    b.className = `badge badge-estado ${online ? 'bg-success' : 'bg-danger'} me-3`;
    b.innerHTML = online ? '<i class="bi bi-wifi me-1"></i> Online' : '<i class="bi bi-wifi-off me-1"></i> Offline';
  });
}

function init() {
  // Limpia credenciales que pudieran venir en la URL
  try {
    const u = new URL(location.href);
    if (u.searchParams.has('usuario') || u.searchParams.has('password')) {
      u.searchParams.delete('usuario'); u.searchParams.delete('password');
      history.replaceState({}, document.title, u.toString());
    }
  } catch (_) {}

  $('btn-logout').addEventListener('click', hacerLogout);
  $('btn-logout-admin').addEventListener('click', hacerLogout);
  $('form-login').addEventListener('submit', manejarLogin);
  botonSync('btn-sync-now');

  $('form-comentario').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fc = e.currentTarget;
    if (!fc.checkValidity()) { fc.classList.add('was-validated'); return; }
    const idItem = $('modalItemId').value;
    const texto = $('texto-comentario').value.trim();
    if (texto && idItem) await enviarComentarioModal(idItem, texto);
  });

  pintarConexion(navigator.onLine);
  initSync(pintarConexion);
  iniciarSincroniaAutomatica();   // revalida caché cada 30 s para ver ítems de compañeros

  // Al recibir aviso de datos nuevos, refrescar la sección activa del controlador correspondiente
  window.addEventListener('sincronia-datos-nuevos', () => {
    if (adminCtrl) adminCtrl.refrescarForzado();
    else if (empresaCtrl) empresaCtrl.refrescarForzado();
  });

  // Al volver a la pestaña, limpiar caché internamente para traer datos frescos (sin toast al usuario)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      limpiarCache();
    }
  });

  window.addEventListener('sync-completado', (evt) => {
    const d = evt.detail || {};
    invalidarAcciones(['obtener_comentarios', 'obtener_comentarios_todos']);
    if (d.procesados > 0) toast(d.mensaje || 'Sincronizado', 'success');
  });

  restaurarSesion().then(s => (s ? entrar(s) : verLogin())).catch(verLogin);
}

init();
