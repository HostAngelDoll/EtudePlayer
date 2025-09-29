//preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  showContextMenu: (options) => {
    ipcRenderer.invoke("show-context-menu", options)
  },
  onContextPlaySelected: (callback) => {
    ipcRenderer.removeAllListeners("context-play-selected");
    ipcRenderer.on("context-play-selected", callback);
  },
  onContextMenuAction: (callback) => {
    ipcRenderer.removeAllListeners("context-menu-action");
    ipcRenderer.on("context-menu-action", (_, action) => callback(action));
  },

  onScanProgress: (callback) => {
    ipcRenderer.removeAllListeners("scan-progress");
    ipcRenderer.on("scan-progress", (event, progress) => callback(progress));
  },
  getPlaylists: async () => {
    try {
      return await ipcRenderer.invoke('get-playlists');
    } catch (err) {
      console.error('Error al obtener playlists:', err);
      return { playlists: [], xmas: null };
    }
  },
  getSongs: async (path) => {
    try {
      return await ipcRenderer.invoke('get-songs', path);
    } catch (err) {
      console.error(`Error al obtener canciones de ${path}:`, err);
      return [];
    }
  },
  getXmasSongs: async (path) => {
    try {
      return await ipcRenderer.invoke('get-xmas-songs', path);
    } catch (err) {
      console.error(`Error al obtener canciones Xmas de ${path}:`, err);
      return [];
    }
  },

  selectFolder: (folderPath) => {
    ipcRenderer.send('select-folder', folderPath)
  },
  selectXmas: (baseRoot) => {
    ipcRenderer.send('select-xmas', baseRoot);
  },

  onFolderUpdated: (callback) => {
    ipcRenderer.removeAllListeners('folder-updated');
    ipcRenderer.on('folder-updated', (event, { folderPath, files }) => callback(files, folderPath));
  },
  onPlaylistUpdated: (callback) => {
    ipcRenderer.removeAllListeners('playlist-updated');
    ipcRenderer.on('playlist-updated', (event, payload) => callback(payload));
  },

  // Rename
  renameFile: (payload) => ipcRenderer.invoke("rename-file", payload),
  onFileRenamed: (callback) => {
    ipcRenderer.removeAllListeners("file-renamed");
    ipcRenderer.on("file-renamed", (_, payload) => callback(payload));
  },

  // NEW: show context menu for move tree nodes
  showMoveContextMenu: async (payload) => {
    try {
      return await ipcRenderer.invoke('show-move-context-menu', payload);
    } catch (err) {
      console.error('Error mostrando menu contexto moveTree:', err);
      return null;
    }
  },

  // NEW: create folder
  createFolder: async (payload) => {
    try {
      return await ipcRenderer.invoke('create-folder', payload);
    } catch (err) {
      console.error('Error creando carpeta:', err);
      return { success: false, error: err && err.message ? err.message : String(err) };
    }
  },
  // NEW: rename folder
  renameFolder: async (payload) => {
    try {
      return await ipcRenderer.invoke('rename-folder', payload);
    } catch (err) {
      console.error('Error renombrando carpeta:', err);
      return { success: false, error: err && err.message ? err.message : String(err) };
    }
  },
  onFolderRenamed: (callback) => {
    ipcRenderer.removeAllListeners('folder-renamed');
    ipcRenderer.on('folder-renamed', (event, payload) => callback(payload));
  },
  // MAIN -> renderer: move-tree-action
  onMoveTreeAction: (callback) => {
    ipcRenderer.removeAllListeners('move-tree-action');
    ipcRenderer.on('move-tree-action', (event, action) => callback(action));
  },

  // Comprobar existencia de ruta (true/false)
  pathExists: async (path) => {
    try {
      return await ipcRenderer.invoke('path-exists', path);
    } catch (err) {
      console.error('pathExists error:', err);
      return false;
    }
  },

  // Leer todos los nombres de archivo de una carpeta (devuelve array o null si error)
  readFolderFiles: async (path) => {
    try {
      return await ipcRenderer.invoke('read-folder-files', path);
    } catch (err) {
      console.error('readFolderFiles error:', err);
      return null;
    }
  },

  // ---- Watchdog control (activar/desactivar emisión de eventos desde main) ----
  setWatchdog: async (enabled) => {
    try {
      return await ipcRenderer.invoke('set-watchdog', !!enabled);
    } catch (err) {
      console.error('setWatchdog error:', err);
      return null;
    }
  },

  // Ejecutar operaciones de move (ETAPA 3)
  executeMoveOperations: async (operations) => {
    try {
      return await ipcRenderer.invoke('execute-move-operations', { operations });
    } catch (err) {
      console.error('executeMoveOperations error:', err);
      return { success: false, error: err && err.message ? err.message : String(err), results: [] };
    }
  },

  // Subscribir progreso de movimiento (etapa 3)
  onMoveProgress: (callback) => {
    ipcRenderer.removeAllListeners('move-progress');
    ipcRenderer.on('move-progress', (event, payload) => callback(payload));
  },

  // Mover a papelera (main)
  moveToTrash: async (files) => {
    try {
      return await ipcRenderer.invoke('move-to-trash', { files });
    } catch (err) {
      console.error('moveToTrash error:', err);
      return { success: false, error: err && err.message ? err.message : String(err), results: [] };
    }
  },

  // Progreso de move-to-trash
  onMoveToTrashProgress: (callback) => {
    ipcRenderer.removeAllListeners('move-to-trash-progress');
    ipcRenderer.on('move-to-trash-progress', (event, payload) => callback(payload));
  },

  // Abrir carpeta papelera
  openTrashFolder: async () => {
    try {
      return await ipcRenderer.invoke('open-trash-folder');
    } catch (err) {
      console.error('openTrashFolder error:', err);
      return { success: false, error: err && err.message ? err.message : String(err) };
    }
  },

  // Revelar archivo en carpeta (invoca main -> shell.showItemInFolder)
  revealInFolder: async (filePath) => {
    try {
      return await ipcRenderer.invoke('reveal-in-folder', filePath);
    } catch (err) {
      console.error('revealInFolder error:', err);
      return { success: false, error: err && err.message ? err.message : String(err) };
    }
  },

  // ----------------------------------------------------------------------------
  // Crear directorio recursivamente (mkdir -p)
  ensureDir: async (dirPath) => {
    try {
      return await ipcRenderer.invoke('ensure-dir', dirPath);
    } catch (err) {
      console.error('ensureDir error:', err);
      return { success: false, error: err && err.message ? err.message : String(err) };
    }
  },

  // Eliminar carpeta (solo si está vacía)
  removeFolder: async (folderPath) => {
    try {
      return await ipcRenderer.invoke('remove-folder', folderPath);
    } catch (err) {
      console.error('removeFolder error:', err);
      return { success: false, error: err && err.message ? err.message : String(err) };
    }
  },

  // Renombrar usando rutas completas
  renamePath: async (oldPath, newPath) => {
    try {
      return await ipcRenderer.invoke('rename-path', { oldPath, newPath });
    } catch (err) {
      console.error('renamePath error:', err);
      return { success: false, error: err && err.message ? err.message : String(err) };
    }
  },

  // Notificar shortcuts (renderer recibe acciones)
  onShortcutAction: (callback) => {
    ipcRenderer.removeAllListeners('shortcut-action');
    ipcRenderer.on('shortcut-action', (event, payload) => callback(payload));
  },

  
  // --- START: peaks/ffmpeg related APIs ---
  getFileMetadata: async (filePath) => {
    try {
      return await ipcRenderer.invoke('get-file-metadata', filePath);
    } catch (err) {
      console.error('getFileMetadata error:', err);
      return { size: 0, mtimeMs: 0, duration: 0, error: String(err) };
    }
  },
  generatePeaks: async ({ path, peaksCount = 8192, priority = 'normal' } = {}) => {
    try {
      return await ipcRenderer.invoke('generate-peaks', { path, peaksCount, priority });
    } catch (err) {
      console.error('generatePeaks error:', err);
      return { success: false, error: String(err) };
    }
  },
  cancelPeaks: async ({ path } = {}) => {
    try {
      return await ipcRenderer.invoke('cancel-peaks', { path });
    } catch (err) {
      console.error('cancelPeaks error:', err);
      return { success: false, error: String(err) };
    }
  },

  onPeaksProgress: (callback) => {
    ipcRenderer.removeAllListeners('peaks-progress');
    ipcRenderer.on('peaks-progress', (event, payload) => callback(payload));
  },
  onPeaksStarted: (callback) => {
    ipcRenderer.removeAllListeners('peaks-started');
    ipcRenderer.on('peaks-started', (event, payload) => callback(payload));
  },
  onPeaksDone: (callback) => {
    ipcRenderer.removeAllListeners('peaks-done');
    ipcRenderer.on('peaks-done', (event, payload) => callback(payload));
  },
  onPeaksCancelled: (callback) => {
    ipcRenderer.removeAllListeners('peaks-cancelled');
    ipcRenderer.on('peaks-cancelled', (event, payload) => callback(payload));
  },
  onPeaksError: (callback) => {
    ipcRenderer.removeAllListeners('peaks-error');
    ipcRenderer.on('peaks-error', (event, payload) => callback(payload));
  }
  // --- END: peaks APIs ---

});

// ##########################################
// next file -> index.html -> renderer.js part-1
// ##########################################
