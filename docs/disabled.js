// ---------------------------------------------------------------------------
// Disabled
// ---------------------------------------------------------------------------

// <!-- <button id="toggleAutoPlayBtn">AutoPlay: ON</button> -->
// <!-- <button id="clear">Clear Playlist</button> -->
// const toggleAutoPlayBtn = document.getElementById('toggleAutoPlayBtn');
// const clearPlbtn = document.getElementById('clear');

// toggleAutoPlayBtn.addEventListener('click', () => {
//   autoPlay = !autoPlay;
//   toggleAutoPlayBtn.textContent = `AutoPlay: ${autoPlay ? 'OFF' : 'ON'}`;
// });

// clearPlbtn.addEventListener('click', () => {  // vaciar playlist
//   playlist = [];
//   updatePlaylistUI();
//   document.title = originalTitle;
//   if (wavesurfer) {
//     wavesurfer.stop();
//     wavesurfer.destroy();
//     wavesurfer = null;
//   }
// });

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