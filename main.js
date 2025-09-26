// main.js
const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const chokidar = require("chokidar");
const CACHE_PATH = path.join(app.getPath("userData"), "cache.json");
const XMAS_START_YEAR = 2004;
const XMAS_END_YEAR = 2021;
const ROOT_YEARS_PATH = "E:\\_Internal";
const TRASH_FOLDER = "E:\\_Exclude\\l_reallydeleted";
let watchers = new Map();
let watchdogEnabled = true; // --- WATCHDOG GLOBAL (activar/desactivar notificaciones de watchers) ---
let win;


async function createWindow() { // main function to start app
  win = new BrowserWindow({
    width: 1200,
    height: 720,
    title: 'EtudePlayer',
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
            .filter(f => f.isFile() && (f.name.toLowerCase().endsWith('.mp3') || f.name.toLowerCase().endsWith('.mp4')))
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
        .filter(f => f.isFile() && (f.name.toLowerCase().endsWith('.mp3') || f.name.toLowerCase().endsWith('.mp4')))
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
    const mediaFiles = files.filter(f => f.endsWith('.mp3') || f.endsWith('.mp4'))
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
      .filter(f => f.isFile() && (f.name.toLowerCase().endsWith('.mp3') || f.name.toLowerCase().endsWith('.mp4')))
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


// ----------------------
// Abrir carpeta papelera en explorador
// ----------------------

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


// ----------------------------------------------------------
// default app functions
// ----------------------------------------------------------

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

app.whenReady().then(createWindow);

// Next file is preload.js