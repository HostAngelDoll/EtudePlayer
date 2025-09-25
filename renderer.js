// ##########################################
// Advertencia: 
// No tener todas las partes del renderer.js significa no poder hacerle juicio hasta que este entrgeado
// renderer.js // part-1 to 4
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
const copyBtn = document.getElementById('copyBtn');
const pitchSlider = document.getElementById('pitchSlider');
const pitchInput = document.getElementById('pitchInput');
const statusBar = document.getElementById('statusBar');
const resetBtn = document.getElementById('resetEQ');
const eqContainer = document.getElementById('eqContainer');
const sliders = eqContainer.querySelectorAll('input[type="range"]');
const originalTitle = "EtudePlayer";


// ---------------------------------------------------
// inicializar
// ---------------------------------------------------

const ROOT_YEARS_PATH = "E:\\_Internal";
const eqBands = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const moveTreeState = { // estado para preservar entre refreshes
  expandedPaths: new Set(),
  selectedPath: null
};
let filesWhileRenaming = []
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
if (savedEqValues.length !== eqBands.length) { savedEqValues = eqBands.map(() => 0); }
volumeLabel.textContent = `${volumeSlider.value}%`;
document.title = originalTitle;


// -----------------------------------------------
// Iniciating > Modal move-to-folder state
// -----------------------------------------------
let moveModalOverlay = null;
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

// -----------------------------------------------------
// funciones de renderer
// -----------------------------------------------------

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

async function loadPlaylistFromArray(songsArray, cacheKey, forceNext = false) {
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
      showProgressNotification(`Cargando ${i + 1} de ${total}`, (i + 1) / total);
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
    showProgressNotification(`Cargando ${i + 1} de ${total}`, (i + 1) / total);
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
  showProgressNotification('Carga completa', 1); // esto ocultará después si tu func lo hace
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
  await loadPlaylistFromArray(songsArray, cacheKey);
}

window.addEventListener('beforeunload', () => {
  try {
    localStorage.setItem('playlistCache', JSON.stringify(playlistCache));
    console.log('playlistCache guardado antes de cerrar');
  } catch (e) {
    console.warn('No se pudo guardar playlistCache al cerrar:', e);
  }
});

function clearPlayingStyle() {
  // Seleccionamos todas las filas del tbody que tengan la clase "playing"
  const filasPlaying = document.querySelectorAll('#playlist tbody tr.playing');

  // Eliminamos cada una de esas filas
  filasPlaying.forEach(fila => {
    fila.classList.remove('playing');
  });
}


// ##########################################
// Advertencia: 
// No tener todas las partes del renderer.js significa no poder hacerle juicio hasta que este entrgeado

// renderer.js // part-2 to 4
// ##########################################


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
      playSong(index);
      // tbody.querySelectorAll('tr').forEach(r => r.classList.remove('playing'));      
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

// ----------------------------------------------------------------------
// playback state
// ----------------------------------------------------------------------

function getNameAndYear(rawFileUrl) {
  let path = rawFileUrl.replace(/^file:\/+/, ''); // 1. Eliminar el prefijo "file://"
  path = decodeURIComponent(path); // 2. Decodificar caracteres codificados (como %20 -> espacio)
  const pathSubstring = path.substring(13, 17); // 3. Extraer subcadena (índices 13 a 16 inclusive = JS substring(13,17))
  let filename = path.split(/[\\/]/).pop(); // 4. Obtener nombre de archivo
  if (filename.includes('.')) { filename = filename.substring(0, filename.lastIndexOf('.')); }
  return `${pathSubstring}. ${filename}`;
}

function getNameAndYear_forArray(rawFileUrl) {
  let path = rawFileUrl;

  // Si la ruta empieza con "file://", eliminar ese prefijo
  if (path.startsWith('file://')) {
    path = path.replace(/^file:\/+/, '');
  }

  // Decodificar posibles caracteres codificados
  path = decodeURIComponent(path);

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
}

// -----------------------------------------------------
// Controles
// -----------------------------------------------------


async function playSong(index) { // Reproducir canción por índice
  if (playlist.length === 0) return;

  function retrasar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  songPath = playlist[index].path || playlist[index]; // ruta absoluta
  currentSongIndex = index;

  initWaveform(songPath);
  wavesurfer.setVolume(volumeSlider.value / 100);
  retrasar(1000);
  wavesurfer.play();
  updatePlaylistUI();

  console.log(`Is playing: ${songPath}`);
  document.title = getNameAndYear(songPath);
}

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


prevBtn.addEventListener('click', () => {
  if (playlist.length === 0) return;
  currentSongIndex = (currentSongIndex - 1 + playlist.length) % playlist.length;
  playSong(currentSongIndex);
});

nextBtn.addEventListener('click', () => {
  if (playlist.length === 0) return;
  currentSongIndex = (currentSongIndex + 1) % playlist.length;
  playSong(currentSongIndex);
});

copyBtn.addEventListener('click', () => {
  if (!playlist.length) return;
  const currentSong = playlist[currentSongIndex];
  if (!currentSong) return;

  const filename = currentSong.name.replace(/\.[^/.]+$/, "");  // Extraer nombre sin extensión

  navigator.clipboard.writeText(filename).then(() => {
    console.log(`Copied: ${filename}`);
  });
});

playPauseBtn.addEventListener('click', () => { playSongBtn(); });

stopBtn.addEventListener('click', () => { stopSong(); });


// ----------------------------------------------------------------------
// Activity bar (folder)
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

// Cargar árbol y manejar clicks en nodos
window.addEventListener('DOMContentLoaded', async () => {

  try {
    const savedCache = localStorage.getItem('playlistCache');
    if (savedCache) {
      playlistCache = JSON.parse(savedCache) || {};
      console.log('playlistCache restaurado. Claves:', Object.keys(playlistCache));
    }
  } catch (err) {
    console.warn('No se pudo restaurar playlistCache:', err);
    playlistCache = {};
  }

  const data = await window.electronAPI.getPlaylists();
  const treeContainer = document.getElementById('tree');

  function createNode(node) {
    const li = document.createElement('li');
    li.textContent = node.name;

    // Subnodos
    if (node.nodes && node.nodes.length > 0) {
      const ul = document.createElement('ul');
      node.nodes.forEach(child => ul.appendChild(createNode(child)));
      li.appendChild(ul);
    }

    // Click para abrir/cerrar subnodos
    li.addEventListener('click', async (e) => {
      e.stopPropagation();

      // 1. Activar solo este nodo
      setActiveFolder(li);

      // 2. Expandir/colapsar si tiene hijos
      if (li.querySelector('ul')) {
        // Si es un año (los nodos que tienen subcarpetas principales)
        if (!li.parentElement.closest('li')) {
          // cerrar todos los demás años
          document.querySelectorAll('#tree > ul > li').forEach(yearLi => {
            if (yearLi !== li) yearLi.classList.remove('open');
          });
        }

        // abrir y cerrar este
        li.classList.toggle('open');
      }

      // Si es carpeta de música, cargar canciones bajo demanda
      if (node.type === 'folder' && node.path) {
        messageFromOpenByNode = true;
        await loadPlaylistFromFolder(node.path);

        window.electronAPI.selectFolder(node.path); // <- nueva función que vamos a exponer

        node.loadedSongs = true; // marca que ya cargamos
        if (autoPlay && playlist.length > 0) playSong(0); // solo si el flag autoPlay está activo
      }

      // 🎄 Subnodo Xmas especial
      if (node.type === 'xmas-all' && !node.loadedSongs) {
        node.loadedSongs = true; // marcar antes de await para evitar clics múltiples

        li.addEventListener('click', async (e) => {
          e.stopPropagation();
          const songs = await window.electronAPI.getXmasSongs(node.path);

          playlist = songs.map(f => ({
            name: f.split('\\').pop(), // solo nombre de archivo
            path: f // ruta completa
          }));

          messageFromOpenByNode = true;
          await loadPlaylistFromArray(songs, 'xmas-all'); // cacheKey claro 'xmas-all'

          window.electronAPI.selectXmas(node.path);

          if (autoPlay && playlist.length > 0) playSong(0);
        });
      }
    });
    return li;
  }

  const ul = document.createElement('ul');
  data.playlists.forEach(year => { ul.appendChild(createNode({ name: year.year, nodes: year.nodes })); });
  ul.appendChild(createNode(data.xmas));
  treeContainer.appendChild(ul);
});


// ---------------------------------------------------------------
// Volume conection
// ---------------------------------------------------------------

// Función para actualizar volumen y label
function updateVolumeUI(volume) {
  volumeSlider.value = Math.round(volume * 100);
  volumeLabel.textContent = `${volumeSlider.value}%`;
  btnMute.textContent = isMuted ? 'Unmute' : 'Mute';
}

// Listener para subir el volumen
btnVolUp.addEventListener('click', () => {
  currentVolume = Math.min(1, currentVolume + 0.1);
  if (!isMuted) applyVolume();
  updateVolumeUI(currentVolume);
});

// Listener para bajar el volumen
btnVolDown.addEventListener('click', () => {
  currentVolume = Math.max(0, currentVolume - 0.1);
  if (!isMuted) applyVolume();
  updateVolumeUI(currentVolume);
});

// Mute / Unmute
btnMute.addEventListener('click', () => {
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
});

// evento de cambio
volumeSlider.addEventListener('input', () => {
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
});

// Aplica el volumen a Wavesurfer si existe
function applyVolume() {
  if (wavesurfer) {
    wavesurfer.setVolume(isMuted ? 0 : currentVolume);
  }
}

// Inicializa el slider al cargar
updateVolumeUI(defaultVol);


// ##########################################
// Advertencia: 
// No tener todas las partes del renderer.js significa no poder hacerle juicio hasta que este entrgeado
// renderer.js // part-3 to 4
// ##########################################

// ----------------------------------------------------------------
// Waveform slider
// ----------------------------------------------------------------

function updatePitch(val) {
  pitchValue = parseFloat(val); // guardamos siempre
  pitchSlider.value = pitchValue;
  pitchInput.value = pitchValue.toFixed(2);

  // aplicar si ya hay wavesurfer activo
  if (wavesurfer) {
    wavesurfer.setPlaybackRate(pitchValue, false);
  }
}

function formatTime(seconds, negative = false) {
  if (isNaN(seconds)) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return (negative ? "-" : "") + `${mins}:${secs}`;
}


// slider controla
pitchSlider.addEventListener('input', (e) => updatePitch(e.target.value));

// input controla
pitchInput.addEventListener('change', (e) => updatePitch(e.target.value));


// Aplicar valores a sliders inmediatamente
sliders.forEach((slider, i) => {
  slider.value = savedEqValues[i];
});

function crearVideoPlayer(url) {
  const container = document.getElementById('videoContainer');

  const existingVideo = document.getElementById('videoPlayer');
  if (existingVideo) {
    container.removeChild(existingVideo);
  }

  // Crear el nuevo elemento video
  const video = document.createElement('video');
  video.id = 'videoPlayer';
  video.controls = true;
  video.playsInline = true;
  video.style.width = '100%';
  video.style.maxWidth = '600px';
  video.src = url;
  container.appendChild(video);
  container.style.display = 'block';
}

function apagarVideoPlayer() {
  const container = document.getElementById('videoContainer');
  if (container.childElementCount === 0) return

  const video = document.getElementById('videoPlayer');
  if (video) {
    container.removeChild(video);
  }
  container.style.display = 'none';
}

function initWaveform(audioPath) {
  // destruir instancia previa
  if (wavesurfer) {
    wavesurfer.destroy();
  }

  const _wave_color = '#909090ff'
  const _progress_Color = '#5d5d5dff'

  if (audioPath.toLowerCase().endsWith('.mp4')) {
    // mostrar el contenedor de video
    crearVideoPlayer(audioPath);

    wavesurfer = WaveSurfer.create({
      container: '#waveform',
      waveColor: _wave_color,
      progressColor: _progress_Color,
      height: 30,
      responsive: true,
      media: videoPlayer,   // aquí va el <video>
    });

  } else {
    // ocultar video si no es mp4
    apagarVideoPlayer()

    wavesurfer = WaveSurfer.create({
      container: '#waveform',
      waveColor: _wave_color,
      progressColor: _progress_Color,
      height: 30,
      responsive: true,
    });

    wavesurfer.load(audioPath);
  }

  updateVolumeUI(volumeSlider.value / 100);
  currentVolume = volumeSlider.value / 100;


  wavesurfer.on('audioprocess', () => {
    const current = wavesurfer.getCurrentTime();
    const total = wavesurfer.getDuration();
    const left = total - current;

    currentDurLabel.textContent = formatTime(current);
    leftDurLabel.textContent = formatTime(left, true);
  });

  wavesurfer.on('ready', () => {
    const total = wavesurfer.getDuration();
    totalDurLabel.textContent = formatTime(total);
    currentDurLabel.textContent = "0:00";
    leftDurLabel.textContent = formatTime(total, true);
    wavesurfer.setPlaybackRate(pitchValue, false);

    // Crear AudioContext si no existe y una sola vez
    if (!audioContext) {
      audioContext = new AudioContext();

      // Crear filtros para cada banda
      eqFilters = eqBands.map((band, i) => {
        const filter = audioContext.createBiquadFilter();
        filter.type = band <= 32 ? 'lowshelf' : band >= 16000 ? 'highshelf' : 'peaking';
        filter.Q.value = 1;
        filter.frequency.value = band;
        filter.gain.value = parseFloat(sliders[i].value); // aplicar valor actual del slider
        return filter;
      });
    }

    // ⚡ Crear un nuevo mediaNode SIEMPRE
    if (mediaNode) {
      try { mediaNode.disconnect(); } catch (e) { }
    }

    // Conectar media element a los filtros
    const audio = wavesurfer.getMediaElement();

    try {
      mediaNode = audioContext.createMediaElementSource(audio);
    } catch (error) { }

    // Conectar filtros en cadena
    const equalizer = eqFilters.reduce((prev, curr) => {
      prev.connect(curr);
      return curr;
    }, mediaNode);

    // Conectar al destino
    equalizer.connect(audioContext.destination);

  });

  // cuando acaba
  wavesurfer.on('finish', () => {
    if (stopAfterCheckbox.checked) {
      stopAfterCheckbox.checked = false; // desmarcar automáticamente
      document.title = originalTitle;    // reset título
      songPath = null
      clearPlayingStyle();
      return; // no reproducir siguiente
    }

    if (playlist.length > 0) {
      currentSongIndex = (currentSongIndex + 1) % playlist.length;
      playSong(currentSongIndex);
    } else {
      document.title = originalTitle;
      songPath = null
      statusBar.textContent = originalTitle;
      clearPlayingStyle();
    }
  });

  wavesurfer.on('play', () => {
    wavesurfer.setVolume(isMuted ? 0 : currentVolume);
    const currentSong = playlist[currentSongIndex];
    if (currentSong) {
      statusBar.textContent = `Playing: ${currentSong.name}`;
    }
  });

  wavesurfer.on('pause', () => {
    if (!wavesurfer.isPlaying()) {
      statusBar.textContent = "Paused";
    }
  });

  wavesurfer.on('error', (errMsg) => {
    console.error('WaveSurfer error:', errMsg);

    // Opcional: mostrar mensaje al usuario
    statusBar.textContent = `Error al reproducir: ${errMsg}`;

    // Saltar a la siguiente canción si hay playlist
    if (playlist.length > 0) {
      currentSongIndex = (currentSongIndex + 1) % playlist.length;
      playSong(currentSongIndex);
    } else {
      // Si no hay más canciones, restablecer estado
      document.title = originalTitle;
      songPath = null;
      statusBar.textContent = originalTitle;
      clearPlayingStyle();
    }
  });
}

// Vincular sliders a filtros y almacenamiento
sliders.forEach((slider, i) => {
  slider.addEventListener('input', () => {
    const val = parseFloat(slider.value);
    if (eqFilters[i]) eqFilters[i].gain.value = val; // aplicar si hay audio

    // Guardar todos los valores en localStorage
    const currentValues = Array.from(sliders).map(s => parseFloat(s.value));
    localStorage.setItem('eqValues', JSON.stringify(currentValues));
  });
});

// Botón de reset EQ
resetBtn.addEventListener('click', () => {
  sliders.forEach((slider, i) => {
    slider.value = 0;           // reinicia slider
    if (eqFilters[i]) eqFilters[i].gain.value = 0; // reinicia filtro activo
  });
  localStorage.setItem('eqValues', JSON.stringify(eqBands.map(() => 0)));
});

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
  loadPlaylistFromArray(playlist, pathFolder, true); // vuelve a renderizar
});

// carpetas de cada año
window.electronAPI.onFolderUpdated(async (files, folderPath) => {
  if (disableWatchdog) return;
  // Convertir a formato {name, path} si viene como string
  const songsArray = files.map(f => (typeof f === 'string' ? { name: f.split(/[\\/]/).pop(), path: f } : f));

  // Cargar playlist desde array (recalcula duración, ordena alfabéticamente, actualiza cache)
  await loadPlaylistFromArray(songsArray, folderPath, true);

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
  await loadPlaylistFromArray(songsArray, folderKey, true);

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
    playSong(index);
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
    case "moveToTrash":
      // mover a papelera
      break;
    case "undo":
      // deshacer última operación
      break;
  }
});


// ##########################################
// Advertencia: 
// No tener todas las partes del renderer.js significa no poder hacerle juicio hasta que este entrgeado
// renderer.js // part-4 to 4
// ##########################################

// ---------------------------------------------------------------
// move files opetations
// ---------------------------------------------------------------


// ----------------- Modal / Tree code ---------------------------

// Utility: detectar si crear/renombrar está bloqueado (misma regla que en main)
function isCreateBlockedNodePath(nodePath) {
  if (!nodePath) return true;
  const base = nodePath.toLowerCase();
  return base.includes('music.main') || base.includes('music.registry.base') || base.includes('music.xmas');
}

/**
 * "E:/_years/2004/01. folder" -> "01. folder"
 * @param {*} _path 
 * @returns First Level of the path
 */
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

/**
 * "01. folder.example" -> "folder example"
 * @param {*} folderName
 * @returns name without prefix
 */
function removePrefixFolder(folderName) {
  return folderName.replace(/^\d{2}\.\s/, '');
}

/**
 * Decide si estas carpetas pueden tener subcarpetas creadas por etudeplayer
 * @param {*} node 
 * @param {*} isCreating 
 * @param {*} isMenu 
 * @returns A bolean value
 */
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
  if (data.xmas) { rootNodes.push(data.xmas);}

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

    // Validar y preparar
    const res = await validateAndPrepareMove(files, selectedMoveNode.path);

    if (!res || res.success === false) {
      console.error('Preparación de movimiento fallida:', res && res.error);
      return;
    }

    // Marca el botón como "preparado" (flag visual) — la etapa 3 ejecutará pendingMoveOperations
    moveConfirmBtn.dataset.prepared = 'true';
    moveConfirmBtn.textContent = '✔ Preparado';
    moveConfirmBtn.disabled = false;
    
    // Seccion para mover archivos de verdad
    console.log('Mover a: "', selectedMoveNode.path, '" files:', filesToMove);

    return; //por el momento para hacer pruebas finales

    // Tras finalizar las operaciones
    selectedMoveNode = null;
    filesWhileRenaming = [];
    filesToMove = []
    closeMoveDialog(); //piden no cerrar pero por el momento es simulacion
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
      return;
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
      return;
    }
    openMoveDialog(filesWhileRenaming);
    return;
  }
});

// ----------------- Fin del modal -----------------------------


// Normalizar rutas para comparar (tolower + backslashes)
function normalizePathForCompare(p) {
  if (!p || typeof p !== 'string') return '';
  return p.replace(/\//g, '\\').toLowerCase();
}

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



// ##########################################
// next file -> index.html
// ##########################################
