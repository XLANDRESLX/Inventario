# Inventario Multiorganización — Offline First

Aplicación web ligera, modular y sin dependencias pesadas para gestión de inventario multiorganización, diseñada para alojarse estáticamente (GitHub Pages) con backend en **Google Apps Script** y base de datos en **Google Sheets**. Funciona sin conexión gracias a **IndexedDB nativo**.

---

## 📁 Estructura del proyecto

| Archivo | Descripción |
|---------|-------------|
| `Code.gs` | Backend Google Apps Script (Web App). Endpoints `doPost`/`doGet`, CORS, autenticación, inventario, comentarios y sincronización de cola. |
| `db.js` | Wrapper nativo de IndexedDB. ObjectStores: `usuarios_session` y `cola_sincronizacion`. |
| `sync.js` | Motor de red: listeners `online`/`offline`, sincronización en lote (`SYNC_BATCH`) al reconectar. |
| `index.html` | Interfaz Bootstrap 5: login y panel de empresa (solo lectura, filtros, buscador, modal de comentarios). |
| `app.js` | Lógica del frontend (ES Modules): login SHA-256, renderizado de inventario, comentarios online/offline, toast. |
| `README.md` | Esta documentación técnica. |

---

## 🚀 Despliegue rápido

### 1. Google Sheets (base de datos)

Crea un libro de Google Sheets con exactamente estas 5 pestañas y sus encabezados en la **primera fila**:

**Pestaña `Empresas`**
```
id_empresa | nombre_empresa | fecha_creacion | estado
```

**Pestaña `Usuarios`**
```
id_usuario | id_empresa | usuario | pass_hash | rol | estado
```
- `rol`: `Admin` o `Empresa`
- `estado`: `Activo` / `Inactivo`
- `pass_hash`: hash SHA-256 de la contraseña (puedes generarlo con cualquier herramienta SHA-256).

**Pestaña `Divisiones`**
```
id_division | id_empresa | nombre_division | ubicacion
```

**Pestaña `Inventario`**
```
id_item | id_empresa | id_division | codigo_sku | nombre_producto | cantidad | unidad | fecha_actualizacion
```

**Pestaña `Comentarios`**
```
id_comentario | id_item | id_empresa | id_usuario | comentario | fecha_hora
```

Copia el **ID del spreadsheet** (está en la URL: `https://docs.google.com/spreadsheets/d/<ID>/edit`).

### 2. Google Apps Script (backend)

1. Ve a [https://script.google.com](https://script.google.com) y crea un proyecto nuevo.
2. Pega el contenido de `Code.gs`.
3. Reemplaza `SPREADSHEET_ID` por el ID de tu hoja de cálculo.
4. Despliega: **Desplegar > Nueva implementación**
   - Tipo: **Web App**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier persona**
5. Copia la URL del Web App (deployment ID).

### 3. Frontend (GitHub Pages)

1. Sube `index.html`, `app.js`, `db.js` y `sync.js` a un repositorio de GitHub.
2. Activa **GitHub Pages** (Settings > Pages > rama `main` o `master`, carpeta `/root`).
3. Edita `app.js` y reemplaza `GAS_URL` por la URL de tu Web App:

```js
const GAS_URL = 'https://script.google.com/macros/s/TU_DEPLOYMENT_ID/exec';
```

4. Accede a la URL de GitHub Pages.

---

## 🔐 Autenticación y roles

### Login
- Todo usuario debe autenticarse con **usuario + contraseña**.
- El frontend hashea la contraseña con **SHA-256** (Web Crypto API) antes de enviarla.
- El backend compara el `pass_hash` recibido con el almacenado en la hoja `Usuarios`.
- Al iniciar sesión correctamente, la sesión se guarda en IndexedDB (`usuarios_session`) para permitir reingresos sin conexión.

### Rol "Empresa" (interfaz incluida)
- **Solo lectura** del inventario.
- Puede filtrar por división/bodega y buscar productos por SKU o nombre.
- Puede abrir el modal de cualquier ítem para ver el historial de comentarios y publicar nuevas observaciones.

### Rol "Admin"
- Acceso total (creación de empresas, divisiones, usuarios y gestión directa de inventario).
- Los endpoints para administración están expuestos en `Code.gs`; la interfaz de administración queda abierta como extensión futura.

---

## 📡 Arquitectura Offline-First

### Verificación de red
- `navigator.onLine` y eventos `window.online` / `window.offline`.
- Badge de estado en la navbar (verde = Online, rojo = Offline).

### Modo Online
- Login, consulta de inventario e inserción de comentarios se envían directamente al `doPost` del Web App.

### Modo Offline
- Si el usuario publica un comentario sin conexión, el frontend:
  1. Genera un UUID local + timestamp.
  2. Guarda el payload en la tienda `cola_sincronizacion` de IndexedDB.
  3. Renderiza el comentario inmediatamente en el DOM con insignia **"Pendiente de envío"**.

### Reconexión
- Al detectar red (`online`), el motor de sincronización lee la cola de IndexedDB y envía los comentarios en lote (`action: 'SYNC_BATCH'`) al backend.
- Tras recibir HTTP 200/confirmación, elimina los registros enviados de IndexedDB.
- Se despacha un evento `sync-completado` que refresca la vista de comentarios.

---

## 🗄️ IndexedDB (db.js)

Base de datos: `InventarioOfflineDB` (versión 1).

### ObjectStore `usuarios_session`
- `keyPath`: `id` (valor fijo `sesion_activa`)
- Índice: `usuario` (único)

### ObjectStore `cola_sincronizacion`
- `keyPath`: `id` (autoincremental)
- Índices: `uuid` (único), `estado`

### Funciones exportadas
```js
guardarSesion(datos)        // Guarda sesión tras login exitoso
obtenerSesion()             // Recupera sesión guardada (rehydrate offline)
eliminarSesion()            // Borra sesión (logout)
guardarEnCola(item)         // Guarda comentario pendiente
obtenerColaPendiente()      // Devuelve registros con estado 'pendiente'
eliminarDeCola(id)          // Elimina registro por ID autoincremental
eliminarDeColaPorUuid(uuid) // Elimina registro por UUID
limpiarCola()               // Vacía toda la cola
```

---

## 🔌 Endpoints del Web App (Code.gs)

Todas las peticiones son `POST` a la URL del Web App con `Content-Type: text/plain` y cuerpo JSON.

| Acción | Cuerpo de ejemplo | Respuesta destacada |
|--------|-------------------|---------------------|
| `login` | `{ action:'login', usuario:'...', pass_hash:'...' }` | `{ success, id_usuario, id_empresa, nombre_empresa, usuario, rol, token }` |
| `obtener_inventario` | `{ action:'obtener_inventario', id_empresa:'...', id_division:'...' }` | `{ success, total, items, empresa }` |
| `obtener_divisiones` | `{ action:'obtener_divisiones', id_empresa:'...' }` | `{ success, total, divisiones }` |
| `obtener_comentarios` | `{ action:'obtener_comentarios', id_item:'...' }` | `{ success, id_item, total, comentarios }` |
| `agregar_comentario` | `{ action:'agregar_comentario', id_item, id_empresa, id_usuario, comentario }` | `{ success, id_comentario }` |
| `sync_batch` | `{ action:'SYNC_BATCH', comentarios: [...] }` | `{ success, procesados, exitosos, fallidos, detalles }` |

### CORS
El backend envía `Access-Control-Allow-Origin: *`, lo que permite llamadas desde GitHub Pages (origen cruzado). Se usa `Content-Type: text/plain` para evitar el preflight `OPTIONS` del navegador.

---

## 🛠️ Personalización

- **TTL del caché de inventario:** modifica `CACHE_TTL_MS` en `app.js` (por defecto 5 minutos).
- **Timeout del toast:** modifica `delay` en `mostrarToast()` (por defecto 5000 ms).
- **URL del backend:** cambia `GAS_URL` al inicio de `app.js`.

---

## ⚠️ Consideraciones de seguridad (entorno de prueba)

- Este modelo usa `pass_hash` comparado directamente; en producción considera agregar firmas de solicitud o tokens de acceso más robustos.
- El Web App se despliega con acceso "Cualquier persona"; asegúrate de que la hoja de cálculo no contenga datos sensibles fuera del alcance de la aplicación.
- Las contraseñas se transmiten hasheadas (SHA-256) desde el frontend, pero el canal es HTTPS (Google Apps Script).

---

## 📄 Licencia

Uso libre y educativo. Sin dependencias externas (solo CDN de Bootstrap 5 y Bootstrap Icons).