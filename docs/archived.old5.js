// funciones antiguas de renderer.js

function initWaveform(audioPath, _peaks = null) {
  return new Promise((resolve, reject) => {
    // destruir instancia previa
    if (wavesurfer) { wavesurfer.destroy(); }

    const _wave_color = '#909090ff';
    const _progress_Color = '#5d5d5dff';
    const _cursor_color = '#ddd5e9';

    const isEmptyPeaks = _peaks === 'empty';
    const peaksData = isEmptyPeaks ? new Array(1000).fill(0) : _peaks;

    if (audioPath.toLowerCase().endsWith('.mp4')) {
      crearVideoPlayer(audioPath);
      wavesurfer = WaveSurfer.create({
        container: '#waveform',
        waveColor: _wave_color,
        progressColor: _progress_Color,
        cursorColor: _cursor_color,
        minPxPerSec: 0.1,
        height: 30,
        responsive: true,
        media: videoPlayer,
        partialRender: true,
        fillParent: true,
        hideScrollbar: true,
        autoScroll: false, 
        peaks: peaksData
      });

    } else {
      apagarVideoPlayer();
      wavesurfer = WaveSurfer.create({
        container: '#waveform',
        waveColor: _wave_color,
        progressColor: _progress_Color,
        cursorColor: _cursor_color,
        minPxPerSec: 0.1,
        height: 30,
        responsive: true,
        partialRender: true,
        fillParent: true,
        hideScrollbar: true,
        autoScroll: false, 

        peaks: peaksData
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

      try {
        if (!audioContext) {
          audioContext = new AudioContext();
          eqFilters = eqBands.map((band, i) => {
            const filter = audioContext.createBiquadFilter();
            filter.type = band <= 32 ? 'lowshelf' : band >= 16000 ? 'highshelf' : 'peaking';
            filter.Q.value = 1;
            filter.frequency.value = band;
            filter.gain.value = parseFloat(sliders[i].value);
            return filter;
          });
        }

        if (mediaNode) {
          try { mediaNode.disconnect(); } catch (e) { }
        }

        const audio = wavesurfer.getMediaElement();

        try {
          mediaNode = audioContext.createMediaElementSource(audio);
        } catch (e) {
          return reject(e);
        }

        const equalizer = eqFilters.reduce((prev, curr) => {
          prev.connect(curr);
          return curr;
        }, mediaNode);

        equalizer.connect(audioContext.destination);

        // ✅ Promesa resuelta aquí, cuando todo está listo
        resolve(wavesurfer);

      } catch (err) {
        reject(err);
      }
    });

    wavesurfer.on('finish', () => {
      if (stopAfterCheckbox.checked) {
        stopAfterCheckbox.checked = false;
        document.title = originalTitle;
        songPath = null;
        clearPlayingStyle();
        return;
      }

      if (playlist.length > 0) {
        currentSongIndex = (currentSongIndex + 1) % playlist.length;
        playSong(currentSongIndex);
      } else {
        document.title = originalTitle;
        songPath = null;
        statusBar.textContent = originalTitle;
        clearPlayingStyle();
      }
    });

    wavesurfer.on('play', () => {
      wavesurfer.setVolume(isMuted ? 0 : currentVolume);
      const currentSong = playlist[currentSongIndex];
      if (currentSong) {
        console.log(`Is playing: ${songPath}`);
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
      statusBar.textContent = `Error al reproducir: ${errMsg}`;

      if (playlist.length > 0) {
        currentSongIndex = (currentSongIndex + 1) % playlist.length;
        playSong(currentSongIndex);
      } else {
        document.title = originalTitle;
        songPath = null;
        statusBar.textContent = originalTitle;
        clearPlayingStyle();
      }
      reject(errMsg);
    });
  });
}

async function playSong(index) {
  if (playlist.length === 0) return;

  songPath = playlist[index].path || playlist[index];
  currentSongIndex = index;

  try {
    await initWaveform(songPath); // ⏳ Espera a que esté todo listo
    wavesurfer.setVolume(volumeSlider.value / 100);
    wavesurfer.play();

    updatePlaylistUI();
    console.log(`Is playing: ${songPath}`);
    document.title = getNameAndYear(songPath);
  } catch (error) {
    console.error("Error al inicializar waveform:", error);
    statusBar.textContent = "Error al iniciar la canción.";
  }
}
