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

});

// ##########################################
// next file -> index.html -> renderer.js part-1
// ##########################################
