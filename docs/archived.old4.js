// Convertir 'ctrl+1' -> 'CommandOrControl+1' (más robusto)
function normalizeAccel(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const parts = raw.split('+').map(p => p.trim().toLowerCase()).filter(Boolean);
  if (!parts.length) return null;
  const mapped = parts.map(p => {
    if (p === 'ctrl' || p === 'control' || p === 'cmd' || p === 'command') return 'CommandOrControl';
    if (p === 'shift') return 'Shift';
    if (p === 'alt' || p === 'option') return 'Alt';
    if (p === 'super' || p === 'win' || p === 'meta') return 'Super';
    // leave numeric or letter or F1-style as-is but uppercase letters
    if (p.length === 1 && /[a-z0-9]/.test(p)) return p.toLowerCase();
    return p.toUpperCase();
  });
  return mapped.join('+');
}

function registerShortcutsFromMap(map) {
  // map: { "ctrl+1": "seekBack10", ... } (raw from JSON)
  try {
    // unregister previous
    globalShortcut.unregisterAll();
    registeredShortcuts.clear();

    const seenAccels = new Set();
    for (const rawKey of Object.keys(map || {})) {
      const action = map[rawKey];
      const accel = normalizeAccel(rawKey);
      if (!accel) {
        console.warn(`[shortcuts] invalid key "${rawKey}" — skipped`);
        continue;
      }
      if (seenAccels.has(accel)) {
        console.warn(`[shortcuts] duplicate accelerator "${accel}" in shortcuts.json — skipped`);
        continue;
      }
      // try to register
      const ok = globalShortcut.register(accel, () => {
        // handle action
        handleGlobalShortcut(action);
      });
      if (!ok) {
        console.warn(`[shortcuts] failed to register "${accel}" -> "${action}" (maybe in use by OS).`);
        continue;
      }
      seenAccels.add(accel);
      registeredShortcuts.set(accel, action);
      console.log(`[shortcuts] registered: ${accel} -> ${action}`);
    }
  } catch (err) {
    console.error('[shortcuts] registerShortcutsFromMap error:', err);
  }
}

function handleGlobalShortcut(action) {
  try {
    if (!action || typeof action !== 'string') return;
    // Actions that main should handle:
    if (action === 'toggleWindow') {
      try {
        // Toggle minimize / restore / focus
        if (!win || win.isDestroyed()) {
          // try to get any window
          const w = BrowserWindow.getAllWindows()[0];
          if (w) {
            win = w;
          } else {
            return;
          }
        }
        if (win.isMinimized()) {
          win.restore();
          win.focus();
        } else {
          // If focused -> minimize, otherwise bring to front
          if (win.isFocused()) {
            win.minimize();
          } else {
            if (!win.isVisible()) win.show();
            win.focus();
          }
        }
      } catch (e) { console.warn('toggleWindow error:', e); }
      return;
    }

    // Others -> forward to renderer (if available)
    if (win && win.webContents) {
      win.webContents.send('shortcut-action', { action });
    } else {
      // If no window, still try to find a window
      const w = BrowserWindow.getAllWindows()[0];
      if (w && w.webContents) w.webContents.send('shortcut-action', { action });
    }
  } catch (err) {
    console.error('handleGlobalShortcut error:', err);
  }
}

async function loadShortcutsFileAndRegister() {
  try {
    // default: if file missing, nothing to register
    const p = SHORTCUTS_PATH;
    let raw = '{}';
    try {
      raw = await fs.readFile(p, 'utf8');
    } catch (e) {
      // file might not exist → no shortcuts; leave empty
      console.warn(`[shortcuts] ${p} not found — no global shortcuts registered`);
      return;
    }

    let parsed = {};
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.warn('[shortcuts] invalid JSON in shortcuts.json — ignoring');
      return;
    }

    // register
    registerShortcutsFromMap(parsed);
  } catch (err) {
    console.error('[shortcuts] loadShortcutsFileAndRegister error:', err);
  }
}

// Watch the shortcuts file for changes (reload automatically)
function watchShortcutsFile() {
  try {
    if (shortcutsWatcher) {
      try { shortcutsWatcher.close(); } catch (e) { /* ignore */ }
      shortcutsWatcher = null;
    }
    shortcutsWatcher = chokidar.watch(SHORTCUTS_PATH, { ignoreInitial: true, persistent: true });
    let reloadTimer = null;
    shortcutsWatcher.on('change', () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(async () => {
        console.log('[shortcuts] change detected -> reloading shortcuts.json');
        await loadShortcutsFileAndRegister();
      }, 200);
    });
  } catch (e) {
    console.warn('[shortcuts] watchShortcutsFile error:', e);
  }
}

// init viejo que laguea

function initWaveform(audioPath) {
  // destruir instancia previa
  if (wavesurfer && !wavesurfer.isDestroyed) return wavesurfer;
  // if (wavesurfer) {
  //   wavesurfer.destroy();
  // }

  const _wave_color = '#909090ff'
  const _progress_Color = '#5d5d5dff'
  const _cursor_color = '#ddd5e9'

  if (audioPath.toLowerCase().endsWith('.mp4')) {
    // mostrar el contenedor de video
    crearVideoPlayer(audioPath);

    wavesurfer = WaveSurfer.create({
      container: '#waveform',
      waveColor: _wave_color,
      progressColor: _progress_Color,
      cursorColor: _cursor_color,
      pixelRatio: 1,
      minPxPerSec: 1,
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
      cursorColor: _cursor_color,
      pixelRatio: 1,
      minPxPerSec: 1,
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

function playSong(index) { // Reproducir canción por índice
  if (playlist.length === 0) return;

  songPath = playlist[index].path || playlist[index]; // ruta absoluta
  currentSongIndex = index;

  initWaveform(songPath /*, cachedPeaksIfAny*/);
  wavesurfer.setVolume(volumeSlider.value / 100);
  wavesurfer.play();
  updatePlaylistUI();

  console.log(`Is playing: ${songPath}`);
  document.title = getNameAndYear(songPath);
}