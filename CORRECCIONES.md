# Correcciones de inventario

## Cambios incluidos

- SKU y número de serie se validan en el navegador y, de forma definitiva, en Google Apps Script contra todas las filas de la hoja Inventario.
- La comparación de SKU y serie ignora espacios al inicio/final y diferencias entre mayúsculas/minúsculas.
- La validación del servidor se ejecuta dentro de `LockService` para evitar que dos usuarios registren simultáneamente el mismo identificador.
- Al duplicar un ítem, el SKU queda vacío para autogenerarse y el número de serie queda vacío para que no se copie un identificador único.
- Si la validación del formulario de duplicado falla, el modal permanece abierto y muestra el error.
- La sincronización consulta cambios cada segundo mientras la vista Inventario está abierta, agrega filas nuevas sin recargar la página y evita peticiones solapadas.
- Se eliminó el aviso visible «Actualizando datos...». La actualización se ejecuta en segundo plano.
- Si el inventario estaba vacío, la llegada del primer ítem sustituye el estado vacío por la tabla sin recargar la aplicación.

## Publicación

1. Actualiza el proyecto de frontend con los archivos de este ZIP.
2. Abre el proyecto de Google Apps Script vinculado a la hoja de cálculo.
3. Sustituye el contenido de `Code.gs` por el `Code.gs` incluido en este ZIP.
4. Guarda y crea una nueva implementación de la aplicación web (o actualiza la implementación existente).
5. Recarga la aplicación y prueba registrar, editar y duplicar ítems desde dos sesiones distintas.

**Importante:** `Code.gs` está excluido del seguimiento Git por la regla existente en `.gitignore`, pero sí está incluido en este ZIP. Por eso, para activar la validación global y segura, también debes actualizarlo en Apps Script.

## Comprobaciones realizadas

- Sintaxis JavaScript verificada con `node --check` en los módulos modificados y `Code.gs`.
- Revisión de conflictos Git: ramas locales integradas en `main`; repositorio sin conflictos pendientes.
- No se pudo ejecutar una prueba real contra Google Sheets desde este entorno; la verificación final debe hacerse en la implementación de Apps Script.
