
// cargar arbol al terminar cargar html
window.addEventListener('DOMContentLoaded', async () => {

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
        stopFolderUpdate = false;

        await loadPlaylistFromFolder(node.path);
        window.electronAPI.selectFolder(node.path);
        currentOpenFolder = node.path;

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
          await loadPlaylistFromArray(songs, 'xmas-all', false, "cilckNodeXmas"); // cacheKey claro 'xmas-all'

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
