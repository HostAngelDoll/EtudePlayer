//preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  showContextMenu: (options) => ipcRenderer.invoke("show-context-menu", options),
  onContextPlaySelected: (callback) => {
    ipcRenderer.removeAllListeners("context-play-selected");
    ipcRenderer.on("context-play-selected", callback);
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
  }

});

// ##########################################
// next file -> renderer.js part-1
// ##########################################
