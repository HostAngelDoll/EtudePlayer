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


// async function loadPlaylistSongs(songs) {
//   // Crear objetos con name, path y duration
//   playlist = await Promise.all(songs.map(async f => {
//     const songPath = typeof f === 'string' ? f : f.path;
//     const audio = new Audio(songPath);
//     await new Promise(resolve => {
//       audio.addEventListener('loadedmetadata', resolve, { once: true });
//     });
//     const minutes = Math.floor(audio.duration / 60);
//     const seconds = Math.floor(audio.duration % 60).toString().padStart(2, '0');
//     return {
//       name: f.name || f.split('\\').pop(),
//       path: songPath,
//       duration: `${minutes}:${seconds}`
//     };
//   }));

//   updatePlaylistUI();
// }


// async function loadPlaylistSongs(songs, folderPath) {
//   // Verificar si ya tenemos cache
//   if (playlistCache[folderPath] && playlistCache[folderPath].length > 0) {
//     console.log("si hay cache en '" + folderPath + "'")
//     playlist = playlistCache[folderPath];
//     updatePlaylistUI();
//     return;
//   }

//   playlist = [];

//   for (let i = 0; i < songs.length; i++) {
//     const f = songs[i];
//     const songPath = typeof f === "string" ? f : f.path;
//     const audio = new Audio(songPath);

//     await new Promise(resolve =>
//       audio.addEventListener("loadedmetadata", resolve, { once: true })
//     );

//     const minutes = Math.floor(audio.duration / 60);
//     const seconds = Math.floor(audio.duration % 60).toString().padStart(2, "0");

//     playlist.push({
//       name: f.name || f.split("\\").pop(),
//       path: songPath,
//       duration: `${minutes}:${seconds}`
//     });

//     // 👇 Aquí usamos tu función en cada iteración
//     showProgressNotification(
//       `Cargando ${i + 1} de ${songs.length}`,
//       (i + 1) / songs.length
//     );
//   }

//   // Guardar cache solo si hay canciones válidas
//   if (playlist.length > 0) {
//     playlistCache[folderPath] = playlist;
//     localStorage.setItem("playlistCache", JSON.stringify(playlistCache));
//   }

//   updatePlaylistUI();
// }


// // Cargar árbol y manejar clicks en nodos
// window.addEventListener('DOMContentLoaded', async () => {
//   try {
//     const savedCache = localStorage.getItem('playlistCache');
//     if (savedCache) {
//       playlistCache = JSON.parse(savedCache) || {};
//       console.log('playlistCache restaurado. Claves:', Object.keys(playlistCache));
//     }
//   } catch (err) {
//     console.warn('No se pudo restaurar playlistCache:', err);
//     playlistCache = {};
//   }

//   const data = await window.electronAPI.getPlaylists();
//   const treeContainer = document.getElementById('tree');

//   function createNode(node) {
//     const li = document.createElement('li');
//     li.textContent = node.name;

//     // Subnodos
//     if (node.nodes && node.nodes.length > 0) {
//       const ul = document.createElement('ul');
//       node.nodes.forEach(child => ul.appendChild(createNode(child)));
//       li.appendChild(ul);
//     }

//     // Click para abrir/cerrar subnodos
//     li.addEventListener('click', async (e) => {
//       e.stopPropagation();

//       // 1. Activar solo este nodo
//       setActiveFolder(li);

//       // 2. Expandir/colapsar si tiene hijos
//       if (li.querySelector('ul')) {
//         // Si es un año (los nodos que tienen subcarpetas principales)
//         if (!li.parentElement.closest('li')) {
//           // cerrar todos los demás años
//           document.querySelectorAll('#tree > ul > li').forEach(yearLi => {
//             if (yearLi !== li) yearLi.classList.remove('open');
//           });
//         }

//         // abrir y cerrar este
//         li.classList.toggle('open');
//       }

//       // Si es carpeta de música, cargar canciones bajo demanda
//       //// if (node.type === 'folder' && !node.loadedSongs && node.path)
//       if (node.type === 'folder' && node.path) {
//         // const songs = await window.electronAPI.getSongs(node.path);

//         // playlist = songs.map(f => ({ name: f, path: `${node.path}\\${f}` }));
//         // updatePlaylistUI();

//         // await loadPlaylistSongs(songs.map(f => ({ name: f, path: `${node.path}\\${f}` })));
//         await loadPlaylistFromFolder(node.path);

//         node.loadedSongs = true; // marca que ya cargamos
//         if (autoPlay && playlist.length > 0) playSong(0); // solo si el flag autoPlay está activo
//       }

//       // 🎄 Subnodo Xmas especial
//       if (node.type === 'xmas-all' && !node.loadedSongs) {
//         node.loadedSongs = true; // marcar antes de await para evitar clics múltiples

//         li.addEventListener('click', async (e) => {
//           e.stopPropagation();
//           // const songs = await ipc|Renderer.invoke('get-xmas-songs', node.path);
//           const songs = await window.electronAPI.getXmasSongs(node.path);

//           playlist = songs.map(f => ({
//             name: f.split('\\').pop(), // solo nombre de archivo
//             path: f // ruta completa
//           }));

//           // updatePlaylistUI();

//           // await loadPlaylistSongs(songs.map(f => ({ name: f, path: `${node.path}\\${f}` })));
//           await loadPlaylistFromArray(songs, 'xmas-all'); // cacheKey claro 'xmas-all'

//           // playlist.sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));

//           if (autoPlay && playlist.length > 0) playSong(0);
//         });
//       }

//     });

//     return li;
//   }

//   const ul = document.createElement('ul');

//   data.playlists.forEach(year => {
//     ul.appendChild(createNode({ name: year.year, nodes: year.nodes }));
//   });

//   ul.appendChild(createNode(data.xmas));

//   treeContainer.appendChild(ul);
// });


// Handler de IPC actualizado del main.js
// ipcMain.handle('get-playlists', async () => {
//   const rootPath = "E:\\_Internal";
//   try {
//     const yearDirs = await fs.readdir(rootPath, { withFileTypes: true });
//     const years = yearDirs.filter(d => d.isDirectory() && /^\d{4}$/.test(d.name))
//       .map(d => d.name);

//     const playlists = [];

//     for (const year of years) {
//       const yearPath = path.join(rootPath, year);
//       const prefix = String(year - 2003).padStart(2, '0');
//       const nodes = [];

//       // Main
//       const mainTemp = path.join(yearPath, `${prefix}. music.main`);
//       try {
//         await fs.access(mainTemp);
//         const mainNodes = await getFolderNodes(mainTemp);
//         nodes.push({ name: 'Main', type: 'folder', path: mainTemp, nodes: mainNodes });
//       } catch { } // si no existe, no hace nada

//       // Album Package
//       const albumPath = path.join(yearPath, `${prefix}. music.registry.album.package`);
//       try {
//         await fs.access(albumPath);
//         const albumNodes = await getFolderNodes(albumPath);
//         nodes.push({ name: 'Album Package', type: 'folder', path: albumPath, nodes: albumNodes });
//       } catch { }

//       // Base
//       const basePath = path.join(yearPath, `${prefix}. music.registry.base`);
//       try {
//         await fs.access(basePath);
//         nodes.push({ name: 'Base', type: 'folder', path: basePath, nodes: [] });
//       } catch { }

//       // Theme
//       const themePath = path.join(yearPath, `${prefix}. music.theme`);
//       try {
//         await fs.access(themePath);
//         const themeNodes = await getFolderNodes(themePath);
//         nodes.push({ name: 'Theme', type: 'folder', path: themePath, nodes: themeNodes });
//       } catch { }

//       playlists.push({ year, nodes });
//     }

//     // Nodo especial Xmas
//     const xmasNode = {
//       name: 'Xmas',
//       type: 'folder',
//       path: null,
//       nodes: [
//         { name: 'All Songs', type: 'xmas-all', path: rootPath }
//       ]
//     };

//     return { playlists, xmas: xmasNode };

//   } catch (err) {
//     console.error('Error obteniendo playlists:', err);
//     return { playlists: [], xmas: null };
//   }
// });


// funcion de main.js sin implementacion de vigilancia
// ipcMain.handle('get-xmas-songs', async (event, rootPath) => { //ext check
//   try {
//     const yearDirs = await fs.readdir(rootPath, { withFileTypes: true });
//     const years = yearDirs.filter(d => d.isDirectory() && /^\d{4}$/.test(d.name))
//       .map(d => d.name);

//     let allSongs = [];

//     for (const year of years) {
//       const prefix = String(year - 2003).padStart(2, '0');
//       const xmasPath = path.join(rootPath, year, `${prefix}. music.xmas`);

//       try {
//         await fs.access(xmasPath);
//         const entries = await fs.readdir(xmasPath, { withFileTypes: true });
//         const mediaFiles = entries
//           .filter(f => f.isFile() && (f.name.toLowerCase().endsWith('.mp3') || f.name.toLowerCase().endsWith('.mp4')))
//           .map(f => path.join(xmasPath, f.name));
//         allSongs = allSongs.concat(mediaFiles);

//       } catch {
//         // carpeta xmas no existe para este año, continuar
//       }
//     }

//     return allSongs;
//   } catch (err) {
//     console.error(`Error obteniendo canciones Xmas desde ${rootPath}:`, err);
//     return [];
//   }
// });

// renderer.js
// cuando se renombra el archivo pero watchdog ya hace el trabajo
// window.electronAPI.onFileRenamed(({ oldPath, newPath }) => {
//   // Actualizar playlist
//   const song = playlist.find(f => f.path === oldPath);
//   if (song) {
//     song.path = newPath;
//     song.name = newPath.split(/[/\\]/).pop();
//   }

//   loadPlaylistFromArray(playlist); // vuelve a renderizar
// });

// preload.js
// onFileRenamed: (callback) => {
//   ipcRenderer.removeAllListeners("file-renamed");
//   ipcRenderer.on("file-renamed", (_, payload) => callback(payload));
// },