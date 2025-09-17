//renderer.js
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
let currentSongIndex = 0;
let playlist = [];
let autoPlay = false;
let activeFolderEl = null;
let pitchValue = 1.0; // valor persistente
let audioContext = null; // Definir bandas del ecualizador
let eqFilters = [];
let mediaNode = null;
volumeLabel.textContent = `${volumeSlider.value}%`;


// -----------------------------------------------------
// funciones de renderer
// -----------------------------------------------------


// function updatePlaylistUI() { // Actualizar lista en la interfaz
//   playlistDiv.innerHTML = '';
//   playlist.forEach((song, index) => {
//     const div = document.createElement('div');
//     div.textContent = song.name || song; // si viene como objeto {name,path} o string
//     div.style.cursor = 'pointer';
//     if (index === currentSongIndex) div.style.fontWeight = 'bold';
//     div.addEventListener('click', () => playSong(index));
//     playlistDiv.appendChild(div);
//   });
// }

async function loadPlaylistSongs(songs) {
  // Crear objetos con name, path y duration
  playlist = await Promise.all(songs.map(async f => {
    const songPath = typeof f === 'string' ? f : f.path;
    const audio = new Audio(songPath);
    await new Promise(resolve => {
      audio.addEventListener('loadedmetadata', resolve, { once: true });
    });
    const minutes = Math.floor(audio.duration / 60);
    const seconds = Math.floor(audio.duration % 60).toString().padStart(2, '0');
    return {
      name: f.name || f.split('\\').pop(),
      path: songPath,
      duration: `${minutes}:${seconds}`
    };
  }));

  updatePlaylistUI();
}

function clearPlayingStyle() {
  const rows = playlistDiv.querySelectorAll('.playlist-row');
  rows.forEach(r => r.classList.remove('playing'));
}

function updatePlaylistUI() {
  const tbody = document.querySelector('#playlist tbody');
  tbody.innerHTML = '';

  playlist.forEach((song, index) => {
    const tr = document.createElement('tr');
    tr.dataset.index = index;

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
      // al oprimir stop no deberia marcar
    });

    // Click derecho
    tr.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      tbody.querySelectorAll('tr').forEach(r => r.classList.remove('selected'));
      tr.classList.add('selected');
      console.log("Mostrar menú contextual para:", song.name);
    });

    tbody.appendChild(tr);
  });
}

function getNameAndYear(rawFileUrl) {
  let path = rawFileUrl.replace(/^file:\/+/, ''); // 1. Eliminar el prefijo "file://"
  path = decodeURIComponent(path); // 2. Decodificar caracteres codificados (como %20 -> espacio)
  const pathSubstring = path.substring(13, 17); // 3. Extraer subcadena (índices 13 a 16 inclusive = JS substring(13,17))
  let filename = path.split(/[\\/]/).pop(); // 4. Obtener nombre de archivo
  if (filename.includes('.')) { filename = filename.substring(0, filename.lastIndexOf('.')); }
  return `${pathSubstring}. ${filename}`;
}



function playSong(index) { // Reproducir canción por índice
  if (playlist.length === 0) return;
  const songPath = playlist[index].path || playlist[index]; // ruta absoluta
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

  // Extraer nombre sin extensión
  const filename = currentSong.name.replace(/\.[^/.]+$/, "");

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
      //// if (node.type === 'folder' && !node.loadedSongs && node.path)
      if (node.type === 'folder' && node.path) {
        const songs = await window.electronAPI.getSongs(node.path);

        // playlist = songs.map(f => ({ name: f, path: `${node.path}\\${f}` }));
        // updatePlaylistUI();

        await loadPlaylistSongs(songs.map(f => ({ name: f, path: `${node.path}\\${f}` })));

        node.loadedSongs = true; // marca que ya cargamos
        if (autoPlay && playlist.length > 0) playSong(0); // solo si el flag autoPlay está activo
      }

      // 🎄 Subnodo Xmas especial
      if (node.type === 'xmas-all' && !node.loadedSongs) {
        node.loadedSongs = true; // marcar antes de await para evitar clics múltiples

        li.addEventListener('click', async (e) => {
          e.stopPropagation();
          // const songs = await ipc|Renderer.invoke('get-xmas-songs', node.path);
          const songs = await window.electronAPI.getXmasSongs(node.path);

          playlist = songs.map(f => ({
            name: f.split('\\').pop(), // solo nombre de archivo
            path: f // ruta completa
          }));

          // playlist.sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
          // updatePlaylistUI();

          await loadPlaylistSongs(songs.map(f => ({ name: f, path: `${node.path}\\${f}` })));

          if (autoPlay && playlist.length > 0) playSong(0);
        });
      }

    });

    return li;
  }

  const ul = document.createElement('ul');

  data.playlists.forEach(year => {
    ul.appendChild(createNode({ name: year.year, nodes: year.nodes }));
  });

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

function destruirVideoPlayer() {
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

  const _wave_color = '#999'
  const _progress_Color = '#007acc'

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
    destruirVideoPlayer()

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
      clearPlayingStyle();
      return; // no reproducir siguiente
    }

    if (playlist.length > 0) {
      currentSongIndex = (currentSongIndex + 1) % playlist.length;
      playSong(currentSongIndex);
    } else {
      document.title = originalTitle;
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
