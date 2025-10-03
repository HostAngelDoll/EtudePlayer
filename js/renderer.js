// ##########################################
// Advertencia: 
// No tener todas las partes del renderer.js significa no poder hacerle juicio hasta que este entrgeado
// renderer.js // part-1 to 3
// ##########################################

const playlistDiv = document.getElementById('playlist');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const playPauseBtn = document.getElementById('playPauseBtn');
const stopBtn = document.getElementById('stopBtn');
const volumeSlider = document.getElementById('volumeSlider');
const volumeLabel = document.getElementById('volumeLabel');
const btnMute = document.getElementById('btnMute');
const btnVolDown = document.getElementById('btnVolDown');
const btnVolUp = document.getElementById('btnVolUp');
const stopAfterCheckbox = document.getElementById('stopAfterCheckbox');
const totalDurLabel = document.getElementById('totalDur');
const currentDurLabel = document.getElementById('currentDur');
const leftDurLabel = document.getElementById('leftDur');
const pitchSlider = document.getElementById('pitchSlider');
const pitchInput = document.getElementById('pitchInput');
const statusBar = document.getElementById('statusBar');
const resetBtn = document.getElementById('resetEQ');
const eqContainer = document.getElementById('eqContainer');
const sliders = eqContainer.querySelectorAll('input[type="range"]');
const openReBinBtn = document.getElementById('openTrashBtn');
const eqSummonBtn = document.getElementById('openEqualizerBtn');
const eqCloseBtn = document.getElementById('closeEqBtn');
const stopOnFinish_Btn = document.getElementById('stopOnFinishBtn');

// ---------------------------------------------------
// inicializar
// ---------------------------------------------------

const originalTitle = "EtudePlayer";
const ROOT_YEARS_PATH = "E:\\_Internal";
const eqBands = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const moveTreeState = { expandedPaths: new Set(), selectedPath: null }; // preservar entre refreshes
let filesWhileRenaming = [];
let wavesurfer = null;
let previousVolume = 1;
let currentVolume = 1;   // 0 a 1
let defaultVol = 0.4;
let isMuted = false;
let currentSongIndex = -1; // let currentIndex = -1;
let playlist = [];
let autoPlay = false;
let activeFolderEl = null;
let pitchValue = 1.0;
let audioContext = null; // Definir bandas del ecualizador
let eqFilters = [];
let mediaNode = null;
let songPath = null; // let currentAudio = null;
let playlistCache = {};
let messageFromOpenByNode = false;
let disableWatchdog = false;
let currentOpenFolder = null; // ruta de la carpeta actualmente abierta en UI de move files
let savedEqValues = JSON.parse(localStorage.getItem('eqValues') || '[]');
let stopFolderUpdate = false
let debug_LoadFromArrayFX = false // para ver el status de la carga por array
let moveModalOverlay = null;        // Iniciating > Modal move-to-folder state
let moveTreeContainer = null;
let moveCurrentPathEl = null;
let btnUp = null;
let btnNewFolder = null;
let moveCancelBtn = null;
let moveConfirmBtn = null;
let modalTreeData = null; // la estructura entera para el modal
let selectedMoveNode = null; // nodo seleccionado para mover
let filesToMove = []; // rutas de archivos seleccionados para mover (cuando el modal se abre)
let pendingMoveOperations = null; // al prepararse: array [{ src, dest }, ...]
let eqIsOpen = false;
let isMouseDown_eqSli = false;
let activeSlider_eqSli = null;
let historyStack = []; // LIFO
let stopOnFinish_Flag = false;
if (savedEqValues.length !== eqBands.length) { savedEqValues = eqBands.map(() => 0); }
volumeLabel.textContent = `${volumeSlider.value}%`;
document.title = originalTitle;

// ----------------------------------------------------------------------
// START peaksDB (IndexedDB helper) 
// ----------------------------------------------------------------------

const PEAKS_DB_NAME = 'EtudePeaksDB';
const PEAKS_STORE = 'peaksCache';
const PEAKS_DB_VERSION = 1;

const peaksDB = {
  db: null,
  async open() {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(PEAKS_DB_NAME, PEAKS_DB_VERSION);
      req.onupgradeneeded = (ev) => {
        const db = ev.target.result;
        if (!db.objectStoreNames.contains(PEAKS_STORE)) {
          const store = db.createObjectStore(PEAKS_STORE, { keyPath: 'path' });
          store.createIndex('lastAccessed', 'lastAccessed', { unique: false });
        }
      };
      req.onsuccess = () => {
        this.db = req.result;
        resolve(this.db);
      };
      req.onerror = (e) => {
        console.error('peaksDB open error', e);
        reject(e);
      };
    });
  },
  async get(path) {
    try {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction([PEAKS_STORE], 'readonly');
        const st = tx.objectStore(PEAKS_STORE);
        const r = st.get(path);
        r.onsuccess = () => {
          const entry = r.result;
          if (entry) {
            // convert stored ArrayBuffer to ArrayBuffer (it is already)
            entry.lastAccessed = Date.now();
            // update lastAccessed (async, don't await)
            try {
              const txu = db.transaction([PEAKS_STORE], 'readwrite');
              txu.objectStore(PEAKS_STORE).put(entry);
            } catch (e) { }
          }
          resolve(entry || null);
        };
        r.onerror = () => resolve(null);
      });
    } catch (e) {
      console.warn('peaksDB.get error', e);
      return null;
    }
  },
  async put(entry) {
    // entry { path, size, mtimeMs, duration, peaksCount, peaks: ArrayBuffer, placeholder?:bool }
    try {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        entry.lastAccessed = Date.now();
        const tx = db.transaction([PEAKS_STORE], 'readwrite');
        const st = tx.objectStore(PEAKS_STORE);
        const r = st.put(entry);
        r.onsuccess = () => {
          // optionally prune if too big (implement simple prune triggered here)
          this.pruneIfNeeded().catch(() => { });
          resolve(true);
        };
        r.onerror = (e) => { console.warn('peaksDB.put error', e); resolve(false); };
      });
    } catch (e) {
      console.warn('peaksDB.put exception', e);
      return false;
    }
  },
  async delete(path) {
    try {
      const db = await this.open();
      return new Promise((resolve) => {
        const tx = db.transaction([PEAKS_STORE], 'readwrite');
        const st = tx.objectStore(PEAKS_STORE);
        const r = st.delete(path);
        r.onsuccess = () => resolve(true);
        r.onerror = () => resolve(false);
      });
    } catch (e) {
      return false;
    }
  },
  async listAll() {
    try {
      const db = await this.open();
      return new Promise((resolve, reject) => {
        const tx = db.transaction([PEAKS_STORE], 'readonly');
        const st = tx.objectStore(PEAKS_STORE);
        const r = st.getAll();
        r.onsuccess = () => resolve(r.result || []);
        r.onerror = () => resolve([]);
      });
    } catch (e) {
      return [];
    }
  },
  async pruneIfNeeded() {
    // Simple pruning policy: limit number of entries to maxEntries
    const maxEntries = 1000; // tune as you want
    const all = await this.listAll();
    if (all.length <= maxEntries) return;
    // sort by lastAccessed ascending and delete oldest
    all.sort((a, b) => (a.lastAccessed || 0) - (b.lastAccessed || 0));
    const toDelete = all.slice(0, all.length - maxEntries);
    for (const e of toDelete) await this.delete(e.path);
  }
};

// ----------------------------------------------------------------------
// playback and playlist state
// ----------------------------------------------------------------------

function obtenerFechaActualStr() {
  const fecha = new Date();

  const año = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0'); // Mes comienza en 0
  const dia = String(fecha.getDate()).padStart(2, '0');

  const horas = String(fecha.getHours()).padStart(2, '0');
  const minutos = String(fecha.getMinutes()).padStart(2, '0');
  const segundos = String(fecha.getSeconds()).padStart(2, '0');

  return `${año}-${mes}-${dia} ${horas}:${minutos}:${segundos}`;
}

function vaciarPlaylistCache() {
  playlistCache = {};
  localStorage.removeItem('playlistCache');
}

function deriveFolderFromPath(p) {
  if (!p || typeof p !== 'string') return null;
  const pos = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
  if (pos === -1) return null;
  return p.substring(0, pos);
}

async function getAudioDurationSeconds(src) {
  return new Promise((resolve) => {
    try {
      const a = document.createElement('audio');
      a.preload = 'metadata';
      a.src = src;
      const onLoaded = () => {
        const val = a.duration || 0;
        cleanup();
        resolve(val);
      };
      const onError = () => {
        cleanup();
        resolve(0);
      };
      function cleanup() {
        a.removeEventListener('loadedmetadata', onLoaded);
        a.removeEventListener('error', onError);
        try { a.src = ''; } catch (e) { }
      }
      a.addEventListener('loadedmetadata', onLoaded, { once: true });
      a.addEventListener('error', onError, { once: true });
    } catch (e) {
      resolve(0);
    }
  });
}

async function loadPlaylistFromArray(songsArray, cacheKey, forceNext = false, callingFrom = "") {
  // songsArray: array de strings (paths) o array de objetos {name, path}
  // cacheKey: string identificador para cache (ej: folderPath o 'xmas-all')
  if (!Array.isArray(songsArray)) return;

  // generar cacheKey si no viene
  if (!cacheKey) {
    const first = songsArray[0];
    const samplePath = (typeof first === 'string') ? first : (first && first.path);
    cacheKey = deriveFolderFromPath(samplePath) || `playlist-${Date.now()}`;
  }

  // Ordenar el array por nombre de archivo
  songsArray.sort((a, b) => {
    const nameA = (typeof a === 'string') ? a.split(/[\\/]/).pop() : (a.name || a.path);
    const nameB = (typeof b === 'string') ? b.split(/[\\/]/).pop() : (b.name || b.path);
    return nameA.localeCompare(nameB);
  });

  // usar cache si existe y tiene contenido
  if (playlistCache[cacheKey] && Array.isArray(playlistCache[cacheKey]) && playlistCache[cacheKey].length > 0 && forceNext === false) {
    console.log('Usando cache para', cacheKey);
    currentSongIndex = -1;
    playlist = playlistCache[cacheKey];
    updatePlaylistUI();
    return;
  }

  // si no hay cache → calcular duraciones secuencialmente (para progress)
  const total = songsArray.length;
  const newPlaylist = [];

  for (let i = 0; i < total; i++) {
    const item = songsArray[i];
    const songPath = (typeof item === 'string') ? item : (item.path || item.name);

    // derivar nombre si no viene
    let name = (typeof item === 'object' && item.name)
      ? item.name
      : (songPath ? songPath.split(/[\\/]/).pop() : `track-${i + 1}`);

    name = getNameAndYear_forArray(songPath);

    if (!songPath) {
      newPlaylist.push({ name, path: '', duration: '0:00' });
      showProgressNotifyPlaylist(`Cargando ${i + 1} de ${total}`, (i + 1) / total);
      continue;
    }

    const durSecs = await getAudioDurationSeconds(songPath); // puede tardar, lo esperamos
    const mins = Math.floor(durSecs / 60);
    const secs = Math.floor(durSecs % 60).toString().padStart(2, '0');

    newPlaylist.push({
      name,
      path: songPath,
      duration: `${mins}:${secs}`
    });

    // update progress using tu función existente
    showProgressNotifyPlaylist(`Cargando ${i + 1} de ${total}`, (i + 1) / total);
  }

  playlist = newPlaylist;

  // Guardar en cache si hay contenido válido y cacheKey es string
  if (playlist.length > 0 && typeof cacheKey === 'string') {
    playlistCache[cacheKey] = playlist;
    try {
      localStorage.setItem('playlistCache', JSON.stringify(playlistCache));
    } catch (err) {
      console.warn('No se pudo guardar playlistCache en localStorage:', err);
    }
  }

  updatePlaylistUI();
  if (debug_LoadFromArrayFX) console.warn("Update hasta el final desde: '" + callingFrom + "' en este tiempo: " + obtenerFechaActualStr());

  showProgressNotifyPlaylist('Playlist Actualizada', 1, false, 3500); // esto ocultará después si tu func lo hace
  if (disableWatchdog) {
    disableWatchdog = false;
  }
}

async function loadPlaylistFromFolder(folderPath) {
  // folderPath: string (ruta absoluta)
  if (!folderPath) return;
  // crear cacheKey = folderPath (asegurar string)
  const cacheKey = String(folderPath);

  // pedir archivos al main (devuelve array de filenames)
  const files = await window.electronAPI.getSongs(folderPath); // filenames (ej: ['01.mp3','02.mp4'])

  // convertir a array de objetos con path completo
  const songsArray = files.map(f => ({ name: f, path: `${folderPath}\\${f}` }));

  // delegar a loadPlaylistFromArray con cacheKey claro
  await loadPlaylistFromArray(songsArray, cacheKey, false, "loadPlaylistFromFolder");
}

function saveCachePlaylist() {
  try {
    localStorage.setItem('playlistCache', JSON.stringify(playlistCache));
    console.log('playlistCache guardado antes de cerrar');
  } catch (e) {
    console.warn('No se pudo guardar playlistCache al cerrar:', e);
  }
}

function getNameAndYear(rawFileUrl) {
  let path = rawFileUrl;
  if (path.startsWith('file://')) {
    path = path.replace(/^file:\/+/, '');
    path = decodeURIComponent(path);  // Solo aquí es seguro decodificar
  }
  const pathSubstring = path.substring(13, 17); // 3. Extraer subcadena (índices 13 a 16 inclusive = JS substring(13,17))
  let filename = path.split(/[\\/]/).pop(); // 4. Obtener nombre de archivo
  if (filename.includes('.')) { filename = filename.substring(0, filename.lastIndexOf('.')); }
  return `${pathSubstring}. ${filename}`;
}

function getNameAndYear_forArray(rawFileUrl) {
  let path = rawFileUrl;
  try {
    // Si la ruta empieza con "file://", eliminar ese prefijo
    if (path.startsWith('file://')) {
      path = path.replace(/^file:\/+/, '');
      path = decodeURIComponent(path);  // Solo aquí es seguro decodificar
    }

    // Extraer nombre del archivo (lo que viene después del último '/' o '\')
    let filename = path.split(/[\\/]/).pop();

    // Si el nombre tiene extensión, eliminarla
    if (filename.includes('.')) {
      filename = filename.substring(0, filename.lastIndexOf('.'));
    }

    // Extraer año: substring desde posición 13 a 16 (índices 13 a 16 inclusive)
    // Para evitar errores, verificamos que la cadena sea suficientemente larga
    let pathSubstring = '';
    if (path.length >= 17) {
      pathSubstring = path.substring(13, 17);
    } else {
      // Si la ruta es muy corta, devolvemos un valor por defecto o vacío
      pathSubstring = '????';
    }

    return `${pathSubstring}. ${filename}`;

  } catch (error) {
    throw new Error(error + " - La ruta fallida es: " + rawFileUrl);
  }

}

function clearPlayingStyle() {
  // Seleccionamos todas las filas del tbody que tengan la clase "playing"
  const filasPlaying = document.querySelectorAll('#playlist tbody tr.playing');

  // Eliminamos cada una de esas filas
  filasPlaying.forEach(fila => {
    fila.classList.remove('playing');
  });
}

function updatePlaylistUI() {
  const tbody = document.querySelector('#playlist tbody');
  tbody.innerHTML = '';

  playlist.forEach((song, index) => {
    const tr = document.createElement('tr');
    tr.dataset.index = index;
    tr.dataset.path = song.path || song;   // ✅ nuevo: guardar path real

    // Columna nombre
    const tdName = document.createElement('td');
    tdName.textContent = song.name || song;
    tr.appendChild(tdName);

    // Columna duración
    const tdDuration = document.createElement('td');
    tdDuration.textContent = song.duration || '--:--';
    tr.appendChild(tdDuration);

    // Aplicar estilos según estado
    if (index === currentSongIndex && wavesurfer && wavesurfer.isPlaying()) {
      tr.classList.add('playing');
    }

    // Click para selección múltiple
    tr.addEventListener('click', (e) => {
      if (e.ctrlKey || e.metaKey) {
        tr.classList.toggle('selected');
      } else if (e.shiftKey) {
        const rows = [...tbody.querySelectorAll('tr')];
        const lastSelected = rows.findIndex(r => r.classList.contains('selected'));
        const currentIndex = rows.indexOf(tr);
        if (lastSelected >= 0) {
          const [start, end] = [lastSelected, currentIndex].sort((a, b) => a - b);
          rows.forEach((row, i) => {
            row.classList.toggle('selected', i >= start && i <= end);
          });
        }
      } else {
        tbody.querySelectorAll('tr').forEach(r => r.classList.remove('selected'));
        tr.classList.add('selected');
      }
    });

    // Doble click → reproducir y marcar negrita
    tr.addEventListener('dblclick', () => {
      document.title = originalTitle;
      statusBar.textContent = "Loading...";
      LetsplaySong(index);
      tr.classList.add('playing');
    });

    tr.addEventListener("contextmenu", (e) => {
      e.preventDefault();

      const tbody = document.querySelector("#playlist tbody");
      const selectedRows = tbody.querySelectorAll("tr.selected");

      // Si la fila sobre la que hice click derecho NO está en la selección actual,
      // entonces hacemos que sea la única seleccionada
      if (!tr.classList.contains("selected")) {
        tbody.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
        tr.classList.add("selected");
      }

      // Ver cuántos hay seleccionados ahora
      const newSelection = tbody.querySelectorAll("tr.selected");
      const type = newSelection.length > 1 ? "multiple" : "single";

      // Paths de los archivos seleccionados
      const files = Array.from(newSelection).map(r => r.dataset.path);

      // Llamar al menú contextual en main
      window.electronAPI.showContextMenu({ type, files });
    });

    tbody.appendChild(tr);
  });

  // ✅ Restaurar resaltado de la canción en curso tras refresh
  if (songPath) {
    clearPlayingStyle();
    //const tbody = document.querySelector('#playlist tbody');
    const rows = tbody.querySelectorAll("tr");
    rows.forEach(row => {
      if (row.dataset.path === songPath) {
        row.classList.add("playing");
      }
    });
  }
}

// -----------------------------------------------------
// Controles
// -----------------------------------------------------

function stopSong() {
  if (wavesurfer) {
    wavesurfer.stop();
    wavesurfer.seekTo(0);
    document.title = originalTitle;
    statusBar.textContent = originalTitle;
    clearPlayingStyle();
  }
}

function playSongBtn() {
  if (!wavesurfer) return;
  if (wavesurfer.isPlaying()) {
    wavesurfer.pause();
  } else {
    wavesurfer.play();
    document.title = getNameAndYear(songPath);
    updatePlaylistUI();
  }
}

async function prevSongBtn() {
  if (playlist.length === 0) return;
  currentSongIndex = (currentSongIndex - 1 + playlist.length) % playlist.length;
  await LetsplaySong(currentSongIndex);

}

async function nextSongBtn() {
  if (playlist.length === 0) return;
  currentSongIndex = (currentSongIndex + 1) % playlist.length;
  await LetsplaySong(currentSongIndex);
}

function stopOnFinish() {
  stopOnFinish_Btn.classList.toggle("playback-btn-active");
  stopOnFinish_Flag = !stopOnFinish_Flag;
}

// ----------------------------------------------------------------------
// Activity bar (folder) // Cargar árbol y manejar clicks en nodos
// ----------------------------------------------------------------------

function setActiveFolder(el) {
  if (activeFolderEl) activeFolderEl.classList.remove('active-folder');
  el.classList.add('active-folder');
  activeFolderEl = el;
}

function collapseAllNodes() {
  const treeContainer = document.getElementById('tree');

  // Quitar clase 'open' de todos los <li> que la tengan
  treeContainer.querySelectorAll('li.open').forEach(li => li.classList.remove('open'));

  // Opcional: desactivar cualquier nodo activo
  treeContainer.querySelectorAll('li.active').forEach(li => li.classList.remove('active'));
}

async function refreshTree() {
  const treeContainer = document.getElementById('tree');
  if (!treeContainer) return;

  // Vaciar DOM anterior
  treeContainer.innerHTML = '';

  // Obtener datos desde main (playlists + xmas node)
  let data;
  try {
    data = await window.electronAPI.getPlaylists();
    if (!data) data = { playlists: [], xmas: null };
  } catch (e) {
    console.error('refreshTree: error obteniendo playlists', e);
    data = { playlists: [], xmas: null };
  }

  // Helper recursivo para crear nodos
  function createNode(node) {
    const li = document.createElement('li');
    li.classList.add('tree-node');
    // store path if present
    if (node.path) li.dataset.path = node.path;

    // label wrapper to allow CSS targeting and prevent text-only click issues
    const label = document.createElement('span');
    label.className = 'node-label';
    label.textContent = node.name || (node.path ? node.path.split(/[\\/]/).pop() : '(sin nombre)');
    li.appendChild(label);

    // create children container if needed
    let childrenContainer = null;
    if (node.nodes && node.nodes.length) {
      childrenContainer = document.createElement('ul');
      childrenContainer.className = 'children';
      for (const child of node.nodes) {
        childrenContainer.appendChild(createNode(child));
      }
      li.appendChild(childrenContainer);
    }

    // Restore expanded state if path is in moveTreeState.expandedPaths
    if (node.path && moveTreeState.expandedPaths && moveTreeState.expandedPaths.has(node.path)) {
      li.classList.add('open');
      if (childrenContainer) childrenContainer.style.display = 'block';
    }

    // Restore selected state if this path matches
    if (node.path && moveTreeState.selectedPath && normalizePathForCompare(moveTreeState.selectedPath) === normalizePathForCompare(node.path)) {
      // Visual selection — use your setActiveFolder to keep consistency
      setActiveFolder(li);
      // also mark this DOM element as selected state
      li.classList.add('active-folder');
    }

    // Toggle helper (expand / collapse)
    const toggleOpen = () => {
      const isOpen = li.classList.toggle('open');
      if (isOpen) {
        if (childrenContainer) childrenContainer.style.display = 'block';
        if (node.path) moveTreeState.expandedPaths.add(node.path);
      } else {
        if (childrenContainer) childrenContainer.style.display = 'none';
        if (node.path) moveTreeState.expandedPaths.delete(node.path);
      }
    };

    // Click handlers
    label.addEventListener('click', async (e) => {
      e.stopPropagation();

      // Select this node visually
      setActiveFolder(li);

      // If this is a top-level year node, close other years when expanding
      if (li.querySelector('ul')) {
        const isTopLevel = !li.parentElement.closest('li'); // true if direct child of root UL
        if (isTopLevel) {
          document.querySelectorAll('#tree > ul > li').forEach(yearLi => {
            if (yearLi !== li) {
              yearLi.classList.remove('open');
              const childU = yearLi.querySelector('ul');
              if (childU) childU.style.display = 'none';
            }
          });
        }
        // Toggle this node
        toggleOpen();
      }

      // If it's a folder with a real path -> load songs
      if (node.type === 'folder' && node.path) {
        try {
          messageFromOpenByNode = true;
          currentOpenFolder = node.path; // marcar carpeta abierta
          await loadPlaylistFromFolder(node.path);
          // iniciar watcher / notificable al main
          window.electronAPI.selectFolder(node.path);
          node.loadedSongs = true;
          if (autoPlay && playlist.length > 0) LetsplaySong(0);
        } catch (err) {
          console.error('Error cargando carpeta desde tree:', err);
        }
      }

      // Special case: xmas-all (unir todas las canciones Xmas)
      if (node.type === 'xmas-all') {
        // evitar doble-fetch por múltiples clicks rápidos
        if (node._loading) return;
        node._loading = true;
        try {
          const songs = await window.electronAPI.getXmasSongs(node.path);
          if (!Array.isArray(songs)) {
            node._loading = false;
            return;
          }

          playlist = songs.map(f => ({ name: f.split(/[\\/]/).pop(), path: f }));
          messageFromOpenByNode = true;
          await loadPlaylistFromArray(songs, 'xmas-all'); // cacheKey 'xmas-all'
          window.electronAPI.selectXmas(node.path);
          node.loadedSongs = true;
          if (autoPlay && playlist.length > 0) LetsplaySong(0);
        } catch (err) {
          console.error('Error cargando Xmas-all:', err);
        } finally {
          node._loading = false;
        }
      }
    });

    // Allow clicking the whole li area to behave like label
    li.addEventListener('click', (e) => {
      // avoid double-handling if label already handled
      if (e.target === label) return;
      label.click();
    });

    return li;
  }

  // Build tree root
  const rootUl = document.createElement('ul');

  // Add each year node
  (data.playlists || []).forEach(year => {
    const yearNode = { name: year.year, nodes: year.nodes || [], type: 'year', path: `${ROOT_YEARS_PATH}\\${year.year}` };
    rootUl.appendChild(createNode(yearNode));
  });

  // Add Xmas top node if present
  if (data.xmas) {
    rootUl.appendChild(createNode(data.xmas));
  }

  treeContainer.appendChild(rootUl);
}

async function initializeSavedCache() {
  try {
    const savedCache = localStorage.getItem('playlistCache');
    if (savedCache) {
      playlistCache = JSON.parse(savedCache) || {};
      // console.log('playlistCache restaurado. Claves:', Object.keys(playlistCache));
    }
  } catch (err) {
    console.warn('No se pudo restaurar playlistCache:', err);
    playlistCache = {};
  }

  await refreshTree(); // Construir/refresh del árbol con la función nueva
}

// ---------------------------------------------------------------
// Volume conection
// ---------------------------------------------------------------

function updateVolumeUI(volume) {
  volumeSlider.value = Math.round(volume * 100);
  volumeLabel.textContent = `${volumeSlider.value}%`;
  btnMute.textContent = isMuted ? '♫⃠' : '♫';
}

function applyVolume() {
  if (wavesurfer) { wavesurfer.setVolume(isMuted ? 0 : currentVolume); }
}

function volumeUp() {
  currentVolume = Math.min(1, currentVolume + 0.05);
  if (!isMuted) applyVolume();
  updateVolumeUI(currentVolume);
}

function volumeDown() {
  currentVolume = Math.max(0, currentVolume - 0.05);
  if (!isMuted) applyVolume();
  updateVolumeUI(currentVolume);
}

function muteBtn() {
  if (!isMuted) {
    previousVolume = volumeSlider.value / 100;
    isMuted = true;
    applyVolume();
  } else {
    isMuted = false;
    currentVolume = previousVolume || defaultVol;
    applyVolume();
  }
  updateVolumeUI(previousVolume);
}

function updateVolumeSlider() {
  currentVolume = volumeSlider.value / 100;
  // Si estaba muted, desmuteamos al mover el slider
  if (isMuted) {
    isMuted = false;
    btnMute.textContent = 'Mute';
  }
  // Aplicar el volumen a wavesurfer si existe
  applyVolume();
  // Actualizar label
  volumeLabel.textContent = `${volumeSlider.value}%`;
}

// ----------------------------------------------------------------
// Waveform slider for init
// ----------------------------------------------------------------

function updatePitch(val) {
  pitchValue = parseFloat(val);
  pitchSlider.value = pitchValue;
  pitchInput.value = pitchValue.toFixed(2);
  if (wavesurfer) { wavesurfer.setPlaybackRate(pitchValue, false); }
}

function formatTime(seconds, negative = false) {
  if (isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return (negative ? "-" : "") + `${mins}:${secs}`;
}

function handleVideoClick(event) {
  const video = event.currentTarget;
  if (video.paused) {
    video.play();
  } else {
    video.pause();
  }
}

function crearVideoPlayer(url) {
  const container = document.getElementById('videoContainer');

  const existingVideo = document.getElementById('videoPlayer');
  if (existingVideo) {
    container.removeChild(existingVideo);
  }

  // Crear el nuevo elemento video
  const video = document.createElement('video');
  video.id = 'videoPlayer';
  video.controls = false;
  video.playsInline = true;
  video.src = url;
  video.addEventListener('click', handleVideoClick);

  container.appendChild(video);
  container.style.display = 'flex';
}

function apagarVideoPlayer() {
  const container = document.getElementById('videoContainer');
  if (container.childElementCount === 0) return

  const video = document.getElementById('videoPlayer');
  if (video) {
    video.pause();
    video.removeEventListener('click', handleVideoClick);
    video.load();
    container.removeChild(video);
  }
}


// ##########################################
// Advertencia: 
// No tener todas las partes del renderer.js significa no poder hacerle juicio hasta que este entrgeado

// renderer.js // part-2 to 3
// ##########################################


// ------------------------------------------------------------
// Eq sliders listeners and values
// ------------------------------------------------------------

function summonEqualizer() {
  const eqModDiv = document.getElementById("equalizadorModal")
  if (!eqIsOpen) {
    eqModDiv.style.display = "flex";
  } else {
    eqModDiv.style.display = "none";
  }
  eqIsOpen = !eqIsOpen;
}

function resetEqualizer() {
  sliders.forEach((slider, i) => {
    slider.value = 0;           // reinicia slider
    if (eqFilters[i]) eqFilters[i].gain.value = 0; // reinicia filtro activo
  });
  localStorage.setItem('eqValues', JSON.stringify(eqBands.map(() => 0)));

}

function applyVal_toSliders() {
  sliders.forEach((slider, i) => {
    slider.value = savedEqValues[i]; // Aplicar valores a sliders ahora
    if (eqFilters[i]) eqFilters[i].gain.value = parseFloat(slider.value);
  });
}

// Función para guardar ecualizador en localStorage
function saveSliderValuesEq() {
  const currentValues = Array.from(sliders).map(s => parseFloat(s.value));
  localStorage.setItem('eqValues', JSON.stringify(currentValues));
}

// Loop para cada slider
function setListeners_toSliders() {
  sliders.forEach((slider, i) => {
    // Cuando se presiona un slider
    slider.addEventListener('mousedown', () => {
      isMouseDown_eqSli = true;
      activeSlider_eqSli = slider;
    });

    // Si el mouse entra en un slider mientras está presionado, lo enfocamos
    slider.addEventListener('mouseenter', () => {
      if (isMouseDown_eqSli) {
        activeSlider_eqSli = slider;
      }
    });

    // Si el mouse sale del slider actual, lo desenfocamos
    slider.addEventListener('mouseleave', () => {
      if (isMouseDown_eqSli && activeSlider_eqSli === slider) {
        activeSlider_eqSli = null;
      }
    });

    // Movimiento mientras está activo
    slider.addEventListener('mousemove', (e) => {
      if (isMouseDown_eqSli && activeSlider_eqSli === slider) {
        const rect = slider.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        const value = slider.min * 1 + (slider.max - slider.min) * percent;
        slider.value = Math.min(Math.max(value, slider.min), slider.max);

        // Aplicar valor al filtro si existe
        if (eqFilters[i]) eqFilters[i].gain.value = parseFloat(slider.value);

        // Guardar en localStorage
        saveSliderValuesEq();
      }
    });

    // También escuchar eventos 'input' normales (por si el usuario no arrastra)
    slider.addEventListener('input', () => {
      const val = parseFloat(slider.value);
      if (eqFilters[i]) eqFilters[i].gain.value = val;
      saveSliderValuesEq();
    });
  });
}

// Reset al soltar el mouse
function mouseUp_forSliders(){
  isMouseDown_eqSli = false;
  activeSlider_eqSli = null;
}

// ------------------------------------------------------------
// Show Notification
// ------------------------------------------------------------

window.electronAPI.onScanProgress(({ current, total, message }) => {
  showProgressNotification(message, current / total);
});

function showProgressNotification(message, progress = 0, isError = false, timeout = 2500) {
  const tooltip = document.getElementById("progressTooltip");
  const msg = document.getElementById("progressMessage");
  const fill = document.getElementById("progressFill");

  msg.textContent = message;
  fill.style.width = `${Math.round(progress * 100)}%`;
  if (!isError) {
    tooltip.style.backgroundColor = "#1e1e1e";
    tooltip.style.color = "#ccc"
    fill.style.backgroundColor = "#0e70c0";

  }
  else if (isError) {
    tooltip.style.backgroundColor = "#af0000ff";
    tooltip.style.color = "#fff"
    fill.style.backgroundColor = "#fff";
  }

  tooltip.style.display = "block";

  // opcional: ocultar automáticamente cuando llegue al 100%
  if (progress >= 1) {
    setTimeout(() => { tooltip.style.display = "none"; }, timeout);
  }
}

function showProgressNotifyPlaylist(message, progress = 0, isError = false, timeout = 2500) {
  const container = document.getElementById("progressPlaylistHead");
  const msg = document.getElementById("progressPlaylistMessage");
  const fill = document.getElementById("progressFillPlaylist");

  msg.textContent = message;
  fill.style.width = `${Math.round(progress * 100)}%`;

  if (!isError) {
    container.style.backgroundColor = "#1e1e1e";
    container.style.color = "#ccc";
    fill.style.backgroundColor = "#f30487";
  } else {
    container.style.backgroundColor = "#af0000ff";
    container.style.color = "#fff";
    fill.style.backgroundColor = "#fff";
  }

  container.style.display = "block";

  // Ocultar automáticamente si se completa al 100%
  if (progress >= 1) {
    setTimeout(() => { container.style.display = "none"; }, timeout);
  }
}


// -------------------------------------------------------------------
// file operations and watchdog
// -------------------------------------------------------------------

window.electronAPI.onFileRenamed(async ({ oldPath, newPath }) => {
  disableWatchdog = true;
  const song = playlist.find(f => f.path === oldPath);
  const formated_name = getNameAndYear_forArray(newPath);
  const pathFolder = newPath.substring(0, newPath.lastIndexOf('/'));

  if (song) {
    song.path = newPath;
    song.name = formated_name;
  }
  playlist.sort((a, b) => a.name.localeCompare(b.name));

  if (songPath === oldPath) {
    document.title = formated_name;
    songPath = newPath;
  }

  pushHistory({
    type: 'renameFile',
    timestamp: Date.now(),
    data: { oldPath, newPath }
  });

  loadPlaylistFromArray(playlist, pathFolder, true, "onFileRenamed"); // vuelve a renderizar
  try {
    const entry = await peaksDB.get(oldPath);
    if (entry) {
      // attempt to move/rename key: copy entry under newPath, delete old key
      const newEntry = { ...entry, path: newPath, lastAccessed: Date.now() };
      await peaksDB.put(newEntry);
      await peaksDB.delete(oldPath);
    }
  } catch (e) { /* ignore */ }
});

// carpetas de cada año
window.electronAPI.onFolderUpdated(async (files, folderPath) => {
  if (stopFolderUpdate) return;
  if (disableWatchdog) return;
  // Convertir a formato {name, path} si viene como string
  const songsArray = files.map(f => (typeof f === 'string' ? { name: f.split(/[\\/]/).pop(), path: f } : f));

  // Cargar playlist desde array (recalcula duración, ordena alfabéticamente, actualiza cache)
  await loadPlaylistFromArray(songsArray, folderPath, true, "onFolderUpdated");

  // Mostrar tooltip de notificación
  if (!messageFromOpenByNode) {
    showProgressNotification(`La carpeta "${folderPath}" ha cambiado`, 1);
  } else {
    messageFromOpenByNode = false;
  }
});

// carpetas unidas (xmas)
window.electronAPI.onPlaylistUpdated(async (payload) => {
  if (disableWatchdog) return;

  if (!payload || !Array.isArray(payload.files)) return;

  const folderKey = payload.folderPath || deriveFolderFromPath(payload.folderPath) || payload.folderPath;

  // Forzar refresco: eliminar cache temporal para esa key
  if (typeof folderKey === 'string') {
    delete playlistCache[folderKey];
    try { localStorage.setItem('playlistCache', JSON.stringify(playlistCache)); } catch (e) { }
  }

  // Mapear a {name,path}
  const songsArray = payload.files.map(f => ({ name: f.split(/[\\/]/).pop(), path: f }));

  // Cargar (recalcula duraciones para los no cacheados)
  await loadPlaylistFromArray(songsArray, folderKey, true, "onPlaylistUpdated");

  // Notificar al usuario (tooltip cerrable manualmente)
  if (!messageFromOpenByNode) {
    showProgressNotification(`La carpeta "${payload.folderPath}" ha cambiado`, 1);
  } else {
    messageFromOpenByNode = false;
  }
});


// --------------------------------------------------------------
// context menu conections
// --------------------------------------------------------------

window.electronAPI.onContextPlaySelected(() => {
  const tbody = document.querySelector("#playlist tbody");
  const selectedRow = tbody.querySelector("tr.selected");
  if (!selectedRow) return;

  const index = parseInt(selectedRow.dataset.index, 10);
  if (!isNaN(index)) {
    document.title = originalTitle;
    statusBar.textContent = "Loading...";
    LetsplaySong(index);
  }
});

window.electronAPI.onContextMenuAction(async (action) => {
  if (!action || !action.type) return;
  console.log("Acción de menú:", action);

  if (action.type === "rename") {
    const filePath = action.files[0]; // solo hay uno

    // Extraer nombre y extensión
    const currentName = filePath.split(/[/\\]/).pop();
    const nameWithoutExtension = currentName.replace(/\.[^/.]+$/, ''); // Eliminar la extensión
    const extension = currentName.slice(nameWithoutExtension.length); // Obtener la extensión

    // Crear un dialogo básico con el nombre sin la extensión
    const newNameWithoutExtension = await customPrompt("Renombrar archivo:", nameWithoutExtension);

    if (newNameWithoutExtension && newNameWithoutExtension !== nameWithoutExtension) {
      // Concatenar la extensión al nuevo nombre
      const newName = newNameWithoutExtension + extension;

      // Pedir al main que renombre
      window.electronAPI.renameFile({ oldPath: filePath, newName });
    }
    return;
  }

  if (action.type === "moveToFolder") {
    filesToMove = Array.isArray(action.files) ? action.files.slice() : [];
    filesWhileRenaming = filesToMove;
    openMoveDialog(filesToMove);
    return;
  }

  if (action.type === "moveToTrash") {
    executeMoveToTrash(action);
    return;
  }

  if (action.type === "revealInFolder") {
    const filePath = (action.files && action.files[0]) || null;
    if (!filePath) return;

    // Llamar a la API expuesta por preload
    try {
      const res = await window.electronAPI.revealInFolder(filePath);
      if (res && res.success) {
        // Opcional: mostrar un pequeño tooltip confirmando la apertura
        showProgressNotification('Abriendo en el explorador...', 1, false, 1500);
      } else {
        // Mostrar tooltip de error (archivo no encontrado o fallo)
        const errMsg = (res && res.error) ? res.error : 'Archivo no encontrado';
        showProgressNotification(`No se pudo abrir el archivo:\n${errMsg}`, 1, true, 4000);
      }
    } catch (err) {
      console.error('Error intentando revelar archivo en carpeta:', err);
      showProgressNotification('Error al intentar abrir el explorador', 1, true, 4000);
    }
    return;
  }

  if (action.type === 'undo') {
    // Deshacer la última acción
    await undoLastAction();
    return;
  }

  switch (action.type) {
    case "copyName": {
      // copiar nombre (single)
      const fp = (action.files && action.files[0]) || null;
      if (!fp) return;
      const fname = fp.split(/[/\\]/).pop().replace(/\.[^/.]+$/, '');
      navigator.clipboard.writeText(fname);
      break;
    }
    case "copyPath": {
      const fp = (action.files && action.files[0]) || null;
      if (!fp) return;
      navigator.clipboard.writeText(fp);
      break;
    }
    case "copyNames":
      // copiar múltiples nombres // multiple
      if (Array.isArray(action.files) && action.files.length) {
        const names = action.files.map(p => p.split(/[/\\]/).pop().replace(/\.[^/.]+$/, '')).join('\n');
        navigator.clipboard.writeText(names);
      }
      break;
    case "copyPaths":
      if (Array.isArray(action.files) && action.files.length) {
        navigator.clipboard.writeText(action.files.join('\n'));
      }
      break;
  }
  return;
});


// ##########################################
// Advertencia: 
// No tener todas las partes del renderer.js significa no poder hacerle juicio hasta que este entrgeado

// renderer.js // part-3 to 4
// ##########################################


// ---------------------------------------------------------------
// move files opetations | Modal / Tree code
// ---------------------------------------------------------------

// Utility: detectar si crear/renombrar está bloqueado (misma regla que en main)
function isCreateBlockedNodePath(nodePath) {
  if (!nodePath) return true;
  const base = nodePath.toLowerCase();
  return base.includes('music.main') || base.includes('music.registry.base') || base.includes('music.xmas');
}

/** "E:/_years/2004/01. folder" -> "01. folder" */
function processPath(_path) {
  // Separar por backslash o slash dependiendo del sistema
  const partes = _path.split(/[\\/]/);
  const ultimaCarpeta = partes[partes.length - 1];

  // Verificar si es un año válido
  const año = parseInt(ultimaCarpeta);
  const añoActual = new Date().getFullYear();

  if (!isNaN(año) && año >= 2000 && año <= añoActual) {
    return ultimaCarpeta;
  } else {
    return ultimaCarpeta;
  }
}

/** "01. folder.example" -> "folder example" */
function removePrefixFolder(folderName) {
  return folderName.replace(/^\d{2}\.\s/, '');
}

/** Decide si estas carpetas pueden tener subcarpetas creadas por etudeplayer */
function isCreateBlocked(node, isCreating = false, isMenu = true) {
  if (!node || !node.path) return true; // sin path → no crear
  const name = removePrefixFolder(node.path.toLowerCase());

  const denidedNames = [
    'music.main', 'music.registry.base', 'music.xmas', '_Internal',
    ...Array.from({ length: 2025 - 2004 + 1 }, (_, i) => (2004 + i).toString())
  ];

  const cantTouchThis = [
    '_Internal', ...Array.from({ length: 2025 - 2004 + 1 }, (_, i) => (2004 + i).toString())
  ];

  if ((isCreating && !isMenu) && denidedNames.some(part => name.includes(part))) {
    return true;
  } else if ((!isCreating && !isMenu) && cantTouchThis.some(part => name.includes(part))) {
    return true;
  }

  // también bloquear si node.type === 'xmas-all'
  if (node.type === 'xmas-all') return true;
  return false;
}

/** Abrir modal (opcionalmente con lista de archivos a mover) */
async function openMoveDialog(files = []) {
  // Elementos del DOM (sólo una vez)
  moveModalOverlay = document.getElementById('moveModalOverlay');
  moveTreeContainer = document.getElementById('moveTreeContainer');
  moveCurrentPathEl = document.getElementById('moveCurrentPath');
  moveCancelBtn = document.getElementById('moveCancelBtn');
  moveConfirmBtn = document.getElementById('moveConfirmBtn');

  filesToMove = Array.isArray(files) ? files.slice() : [];

  // Mostrar overlay
  moveModalOverlay.style.display = 'flex';
  moveModalOverlay.removeAttribute('aria-hidden');
  moveModalOverlay.removeAttribute('inert');

  moveConfirmBtn.disabled = true;
  selectedMoveNode = null;

  const data = await window.electronAPI.getPlaylists(); // Cargar estructura desde main (getPlaylists)

  // Construimos un árbol "root" con años
  const rootNodes = (data.playlists || []).map(y => ({
    name: y.year,
    type: 'year',
    path: `${ROOT_YEARS_PATH}\\${y.year}`,
    nodes: y.nodes || []
  }));

  // agregar nodo Xmas al final
  if (data.xmas) { rootNodes.push(data.xmas); }

  modalTreeData = {
    name: 'root',
    type: 'root',
    path: ROOT_YEARS_PATH,
    nodes: rootNodes
  };

  renderMoveTree(modalTreeData); // Renderizar el árbol
  moveCurrentPathEl.textContent = ROOT_YEARS_PATH; // Setear ruta actual visual
  document.getElementById('moveModalCloseBtn').onclick = closeMoveDialog; // Eventos del modal
  moveCancelBtn.onclick = closeMoveDialog;

  // move confirm
  moveConfirmBtn.onclick = async (e) => {
    e.stopPropagation();  // Evita que el evento clic siga propagándose

    if (!selectedMoveNode || !selectedMoveNode.path) {
      showProgressNotification('Selecciona una carpeta destino válida.', 1, true, 4000);
      return;
    }

    const parentNode = selectedMoveNode || modalTreeData;
    const folderSelected = removePrefixFolder(processPath(parentNode.path));

    const cantTouchThis = [
      '_Internal', 'music.registry.album.package',
      ...Array.from({ length: 2025 - 2004 + 1 }, (_, i) => (2004 + i).toString())
    ];
    if (cantTouchThis.some(part => folderSelected.includes(part))) {
      showProgressNotification('No se permite mover archivos a esta carpeta', 1, true, 5000)
      return;
    };

    // El momento antes de mover de verdad los archivos
    // filesWhileRenaming contiene las rutas seleccionadas para mover
    const files = Array.isArray(filesWhileRenaming) && filesWhileRenaming.length ? filesWhileRenaming.slice() : filesToMove.slice();

    const prep = await validateAndPrepareMove(files, selectedMoveNode.path);
    if (!prep || prep.success === false) {
      console.error('Preparación fallida:', prep && prep.error);
      return;
    }

    // Mover archivos de fomra real
    stopFolderUpdate = true;
    await executePendingMovesAndSync();
    console.log('Moved to: "', selectedMoveNode.path, '" files:', filesToMove);


    selectedMoveNode = null;
    filesWhileRenaming = [];
    filesToMove = [];

    setTimeout(() => {
      stopFolderUpdate = false;
    }, 5000);

    closeMoveDialog();
  };
}

/** Cierra el modal de mover archivos */
function closeMoveDialog() {
  const overlay = document.getElementById('moveModalOverlay');
  if (!overlay) return;
  overlay.style.display = 'none';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('inert', '');

  const modal = document.getElementById('moveModalOverlay');
  if (modal) { modal.removeAttribute('aria-hidden'); }

  // limpiar estado
  moveConfirmBtn && (moveConfirmBtn.disabled = true);
  moveTreeContainer && (moveTreeContainer.innerHTML = '');
}

/** Render del árbol para el modal (recursivo) */
function renderMoveTree(treeRoot) {
  if (!moveTreeContainer) return;
  moveTreeContainer.innerHTML = '';

  function createNodeElement(node) {
    const li = document.createElement('div');
    li.className = 'folder-item';
    li.dataset.type = node.type || 'folder';
    if (node.path) li.dataset.path = node.path;

    // toggle (triángulo)
    const toggle = document.createElement('span');
    toggle.className = 'toggle';
    toggle.textContent = (node.nodes && node.nodes.length) ? '▸' : '';
    li.appendChild(toggle);

    // label (nombre de la carpeta)
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = node.name || (node.path ? node.path.split(/[\\/]/).pop() : '(no name)');
    li.appendChild(label);

    // visual disabled si no hay path
    if (!node.path) {
      li.classList.add('disabled');
    }

    // Acción reutilizable: toggle open/close
    li._toggleOpen = () => {
      const isOpen = li.getAttribute('data-open') === 'true';
      if (!isOpen) {
        // abrir
        li.setAttribute('data-open', 'true');
        toggle.textContent = '▾';
        if (node.path) moveTreeState.expandedPaths.add(node.path);

        if (!li._childContainer) {
          const c = document.createElement('div');
          c.style.paddingLeft = '14px';
          // crear hijos
          if (node.nodes && node.nodes.length) {
            node.nodes.forEach(child => {
              c.appendChild(createNodeElement(child));
            });
          }
          li._childContainer = c;
          li.appendChild(c);
        } else {
          li._childContainer.style.display = 'block';
        }
      } else {
        // cerrar
        li.setAttribute('data-open', 'false');
        toggle.textContent = '▸';
        if (node.path) moveTreeState.expandedPaths.delete(node.path);
        if (li._childContainer) li._childContainer.style.display = 'none';
      }
    };

    // CLICK en la flechita -> solo toggle (no selecciona)
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      li._toggleOpen();
    });

    // CLICK en la etiqueta -> select + toggle (si tiene hijos)
    label.addEventListener('click', (e) => {
      e.stopPropagation();
      // primero expandir/colapsar si tiene subnodos
      if (node.nodes && node.nodes.length) {
        li._toggleOpen();
      }
      // luego seleccionar
      selectMoveNode(node, li);
    });

    // CLICK en la zona del elemento (fallback) -> tratar como etiqueta (toggle + select)
    li.addEventListener('click', (e) => {
      e.stopPropagation();
      if (e.target === toggle || e.target === label) return; // ya manejado
      if (node.nodes && node.nodes.length) {
        li._toggleOpen();
      }
      selectMoveNode(node, li);
    });

    // CONTEXTMENU (clic derecho) — *se añade sobre li, label y toggle* para evitar casos donde el evento no llegue.
    const onCtx = (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Llamamos al preload -> main para mostrar el menu nativo.
      // En main ya determinamos si las opciones van habilitadas/deshabilitadas.
      window.electronAPI.showMoveContextMenu({ path: node.path });
    };
    li.addEventListener('contextmenu', onCtx);
    label.addEventListener('contextmenu', onCtx);
    toggle.addEventListener('contextmenu', onCtx);

    return li;
  }

  // construir un UL-like root (pero usamos divs)
  const rootWrapper = document.createElement('div');
  modalTreeData.nodes.forEach(yearNode => {
    const el = createNodeElement(yearNode);
    rootWrapper.appendChild(el);
  });

  moveTreeContainer.appendChild(rootWrapper);
}

/** Nueva función: obtener la cadena de ancestros (paths) desde root hasta targetPath */
function getAncestorPathChain(root, targetPath) {
  const chain = [];
  let found = false;

  function recurse(node, acc) {
    if (found) return;
    const newAcc = acc.slice();
    if (node.path) newAcc.push(node.path);
    if (node.path === targetPath) {
      chain.push(...newAcc);
      found = true;
      return;
    }
    if (node.nodes && node.nodes.length) {
      for (const c of node.nodes) {
        recurse(c, newAcc);
        if (found) return;
      }
    }
  }

  // root.nodes es array de top-level (años + xmas)
  for (const top of modalTreeData.nodes || []) {
    recurse(top, []);
    if (found) break;
  }
  return chain; // array de paths (ordenado desde ancestro más alto a target)
}

// Expande en cadena: asegura que cada ancestro exista en DOM y esté expandido
async function expandPathChain(chain) {
  for (const p of chain) {
    if (!p) continue;
    const el = findElementByPath(p);
    if (el) {
      const isOpen = el.getAttribute('data-open') === 'true';
      if (!isOpen) {
        const toggle = el.querySelector('.toggle');
        if (toggle) toggle.click(); // usa el handler que ya definimos
        // esperar un poco para que los hijos se rendericen antes de ir al siguiente
        await new Promise(r => setTimeout(r, 20));
      }
    }
  }
}

/** Seleccionar visualmente un nodo dentro del modal */
function selectMoveNode(node, el) {

  function isValidMoveTarget(node) {
    if (!node || !node.path) return false;
    // Si existe el path pero su basename es un año (por ejemplo "2006") permitimos (se añadirá prefijo si se crea carpeta)
    // Sin embargo según la especificación, no permitimos mover a nodos "sin path" o con bloqueo
    if (isCreateBlocked(node, false, true)) return false;
    return true;
  }

  // remover seleccionado anterior
  const prev = moveTreeContainer.querySelector('.folder-item.selected');
  if (prev) prev.classList.remove('selected');

  // marcar nuevo
  if (el) el.classList.add('selected');
  selectedMoveNode = node;
  moveCurrentPathEl.textContent = node.path || ROOT_YEARS_PATH;

  // Validar el botón Mover
  const allowed = isValidMoveTarget(node);
  moveConfirmBtn.disabled = !allowed;

  // Si el nodo está bloqueado para creación, mostrar visual disabled (no impedir selección visualmente si el spec lo requiere)
  if (isCreateBlocked(node, false)) {
    el && el.classList.add('disabled');
  } else {
    el && el.classList.remove('disabled');
  }
}

/** Recorrer el árbol para encontrar el padre de una ruta dada (retorna el nodo padre) */
function findParentNode(root, childPath) {
  if (!root || !childPath) return null;

  let parent = null;

  function recurse(node) {
    if (!node || !node.nodes) return;
    for (const n of node.nodes) {
      if (n.path === childPath) {
        parent = node;
        return;
      }
      if (n.nodes) recurse(n);
      if (parent) return;
    }
  }

  recurse(root);
  return parent;
}

/** Buscar el elemento DOM por data-path (no selector CSS con backslashes) */
function findElementByPath(targetPath) {
  if (!moveTreeContainer || !targetPath) return null;
  const items = moveTreeContainer.querySelectorAll('.folder-item');
  for (const it of items) {
    if (it.dataset.path === targetPath) return it;
  }
  return null;
}

/** Buscar el nodo por path dentro de modalTreeData */
function findNodeByPath(root, targetPath) {
  if (!root) return null;
  let found = null;
  function recurse(n) {
    if (found) return;
    if (n.path === targetPath) { found = n; return; }
    if (n.nodes && n.nodes.length) {
      for (const c of n.nodes) recurse(c);
    }
  }
  recurse(root);
  return found;
}

// GESTIÓN de acciones del menú nativo (main -> renderer)
window.electronAPI.onMoveTreeAction(async (action) => {
  if (!action || !action.type) return;
  const { type, path: nodePath } = action;

  if (type === 'createFolder') {
    // prompt para nombre
    closeMoveDialog();
    const raw = await customPrompt('Nombre de la nueva carpeta:');
    if (!raw) return;
    let folderName = raw.trim();
    if (!folderName) return;

    // Si el parent es un nodo "year", aplicar prefijo XX.
    // Intentamos inferir si nodePath es un YEAR folder (por ejemplo ...\2006)
    const baseName = nodePath ? nodePath.split(/[\\/]/).pop() : '';
    let finalName = folderName;
    const yearNum = parseInt(baseName, 10);
    if (!isNaN(yearNum) && yearNum > 1900 && yearNum < 3000) {
      const idx = String(yearNum - 2003).padStart(2, '0');
      finalName = `${idx}. ${folderName}`;
    }

    // Llamar a main para crear carpeta
    const res = await window.electronAPI.createFolder({ parentPath: nodePath, folderName: finalName });
    if (!res || !res.success) {
      showProgressNotification('No se pudo crear la carpeta: ' + (res && res.error ? res.error : 'Error desconocido'), 1, true, 4000);
      openMoveDialog(filesWhileRenaming);
      return;
    }
    if (res && res.success) {
      pushHistory({
        type: 'createFolder',
        timestamp: Date.now(),
        data: { folderPath: res.path }
      });
    }
    openMoveDialog(filesWhileRenaming);
    return;
  }

  if (type === 'renameFolder') {
    if (!nodePath) return;
    // sacar nombre actual
    closeMoveDialog();
    const currentBasename = nodePath.split(/[\\/]/).pop();
    const newName = await customPrompt('Nuevo nombre de carpeta:', currentBasename);
    if (!newName) return;

    const result = await window.electronAPI.renameFolder({ oldPath: nodePath, newName: newName.trim() });
    if (!result || !result.success) {
      showProgressNotification('No se pudo renombrar: ' + (result && result.error ? result.error : 'Error'), 1, true, 4000);
      openMoveDialog(filesWhileRenaming);
      return;
    }

    pushHistory({
      type: 'renameFolder',
      timestamp: Date.now(),
      data: { oldPath: payload.oldPath, newPath: payload.newPath }
    });
    openMoveDialog(filesWhileRenaming);
    return;
  }

});


// ----------------- Fin del modal -----------------------------

// ##########################################
// Advertencia: 
// No tener todas las partes del renderer.js significa no poder hacerle juicio hasta que este entrgeado

// renderer.js // part-4 to 4
// ##########################################


/**
 * Validate & prepare move:
 * - files: array de rutas absolutas (strings)
 * - destPath: ruta de carpeta destino (string)
 * Devuelve { success: true, operations } o { success:false, error }
 */
async function validateAndPrepareMove(files, destPath) {
  // 1) comprobar input
  if (!Array.isArray(files) || files.length === 0) {
    // problema lógico: notificar por consola como pediste
    console.error('validateAndPrepareMove: filesToMove está vacío. Abortando preparación.');
    return { success: false, error: 'No files to move' };
  }

  // 2) comprobar destino existe (usamos IPC al main)
  const destExists = await window.electronAPI.pathExists(destPath);
  if (!destExists) {
    showProgressNotification(`La carpeta de destino no existe: ${destPath}`, 1, true, 5000);
    return { success: false, error: 'Destination does not exist' };
  }

  // 3) detener playback si alguno de los archivos está reproduciéndose
  const normalizedSong = songPath ? normalizePathForCompare(songPath) : null;
  if (normalizedSong) {
    for (const f of files) {
      if (normalizePathForCompare(f) === normalizedSong) {
        // Detener playback y limpiar UI como pediste
        try {
          if (wavesurfer) wavesurfer.stop(); // detiene y resetea el cursor
        } catch (e) { /* ignore */ }
        clearPlayingStyle();
        songPath = null;
        statusBar.textContent = originalTitle;
        break;
      }
    }
  }

  // 4) obtener nombres existentes en destino
  const existing = await window.electronAPI.readFolderFiles(destPath);
  if (existing === null) {
    showProgressNotification(`Error accediendo a la carpeta destino: ${destPath}`, 1, true, 5000);
    return { success: false, error: 'Cannot read destination folder' };
  }

  // Set con nombres en minúsculas para comparaciones (basename + ext)
  const plannedLowerSet = new Set(existing.map(n => n.toLowerCase()));

  // 5) construir operaciones respetando conflictos (basename + ext)
  const operations = [];

  for (const src of files) {
    const basename = (typeof src === 'string') ? src.split(/[\\/]/).pop() : String(src);
    // separa base y ext
    const lastDot = basename.lastIndexOf('.');
    const baseNoExt = lastDot >= 0 ? basename.substring(0, lastDot) : basename;
    const ext = lastDot >= 0 ? basename.substring(lastDot) : '';

    // generar nombre único si ya existe (base.ext, base (2).ext, base (3).ext, ...)
    let candidate = basename;
    let counter = 2;
    while (plannedLowerSet.has(candidate.toLowerCase())) {
      candidate = `${baseNoExt} (${counter})${ext}`;
      counter++;
    }

    // reservar el nombre en el set (para conflictos entre múltiples archivos que movemos)
    plannedLowerSet.add(candidate.toLowerCase());

    // path destino final (Windows style, ya que tu proyecto usa backslashes)
    const destFull = `${destPath}\\${candidate}`;

    operations.push({ src, dest: destFull });
  }

  // Guardar resultado globalmente para ETAPA 3
  pendingMoveOperations = operations;

  // Notificar éxito (preparado)
  showProgressNotification(`Preparadas ${operations.length} operaciones para mover.`, 1, false, 3500);
  console.log('validateAndPrepareMove -> pendingMoveOperations:', operations);

  return { success: true, operations };
}

/** Ejecutar las operaciones preparadas (ETAPA 3) y sincronizar UI/cache. */
async function executePendingMovesAndSync() {
  if (!Array.isArray(pendingMoveOperations) || pendingMoveOperations.length === 0) {
    console.error('No hay operaciones pendientes para ejecutar.');
    return;
  }

  // 1) Desactivar listeners / watchdog
  disableWatchdog = true; // tu flag local para ignorar eventos entrantes
  try { await window.electronAPI.setWatchdog(false); } catch (e) {
    console.warn('No se pudo desactivar watchdog en main:', e);
  }

  // Subscribe para progreso
  window.electronAPI.onMoveProgress(({ current, total, file }) => {
    showProgressNotification(`Moviendo ${current} / ${total}`, current / total);
  });

  // Mostrar inicio
  showProgressNotification(`Iniciando movimiento de ${pendingMoveOperations.length} archivos...`, 0);

  // 2) Ejecutar en main
  const res = await window.electronAPI.executeMoveOperations(pendingMoveOperations);

  // 3) Procesar resultados
  let moved = [];
  let failed = [];
  if (res && Array.isArray(res.results)) {

    moved = res.results.filter(r => r.success).map(r => r.src);
    failed = res.results.filter(r => !r.success);

  } else if (res && res.success === true && res.results) {

    moved = res.results.map(r => r.src);

  } else {

    // si res no tiene results pero indica error
    if (res && res.error) {
      showProgressNotification('Error moviendo archivos', 1, true, 4000);
      customAlert(`Error moviendo archivos: ${res.error}`);
    }

  }

  // 4) Guardar en historia para deshacer
  if (Array.isArray(pendingMoveOperations) && pendingMoveOperations.length) {
    const histItem = {
      type: 'move',
      timestamp: Date.now(),
      data: {
        files: pendingMoveOperations.map(op => ({ oldPath: op.src, newPath: op.dest }))
      }
    };
    pushHistory(histItem);
  }

  // 5) Actualizar cache y playlist
  if (Array.isArray(moved) && moved.length > 0 && Array.isArray(playlist)) {
    // 1) crear set de rutas movidas (normalizadas)
    const movedSet = new Set(moved.map(normalizePathForCompare));

    // 2) quitar esas rutas del array playlist (filtro in-place -> reasignación)
    playlist = playlist.filter(item => !movedSet.has(normalizePathForCompare(item.path || item)));

    // 3) preparar array para loadPlaylistFromArray: [{name, path}, ...]
    const songsArray = playlist.map(it => ({ name: it.name, path: it.path }));

    // 4) Volver a cargar la playlist usando loadPlaylistFromArray con la carpeta actual
    //    — esto recalcula duraciones, ordena y actualiza cache internamente.
    try {
      // mantener watchdog DESACTIVADO mientras recargamos para evitar refreshes por watchers
      await loadPlaylistFromArray(songsArray, currentOpenFolder || null, true, "afterMovingCorrect"); // force refresh
    } catch (err) {
      console.error('Error re-cargando playlist tras mover archivos:', err);
      // En caso extremo fallback: renderizar la lista actual (mínimo visual)
      // updatePlaylistUI(); // solo como último recurso si loadPlaylist falla
    }
  } else {
    // Si no hay 'moved' o playlist vacío, llamar a loadPlaylistFromArray con la lista actual
    // para asegurar coherencia (no cambia la carpeta abierta).
    try {
      const songsArrayFallback = Array.isArray(playlist) ? playlist.map(it => ({ name: it.name, path: it.path })) : [];
      if (songsArrayFallback.length) await loadPlaylistFromArray(songsArrayFallback, currentOpenFolder || null, true, "afterMovePlaylistVoid");
    } catch (e) { /* noop */ }
  }

  // 6) Reactivar watchdog / listeners
  disableWatchdog = false;
  try { await window.electronAPI.setWatchdog(true); } catch (e) {
    console.warn('No se pudo reactivar watchdog en main:', e);
  }

  // 7) Notificar resultado al usuario
  if (failed.length > 0) {
    // construir mensaje con los fallidos
    const msg = failed.map(f => `${f.src} — ${f.error || 'Error desconocido'}`).join('\n');
    showProgressNotification(`Movidos: ${moved.length}. Fallidos: ${failed.length}`, 1, true, 6000);
    customAlert('No se pudieron mover los siguientes archivos:\n\n' + msg);
  } else {
    showProgressNotification('Archivos movidos correctamente', 1, false, 3500);
  }

  // 8) limpiar estado
  pendingMoveOperations = null;
  // resetear visual del botón de preparar (si existe)
  if (moveConfirmBtn) {
    delete moveConfirmBtn.dataset.prepared;
    moveConfirmBtn.textContent = 'Mover aquí';
  }

  return { moved, failed };
}

// ------------------------------------------------------------
// Move to recicler bin
// ------------------------------------------------------------

function generateCaptcha(len = 6) {
  const CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // evitar O,0, I,1 para claridad
  let s = '';
  for (let i = 0; i < len; i++) s += CH[Math.floor(Math.random() * CH.length)];
  return s;
}

async function openReciclerBinBtn() {
  showProgressNotification('Abriendo papelera...', 0);
  const res = await window.electronAPI.openTrashFolder();
  if (res && res.success) {
    showProgressNotification('Papelera abierta', 1, false, 2000);
  } else {
    showProgressNotification('No se pudo abrir la papelera', 1, true, 4000);
  }
}

async function executeMoveToTrash(action) {

  // files: array de rutas absolutas
  const files = Array.isArray(action.files) ? action.files.slice() : [];
  if (!files.length) {
    console.error('moveToTrash called with empty files array.');
    return;
  }

  (async () => {
    // 1) generar captcha aleatorio y pedir confirmación
    const captcha = generateCaptcha(6);
    const promptMsg = `CONFIRMACIÓN: Para mover a la papelera, escribe exactamente: ${captcha}`;
    const typed = await customPrompt(promptMsg, ''); // customPrompt debe devolver string o null
    if (!typed) {
      showProgressNotification('Operación cancelada', 1, true, 2000);
      return;
    }
    if (typed !== captcha) {
      showProgressNotification('Captcha incorrecto. Operación cancelada.', 1, true, 3500);
      return;
    }

    // 2) Si alguno está reproduciéndose -> detener playback y quitar estilo
    const songNormalized = songPath ? normalizePathForCompare(songPath) : null;
    if (songNormalized) {
      for (const f of files) {
        if (normalizePathForCompare(f) === songNormalized) {
          try { if (wavesurfer) wavesurfer.stop(); } catch (e) { /* ignore */ }
          clearPlayingStyle();
          songPath = null;
          statusBar.textContent = originalTitle;
          break;
        }
      }
    }

    // 3) Desactivar watchdog local y remote
    disableWatchdog = true;
    stopFolderUpdate = true;
    try { await window.electronAPI.setWatchdog(false); } catch (e) { /* ignore */ }

    // 4) Suscribirse a progreso
    window.electronAPI.onMoveToTrashProgress(({ current, total, file }) => {
      showProgressNotification(`Papelera: ${current} / ${total}`, current / total);
    });

    showProgressNotification('Moviendo archivos a la papelera...', 0);

    // 5) Ejecutar move en main
    const res = await window.electronAPI.moveToTrash(files);

    // 6) Procesar resultados
    let moved = [];
    let failed = [];

    if (res && Array.isArray(res.results)) {
      moved = res.results.filter(r => r.success).map(r => r.src);
      failed = res.results.filter(r => !r.success);
    } else if (res && res.success && res.results) {
      moved = res.results.filter(r => r.success).map(r => r.src);
    } else if (res && res.success === false && res.results && res.results.length) {
      // fallback
      moved = res.results.filter(r => r.success).map(r => r.src);
      failed = res.results.filter(r => !r.success);
    } else if (res && res.success === false && res.error) {
      showProgressNotification('Error moviendo a la papelera', 1, true, 4000);
      customAlert('Error moviendo archivos a la papelera:\n' + res.error);
    }

    if (res && Array.isArray(res.results) && res.results.length) {
      const histItem = {
        type: 'moveToTrash',
        timestamp: Date.now(),
        data: {
          files: res.results.map(r => ({ oldPath: r.src, newPath: r.dest }))
        }
      };
      pushHistory(histItem);
    }

    // 7) Quitar movidos de playlist y recargar carpeta actual (sin updatePlaylistUI directo)
    if (moved.length > 0 && Array.isArray(playlist)) {
      const movedSet = new Set(moved.map(normalizePathForCompare));
      playlist = playlist.filter(item => !movedSet.has(normalizePathForCompare(item.path || item)));
      const songsArray = playlist.map(it => ({ name: it.name, path: it.path }));
      // Mantener watchdog DESACTIVADO mientras recargamos
      try {
        await loadPlaylistFromArray(songsArray, currentOpenFolder || null, true);
      } catch (e) {
        console.error('Error recargando playlist tras mover a papelera:', e);
        updatePlaylistUI(); // fallback visual
      }
    }

    // 8) Reactivar watchdog
    disableWatchdog = false;
    setTimeout(() => {
      stopFolderUpdate = false;
    }, 6000);

    try { await window.electronAPI.setWatchdog(true); } catch (e) { /* ignore */ }

    // 9) Notificar resultados
    if (failed.length > 0) {
      const msg = failed.map(f => `${f.src} — ${f.error || 'Error desconocido'}`).join('\n');
      showProgressNotification(`Movidos: ${moved.length}. Fallidos: ${failed.length}`, 1, true, 6000);
      customAlert('No se pudieron mover a la papelera:\n\n' + msg);
    } else {
      showProgressNotification('Archivos movidos a la papelera', 1, false, 3000);
    }
  })();

  return;

}

// ------------------------------------------------------------
// Deshacer acciones de operaciones de archivos
// ------------------------------------------------------------

function pushHistory(item) {
  // item: { type, timestamp, data }
  historyStack.push(item);
  console.log('history push:', item);
}

/** Helper: normalizar path para comparación (windows/unix) */
function normalizePathForCompare(p) {
  if (!p || typeof p !== 'string') return '';
  return p.replace(/\//g, '\\').toLowerCase();
}

function dirnameOf(p) {
  if (!p || typeof p !== 'string') return '';
  const pos = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
  if (pos === -1) return '';
  return p.substring(0, pos);
}

function basenameOf(p) {
  if (!p || typeof p !== 'string') return '';
  const pos = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'));
  return pos === -1 ? p : p.substring(pos + 1);
}

// Recarga la playlist actual desde disco usando getSongs + loadPlaylistFromArray
async function refreshPlaylistAfterUndo() {
  try {
    // Si hay carpeta abierta en UI, recargar desde disco (fuente de verdad)
    if (currentOpenFolder && typeof currentOpenFolder === 'string') {
      const filenames = await window.electronAPI.getSongs(currentOpenFolder); // devuelve array de names
      if (!Array.isArray(filenames)) {
        // fallback: si falla la lectura, no tocar UI fuertemente
        console.warn('refreshPlaylistAfterUndo: getSongs devolvió no-array');
        return;
      }
      const songsArray = filenames.map(fn => ({ name: fn, path: `${currentOpenFolder}\\${fn}` }));
      // Forzar recalculo y cache con force=true
      await loadPlaylistFromArray(songsArray, currentOpenFolder, true);
      return;
    }

    // Si no hay carpeta abierta, reconstruir desde playlist en memoria (si existe)
    if (Array.isArray(playlist) && playlist.length > 0) {
      const songsArray = playlist.map(it => ({ name: it.name, path: it.path }));
      await loadPlaylistFromArray(songsArray, currentOpenFolder || null, true);
      return;
    }

    // Si no hay nada, dejar playlist vacía (UI mínima)
    playlist = [];
    try { updatePlaylistUI(); } catch (e) { /* última opción */ console.warn('refreshPlaylistAfterUndo: updatePlaylistUI fallback', e); }
  } catch (err) {
    console.error('refreshPlaylistAfterUndo error:', err);
    // fallback suave
    try { updatePlaylistUI(); } catch (e) { /* ignore */ }
  }
}

async function undoLastAction() {
  if (!Array.isArray(historyStack) || historyStack.length === 0) {
    showProgressNotification('No hay acciones para deshacer', 1, true, 2500);
    return;
  }

  const last = historyStack[historyStack.length - 1]; // Peek, no pop aún
  if (!last || !last.type) {
    historyStack.pop();
    showProgressNotification('Registro de historial inválido, eliminado', 1, true, 2500);
    return;
  }

  try {
    // Desactivar watchdog local y remoto mientras hacemos undo
    disableWatchdog = true;
    stopFolderUpdate = true;
    try { await window.electronAPI.setWatchdog(false); } catch (e) { /* ignore */ }

    switch (last.type) {
      // ---------- CREATE FOLDER ----------
      case 'createFolder': {
        const folderPath = last.data && last.data.folderPath;
        if (!folderPath) {
          // pop y avisar
          historyStack.pop();
          showProgressNotification('Registro de carpeta inválido eliminado', 1, true, 2500);
          break;
        }

        const exists = await window.electronAPI.pathExists(folderPath);
        if (!exists) {
          // si no existe ya, quitar registro y avisar
          historyStack.pop();
          showProgressNotification('Carpeta ya no existe. Registro eliminado.', 1, true, 3000);
          break;
        }

        const files = await window.electronAPI.readFolderFiles(folderPath);
        if (files === null) {
          // error leyendo -> borrar TODO el historial (regla 5)
          historyStack = [];
          showProgressNotification('Error accediendo a la carpeta. Historial borrado.', 1, true, 4000);
          break;
        }

        if (files.length > 0) {
          // Si no está vacía => borrar todo el historial completo (según regla)
          historyStack = [];
          showProgressNotification('La carpeta no está vacía: historial borrado por seguridad.', 1, true, 5000);
          break;
        }

        // Si está vacía -> eliminar la carpeta
        const rm = await window.electronAPI.removeFolder(folderPath);
        if (rm && rm.success) {
          historyStack.pop();
          showProgressNotification('Carpeta creada eliminada (undo).', 1, false, 2500);
        } else {
          // si no se puede eliminar, borrar todo el historial por seguridad
          historyStack = [];
          showProgressNotification('No se pudo eliminar la carpeta. Historial borrado.', 1, true, 5000);
        }

        break;
      }

      // ---------- MOVE ----------
      case 'move': {
        // last.data.files: [{ oldPath, newPath }, ...]
        const files = (last.data && Array.isArray(last.data.files)) ? last.data.files.slice() : [];
        if (!files.length) {
          historyStack.pop();
          showProgressNotification('No hay rutas para revertir', 1, true, 2500);
          break;
        }

        // Preparar operaciones solo para los archivos que EXISTEN en newPath
        const ops = [];
        const missing = [];
        const dirsToEnsure = new Set();

        for (const f of files) {
          const srcExists = await window.electronAPI.pathExists(f.newPath);
          if (srcExists) {
            ops.push({ src: f.newPath, dest: f.oldPath });
            const d = dirnameOf(f.oldPath);
            if (d) dirsToEnsure.add(d);
          } else {
            missing.push(f);
          }
        }

        if (ops.length === 0) {
          // nada que deshacer físicamente; quitar registro y avisar
          historyStack.pop();
          const msg = missing.map(m => m.oldPath).join('\n') || 'No se encontraron archivos a revertir';
          showProgressNotification('No fue posible revertir (archivos no encontrados)', 1, true, 5000);
          customAlert('No se pudieron revertir (archivos no encontrados):\n' + msg);
          break;
        }

        // Asegurar directorios destino (oldPath parents)
        for (const d of Array.from(dirsToEnsure)) {
          await window.electronAPI.ensureDir(d);
        }

        // Ejecutar movimientos (usar executeMoveOperations en main)
        showProgressNotification('Revirtiendo movimiento...', 0);
        const res = await window.electronAPI.executeMoveOperations(ops);

        // Procesar resultados
        const results = (res && Array.isArray(res.results)) ? res.results : [];
        const succeeded = results.filter(r => r.success).map(r => r.dest); // moved back to dest=oldPath
        const failed = results.filter(r => !r.success);

        // Actualizar UI: recargar carpeta actual para que permanezca como antes
        // try {
        //   if (currentOpenFolder) {
        //     showProgressNotification('Actualizando vista...', 0);
        //     await loadPlaylistFromFolder(currentOpenFolder);
        //   }
        // } catch (e) { console.warn('Error recargando carpeta tras undo move:', e); }

        // REFRESCAR playlist usando el helper (no updatePlaylistUI directa)
        historyStack.pop();
        await refreshPlaylistAfterUndo();

        // Publicar notificaciones y limpiar historial (pop)
        if (failed.length > 0 || missing.length > 0) {
          const failList = failed.map(f => `${f.src} — ${f.error || 'error'}`).concat(missing.map(m => `${m.newPath} — no encontrado`));
          showProgressNotification(`Revertido parcialmente. Fallidos: ${failed.length + missing.length}`, 1, true, 6000);
          customAlert('No se pudieron revertir:\n\n' + failList.join('\n'));
        } else {
          showProgressNotification('Movimiento revertido correctamente', 1, false, 3000);
        }

        break;
      }

      // ---------- MOVE TO TRASH ----------
      case 'moveToTrash': {
        const files = (last.data && Array.isArray(last.data.files)) ? last.data.files.slice() : [];
        if (!files.length) {
          historyStack.pop();
          showProgressNotification('No hay rutas en el registro', 1, true, 2500);
          break;
        }

        const ops = [];
        const missing = [];
        const dirsToEnsure = new Set();

        for (const f of files) {
          const inTrashExists = await window.electronAPI.pathExists(f.newPath);
          if (inTrashExists) {
            ops.push({ src: f.newPath, dest: f.oldPath }); // nuevo -> antiguo
            const d = dirnameOf(f.oldPath);
            if (d) dirsToEnsure.add(d);
          } else {
            missing.push(f);
          }
        }

        if (ops.length === 0) {
          historyStack.pop();
          showProgressNotification('No se encontraron archivos en la papelera para revertir', 1, true, 3500);
          break;
        }

        for (const d of Array.from(dirsToEnsure)) {
          await window.electronAPI.ensureDir(d);
        }

        showProgressNotification('Revirtiendo desde papelera...', 0);
        const res = await window.electronAPI.executeMoveOperations(ops);

        const results = (res && Array.isArray(res.results)) ? res.results : [];
        const failed = results.filter(r => !r.success);

        // Recargar carpeta actual para actualizar vista
        // try {
        //   if (currentOpenFolder) {
        //     await loadPlaylistFromFolder(currentOpenFolder);
        //   }
        // } catch (e) { console.warn('Error recargando carpeta tras undo moveToTrash:', e); }

        // REFRESCAR playlist usando el helper (no updatePlaylistUI directa)
        historyStack.pop();
        await refreshPlaylistAfterUndo();

        if (failed.length > 0 || missing.length > 0) {
          const failList = failed.map(f => `${f.src} — ${f.error || 'error'}`).concat(missing.map(m => `${m.newPath} — no encontrado`));
          showProgressNotification(`Revertido parcialmente desde papelera. Fallidos: ${failed.length + missing.length}`, 1, true, 6000);
          customAlert('No se pudieron revertir desde papelera:\n\n' + failList.join('\n'));
        } else {
          showProgressNotification('Archivos restaurados desde papelera', 1, false, 3000);
        }

        break;
      }

      // ---------- RENAME FILE ----------
      case 'renameFile': {
        const { oldPath, newPath } = last.data || {};
        if (!oldPath || !newPath) {
          historyStack.pop();
          showProgressNotification('Registro inválido, eliminado', 1, true, 2500);
          break;
        }

        const newExists = await window.electronAPI.pathExists(newPath);
        if (!newExists) {
          // eliminar solo el registro (según regla)
          historyStack.pop();
          showProgressNotification('No se encontró el archivo para revertir. Registro eliminado.', 1, true, 3500);
          break;
        }

        // Si oldPath ya existe -> generar sufijo (2)
        let target = oldPath;
        if (await window.electronAPI.pathExists(oldPath)) {
          const base = basenameOf(oldPath);
          const dot = base.lastIndexOf('.');
          const baseNoExt = dot >= 0 ? base.substring(0, dot) : base;
          const ext = dot >= 0 ? base.substring(dot) : '';
          const parent = dirnameOf(oldPath);
          let counter = 2;
          let candidate;
          do {
            candidate = `${baseNoExt} (${counter})${ext}`;
            target = parent + '\\' + candidate;
            counter++;
          } while (await window.electronAPI.pathExists(target));
        }

        // Intentar renombrar newPath -> target
        const ren = await window.electronAPI.renamePath(newPath, target);
        if (ren && ren.success) {

          // Actualizar UI si corresponde
          // try { if (currentOpenFolder) await loadPlaylistFromFolder(currentOpenFolder); } catch (e) { console.warn('Error recargando playlist tras undo renameFile:', e); }
          historyStack.pop();
          await refreshPlaylistAfterUndo();
          showProgressNotification('Cambio de nombre revertido', 1, false, 3000);
        } else {
          // si falla: eliminar registro y avisar
          historyStack.pop();
          showProgressNotification('No se pudo revertir el nombre del archivo. Registro eliminado.', 1, true, 4000);
        }

        break;
      }

      // ---------- RENAME FOLDER ----------
      case 'renameFolder': {
        const { oldPath, newPath } = last.data || {};
        if (!oldPath || !newPath) {
          historyStack.pop();
          showProgressNotification('Registro inválido, eliminado', 1, true, 2500);
          break;
        }

        const newExists = await window.electronAPI.pathExists(newPath);
        if (!newExists) {
          // eliminar solo ese registro
          historyStack.pop();
          showProgressNotification('La carpeta actual no existe. Registro eliminado.', 1, true, 3500);
          break;
        }

        // Si oldPath ya existe, aplicar sufijo (2)
        let target = oldPath;
        if (await window.electronAPI.pathExists(oldPath)) {
          const base = basenameOf(oldPath);
          const parent = dirnameOf(oldPath);
          let counter = 2;
          let candidate;
          do {
            candidate = `${base} (${counter})`;
            target = parent + '\\' + candidate;
            counter++;
          } while (await window.electronAPI.pathExists(target));
        }

        const ren = await window.electronAPI.renamePath(newPath, target);
        if (ren && ren.success) {
          // Intentar refrescar el árbol y la carpeta actual
          try {
            // Forzamos recarga de playlists y árbol para reflejar renombrado de carpetas
            // (intentamos recargar la estructura sin recargar app completa)
            try {
              // const data = await window.electronAPI.getPlaylists();
              // Re-render tree quickly (we have a refresh function? if not, reload)
              // Si tienes una función refreshTree(), llámala aquí. Si no -> recarga la UI completa:
              // fallback: location.reload();
              // if (typeof refreshTree === 'function') {
              //   await refreshTree();
              // } else {
              //   // Fallback: recargar la página para evitar inconsistencias
              //   location.reload();
              // }



            } catch (e) {
              console.warn('No se pudo refrescar árbol tras undo renameFolder:', e);
              location.reload();
            }
          } catch (e2) { /* ignore */ }

          historyStack.pop();
          showProgressNotification('Renombrado de carpeta revertido', 1, false, 3000);
        } else {
          historyStack.pop();
          showProgressNotification('No se pudo revertir el renombrado de carpeta. Registro eliminado.', 1, true, 4000);
        }

        break;
      }

      default:
        historyStack.pop();
        showProgressNotification('Tipo de operación no soportado para undo. Registro eliminado.', 1, true, 3000);
        break;
    }

  } catch (err) {
    console.error('Error durante undo:', err);
    // En caso de error inesperado, por seguridad vaciamos el historial
    historyStack = [];
    showProgressNotification('Error inesperado. Historial borrado.', 1, true, 5000);
  } finally {
    // Reactivar watchers
    disableWatchdog = false;
    setTimeout(() => {
      stopFolderUpdate = false
    }, 6000);
    try { await window.electronAPI.setWatchdog(true); } catch (e) { /* ignore */ }
  }
}

// -------------------------------------------------------------------------
// Global keyshortcuts | Shortcuts handler 
// -------------------------------------------------------------------------

window.electronAPI.onShortcutAction(async ({ action } = {}) => {
  if (!action) return;

  // Helpers
  function clamp(v, a = 0, b = 1) { return Math.max(a, Math.min(b, v)); }

  // Seek relative seconds (positive or negative)
  function seekRelativeSeconds(sec) {
    try {
      if (!wavesurfer) return;
      const total = wavesurfer.getDuration() || 0;
      if (total <= 0) return;
      const current = wavesurfer.getCurrentTime() || 0;
      let target = current + sec;
      if (target < 0) target = 0;
      if (target > total) target = total;
      wavesurfer.seekTo(total > 0 ? target / total : 0);
      // update labels (audioprocess will update, but do immediate update)
      currentDurLabel.textContent = formatTime(target);
      leftDurLabel.textContent = formatTime(total - target, true);
    } catch (e) { console.warn('seekRelativeSeconds error', e); }
  }

  function changeVolumeBy(delta) {
    currentVolume = clamp(currentVolume + delta, 0, 1);
    isMuted = false;
    applyVolume();
    updateVolumeUI(currentVolume);
    // persist new default? we won't auto persist, just keep for session.
  }

  function playRandomSong() {
    try {
      if (!Array.isArray(playlist) || playlist.length === 0) return;
      let idx = Math.floor(Math.random() * playlist.length);
      // avoid same song when possible
      if (playlist.length > 1 && idx === currentSongIndex) {
        idx = (idx + 1) % playlist.length;
      }
      currentSongIndex = idx;
      LetsplaySong(idx);
    } catch (e) { console.warn('playRandomSong error', e); }
  }

  // Action dispatch
  switch (action) {
    case 'seekBack10':
      seekRelativeSeconds(-10);
      break;
    case 'seekForward10':
      seekRelativeSeconds(10);
      break;
    case 'nextSong':
      if (playlist.length === 0) break;
      currentSongIndex = (currentSongIndex + 1) % playlist.length;
      LetsplaySong(currentSongIndex);
      break;
    case 'previousSong':
      if (playlist.length === 0) break;
      currentSongIndex = (currentSongIndex - 1 + playlist.length) % playlist.length;
      LetsplaySong(currentSongIndex);
      break;
    case 'playPause':
      playSongBtn();
      break;
    case 'playRandom':
      playRandomSong();
      break;
    case 'volumeUp':
      changeVolumeBy(0.05);
      break;
    case 'volumeDown':
      changeVolumeBy(-0.05);
      break;
    case 'stopSong':
      // stop and reset to 0
      if (wavesurfer) {
        try { wavesurfer.stop(); wavesurfer.seekTo(0); } catch (e) { /* ignore */ }
      }
      document.title = originalTitle;
      statusBar.textContent = originalTitle;
      clearPlayingStyle();
      break;
    default:
      // unknown action — ignore silently
      console.warn('Unknown shortcut action:', action);
      break;
  }
});

// ----------------------------------------------------------------------------
// Wavepeaks processor
// ----------------------------------------------------------------------------

// Helper: single creation of audioContext + eqFilters (lazy)
function ensureEQFilters() {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (!eqFilters || !eqFilters.length) {
      eqFilters = eqBands.map((band, i) => {
        const filter = audioContext.createBiquadFilter();
        filter.type = band <= 32 ? 'lowshelf' : band >= 16000 ? 'highshelf' : 'peaking';
        filter.Q.value = 1;
        filter.frequency.value = band;
        filter.gain.value = parseFloat(sliders[i].value || 0);
        return filter;
      });
    }
    return { audioContext, eqFilters };
  } catch (e) {
    console.warn('ensureEQFilters error', e);
    return null;
  }
}

// Placeholder generator (small flat line, not total silence)
function makePlaceholderPeaks(count = 8192) {
  const arr = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    arr[i] = 0.0001; // tiny non-zero so wave is visible thin
  }
  return arr;
}

function downsamplePeaks(peaks, maxPeaks = 2000) {
  const factor = Math.ceil(peaks.length / maxPeaks);
  if (factor <= 1) return peaks;
  const reduced = new Float32Array(Math.ceil(peaks.length / factor));
  for (let i = 0; i < reduced.length; i++) {
    reduced[i] = peaks[i * factor];
  }
  return reduced;
}

async function LetsplaySong(index) {
  if (playlist.length === 0) return;

  songPath = playlist[index].path || playlist[index];
  currentSongIndex = index;

  if (wavesurfer && wavesurfer.isPlaying()) {
    wavesurfer.stop();
    clearPlayingStyle();
    document.title = originalTitle;
    try { wavesurfer.destroy(); } catch (e) { /* ignore */ }
    apagarVideoPlayer();
    statusBar.textContent = "Loading...";
    totalDurLabel.textContent = "0:00";
    currentDurLabel.textContent = "0:00";
    leftDurLabel.textContent = "0:00";
  }

  try {
    // Obtener metadata desde main (size, mtimeMs, duration)
    const TO_MIN = 60;
    const meta = await window.electronAPI.getFileMetadata(songPath);
    const durationSec = parseFloat(meta.duration || 0);

    if (durationSec > (60 * TO_MIN)) {
      clearPlayingStyle();
      await window.electronAPI.showErrorDialog({
        title: "Archivo con duracion prohibida",
        message: "Esta canción dura más de 60 minutos y requiere que la dividas en partes",
      });
      statusBar.textContent = "Esta cancion requiere que la divididas en partes"
      return;
    }

    const isLong = durationSec > (20 * TO_MIN);

    if (isLong) {
      // comprobar cache
      const cached = await peaksDB.get(songPath);
      const validCache = cached && cached.size === meta.size && cached.mtimeMs === meta.mtimeMs && Math.abs((cached.duration || 0) - durationSec) < 0.6;

      if (validCache && cached.peaks && cached.peaks instanceof ArrayBuffer) {
        // usar cache
        console.log("Cargando cache de onda de picos");
        await new Promise(resolve => setTimeout(resolve, 50));
        const peaksFloat = new Float32Array(cached.peaks);
        console.log('Peaks size:', peaksFloat.length, 'Approx memory:', peaksFloat.length * 4 / 1024, 'KB');
        const durationMinutes = durationSec / 60;
        const maxPeaks = Math.min(1000 + durationMinutes * 10, 8192);
        const reducedPeaks = downsamplePeaks(peaksFloat, maxPeaks);
        console.log('Peaks size compresed:', reducedPeaks.length, 'Approx memory:', reducedPeaks.length * 4 / 1024, 'KB');
        await initWaveform(songPath, reducedPeaks);
        wavesurfer.setVolume(volumeSlider.value / 100);
        wavesurfer.play();
      } else {
        // No cache -> generar peaks via main (FFmpeg)
        // mostrar UI de progress
        showProgressNotification('Generando forma de onda (picos) — esto acelera futuras cargas...', 0);

        // subscribe a progress events
        const onProgress = (p) => {
          if (!p || !p.path || normalizePathForCompare(p.path) !== normalizePathForCompare(songPath)) return;
          const percent = (typeof p.percent === 'number') ? p.percent / 100 : 0;
          showProgressNotification('Generando forma de onda...', percent);
        };
        window.electronAPI.onPeaksProgress(onProgress);

        // If there is currently a peaks job and the user opens another long file,
        // main.job manager will apply preemption rules. Here we simply request generation.
        console.log("Generando onda de picos para wavesufer");
        // ⚠️ Permite que el navegador pinte antes de trabajo pesado
        await new Promise(resolve => setTimeout(resolve, 50));
        const durationMinutes = durationSec / 60;
        const peaksCount = Math.min(2000 + durationMinutes * 10, 8192); //8192; // tuneable
        const res = await window.electronAPI.generatePeaks({ path: songPath, peaksCount });
        console.log("La onda de picos se ha generado");

        // unsubscribe progress (removeAllListeners in preload ensures replacement; keep defensive)
        // Note: preload's onPeaksProgress uses removeAllListeners before re-registering.

        if (res && res.success && res.peaks) {
          console.log("Guardando los picos en cache")
          // convert Buffer -> ArrayBuffer
          const buf = res.peaks;
          // Node Buffer's underlying ArrayBuffer may be larger: create a slice
          const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
          // save in DB
          await peaksDB.put({
            path: songPath,
            size: res.size || meta.size,
            mtimeMs: meta.mtimeMs,
            duration: res.duration || meta.duration,
            peaksCount: res.peaksCount || peaksCount,
            peaks: ab,
            placeholder: false,
            createdAt: Date.now()
          });

          console.log("Playing with new precreated peaks");
          await new Promise(resolve => setTimeout(resolve, 50));
          const peaksFloat = new Float32Array(ab);
          console.log('Peaks size:', peaksFloat.length, 'Approx memory:', peaksFloat.length * 4 / 1024, 'KB');
          const durationMinutes = durationSec / 60;
          const maxPeaks = Math.min(1000 + durationMinutes * 10, 8192);
          const reducedPeaks = downsamplePeaks(peaksFloat, maxPeaks);
          console.log('Peaks size compresed:', reducedPeaks.length, 'Approx memory:', reducedPeaks.length * 4 / 1024, 'KB');
          await initWaveform(songPath, reducedPeaks);
          wavesurfer.setVolume(volumeSlider.value / 100);
          wavesurfer.play();

        } else {
          // failure or cancelled -> fallback placeholder so waveform is visible (flat)
          console.warn('generatePeaks failed or cancelled', res);
          await new Promise(resolve => setTimeout(resolve, 50));
          const durationMinutes = durationSec / 60;
          const maxPeaks = Math.min(1000 + durationMinutes * 10, 8192);
          const placeholder = makePlaceholderPeaks(maxPeaks); //8192
          const reducedPeaks = downsamplePeaks(placeholder, 900);
          await initWaveform(songPath, reducedPeaks);
          wavesurfer.setVolume(volumeSlider.value / 100);
          wavesurfer.play();
          showProgressNotification('No se pudo generar forma de onda — usando placeholder', 1, true, 4000);
        }
      }
    } else {
      // short file -> normal path (wavesurfer will compute quickly)
      await initWaveform(songPath, null);
      wavesurfer.setVolume(volumeSlider.value / 100);
      wavesurfer.play();
    }

    updatePlaylistUI();
    console.log(`Is playing: ${songPath}`);
    document.title = getNameAndYear(songPath);
  } catch (error) {
    console.error("Error al inicializar waveform:", error);
    statusBar.textContent = "Error al iniciar la canción.";
    // fallback: attempt immediate playback without precomputed peaks
    try {
      await initWaveform(songPath, null);
      wavesurfer.setVolume(currentVolume);
      wavesurfer.play();
    } catch (e) { /* ignore */ }
  }
}

function initWaveform(audioPath, precomputedPeaks = null) {
  return new Promise((resolve, reject) => {
    // destruir instancia previa
    if (wavesurfer) { try { wavesurfer.destroy(); } catch (e) { /* ignore */ } }

    const _wave_color = '#909090ff';
    const _progress_Color = '#5d5d5dff';
    const _cursor_color = '#ddd5e9';

    const commonOpts = {
      container: '#waveform',
      waveColor: _wave_color,
      progressColor: _progress_Color,
      cursorColor: _cursor_color,
      minPxPerSec: 0.1, // allow wavesurfer to economize pixels for long files
      pixelRatio: 1,
      height: 30,
      autoCenter: false,
      responsive: true,
      partialRender: true,
      fillParent: true,
      hideScrollbar: true,
      autoScroll: false,
      //backend: 'WebAudio' // ensure WebAudio backend for filters
    };

    // If precomputedPeaks provided, pass as peaks (expects Float32Array or array)
    if (precomputedPeaks) {
      commonOpts.peaks = precomputedPeaks;
    }

    // For mp4/video case: if audioPath endsWith .mp4, create videoPlayer and provide media
    if (audioPath.toLowerCase().endsWith('.mp4')) {
      crearVideoPlayer(audioPath);
      wavesurfer = WaveSurfer.create({
        ...commonOpts,
        media: document.getElementById('videoPlayer')
      });
    } else {
      apagarVideoPlayer();
      wavesurfer = WaveSurfer.create(commonOpts);
      // if we have precomputed peaks, create will draw instantly from peaks. Still need to call load.
      setTimeout(() => {
        wavesurfer.load(audioPath);
      }, 0);
    }

    // Initialize volume/pitch UI state
    updateVolumeUI(volumeSlider.value / 100);
    currentVolume = volumeSlider.value / 100;

    // Ensure eq filters exist once
    ensureEQFilters();

    // Attach audio processing events
    wavesurfer.on('audioprocess', () => {
      const current = wavesurfer.getCurrentTime();
      const total = wavesurfer.getDuration();
      const left = total - current;

      currentDurLabel.textContent = formatTime(current);
      leftDurLabel.textContent = formatTime(left, true);
    });

    wavesurfer.on('ready', () => {
      try {
        const total = wavesurfer.getDuration();
        totalDurLabel.textContent = formatTime(total);
        currentDurLabel.textContent = "0:00";
        leftDurLabel.textContent = formatTime(total, true);
        wavesurfer.setPlaybackRate(pitchValue, false);

        // Connect media element source to our persistent AudioContext + eqFilters
        try {
          // Ensure we have audioContext & eqFilters
          ensureEQFilters();

          // Acquire the audio element from wavesurfer
          const mediaEl = wavesurfer.getMediaElement();
          if (mediaEl && audioContext) {
            // createMediaElementSource for this element and wire to filters
            try {
              if (mediaNode) {
                try { mediaNode.disconnect(); } catch (e) { }
              }
              mediaNode = audioContext.createMediaElementSource(mediaEl);
            } catch (e) {
              // If createMediaElementSource fails (e.g. element already used in another context), ignore and fallback
              console.warn('createMediaElementSource failed:', e);
              mediaNode = null;
            }

            if (mediaNode) {
              // chain node -> filter0 -> ... -> filterN -> destination
              let prev = mediaNode;
              for (let i = 0; i < eqFilters.length; i++) {
                try {
                  prev.connect(eqFilters[i]);
                  prev = eqFilters[i];
                } catch (err) {
                  console.warn('Error connecting filter', err);
                }
              }
              try {
                prev.connect(audioContext.destination);
              } catch (err) {
                console.warn('Error connecting to destination', err);
              }
            } else {
              // fallback: if we cannot create mediaNode, try to use wavesurfer.backend.setFilters() if available
              try {
                if (wavesurfer.backend && typeof wavesurfer.backend.setFilters === 'function' && eqFilters && eqFilters.length) {
                  wavesurfer.backend.setFilters(eqFilters);
                }
              } catch (err) {
                // ignore
              }
            }
          }
        } catch (err) {
          console.warn('Error connecting EQ filters:', err);
        }

        // Set volume
        wavesurfer.setVolume(isMuted ? 0 : volumeSlider.value / 100);

        resolve(wavesurfer);
      } catch (err) {
        reject(err);
      }
    });

    wavesurfer.on('finish', () => {
      if (stopOnFinish_Flag) {
        stopOnFinish_Flag = false;
        stopOnFinish_Btn.classList.toggle("playback-btn-active");
        document.title = originalTitle;
        songPath = null;
        clearPlayingStyle();
        return;
      }

      if (playlist.length > 0) {
        currentSongIndex = (currentSongIndex + 1) % playlist.length;
        LetsplaySong(currentSongIndex);
      } else {
        document.title = originalTitle;
        songPath = null;
        statusBar.textContent = originalTitle;
        clearPlayingStyle();
      }
    });

    wavesurfer.on('play', () => {
      wavesurfer.setVolume(isMuted ? 0 : volumeSlider.value / 100);
      const currentSong = playlist[currentSongIndex];
      if (currentSong) {
        // statusBar.textContent = `Playing: ${currentSong.name}`;
        statusBar.textContent = "Playing";
      }
    });

    wavesurfer.on('pause', () => {
      if (!wavesurfer.isPlaying() && statusBar.textContent === "Playing") {
        statusBar.textContent = "Paused";
      }
    });

    wavesurfer.on('error', (errMsg) => {
      console.error('WaveSurfer error:', errMsg);
      statusBar.textContent = `Error al reproducir: ${errMsg}`;
      reject(errMsg);
    });
  });
}


// -------------------------------------------------------------
// Listeners del playback, controles y DOM
// -------------------------------------------------------------

window.addEventListener('DOMContentLoaded', async () => { initializeSavedCache() });
window.addEventListener('beforeunload', () => { saveCachePlaylist(); });
//randBtn.addEventListener('click', () => { playRandomSong(); }); //numkey8
prevBtn.addEventListener('click', () => { prevSongBtn(); });      //numkey4
nextBtn.addEventListener('click', () => { nextSongBtn(); });      //numkey2
playPauseBtn.addEventListener('click', () => { playSongBtn(); }); //numkey5
stopBtn.addEventListener('click', () => { stopSong(); });         //numkey0
btnVolUp.addEventListener('click', () => { volumeUp(); });        //numkey9
btnVolDown.addEventListener('click', () => { volumeDown() });     //numkey7
//back10sBtn.addEventListener('click', () => { backTnSec(); });   //numkey1
//ahead10sBtn.addEventListener('click', () => { aheadTnSec(); }); //numkey3
// ...minimize or active window ................................. //numkey6
eqCloseBtn.addEventListener('click', () => { summonEqualizer() });
eqSummonBtn.addEventListener('click', () => { summonEqualizer() });
resetBtn.addEventListener('click', () => { resetEqualizer(); });
btnMute.addEventListener('click', () => { muteBtn(); });
openReBinBtn.addEventListener('click', async () => { openReciclerBinBtn(); });
stopOnFinish_Btn.addEventListener('click', () => { stopOnFinish(); });

// -------------------------------------------------------------------------------

volumeSlider.addEventListener('input', () => { updateVolumeSlider(); });
pitchSlider.addEventListener('input', (e) => updatePitch(e.target.value)); // slider controla
pitchInput.addEventListener('change', (e) => updatePitch(e.target.value)); // input controla
document.addEventListener('mouseup', () => { mouseUp_forSliders(); });

// -------------------------------------------------------------------------------


updateVolumeUI(defaultVol); //inicializar volumen
applyVal_toSliders();
setListeners_toSliders();
window.refreshTree = refreshTree; // expose globally (optional) so other modules can call refreshTree()
