### 🔷 **ETAPA 1: Mostrar el diálogo para mover archivos**

**Objetivo**: Mostrar una ventana tipo modal o diálogo donde el usuario elige la carpeta de destino.

**Componentes y acciones:**

* Treeview de carpetas dentro del directorio raíz (escaneo recursivo o por niveles).
* Botón `./` para subir un nivel.
* Botón `/+` para crear nueva carpeta (con prompt ya hecho).
* Lista de carpetas con lógica para:

  * Mostrar subcarpetas en `music.registry.album.package` y `music.theme`.
  * No permitir crear carpetas dentro de `.main`, `.registry.base`, `.xmas`.
  * Calcular el `XX.` ID basado en `[año - 2003]`.
  
* Botones abajo: `Mover` y `Cancelar`.
* Al presionar “Mover”, se emite el path destino. No se mueven archivos aún.

------------------------------------------------------------------------

### 🔷 **ETAPA 2: Validación y preparación**

**Objetivo**: Validar la acción antes de mover.

**Tareas:**

* Verificar si hay archivos seleccionados.
* Verificar que la carpeta de destino es válida (no nula, no bloqueada).
* Detener reproducción si alguno de los archivos está reproduciéndose.
* Confirmar que no hay conflictos (por ejemplo, nombre duplicado en destino).
* Preparar la lista de operaciones de movimiento (`[origen -> destino]` por archivo).

en orden vamos a saber que entendistes para hacerte correcciones y decirte si procedes

------------------------------------------------------------------------

### 🔷 **ETAPA 3: Mover los archivos**

**Objetivo**: Ejecutar el movimiento físico en el sistema de archivos.

**Tareas:**

* Ejecutar movida de archivos a carpeta de destino.
* Mostrar barra de progreso o tooltip mientras se realiza.
* Manejar errores si alguno falla (no detener todo, pero notificar).
* Si todo va bien, continuar a la siguiente etapa.

------------------------------------------------------------------------

### 🔷 **ETAPA 4: Actualización de playlist y cache**

**Objetivo**: Limpiar la playlist y sincronizar con el nuevo estado del sistema de archivos.

**Tareas:**

* Eliminar de la playlist los archivos que fueron movidos.
* Actualizar la cache de la carpeta actual de la playlist.
* Evitar múltiples listeners disparándose al mismo tiempo (como el watcher).
* Evitar glitches visuales en la UI y tooltip (usar throttling o desactivar temporalmente listeners si es necesario).
* Mostrar tooltip o notificación "Archivos movidos correctamente".

------------------------------------------------------------------------

### 🔷 **ETAPA ¿5?: Notificación final (duplicado)**

**Objetivo**: Notificar al usuario que la operación se completó correctamente.

**Tareas:**

* Mostrar tooltip o notificación "Archivos movidos correctamente".
* Si hubo errores, mostrar detalle de los archivos fallidos.
* Opcional: ofrecer botón "Deshacer" si se implementa historial.

------------------------------------------------------------------------

### 🔷 **ETAPA 5: Historial y deshacer (proponer un plan de como sera)**

**Objetivo**: Guardar una copia de la operación y permitir deshacer.

**Tareas:**

* Guardar `[archivo_moved, old_path, new_path]` en una pila de historial.
* Si el usuario presiona "Deshacer", moverlos de regreso y actualizar playlist/cache.

------------------------------------------------------------------------


## ✅ RESUMEN DE ETAPAS PARA MOVER ARCHIVOS

| Etapa | Descripción                                      |
| ----- | ------------------------------------------------ |
| **1** | Diálogo de selección de carpeta destino (UI)     |
| **2** | Validación: reproducción, duplicados, conflictos |
| **3** | Movimiento físico de archivos (fs)               |
| **4** | Actualización de playlist y cache (sin glitches) |
| **?** | Notificación al usuario                          |
| **5** | Deshacer movimiento (opcional)                   |

--------------------------------------------------------------------------


### ✅ **ETAPA 3: Mover archivos y actualizar estado del sistema**

**Objetivo**: Ejecutar la operación de mover archivos y sincronizar la playlist y la carpeta elegida.

**Tareas**:

1. **Mover los archivos físicamente** al destino.

   * Mostrar barra de progreso / tooltip.
   * Si hubo error, detener la operacion y revertir movimientos antes de la accion.

2. **Actualizar la aplicación según los cambios**:

   * Eliminar de la playlist los archivos movidos.
   * Actualizar la caché de carpeta la carpeta actual de la playlist.
   * Evitar múltiples listeners o glitches visuales (throttling / desactivar temporalmente).
   * Respetar el estado de la UI y asegurar coherencia en la playlist.

3. **Notificar al usuario del resultado**:

   * Si todo salió bien → tooltip: "Archivos movidos correctamente".
   * Si hubo errores → tooltip con detalle de fallos.

