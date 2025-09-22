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

const eqBands = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
let wavesurfer = null;
let previousVolume = 1;
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
let isOpenFolder = false;
let disableWatchdog = false;
volumeLabel.textContent = `${volumeSlider.value}%`;
document.title = originalTitle;


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

// renderer.js // part-2 to 3
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

function playSong(index) { // Reproducir canción por índice
  if (playlist.length === 0) return;
  songPath = playlist[index].path || playlist[index]; // ruta absoluta
  currentSongIndex = index;

  initWaveform(songPath);
  wavesurfer.setVolume(volumeSlider.value / 100);
  wavesurfer.play();
  updatePlaylistUI();

  console.log(`Is playing: ${songPath}`);
  document.title = getNameAndYear(songPath);
}

// -----------------------------------------------------
// Controles
// -----------------------------------------------------

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

playPauseBtn.addEventListener('click', () => {
  if (!wavesurfer) return;
  if (wavesurfer.isPlaying()) {
    wavesurfer.pause();
  } else {
    wavesurfer.play();
    document.title = getNameAndYear(songPath);
    updatePlaylistUI();
  }
});

stopBtn.addEventListener('click', () => {
  if (wavesurfer) {
    wavesurfer.stop();
    wavesurfer.seekTo(0);
    document.title = originalTitle;
    statusBar.textContent = originalTitle;
    clearPlayingStyle();
  }
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


// ----------------------------------------------------------------------
// Activity bar (folder)
// ----------------------------------------------------------------------

function setActiveFolder(el) {
  if (activeFolderEl) activeFolderEl.classList.remove('active-folder');
  el.classList.add('active-folder');
  activeFolderEl = el;
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
        await loadPlaylistFromFolder(node.path);

        isOpenFolder = true;
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

          isOpenFolder = true;
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
}

// evento de cambio
volumeSlider.addEventListener('input', () => {
  const vol = volumeSlider.value / 100;
  if (wavesurfer) wavesurfer.setVolume(vol);
  volumeLabel.textContent = `${volumeSlider.value}%`;
});

// Listener para mutear/desmutear
btnMute.addEventListener('click', () => {
  if (!wavesurfer) return;
  if (wavesurfer.getVolume() > 0) {
    previousVolume = wavesurfer.getVolume();
    wavesurfer.setVolume(0);
    btnMute.textContent = 'Unmute';
  } else {
    wavesurfer.setVolume(previousVolume || 1);
    btnMute.textContent = 'Mute';
  }
});

// Listener para bajar el volumen
btnVolDown.addEventListener('click', () => {
  if (!wavesurfer) return;
  let newVolume = Math.max(0, wavesurfer.getVolume() - 0.1);
  wavesurfer.setVolume(newVolume);
  updateVolumeUI(newVolume);
});

// Listener para subir el volumen
btnVolUp.addEventListener('click', () => {
  if (!wavesurfer) return;
  let newVolume = Math.min(1, wavesurfer.getVolume() + 0.1);
  wavesurfer.setVolume(newVolume);
  updateVolumeUI(newVolume);
});


// ##########################################
// Advertencia: 
// No tener todas las partes del renderer.js significa no poder hacerle juicio hasta que este entrgeado
// renderer.js // part-3 to 3
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


// Recuperar valores guardados o inicializar en 0
let savedEqValues = JSON.parse(localStorage.getItem('eqValues') || '[]');
if (savedEqValues.length !== eqBands.length) {
  savedEqValues = eqBands.map(() => 0);
}

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

function showProgressNotification(message, progress = 0) {
  const tooltip = document.getElementById("progressTooltip");
  const msg = document.getElementById("progressMessage");
  const fill = document.getElementById("progressFill");

  msg.textContent = message;
  fill.style.width = `${Math.round(progress * 100)}%`;

  tooltip.style.display = "block";

  // opcional: ocultar automáticamente cuando llegue al 100%
  if (progress >= 1) {
    setTimeout(() => { tooltip.style.display = "none"; }, 2500);
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
  if (!isOpenFolder) {
    showProgressNotification(`La carpeta "${folderPath}" ha cambiado`, 1);
  } else {
    isOpenFolder = false;
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
  if (!isOpenFolder) {
    showProgressNotification(`La carpeta "${payload.folderPath}" ha cambiado`, 1);
  } else {
    isOpenFolder = false;
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

  switch (action.type) {
    case "copyName":
      // copiar un nombre
      break;
    case "copyPath":
      // copiar ruta
      break;
    case "moveToFolder":
      // abrir dialog mover
      break;
    case "moveToTrash":
      // mover a papelera
      break;
    case "undo":
      // deshacer última operación
      break;
    // multiple
    case "copyNames":
      // maneja copiado de nombres
      break;
    case "copyPaths":
      // manejar copia múltiple
      break;
  }
});

// ##########################################
// next file -> index.html
// ##########################################