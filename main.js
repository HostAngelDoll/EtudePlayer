// main.js
const { app, BrowserWindow, ipcMain, Menu, dialog, shell, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const chokidar = require("chokidar"); 
const CACHE_PATH = path.join(app.getPath("userData"), "cache.json");
const XMAS_START_YEAR = 2004;
const XMAS_END_YEAR = 2021;
const ROOT_YEARS_PATH = "E:\\_Internal";
const TRASH_FOLDER = "E:\\_Exclude\\l_reallydeleted";
const SHORTCUTS_PATH = path.join(process.cwd(), 'shortcuts.json'); // raíz del proyecto
let shortcutsWatcher = null;
let registeredShortcuts = new Map(); // accelerator -> action
let watchers = new Map();
let watchdogEnabled = true; // --- WATCHDOG GLOBAL (activar/desactivar notificaciones de watchers) ---
const child_process = require('child_process'); // ffmpeg process waveform
let ffmpegPath = 'ffmpeg';
try { ffmpegPath = require('ffmpeg-static'); } catch (e) { /* fallback to system ffmpeg */ }
let ffprobePath = 'ffprobe';
try { const _ffp = require('ffprobe-static'); ffprobePath = _ffp.path || _ffp; } catch (e) { /* fallback to system ffprobe */ }
const SAMPLE_RATE = 44100; // PCM sample rate we'll request from ffmpeg
let win;

async function createWindow() { // main function to start app
  win = new BrowserWindow({
    width: 1200,
    height: 720,
    title: 'EtudePlayer',
    icon: path.join(__dirname, 'assets/icon_tb.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // usar preload seguro
      contextIsolation: true,                      // habilitar aislamiento
      nodeIntegration: false                       // desactivar para seguridad
    }
  });
  win.loadFile('index.html');

}

async function getFolderNodes(folderPath) {
  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const folders = entries.filter(e => e.isDirectory());

    const nodes = await Promise.all(folders.map(async (f) => {
      const fullPath = path.join(folderPath, f.name);
      return {
        name: f.name.replace(/^\d+\.\s*/, ''), // quitar prefijo "01. "
        type: 'folder',
        path: fullPath,
        nodes: await getFolderNodes(fullPath) // recursión asíncrona
      };
    }));

    return nodes;
  } catch (err) {
    console.error(`Error leyendo carpeta ${folderPath}:`, err);
    return [];
  }
}

async function saveCache(data) { // Guardar cache
  try {
    await fs.writeFile(CACHE_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error guardando cache:", err);
  }
}

async function loadCache() { // Leer cache
  try {
    const content = await fs.readFile(CACHE_PATH, "utf-8");
    return JSON.parse(content);
  } catch {
    return null; // si no existe, devuelve null
  }
}

function getXmasFolderPath(year, baseRoot = ROOT_YEARS_PATH) {
  // Construir ruta example: E:\_Internal\2006\03. music.xmas
  const index = String(year - 2003).padStart(2, '0');
  return path.join(baseRoot, String(year), `${index}. music.xmas`);
}

function watchFolder(folderPath, opts = {}) {
  // Función para iniciar vigilancia de una carpeta específica
  // opts = { type: 'single' | 'xmas', rootForXmas: baseRoot }

  if (watchers.has(folderPath)) {
    try { watchers.get(folderPath).close(); } catch (e) { }
  }

  // Crear watcher
  const watcher = chokidar.watch(folderPath, {
    ignored: /(^|[\/\\])\../, // ignorar archivos ocultos
    persistent: true,
    ignoreInitial: true,       // no emitir eventos de archivos existentes
    depth: 0,                  // solo la carpeta actual, no subcarpetas
    awaitWriteFinish: {         // esperar a que la escritura termine
      stabilityThreshold: 200,
      pollInterval: 100
    }
  });

  // Función para notificar cambios (con debounce)
  let debounceTimer = null;

  const notifyChange = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {

        // Si hay supresión activa para esta carpeta, NO hacer nada
        // if (isSuppressed(folderPath)) return;
        if (!watchdogEnabled) return;

        if (opts.type === 'xmas') {
          // Re-armar lista combinada y enviarla
          const list = await gatherXmasSongs(opts.rootForXmas || ROOT_YEARS_PATH);
          win.webContents.send('playlist-updated', { folderPath: 'xmas-all', files: list });

        } else {
          // Leer solo la carpeta
          const entries = await fs.readdir(folderPath, { withFileTypes: true });
          const files = entries
            .filter(f => f.isFile() && (f.name.toLowerCase().endsWith('.mp3') || f.name.toLowerCase().endsWith('.mp4') || f.name.toLowerCase().endsWith('.m4a')))
            // .map(f => path.join(folderPath, f.name));
            .map(f => ({ name: f.name, path: `${folderPath}\\${f.name}` }));
          // win.webContents.send('playlist-updated', { folderPath, files });

          win.webContents.send('folder-updated', { folderPath, files });
        }

      } catch (err) {
        console.error(`Error al leer carpeta ${folderPath}:`, err);
      }
    }, 200); // 200ms de debounce
  };

  watcher
    .on('add', notifyChange)
    .on('unlink', notifyChange)
    .on('change', notifyChange)
    .on('error', err => console.error(`Watcher error: ${err}`));

  watchers[folderPath] = watcher;
}

async function watchXmasFolders(baseRoot = ROOT_YEARS_PATH) {
  for (let year = XMAS_START_YEAR; year <= XMAS_END_YEAR; year++) {
    const folder = getXmasFolderPath(year, baseRoot);
    try {
      await fs.access(folder); // existe
      watchFolder(folder, { type: 'xmas', rootForXmas: baseRoot });
    } catch (e) { /* no existe → ignorar*/ }
  }
}

async function gatherXmasSongs(baseRoot = ROOT_YEARS_PATH) {
  // Reutilizable: devolver todas las canciones Xmas (full paths) entre 2004..2021
  const allSongs = [];
  for (let year = XMAS_START_YEAR; year <= XMAS_END_YEAR; year++) {
    const folder = getXmasFolderPath(year, baseRoot);
    try {
      await fs.access(folder);
      const entries = await fs.readdir(folder, { withFileTypes: true });
      const mediaFiles = entries
        .filter(f => f.isFile() && (f.name.toLowerCase().endsWith('.mp3') || f.name.toLowerCase().endsWith('.mp4') || f.name.toLowerCase().endsWith('.m4a')))
        .map(f => path.join(folder, f.name));
      allSongs.push(...mediaFiles);
    } catch (e) { /* carpeta no existe → ignorar */ }
  }
  return allSongs;
}

ipcMain.handle('get-playlists', async (event) => {
  let cached = await loadCache();
  if (cached) {
    return cached; // usar cache si existe
  }

  const rootPath = "E:\\_Internal";
  const playlists = [];
  const yearDirs = await fs.readdir(rootPath, { withFileTypes: true });
  const years = yearDirs.filter(d => d.isDirectory() && /^\d{4}$/.test(d.name)).map(d => d.name);

  for (const [i, year] of years.entries()) {
    event.sender.send("scan-progress", {
      current: i + 1,
      total: years.length,
      message: `Indexando año ${year}...`
    });

    const yearPath = path.join(rootPath, year);
    const prefix = String(year - 2003).padStart(2, '0');
    const nodes = [];

    // Main
    const mainTemp = path.join(yearPath, `${prefix}. music.main`);
    try {
      await fs.access(mainTemp);
      const mainNodes = await getFolderNodes(mainTemp);
      nodes.push({ name: 'Main', type: 'folder', path: mainTemp, nodes: mainNodes });
    } catch { } // si no existe, no hace nada

    // Album Package
    const albumPath = path.join(yearPath, `${prefix}. music.registry.album.package`);
    try {
      await fs.access(albumPath);
      const albumNodes = await getFolderNodes(albumPath);
      nodes.push({ name: 'Album Package', type: 'folder', path: albumPath, nodes: albumNodes });
    } catch { }

    // Base
    const basePath = path.join(yearPath, `${prefix}. music.registry.base`);
    try {
      await fs.access(basePath);
      nodes.push({ name: 'Base', type: 'folder', path: basePath, nodes: [] });
    } catch { }

    // Theme
    const themePath = path.join(yearPath, `${prefix}. music.theme`);
    try {
      await fs.access(themePath);
      const themeNodes = await getFolderNodes(themePath);
      nodes.push({ name: 'Theme', type: 'folder', path: themePath, nodes: themeNodes });
    } catch { }

    // Xmas por año
    const xmasByYear = path.join(yearPath, `${prefix}. music.xmas`);
    try {
      await fs.access(xmasByYear);
      nodes.push({ name: 'Xmas', type: 'folder', path: xmasByYear, nodes: [] });
    } catch { }

    playlists.push({ year, nodes });
  }


  const xmasNode = {
    name: 'Xmas',
    type: 'folder',
    path: null,
    nodes: [
      { name: 'All Songs', type: 'xmas-all', path: rootPath }
    ]
  };

  const result = { playlists, xmas: xmasNode };
  await saveCache(result);

  event.sender.send("scan-progress", { current: years.length, total: years.length, message: "Indexado completado" });

  return result;
});

ipcMain.handle('get-xmas-songs', async (event, rootPath) => {
  try {
    const base = rootPath || ROOT_YEARS_PATH;
    const songs = await gatherXmasSongs(base);
    return songs;
  } catch (err) {
    console.error('Error obteniendo Xmas songs:', err);
    return [];
  }
});

ipcMain.on('select-folder', async (event, folderPath) => {
  try {
    const files = await fs.readdir(folderPath);
    const mediaFiles = files.filter(f => f.endsWith('.mp3') || f.endsWith('.mp4') || f.endsWith('.m4a'))
      .map(f => `${folderPath}\\${f}`);

    // Enviar playlist inicial
    // win.webContents.send('playlist-updated', { folderPath, files: mediaFiles });
    win.webContents.send('folder-updated', { folderPath, files: mediaFiles });

    // Iniciar vigilancia
    watchFolder(folderPath);

  } catch (err) {
    console.error(`Error leyendo carpeta "${folderPath}":`, err);
  }
});

ipcMain.on('select-xmas', async (event, baseRoot) => {
  try {
    const base = baseRoot || ROOT_YEARS_PATH;
    // Enviar playlist inicial combinada
    const songs = await gatherXmasSongs(base);
    win.webContents.send('playlist-updated', { folderPath: 'xmas-all', files: songs });

    // Iniciar watchers en todas las carpetas Xmas del rango
    await watchXmasFolders(base);
  } catch (err) {
    console.error('Error al activar Xmas watch:', err);
  }
});

ipcMain.handle('get-songs', async (event, folderPath) => { //ext check
  // Manejar petición de canciones desde el renderer
  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const files = entries
      .filter(f => f.isFile() && (f.name.toLowerCase().endsWith('.mp3') || f.name.toLowerCase().endsWith('.mp4') || f.name.toLowerCase().endsWith('.m4a')))
      .map(f => f.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    return files; // nombres de archivos
  } catch (err) {
    console.error(`Error leyendo carpeta de canciones ${folderPath}:`, err);
    return [];
  }

});

ipcMain.handle("show-context-menu", (event, { type, files }) => {
  let template = [];

  if (type === "single") {

    template = [
      { label: "▶  Reproducir canción", click: () => event.sender.send("context-play-selected") },
      { type: "separator" },
      { label: "Cambiar nombre", click: () => event.sender.send("context-menu-action", { type: "rename", files }) },
      { label: "Copiar nombre", click: () => event.sender.send("context-menu-action", { type: "copyName", files }) },
      { label: "Copiar ruta", click: () => event.sender.send("context-menu-action", { type: "copyPath", files }) },
      { label: "Abrir ubicación del archivo", click: () => event.sender.send("context-menu-action", { type: "revealInFolder", files }) },
      { type: "separator" },
      { label: "Mover a carpeta...", click: () => event.sender.send("context-menu-action", { type: "moveToFolder", files }) },
      { label: "Mover a papelera", click: () => event.sender.send("context-menu-action", { type: "moveToTrash", files }) },
      { label: "Deshacer último movimiento", click: () => event.sender.send("context-menu-action", { type: "undo" }) },
    ];

  } else if (type === "multiple") {

    template = [
      { label: "Copiar nombres", click: () => event.sender.send("context-menu-action", { type: "copyNames", files }) },
      { label: "Copiar rutas", click: () => event.sender.send("context-menu-action", { type: "copyPaths", files }) },
      { type: "separator" },
      { label: "Mover a carpeta...", click: () => event.sender.send("context-menu-action", { type: "moveToFolder", files }) },
      { label: "Mover a papelera", click: () => event.sender.send("context-menu-action", { type: "moveToTrash", files }) },
      { label: "Deshacer último movimiento", click: () => event.sender.send("context-menu-action", { type: "undo" }) },
    ];

  }

  const menu = Menu.buildFromTemplate(template);
  menu.popup(BrowserWindow.fromWebContents(event.sender));
});

// ----------------------------------------------------------
// Operacion de archivos
// ----------------------------------------------------------

ipcMain.handle("rename-file", async (event, { oldPath, newName }) => {
  try {
    const dir = path.dirname(oldPath);
    const newPath = path.join(dir, newName);

    // fs.renameSync(oldPath, newPath);

    // Usamos la versión promisificada de rename
    await fs.rename(oldPath, newPath);
    // console.log(oldPath);
    // console.log(newPath);

    // Avisar al renderer que el archivo cambió
    event.sender.send("file-renamed", { oldPath, newPath });
    return { success: true };
  } catch (err) {
    console.error("Error renombrando archivo:", err);
    return { success: false, error: err.message };
  }
});

// ----------------------------------------------------------
// Create folder (from move dialog)
// ----------------------------------------------------------

// Mostrar menu contextual para nodos del modal move-tree
ipcMain.handle('show-move-context-menu', (event, { path: nodePath }) => {
  try {
    // Si no hay path (ej: nodo 'Xmas' sin path real), deshabilitar opciones
    const base = nodePath ? path.basename(nodePath).toLowerCase() : '';
    const blocked = null; // !nodePath || base.includes('music.main') || base.includes('music.registry.base') || base.includes('music.xmas');

    const template = [
      {
        label: '📂 Crear subcarpeta aquí',
        // enabled: !blocked,
        click: () => event.sender.send('move-tree-action', { type: 'createFolder', path: nodePath })
      },
      {
        label: '✏️ Renombrar carpeta',
        // enabled: !blocked,
        click: () => event.sender.send('move-tree-action', { type: 'renameFolder', path: nodePath })
      }
    ];

    const menu = Menu.buildFromTemplate(template);
    menu.popup({ window: BrowserWindow.fromWebContents(event.sender) });
    return true;
  } catch (err) {
    console.error('Error mostrando move-context-menu:', err);
    return false;
  }
});

ipcMain.handle('create-folder', async (event, { parentPath, folderName }) => {
  try {
    if (!parentPath || !folderName) {
      return { success: false, error: 'Parámetros inválidos' };
    }

    const baseName = path.basename(parentPath).toLowerCase();
    // No permitir crear dentro de .main, .registry.base, .xmas
    if (baseName.includes('music.main') || baseName.includes('music.registry.base') || baseName.includes('music.xmas')) {
      return { success: false, error: 'Crear carpetas en esta ubicación no está permitido' };
    }

    const newPath = path.join(parentPath, folderName);
    // Crear carpeta
    await fs.mkdir(newPath, { recursive: false });

    // Borrar cache para forzar reindex la próxima vez
    try { await fs.unlink(CACHE_PATH); } catch (e) { /* no existía, ignorar */ }

    // Devolver ruta creada
    return { success: true, path: newPath };
  } catch (err) {
    console.error('Error creando carpeta:', err);
    return { success: false, error: err.message || String(err) };
  }
});

ipcMain.handle('rename-folder', async (event, { oldPath, newName }) => {
  try {
    if (!oldPath || !newName) {
      return { success: false, error: 'Parámetros inválidos' };
    }
    const dir = path.dirname(oldPath);
    const newPath = path.join(dir, newName);

    await fs.rename(oldPath, newPath);

    // Enviar evento al renderer para quien corresponda
    try {
      event.sender.send('folder-renamed', { oldPath, newPath });
    } catch (e) { /* ignore */ }

    // Borrar cache para forzar re-index si lo deseas
    try { await fs.unlink(CACHE_PATH); } catch (e) { /* ignore */ }

    return { success: true, oldPath, newPath };
  } catch (err) {
    console.error('Error renombrando carpeta:', err);
    return { success: false, error: err.message || String(err) };
  }
});


// ---------------------------------------------------------
// Para mover archivos Utils IPC desde renderer (verificadores)
// ---------------------------------------------------------

ipcMain.handle('path-exists', async (event, folderPath) => {
  try {
    if (!folderPath) return false;
    await fs.access(folderPath);
    return true;
  } catch (e) {
    return false;
  }
});

ipcMain.handle('read-folder-files', async (event, folderPath) => {
  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const files = entries.filter(e => e.isFile()).map(e => e.name);
    return files; // array de nombres (strings) o [] si vacía
  } catch (err) {
    console.error('Error leyendo carpeta (read-folder-files):', err);
    return null; // null indica error / no accesible
  }
});


// ----------------------------------------------------------
// Move / create-folder / move-tree
// ----------------------------------------------------------

ipcMain.handle('set-watchdog', (event, enabled) => {
  watchdogEnabled = !!enabled;
  return watchdogEnabled;
});

ipcMain.handle('execute-move-operations', async (event, { operations } = {}) => {
  if (!Array.isArray(operations) || operations.length === 0) {
    return { success: false, error: 'No operations provided', results: [] };
  }

  const results = [];
  try {
    // Desactivar watchdog para evitar ruidos durante el movimiento
    watchdogEnabled = false;

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      try {
        // Ejecutar rename
        await fs.rename(op.src, op.dest);
        results.push({ ...op, success: true });
        // Informar progreso al renderer
        try {
          event.sender.send('move-progress', { current: i + 1, total: operations.length, file: op.src });
        } catch (e) { /* ignore send errors */ }
      } catch (err) {
        // Al primer error: registrar y devolver (NO hacemos rollback)
        results.push({ ...op, success: false, error: err.message || String(err) });
        // Reactivar watchdog antes de devolver
        watchdogEnabled = true;
        return { success: false, error: err.message || String(err), results };
      }
    }

    // Si llegamos aquí → todo movido con éxito
    watchdogEnabled = true;
    return { success: true, results };

  } catch (err) {
    // En caso de fallo imprevisto
    watchdogEnabled = true;
    return { success: false, error: err.message || String(err), results };
  }
});

// ----------------------------------------------------------
// Recicler Bin logical operation
// ----------------------------------------------------------

// --- Asegurar que la carpeta papelera exista al inicio (opcional) ---
async function ensureTrashFolder() {
  try {
    await fs.mkdir(TRASH_FOLDER, { recursive: true });
  } catch (e) { /* ignore errors on startup */ }
}
ensureTrashFolder().catch(() => {});

// ----------------------
// Move to trash (ETAPA bin)
// ----------------------

ipcMain.handle('move-to-trash', async (event, { files } = {}) => {
  if (!Array.isArray(files) || files.length === 0) {
    return { success: false, error: 'No files provided', results: [] };
  }

  // Asegurarnos de que carpeta papelera existe
  try { await fs.mkdir(TRASH_FOLDER, { recursive: true }); } catch (e) { /* ignore */ }

  // Leer nombres existentes en la papelera para checar conflictos
  let existingNames = [];
  try {
    const entries = await fs.readdir(TRASH_FOLDER, { withFileTypes: true });
    existingNames = entries.filter(e => e.isFile()).map(e => e.name);
  } catch (e) {
    // Si no podemos leer la papelera -> error
    return { success: false, error: `No se puede acceder a la papelera: ${e.message || e}`, results: [] };
  }

  const reserved = new Set(existingNames.map(n => n.toLowerCase()));
  const results = [];

  // Emit progress helper
  const sendProgress = (i, total, src) => {
    try { event.sender.send('move-to-trash-progress', { current: i, total, file: src }); } catch (e) { /* ignore */ }
  };

  for (let i = 0; i < files.length; i++) {
    const src = files[i];
    try {
      // verificar que src exista antes de mover
      try {
        await fs.access(src);
      } catch (e) {
        results.push({ src, dest: null, success: false, error: 'Fuente no existe' });
        // detener en el primer error
        return { success: false, error: 'Fuente no existe', results };
      }

      const origName = src.split(/[\\/]/).pop();
      let base = origName;
      const lastDot = origName.lastIndexOf('.');
      const nameNoExt = lastDot >= 0 ? origName.substring(0, lastDot) : origName;
      const ext = lastDot >= 0 ? origName.substring(lastDot) : '';

      // resolver conflictos: name.ext, name (2).ext, ...
      let candidate = origName;
      let counter = 2;
      while (reserved.has(candidate.toLowerCase())) {
        candidate = `${nameNoExt} (${counter})${ext}`;
        counter++;
      }
      reserved.add(candidate.toLowerCase());

      const dest = path.join(TRASH_FOLDER, candidate);

      // Intentar mover
      await fs.rename(src, dest);

      results.push({ src, dest, success: true });
      sendProgress(i + 1, files.length, src);

    } catch (err) {
      // en primer error: devolver resultados parciales y detener (no rollback)
      results.push({ src, dest: null, success: false, error: err && err.message ? err.message : String(err) });
      return { success: false, error: err && err.message ? err.message : String(err), results };
    }
  }

  // Todo moved ok
  return { success: true, results };
});

ipcMain.handle('open-trash-folder', async () => {
  try {
    await shell.openPath(TRASH_FOLDER);
    return { success: true };
  } catch (err) {
    return { success: false, error: err && err.message ? err.message : String(err) };
  }
});

// --------------------
// Reveal in folder (abrir explorador y seleccionar archivo)
// --------------------

ipcMain.handle('reveal-in-folder', async (event, filePath) => {
  try {
    if (!filePath || typeof filePath !== 'string') {
      return { success: false, error: 'Ruta inválida' };
    }

    // Verificar existencia
    try {
      await fs.access(filePath);
    } catch (e) {
      return { success: false, error: 'Archivo no encontrado' };
    }

    // Intentar abrir y seleccionar en el explorador del SO
    try {
      shell.showItemInFolder(filePath);
      return { success: true };
    } catch (err) {
      return { success: false, error: err && err.message ? err.message : String(err) };
    }
  } catch (err) {
    return { success: false, error: err && err.message ? err.message : String(err) };
  }
});

// ---------------------------------------------------------------------------
// Undo file operations
// ---------------------------------------------------------------------------

// -------------- IPC utilitarios para undo (main) ----------------

// Asegurar que un directorio exista (mkdir -p)
ipcMain.handle('ensure-dir', async (event, dirPath) => {
  try {
    if (!dirPath || typeof dirPath !== 'string') return { success: false, error: 'invalid path' };
    await fs.mkdir(dirPath, { recursive: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: err && err.message ? err.message : String(err) };
  }
});

// Eliminar carpeta (se usará para eliminar carpetas vacías)
ipcMain.handle('remove-folder', async (event, folderPath) => {
  try {
    if (!folderPath || typeof folderPath !== 'string') return { success: false, error: 'invalid path' };
    // Intentar eliminar (solo funcionará si está vacía)
    await fs.rmdir(folderPath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err && err.message ? err.message : String(err) };
  }
});

// Renombrar de forma directa: oldPath -> newPath (paths completos)
ipcMain.handle('rename-path', async (event, { oldPath, newPath } = {}) => {
  try {
    if (!oldPath || !newPath) return { success: false, error: 'invalid args' };
    await fs.rename(oldPath, newPath);
    return { success: true };
  } catch (err) {
    return { success: false, error: err && err.message ? err.message : String(err) };
  }
});


// ------------------------------------------------------------------------------
// Global key
// ------------------------------------------------------------------------------

function normalizeAccel(raw) {
  // Convertir 'ctrl+1' -> 'CommandOrControl+1' (más robusto)
  if (!raw || typeof raw !== 'string') return null;
  const parts = raw.split('+').map(p => p.trim().toLowerCase()).filter(Boolean);
  if (!parts.length) return null;
  const mapped = parts.map(p => {
    if (p === 'ctrl' || p === 'control' || p === 'cmd' || p === 'command') return 'CommandOrControl';
    if (p === 'shift') return 'Shift';
    if (p === 'alt' || p === 'option') return 'Alt';
    if (p === 'super' || p === 'win' || p === 'meta') return 'Super';

    // Mantener teclas del teclado numérico en minúscula (num0-num9)
    if (p.startsWith('num') && p.length > 3) return p;

    // Letras individuales en mayúscula
    if (p.length === 1 && /[a-z]/.test(p)) return p.toUpperCase();

    // Números individuales (0-9) se quedan igual
    if (p.length === 1 && /[0-9]/.test(p)) return p;

    // F1-F12 u otras teclas especiales
    return p.toUpperCase();
  });
  return mapped.join('+');
}

async function registerShortcutsFromMap(map) {
  try {
    globalShortcut.unregisterAll();
    registeredShortcuts.clear();

    const seenAccels = new Set();
    const failedAccels = [];

    for (const rawKey of Object.keys(map || {})) {
      const action = map[rawKey];
      const accel = normalizeAccel(rawKey);
      if (!accel) {
        console.warn(`[shortcuts] clave inválida "${rawKey}" — omitida`);
        continue;
      }
      if (seenAccels.has(accel)) {
        console.warn(`[shortcuts] acelerador duplicado "${accel}" — omitido`);
        continue;
      }
      const ok = globalShortcut.register(accel, () => {
        handleGlobalShortcut(action);
      });
      if (!ok) {
        console.warn(`[shortcuts] fallo al registrar "${accel}" -> "${action}"`);
        failedAccels.push(accel);
        continue;
      }
      seenAccels.add(accel);
      registeredShortcuts.set(accel, action);
      console.log(`[shortcuts] registrado: ${accel} -> ${action}`);
    }

    // Si fallaron todas
    if (Object.keys(map).length > 0 && registeredShortcuts.size === 0) {
      const result = await dialog.showMessageBox({
        type: 'warning',
        buttons: ['Reintentar', 'Continuar sin teclas', 'Cancelar'],
        defaultId: 0,
        cancelId: 2,
        title: 'Error al registrar teclas',
        message: 'No se pudieron registrar las teclas. Puede que otra aplicación esté interfiriendo.',
        detail: '¿Desea cerrar la aplicación que interfiere y reintentar?\n\n"Continuar sin teclas" desactivará los atajos globales.\n"Cancelar" cerrará la aplicación.',
        noLink: true,
      });

      if (result.response === 0) {
        // Reintentar
        registerShortcutsFromMap(map);
      } else if (result.response === 1) {
        // Continuar sin teclas
        console.warn('[shortcuts] Continuando sin teclas registradas');
      } else {
        // Cancelar
        console.warn('[shortcuts] Usuario canceló — cerrando aplicación');
        app.quit();
      }
    }
  } catch (err) {
    console.error('[shortcuts] error en registerShortcutsFromMap:', err);
  }
}

function handleGlobalShortcut(action) {
  try {
    if (!action || typeof action !== 'string') return;
    if (action === 'toggleWindow') {
      if (!win || win.isDestroyed()) {
        const w = BrowserWindow.getAllWindows()[0];
        if (w) {
          win = w;
        } else {
          return;
        }
      }
      if (win.isMinimized()) {
        win.restore();
        win.focus();
      } else {
        if (win.isFocused()) {
          win.minimize();
        } else {
          if (!win.isVisible()) win.show();
          win.focus();
        }
      }
      return;
    }
    if (win && win.webContents) {
      win.webContents.send('shortcut-action', { action });
    } else {
      const w = BrowserWindow.getAllWindows()[0];
      if (w && w.webContents) w.webContents.send('shortcut-action', { action });
    }
  } catch (err) {
    console.error('handleGlobalShortcut error:', err);
  }
}

async function loadShortcutsFileAndRegister() {
  try {
    let raw = '{}';
    try {
      raw = await fs.readFile(SHORTCUTS_PATH, 'utf8');
    } catch (e) {
      console.warn(`[shortcuts] ${SHORTCUTS_PATH} no encontrado — sin atajos registrados`);
      return;
    }
    let parsed = {};
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.warn('[shortcuts] JSON inválido en shortcuts.json — ignorado');
      return;
    }
    registerShortcutsFromMap(parsed);
  } catch (err) {
    console.error('[shortcuts] error en loadShortcutsFileAndRegister:', err);
  }
}

function watchShortcutsFile() {
  try {
    if (shortcutsWatcher) {
      try { shortcutsWatcher.close(); } catch (e) { }
      shortcutsWatcher = null;
    }
    shortcutsWatcher = chokidar.watch(SHORTCUTS_PATH, { ignoreInitial: true, persistent: true });
    let reloadTimer = null;
    shortcutsWatcher.on('change', () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(async () => {
        console.log('[shortcuts] cambio detectado -> recargando shortcuts.json');
        await loadShortcutsFileAndRegister();
      }, 200);
    });
  } catch (e) {
    console.warn('[shortcuts] error en watchShortcutsFile:', e);
  }
}

// --------------------------------------------------------------
// ffmpeg peaks and wavefrom processor
// -------------------------------------------------------------- 


// --- START: Peaks generation worker + IPC handlers (INSERT near top of main.js) ---

// Simple job manager for peak generation (concurrency 1, preemption support)
const peaksJobManager = {
  queue: [],
  currentJob: null,
  jobsByPath: new Map(), // path -> job
  concurrency: 1,

  async enqueue(jobParams) {
    // If there's already an in-flight job for the same path, return its promise
    if (this.jobsByPath.has(jobParams.path)) {
      return this.jobsByPath.get(jobParams.path).promise;
    }

    const job = createJob(jobParams);
    this.jobsByPath.set(job.path, job);
    this.queue.push(job);

    // try start if idle
    this._maybeStartNext();
    return job.promise;
  },

  _start(job) {
    this.currentJob = job;
    job.status = 'running';
    job.startedAt = Date.now();
    // run generation
    runFFmpegPeaks(job).then(result => {
      job.status = 'done';
      job.finishedAt = Date.now();
      job.resolve(result);
    }).catch(err => {
      job.status = (err && err.cancelled) ? 'cancelled' : 'error';
      job.finishedAt = Date.now();
      job.reject(err);
    }).finally(() => {
      // cleanup
      this.jobsByPath.delete(job.path);
      this.currentJob = null;
      // start next queued job (if any)
      setImmediate(() => this._maybeStartNext());
    });
  },

  _maybeStartNext() {
    if (this.currentJob) return;
    if (this.queue.length === 0) return;
    const nextJob = this.queue.shift();
    this._start(nextJob);
  },

  cancelByPath(path, reason = 'cancelled-by-request') {
    // If running job is this path -> kill it
    const running = this.currentJob;
    if (running && running.path === path) {
      if (running.proc && !running.proc.killed) {
        try { running.proc.kill('SIGKILL'); } catch (e) {}
      }
      running.reject({ cancelled: true, reason });
      return true;
    }
    // if in queue, remove it and reject
    const idx = this.queue.findIndex(j => j.path === path);
    if (idx >= 0) {
      const [job] = this.queue.splice(idx, 1);
      job.reject({ cancelled: true, reason });
      this.jobsByPath.delete(path);
      return true;
    }
    return false;
  }
};

function createJob({ path, peaksCount = 8192, priority = 'normal' }) {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
    path,
    peaksCount: peaksCount | 0,
    priority,
    status: 'pending',
    startedAt: null,
    finishedAt: null,
    proc: null,
    resolve, reject,
    promise
  };
}

// Helper: get file duration via ffprobe (returns seconds, 0 on failure)
function ffprobeGetDuration(filePath) {
  return new Promise((resolve) => {
    try {
      const args = ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath];
      const p = child_process.spawn(ffprobePath, args);
      let out = '';
      p.stdout.on('data', d => out += d.toString());
      p.on('close', () => {
        const dur = parseFloat((out || '').trim()) || 0;
        resolve(dur);
      });
      p.on('error', () => resolve(0));
    } catch (e) {
      resolve(0);
    }
  });
}

/**
 * Core: run ffmpeg to produce f32le PCM mono at SAMPLE_RATE and compute peaks streaming
 * job: { path, peaksCount, id, ... }
 * returns -> { peaks: Buffer (float32), peaksCount, size, duration }
 */
async function runFFmpegPeaks(job) {
  const { path, peaksCount } = job;
  // get file stat & duration first
  let stat;
  try {
    stat = await fs.stat(path);
  } catch (err) {
    throw { error: 'stat-failed', message: err && err.message ? err.message : String(err) };
  }

  const duration = await ffprobeGetDuration(path);
  // total samples estimation
  const totalSamples = Math.max(1, Math.floor(duration * SAMPLE_RATE));
  const targetPeaks = Math.max(128, peaksCount || 8192);
  const samplesPerPeak = Math.max(1, Math.floor(totalSamples / targetPeaks));

  // Allocate peaks array
  const peaks = new Float32Array(targetPeaks);
  let peakIndex = 0;
  let sampleInWindow = 0;
  let currentMax = 0;

  let processedSamples = 0;

  return new Promise((resolve, reject) => {
    // spawn ffmpeg to output float32le mono PCM
    const args = [
      '-i', path,
      '-vn',
      '-ac', '1',
      '-ar', String(SAMPLE_RATE),
      '-f', 'f32le',
      '-' // stdout
    ];
    const proc = child_process.spawn(ffmpegPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    job.proc = proc;

    // parse stderr for progress time (optional)
    proc.stderr.on('data', (chunk) => {
      const s = chunk.toString();
      // try parse "time=hh:mm:ss.xx"
      const m = s.match(/time=(\d+:\d+:\d+\.\d+)/);
      if (m) {
        const parts = m[1].split(':').map(parseFloat);
        const hh = parseFloat(parts[0]), mm = parseFloat(parts[1]), ss = parseFloat(parts[2]);
        const seconds = hh * 3600 + mm * 60 + ss;
        const percent = duration > 0 ? Math.min(100, (seconds / duration) * 100) : 0;
        try { win && win.webContents && win.webContents.send('peaks-progress', { jobId: job.id, path, percent, time: seconds }); } catch (e) {}
      }
    });

    // buffer handling for float32 samples
    let leftover = null;
    proc.stdout.on('data', (chunk) => {
      if (!chunk || chunk.length === 0) return;
      // merge leftover if exists
      let buffer = chunk;
      if (leftover && leftover.length) {
        buffer = Buffer.concat([leftover, chunk]);
        leftover = null;
      }
      // how many complete float32 samples we have
      const sampleCount = Math.floor(buffer.length / 4);
      const bytesUsed = sampleCount * 4;
      if (bytesUsed < buffer.length) {
        leftover = buffer.slice(bytesUsed);
      }

      if (sampleCount === 0) return;

      // create Float32Array view (little-endian floats)
      // Must use Buffer's underlying ArrayBuffer with byteOffset
      const floats = new Float32Array(buffer.buffer, buffer.byteOffset, sampleCount);

      for (let i = 0; i < floats.length; i++) {
        const v = Math.abs(floats[i]);
        currentMax = Math.max(currentMax, v);
        sampleInWindow++;
        processedSamples++;

        if (sampleInWindow >= samplesPerPeak) {
          // store peak
          if (peakIndex < targetPeaks) {
            peaks[peakIndex] = currentMax;
            peakIndex++;
          }
          // reset window
          sampleInWindow = 0;
          currentMax = 0;

          // occasionally emit progress based on peaks computed
          if (peakIndex % Math.max(1, Math.floor(targetPeaks / 40)) === 0) {
            const percent = Math.min(100, (peakIndex / targetPeaks) * 100);
            try { win && win.webContents && win.webContents.send('peaks-progress', { jobId: job.id, path, percent, peaksComputed: peakIndex }); } catch (e) {}
          }
        }
      }
    });

    proc.on('close', (code, signal) => {
      // If job was cancelled, reject accordingly
      if (job.status === 'cancelled' || (signal && signal !== null && signal !== undefined && signal !== 0)) {
        return reject({ cancelled: true, code, signal });
      }
      // If we didn't fill all peaks (last window), fill remaining windows with currentMax/zeros
      if (peakIndex < targetPeaks) {
        // if there is leftover currentMax (partial window), write it
        if (sampleInWindow > 0 && peakIndex < targetPeaks) {
          peaks[peakIndex++] = currentMax;
        }
        // fill rest with zeros
        while (peakIndex < targetPeaks) { peaks[peakIndex++] = 0; }
      }
      // convert to Buffer to send back (retain float32)
      const peaksBuffer = Buffer.from(peaks.buffer);
      // final progress 100%
      try { win && win.webContents && win.webContents.send('peaks-progress', { jobId: job.id, path, percent: 100, peaksComputed: targetPeaks }); } catch(e) {}
      resolve({
        peaks: peaksBuffer,
        peaksCount: targetPeaks,
        size: stat.size,
        duration
      });
    });

    proc.on('error', (err) => {
      reject({ error: 'ffmpeg-error', message: err && err.message ? err.message : String(err) });
    });

    // If the main process needs to be able to cancel quickly, the cancel handler will kill proc
  }); // end promise
}

// IPC handlers to expose to renderer ---------------------------------
ipcMain.handle('get-file-metadata', async (event, filePath) => {
  try {
    const st = await fs.stat(filePath);
    const duration = await ffprobeGetDuration(filePath);
    return { size: st.size, mtimeMs: st.mtimeMs, duration };
  } catch (err) {
    return { size: 0, mtimeMs: 0, duration: 0, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.handle('generate-peaks', async (event, { path: filePath, peaksCount = 3000, priority = 'normal' } = {}) => {
  if (!filePath) return { success: false, error: 'no-path' }; //8192
  try {
    const p = await peaksJobManager.enqueue({ path: filePath, peaksCount, priority });
    // p is the result from runFFmpegPeaks
    return { success: true, peaks: p.peaks, peaksCount: p.peaksCount, size: p.size, duration: p.duration };
  } catch (err) {
    if (err && err.cancelled) return { success: false, cancelled: true, error: err.reason || 'cancelled' };
    return { success: false, error: err && err.message ? err.message : String(err) };
  }
});

ipcMain.handle('cancel-peaks', async (event, { path: filePath } = {}) => {
  if (!filePath) return { success: false };
  const ok = peaksJobManager.cancelByPath(filePath, 'cancelled-by-renderer');
  return { success: !!ok };
});

// Optionally emit peaks-started / peaks-done as events from enqueue/start/done above
// but we already emit progress from parsing and final result via IPC response from generate-peaks
// For push-style notifications you can also send events using win.webContents.send(...) as done above
// --- END: Peaks generation worker + IPC handlers ---


ipcMain.handle('show-error-dialog', async (event, { title, message }) => {
  const win = BrowserWindow.getFocusedWindow();
  await dialog.showMessageBox(win, {
    type: 'error',
    title: title || 'Error',
    message: message || 'Ocurrió un error.',
    buttons: ['OK'],
    defaultId: 0
  });
});

// ----------------------------------------------------------
// default app functions
// ----------------------------------------------------------

// Unregister all keys on exit
app.on('will-quit', () => { try { globalShortcut.unregisterAll(); } catch (e) { /* ignore */ } });

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

app.whenReady().then(async () => {
  await createWindow();
  await loadShortcutsFileAndRegister(); // registrar shortcuts y watcher
  watchShortcutsFile();
});




// Next file is preload.js