// main.js
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const chokidar = require("chokidar");
const CACHE_PATH = path.join(app.getPath("userData"), "cache.json");
const XMAS_START_YEAR = 2004;
const XMAS_END_YEAR = 2021;
const ROOT_YEARS_PATH = "E:\\_Internal";
let watchers = new Map();
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

  // const notifyChange = () => {
  //   if (debounceTimer) clearTimeout(debounceTimer);
  //   debounceTimer = setTimeout(async () => {
  //     try {

  const notifyChange = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        // Si hay supresión activa para esta carpeta, NO hacer nada
        if (isSuppressed(folderPath)) return;

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
    console.log(oldPath);
    console.log(newPath);

    // Avisar al renderer que el archivo cambió
    event.sender.send("file-renamed", { oldPath, newPath });
    return { success: true };
  } catch (err) {
    console.error("Error renombrando archivo:", err);
    return { success: false, error: err.message };
  }
});


// ----------------------------------------------------------
// Move / create-folder / move-tree
// ----------------------------------------------------------

const suppressedUntil = new Map(); // folderPath -> timestamp (ms)

// Move helper (intento rename; si falla por EXDEV, copia+unlink)
async function moveItem(src, dst) {
  try {
    await fs.rename(src, dst);
    return;
  } catch (err) {
    // fallback cross-device
    if (err && err.code === 'EXDEV') {
      // Usando streams con fs.promises
      const rs = fs.createReadStream(src);
      const ws = fs.createWriteStream(dst);

      return new Promise((resolve, reject) => {
        rs.on('error', reject);
        ws.on('error', reject);
        ws.on('close', async () => {
          try {
            await fs.unlink(src);
            resolve();
          } catch (e) { reject(e); }
        });
        rs.pipe(ws);
      });
    }
    throw err;
  }
}

// Helper: set suppression for a set of folders durante ms milliseconds
function setSuppressionForFolders(folders, ms = 2500) {
  const until = Date.now() + ms;
  for (const f of folders) suppressedUntil.set(f, until);
}

// Helper: check if a folder is currently suppressed
function isSuppressed(folderPath) {
  const until = suppressedUntil.get(folderPath);
  if (!until) return false;
  if (Date.now() > until) {
    suppressedUntil.delete(folderPath);
    return false;
  }
  return true;
}


// -------------------- move dialog / create folder / move files --------------------

ipcMain.handle('get-move-tree', async (event, baseRootArg) => {
  const baseRoot = baseRootArg || ROOT_YEARS_PATH;
  const result = [];
  try {
    const yearDirs = await fs.readdir(baseRoot, { withFileTypes: true });
    const years = yearDirs.filter(d => d.isDirectory() && /^\d{4}$/.test(d.name)).map(d => d.name);
    for (const year of years) {
      const yearPath = path.join(baseRoot, year);
      const id = String(Number(year) - 2003).padStart(2, '0');
      const candidateNames = [
        `${id}. music.main`,
        `${id}. music.registry.album.package`,
        `${id}. music.registry.base`,
        `${id}. music.theme`,
        `${id}. music.xmas`
      ];

      const nodes = [];
      for (const name of candidateNames) {
        const nodePath = path.join(yearPath, name);
        try {
          await fs.access(nodePath);
          // canCreate = false for .main, .registry.base, .xmas
          const canCreate = !(name.endsWith('.main') || name.endsWith('.registry.base') || name.endsWith('.xmas'));
          const childNode = { name, path: nodePath, canCreate, nodes: [] };

          // if album.package or theme -> include subfolders (directories)
          if (name.endsWith('album.package') || name.endsWith('music.theme')) {
            try {
              const subs = await fs.readdir(nodePath, { withFileTypes: true });
              childNode.nodes = subs.filter(s => s.isDirectory()).map(s => ({ name: s.name, path: path.join(nodePath, s.name), canCreate: true, nodes: [] }));
            } catch(e){}
          }

          nodes.push(childNode);
        } catch (e) {
          // ausencia -> ignorar
        }
      }

      result.push({ year, path: yearPath, nodes });
    }
  } catch (err) {
    console.error('Error construyendo move-tree:', err);
  }
  return result;
});

ipcMain.handle('create-folder', async (event, { parentPath, folderName }) => {
  try {
    // seguridad: no permitir crear dentro de .main / .registry.base / .xmas
    const lower = parentPath.toLowerCase();
    if (lower.endsWith('.music.main') || lower.endsWith('.music.registry.base') || lower.endsWith('.music.xmas')) {
      return { success: false, error: 'Creación no permitida en esta carpeta' };
    }
    const newPath = path.join(parentPath, folderName);
    await fs.mkdir(newPath);
    return { success: true, path: newPath };
  } catch (err) {
    console.error('Error creando carpeta:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('move-files', async (event, { files, destPath }) => {
  try {
    if (!Array.isArray(files) || files.length === 0) {
      return { success: false, error: 'No files provided' };
    }

    // determinar carpetas afectadas
    const affected = new Set(files.map(f => path.dirname(f)));
    affected.add(destPath);

    // suprimir watchers en estas carpetas (duración proporcional)
    const suppressMs = Math.max(2000, files.length * 300);
    setSuppressionForFolders(Array.from(affected), suppressMs);

    const moved = [];
    const total = files.length;
    for (let i = 0; i < total; i++) {
      const src = files[i];
      const filename = path.basename(src);
      const dst = path.join(destPath, filename);
      try {
        await moveItem(src, dst);
        moved.push({ oldPath: src, newPath: dst });
        event.sender.send('move-progress', { current: i + 1, total, file: src, percent: Math.round(((i + 1) / total) * 100) });
      } catch (err) {
        console.error('Error moviendo archivo:', src, err);
        event.sender.send('move-progress', { current: i + 1, total, file: src, error: err.message, percent: Math.round(((i + 1) / total) * 100) });
      }
    }

    // Pequeña espera para asegurar que FS termine
    setTimeout(() => {
      // levantar supresión
      for (const f of affected) suppressedUntil.delete(f);
      // notificar al renderer que la operación terminó
      event.sender.send('move-complete', { moved, affected: Array.from(affected) });
    }, 300);

    return { success: true, moved };
  } catch (err) {
    console.error('Error en move-files:', err);
    return { success: false, error: err.message };
  }
});



// ----------------------------------------------------------
// default app functions
// ----------------------------------------------------------

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

app.whenReady().then(createWindow);

// Next file is preload.js