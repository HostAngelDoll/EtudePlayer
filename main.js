// main.js
const { app, BrowserWindow, ipcMain, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const CACHE_PATH = path.join(app.getPath("userData"), "cache.json");
let win;

async function createWindow() {
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

app.whenReady().then(createWindow);

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

// Guardar cache
async function saveCache(data) {
  try {
    await fs.writeFile(CACHE_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error guardando cache:", err);
  }
}

// Leer cache
async function loadCache() {
  try {
    const content = await fs.readFile(CACHE_PATH, "utf-8");
    return JSON.parse(content);
  } catch {
    return null; // si no existe, devuelve null
  }
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


// Handler de IPC actualizado
// ipcMain.handle('get-playlists', async () => {
//   const rootPath = "E:\\_Internal";
//   try {
//     const yearDirs = await fs.readdir(rootPath, { withFileTypes: true });
//     const years = yearDirs.filter(d => d.isDirectory() && /^\d{4}$/.test(d.name))
//       .map(d => d.name);

//     const playlists = [];

//     for (const year of years) {
//       const yearPath = path.join(rootPath, year);
//       const prefix = String(year - 2003).padStart(2, '0');
//       const nodes = [];

//       // Main
//       const mainTemp = path.join(yearPath, `${prefix}. music.main`);
//       try {
//         await fs.access(mainTemp);
//         const mainNodes = await getFolderNodes(mainTemp);
//         nodes.push({ name: 'Main', type: 'folder', path: mainTemp, nodes: mainNodes });
//       } catch { } // si no existe, no hace nada

//       // Album Package
//       const albumPath = path.join(yearPath, `${prefix}. music.registry.album.package`);
//       try {
//         await fs.access(albumPath);
//         const albumNodes = await getFolderNodes(albumPath);
//         nodes.push({ name: 'Album Package', type: 'folder', path: albumPath, nodes: albumNodes });
//       } catch { }

//       // Base
//       const basePath = path.join(yearPath, `${prefix}. music.registry.base`);
//       try {
//         await fs.access(basePath);
//         nodes.push({ name: 'Base', type: 'folder', path: basePath, nodes: [] });
//       } catch { }

//       // Theme
//       const themePath = path.join(yearPath, `${prefix}. music.theme`);
//       try {
//         await fs.access(themePath);
//         const themeNodes = await getFolderNodes(themePath);
//         nodes.push({ name: 'Theme', type: 'folder', path: themePath, nodes: themeNodes });
//       } catch { }

//       playlists.push({ year, nodes });
//     }

//     // Nodo especial Xmas
//     const xmasNode = {
//       name: 'Xmas',
//       type: 'folder',
//       path: null,
//       nodes: [
//         { name: 'All Songs', type: 'xmas-all', path: rootPath }
//       ]
//     };

//     return { playlists, xmas: xmasNode };

//   } catch (err) {
//     console.error('Error obteniendo playlists:', err);
//     return { playlists: [], xmas: null };
//   }
// });

ipcMain.handle('get-xmas-songs', async (event, rootPath) => { //ext check
  try {
    const yearDirs = await fs.readdir(rootPath, { withFileTypes: true });
    const years = yearDirs.filter(d => d.isDirectory() && /^\d{4}$/.test(d.name))
      .map(d => d.name);

    let allSongs = [];

    for (const year of years) {
      const prefix = String(year - 2003).padStart(2, '0');
      const xmasPath = path.join(rootPath, year, `${prefix}. music.xmas`);

      try {
        await fs.access(xmasPath);
        const entries = await fs.readdir(xmasPath, { withFileTypes: true });
        const mediaFiles = entries
          .filter(f => f.isFile() && (f.name.toLowerCase().endsWith('.mp3') || f.name.toLowerCase().endsWith('.mp4')))
          .map(f => path.join(xmasPath, f.name));
        allSongs = allSongs.concat(mediaFiles);

      } catch {
        // carpeta xmas no existe para este año, continuar
      }
    }

    return allSongs;
  } catch (err) {
    console.error(`Error obteniendo canciones Xmas desde ${rootPath}:`, err);
    return [];
  }
});

// Manejar petición de canciones desde el renderer
ipcMain.handle('get-songs', async (event, folderPath) => { //ext check

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

ipcMain.on('select-folder', (event, folderPath) => { //ext check

  const files = fs.readdirSync(folderPath)
    .filter(f => f.endsWith('.mp3') || f.endsWith('.mp4'))  // Incluye mp3 y mp4
    .map(f => path.join(folderPath, f));

  win.webContents.send('playlist-updated', { folderPath, files });

});

ipcMain.handle("show-context-menu", (event, { type }) => {
  let template = [];

  if (type === "single") {

    template = [
      {
        label: "▶ Reproducir canción",
        click: () => {
          event.sender.send("context-play-selected");
        }
      },
      { type: "separator" },
      {
        label: "Opción de prueba (single)",
        click: () => {
          console.log("Menú contextual SINGLE");
        }
      }
    ];

  } else if (type === "multiple") {
    template = [
      {
        label: "Opción de prueba (multiple)",
        click: () => {
          console.log("Menú contextual MULTIPLE");
        }
      }
    ];
  }

  const menu = Menu.buildFromTemplate(template);
  menu.popup(BrowserWindow.fromWebContents(event.sender));
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
