# AGENTS.md

## Project

Multi-company inventory SPA: static HTML5 + vanilla ES modules + Bootstrap 5 (local, `vendor/`), backed by a single Google Apps Script Web App and Google Sheets. Hierarchy: Empresa → División/Sala → Ítem → Comentario. Role `Admin` gets CRUD; role `Empresa` gets read-only inventory and comments.

No build step, package manager, tests, lint, CI, or service worker. GitHub Pages serves the repo root directly.

## Files

- `index.html` — login, company panel, admin shell, and shared modals (comentarios, formulario genérico, confirmación). No CDN: Bootstrap/Icons load from `vendor/`.
- `css/styles.css` — all custom styles.
- `vendor/` — Bootstrap 5.3.3 + Bootstrap Icons 1.11.3 (css, js, fonts). To upgrade: `npm i bootstrap bootstrap-icons` in a temp dir and copy the same files.
- `js/app.js` — entry point: routing, login/logout, connection badge, sync button.
- `js/api.js` — **only place that talks to GAS** (POST text/plain). Stale-while-revalidate cache (localStorage, prefix `inv:cache:`, cleared on logout), in-flight dedupe, timeout, `leer/leerVarios/escribir/invalidarAcciones`, and the `Q` query catalog.
- `js/ui.js` — shared helpers: `esc`, `fmt`, `toast`, `confirmar` (modal), `formModal` (generic edit modal), skeletons, client-side search/filter (`activarFiltros`).
- `js/controllers|views|models/` — MVC for `admin*` and `empresa*`; `authModel.js` handles login/session.
- `js/sync-compat.js` — comments modal + offline enqueue; `sync.js` — queue sync engine; `db.js` — IndexedDB wrapper.
- `Code.gs` — GAS backend; **gitignored, never commit or force-add it**.
- `README.md` — intentionally only describes the app; keep setup/ops notes out of it.

## Run / verify

- Serve over HTTP: `python3 -m http.server 8000`, then open `http://localhost:8000`. `file://` breaks ES module imports.
- No automated checks exist. Verify changes in the browser console and manually test both roles.
- Hard reload (`Ctrl+Shift+R`) after JS edits; ES modules are cached aggressively.
- `inicializarHojas()` is guarded by `CacheService` (6 h). After changing `TABLAS` or sheet structure, run `limpiarCacheInicializacion()` once in the Apps Script editor.
- Backend changes are not locally testable: paste `Code.gs` into script.google.com, save, and redeploy the Web App. Prefer editing the existing deployment so the `/exec` URL stays stable.
- The deployed URL lives in `js/config.js`; update it if a new deployment is created. A GET to that URL returns backend JSON when live.
- The Web App must be deployed as **Execute as: Me** with **Access: Anyone**; otherwise browser POSTs fail.

## Contracts and gotchas

- Every request is `POST` with `Content-Type: text/plain` and a JSON string body to avoid a CORS preflight. Do not switch to `application/json` or add custom headers.
- `action` names are case-sensitive and duplicated in the frontend and the `switch` in `Code.gs`. Keep both sides identical (for example `sync_batch`); a case mismatch falls through to “Acción no reconocida”.
- Auth is client-side only. Passwords are SHA-256 hex of the plaintext (`crypto.subtle`), and the `token` returned by login is never validated. Backend endpoints do not enforce role or session; do not treat them as protected.
- `crypto.subtle` only works on HTTPS or localhost.
- `TABLAS` at the top of `Code.gs` is the schema source of truth. Readers look up columns by header name, so header changes must be mirrored there and in every reader.
- `SPREADSHEET_ID` is hardcoded near the top of `Code.gs`; change it and redeploy to point at another spreadsheet.
- `inicializarHojas()` runs on every request and seeds demo data only when a sheet is empty: users `admin/admin123`, `operador/op123`; `EMP_001`, `DIV_001`, two items.
- `crear_empresa` creates the empresa, a default `Principal` division, and the supplied admin user in one request.
- Ítem fields (sheet `Inventario`, in `TABLAS`): besides the base columns, `marca, modelo, numero_serie, especificaciones, fotografia, estado, observaciones`. `asegurarColumnas()` appends missing headers to existing sheets on deploy (bump `CLAVE_INIT` to force a re-run). `crearItem`/`actualizarItem` write **by header name**, never by position. `estado` ∈ `ESTADOS_ITEM` (duplicated in `Code.gs` and `js/ui.js`; keep both identical).
- Photos: the browser compresses to JPEG ≤1024 px (`comprimirImagen`) and sends `foto_base64` in `crear_item`/`actualizar_item` (`quitar_foto: true` removes it). `Code.gs` saves it in the Drive folder `Inventario_Fotos` (public-by-link, view only) and stores only the **file ID** in `fotografia`. The front renders `https://drive.google.com/thumbnail?id=ID&sz=wN`. Needs the Drive OAuth scope: run `autorizarDrive()` once in the editor before redeploying. Photos of items deleted via cascade (division/empresa) are not trashed.
- SKU is auto-generated (`SKU-0001`…) server-side only when `codigo_sku` is blank. Uniqueness is checked globally across all companies/divisions, not per division.
- Admin navigation is JS state (`AdminController.emp`, `.seccion`), rendered into a single `#admin-contenido`; events use delegation with `data-accion`/`data-id` (no per-row listeners, no inline `onclick`). Mobile uses pill navigation (`#nav-movil-*`); desktop uses the sidebar.
- Perf rule: never do N+1 requests. Use `leerVarios([...])` for parallel loads and `obtener_comentarios_todos` for comments. Mutations go through `escribir(body, [acciones a invalidar])`; keep the list of invalidated actions in sync with the `Q` catalog.
- Offline: IndexedDB keeps the session and pending comments; API reads are cached in `localStorage` (see `js/api.js`) and shown instantly on load, then revalidated. There is no service worker, so the app shell still needs network on first load.
- Pending comments are rehydrated from IndexedDB each time the comments modal opens.

## Conventions

- UI text, IDs, and sheet/column names are Spanish; keep new code consistent.
- Dynamic buttons use `data-accion` + delegated listeners. Inline `onclick` cannot see ES module functions.
- Destructive actions use `confirmar()` from `ui.js` (Bootstrap modal), never `confirm()`/`alert()`.
- README stays functional-only; operational/agent notes belong here.
- Push is user-gated: make local changes, let the user test, and wait for explicit approval before `git push`.

## Known gaps

- Auth is still client-side only (see above); the login screen shows demo credentials — remove before real use.
- No service worker: adding one would make the app shell load offline.
