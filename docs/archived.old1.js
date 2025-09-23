// Devuelve un árbol de años -> carpetas permitidas (solo las 5 tipos)
ipcMain.handle('get-move-tree', async (event, baseRoot) => {
  const base = baseRoot || ROOT_YEARS_PATH;
  const result = [];
  try {
    const entries = await fs.readdir(base, { withFileTypes: true });
    // detecta directorios de años con 4 dígitos en rango 2004..currentYear (o XMAS_END_YEAR)
    const currentYear = new Date().getFullYear();
    const minYear = Math.max(2004, XMAS_START_YEAR);
    const maxYear = Math.max(currentYear, XMAS_END_YEAR);
    for (const dirent of entries) {
      if (!dirent.isDirectory()) continue;
      if (!/^\d{4}$/.test(dirent.name)) continue;
      const yearNum = parseInt(dirent.name, 10);
      if (yearNum < minYear || yearNum > maxYear) continue;

      const yearPath = path.join(base, dirent.name);
      const prefix = String(yearNum - 2003).padStart(2, '0');

      const allowedChildren = ['music.registry.album.package', 'music.theme'];

      const candidates = [
        `${prefix}. music.main`,
        `${prefix}. music.registry.album.package`,
        `${prefix}. music.registry.base`,
        `${prefix}. music.theme`,
        `${prefix}. music.xmas`
      ];

      const children = [];
      for (const c of candidates) {
        const full = path.join(yearPath, c);
        try {
          // await fs.access(full);
          // children.push({ name: c, path: full });
          await fs.access(full);
          // Solo agregar nodos (subcarpetas) si está en allowedChildren
          const basename = c.split('. ').pop(); // obtiene 'music.registry.album.package' etc
          let subnodes = [];
          if (allowedChildren.includes(basename)) {
            // leer subcarpetas dentro
            const entries = await fs.readdir(full, { withFileTypes: true });
            subnodes = entries
              .filter(e => e.isDirectory())
              .map(e => ({ name: e.name, path: path.join(full, e.name), nodes: [] }));
          }
          children.push({ name: c, path: full, nodes: subnodes });
        } catch (e) {
          // no existe -> ignorar
        }
      }

      result.push({ name: dirent.name, path: yearPath, nodes: children });
    }
  } catch (err) {
    console.error('Error en get-move-tree:', err);
  }
  return result;
});

// Crear carpeta nueva (parent = ruta absoluta, name = nombre nuevo)
ipcMain.handle('create-folder', async (event, { parent, name }) => {
  try {
    if (!parent || !name) return { success: false, error: 'Parámetros inválidos' };

    // validar que no se cree dentro de carpetas con sufijos prohibidos
    const forbiddenSuffixes = ['.main', '.registry.base', '.xmas'];
    const parentBasename = path.basename(parent);
    if (forbiddenSuffixes.some(suf => parentBasename.endsWith(suf))) {
      return { success: false, error: 'No se permite crear subcarpetas dentro de esta carpeta' };
    }

    const newPath = path.join(parent, name);
    try {
      await fs.access(newPath);
      return { success: false, error: 'La carpeta ya existe' };
    } catch (_) {
      // no existe -> crear
    }

    await fs.mkdir(newPath, { recursive: true });
    return { success: true, path: newPath };
  } catch (err) {
    console.error('Error create-folder:', err);
    return { success: false, error: err.message || String(err) };
  }
});

// Helper: genera nombre único si el archivo destino ya existe
async function ensureUniqueDest(destFull) {
  try {
    await fs.access(destFull);
    // existe -> generar sufijo
    const dir = path.dirname(destFull);
    const baseName = path.basename(destFull);
    const ext = baseName.includes('.') ? baseName.substring(baseName.lastIndexOf('.')) : '';
    const nameOnly = baseName.replace(ext, '');
    // iterar sufijos (name (1).ext)
    for (let i = 1; i < 1000; i++) {
      const candidate = path.join(dir, `${nameOnly} (${i})${ext}`);
      try {
        await fs.access(candidate);
        continue;
      } catch (e) {
        return candidate;
      }
    }
    // fallback: retornar el original si algo falla
    return destFull;
  } catch (e) {
    // no existe -> usar tal cual
    return destFull;
  }
}

// Helper: mover con fallback copy+unlink en caso de EXDEV
async function safeMove(oldPath, newPath) {
  try {
    await fs.rename(oldPath, newPath);
    return;
  } catch (err) {
    // si es cross-device -> fallback
    if (err && err.code === 'EXDEV') {
      // copiar y luego borrar
      await fs.copyFile(oldPath, newPath);
      await fs.unlink(oldPath);
      return;
    }
    // otro error -> rethrow
    throw err;
  }
}

// Mover varios archivos con reporting por progress IPC
ipcMain.handle('move-files', async (event, { files, dest }) => {
  const moved = []; // { oldPath, newPath }
  try {
    if (!Array.isArray(files) || !dest) {
      return { success: false, error: 'Parámetros inválidos' };
    }

    // preparar lista y asegurarse destino existe
    try { await fs.access(dest); } catch (e) { await fs.mkdir(dest, { recursive: true }); }

    const total = files.length;
    for (let i = 0; i < total; i++) {
      const oldPath = files[i];
      const base = path.basename(oldPath);
      const candidate = path.join(dest, base);
      const unique = await ensureUniqueDest(candidate);

      // report progress (comenzando)
      win.webContents.send('move-progress', { current: i + 1, total, message: `Moviendo ${base} → ${path.basename(unique)}` });

      try {
        await safeMove(oldPath, unique);
        moved.push({ oldPath, newPath: unique });
      } catch (err) {
        console.error(`Error moviendo ${oldPath} -> ${unique}:`, err);
        // reportar error y continuar con siguiente
        win.webContents.send('move-progress', { current: i + 1, total, message: `Error moviendo ${base}: ${err.message || err}` });
      }
    }

    // Después de mover, notificar a renderer que terminó
    win.webContents.send('move-done', { success: true, moved });

    // Opcional: solicitar al renderer refrescar carpetas afectadas (empujar folder-updated)
    // Agrupar por carpeta origen
    const byOrigin = new Map();
    for (const item of moved) {
      const originFolder = path.dirname(item.oldPath);
      if (!byOrigin.has(originFolder)) byOrigin.set(originFolder, []);
      byOrigin.get(originFolder).push(item);
    }
    // enviar folder-updated para cada origen (lista actualizada de archivos)
    for (const [origin] of byOrigin) {
      try {
        const entries = await fs.readdir(origin, { withFileTypes: true });
        const filesNow = entries
          .filter(f => f.isFile() && (f.name.toLowerCase().endsWith('.mp3') || f.name.toLowerCase().endsWith('.mp4')))
          .map(f => ({ name: f.name, path: `${origin}\\${f.name}` }));
        win.webContents.send('folder-updated', { folderPath: origin, files: filesNow });
      } catch (e) {
        // carpeta pudo haber desaparecido -> enviar vacío
        win.webContents.send('folder-updated', { folderPath: origin, files: [] });
      }
    }

    // también enviar folder-updated para el destino
    try {
      const destEntries = await fs.readdir(dest, { withFileTypes: true });
      const destFiles = destEntries
        .filter(f => f.isFile() && (f.name.toLowerCase().endsWith('.mp3') || f.name.toLowerCase().endsWith('.mp4')))
        .map(f => ({ name: f.name, path: `${dest}\\${f.name}` }));
      win.webContents.send('folder-updated', { folderPath: dest, files: destFiles });
    } catch (e) {
      // ignore
    }

    return { success: true, moved };
  } catch (err) {
    console.error('Error move-files:', err);
    win.webContents.send('move-done', { success: false, error: err.message || String(err) });
    return { success: false, error: err.message || String(err) };
  }
});


  // Move dialog / operations
//   getMoveTree: async (baseRoot) => {
//     try { return await ipcRenderer.invoke('get-move-tree', baseRoot); }
//     catch (e) { console.error('getMoveTree error', e); return []; }
//   },
//   createFolder: async (payload) => {
//     try { return await ipcRenderer.invoke('create-folder', payload); }
//     catch (e) { console.error('createFolder error', e); return { success: false, error: e.message }; }
//   },
//   moveFiles: async (payload) => {
//     try { return await ipcRenderer.invoke('move-files', payload); }
//     catch (e) { console.error('moveFiles error', e); return { success: false, error: e.message }; }
//   },

//   // progreso y finalización (main -> renderer)
//   onMoveProgress: (callback) => {
//     ipcRenderer.removeAllListeners('move-progress');
//     ipcRenderer.on('move-progress', (event, progress) => callback(progress));
//   },
//   onMoveDone: (callback) => {
//     ipcRenderer.removeAllListeners('move-done');
//     ipcRenderer.on('move-done', (event, result) => callback(result));
//   },

// ----------------------------------------------------------------------------------


// // ---------- modal helpers ----------
// function ensureMoveModalExists() {
//   const modal = document.getElementById('moveModal');
//   if (!modal) return null;
//   return modal;
// }

// function deselec_folder_tree() {
//   document.querySelectorAll('#tree li.open').forEach(function (li) {
//     li.classList.remove('open');
//   });
// }

// // Renderiza el árbol de move (años -> carpetas permitidas)
// async function renderMoveTree(container, baseRoot) {
//   container.innerHTML = '<div>Cargando...</div>';
//   const tree = await window.electronAPI.getMoveTree(baseRoot);
//   container.innerHTML = '';

//   if (!Array.isArray(tree) || tree.length === 0) {
//     container.innerHTML = '<div>No se encontraron carpetas.</div>';
//     return;
//   }

//   function createNodeElement(node) {
//     const el = document.createElement('div');
//     el.style.marginBottom = '4px';

//     const header = document.createElement('div');
//     header.textContent = node.name;
//     header.style.cursor = 'pointer';
//     header.style.padding = '4px 6px';
//     header.dataset.path = node.path;
//     header.dataset.expanded = 'false';

//     const childrenWrap = document.createElement('div');
//     childrenWrap.style.paddingLeft = '12px';
//     childrenWrap.style.display = 'none';

//     // click seleccion
//     header.addEventListener('click', (e) => {
//       e.stopPropagation();

//       // alternar expand/collapse
//       const expanded = header.dataset.expanded === 'true';
//       header.dataset.expanded = expanded ? 'false' : 'true';
//       childrenWrap.style.display = expanded ? 'none' : 'block';

//       // marcar selección
//       container.querySelectorAll('.move-target-selected').forEach(el => el.classList.remove('move-target-selected'));
//       header.classList.add('move-target-selected');
//       document.getElementById('moveModalCurrentPath').textContent = node.path;
//     });

//     // Recursivo si tiene hijos
//     if (Array.isArray(node.nodes) && node.nodes.length > 0) {
//       for (const child of node.nodes.sort((a, b) => a.name.localeCompare(b.name))) {
//         childrenWrap.appendChild(createNodeElement(child));
//       }
//     }

//     el.appendChild(header);
//     el.appendChild(childrenWrap);
//     return el;
//   }

//   for (const yearNode of tree.sort((a, b) => a.name.localeCompare(b.name))) {
//     const yearEl = document.createElement('div');
//     yearEl.style.marginBottom = '8px';

//     const yearHeader = document.createElement('div');
//     yearHeader.textContent = yearNode.name;
//     yearHeader.style.fontWeight = '600';
//     yearHeader.style.cursor = 'pointer';
//     yearHeader.style.padding = '4px 6px';
//     yearHeader.dataset.expanded = 'false';

//     const childWrap = document.createElement('div');
//     childWrap.style.paddingLeft = '12px';
//     childWrap.style.display = 'none';

//     yearHeader.addEventListener('click', () => {
//       const expanded = yearHeader.dataset.expanded === 'true';
//       yearHeader.dataset.expanded = expanded ? 'false' : 'true';
//       childWrap.style.display = expanded ? 'none' : 'block';
//     });

//     if (Array.isArray(yearNode.nodes)) {
//       for (const c of yearNode.nodes.sort((a, b) => a.name.localeCompare(b.name))) {
//         childWrap.appendChild(createNodeElement(c));
//       }
//     }

//     yearEl.appendChild(yearHeader);
//     yearEl.appendChild(childWrap);
//     container.appendChild(yearEl);
//   }
// }

// // abrir modal (devuelve selected destPath o null si cancela)
// function openMoveDialog(files) {
//   return new Promise(async (resolve) => {
//     const modal = ensureMoveModalExists();
//     if (!modal) return resolve(null);

//     const container = document.getElementById('moveTreeContainer');
//     const btnClose = document.getElementById('moveModalClose');
//     const btnGoUp = document.getElementById('btnGoUp');
//     const btnNew = document.getElementById('btnNewFolder');
//     const curPathLabel = document.getElementById('moveModalCurrentPath');
//     const cancelBtn = document.getElementById('moveCancelBtn');
//     const confirmBtn = document.getElementById('moveConfirmBtn');

//     // current selection
//     curPathLabel.textContent = '';
//     await renderMoveTree(container, ROOT_YEARS_PATH);

//     modal.style.display = 'flex';

//     // handlers
//     function cleanup() {
//       btnClose.removeEventListener('click', onCancel);
//       cancelBtn.removeEventListener('click', onCancel);
//       confirmBtn.removeEventListener('click', onConfirm);
//       btnNew.removeEventListener('click', onNew);
//       btnGoUp.removeEventListener('click', onGoUp);
//     }

//     function onCancel() {
//       cleanup();
//       modal.style.display = 'none';
//       resolve(null);
//     }

//     async function onConfirm() {
//       const selectedEl = container.querySelector('.move-target-selected');
//       if (!selectedEl) {
//         alert('Selecciona una carpeta destino.');
//         return;
//       }
//       const dest = selectedEl.dataset.path;
//       cleanup();
//       modal.style.display = 'none';
//       resolve(dest);
//     }

//     async function onNew() {
//       // Solo permitir crear dentro de una carpeta que no sea .main/.registry.base/.xmas
//       const selectedEl = container.querySelector('.move-target-selected');
//       if (!selectedEl) {
//         alert('Selecciona primero la carpeta padre donde crear la nueva carpeta (por ejemplo, una carpeta de año).');
//         return;
//       }
//       const parent = selectedEl.dataset.path;
//       // verificar sufijos prohibidos
//       const allowedCreate = ['music.registry.album.package', 'music.theme'];
//       const parentName = parent.split(/[\\/]/).pop();
//       if (!allowedCreate.some(s => parentName.endsWith(s))) {
//         alert('No se permite crear subcarpetas dentro de esta carpeta.');
//         return;
//       }

//       // mostrar input inline simple
//       const name = await customPrompt('Nombre de la nueva carpeta:');
//       if (!name || !name.trim()) return;
//       const resp = await window.electronAPI.createFolder({ parent, name: name.trim() });
//       if (!resp || !resp.success) {
//         alert('No se pudo crear la carpeta: ' + (resp && resp.error ? resp.error : 'error'));
//         return;
//       }
//       // refrescar árbol
//       await renderMoveTree(container, ROOT_YEARS_PATH);
//       // seleccionar la nueva carpeta si aparece
//       // (simple: buscar exact match path)
//       const newEl = container.querySelector(`[data-path="${resp.path.replace(/\\/g, '\\\\')}"]`);
//       // no garantizado, pero el usuario puede volver a seleccionar manualmente
//     }

//     function onGoUp() {
//       // para nuestro árbol año->tipos no hay "arriba" profundo; podemos resetear selección
//       container.querySelectorAll('.move-target-selected').forEach(el => el.classList.remove('move-target-selected'));
//       curPathLabel.textContent = '';
//     }

//     btnClose.addEventListener('click', onCancel);
//     cancelBtn.addEventListener('click', onCancel);
//     confirmBtn.addEventListener('click', onConfirm);
//     btnNew.addEventListener('click', onNew);
//     btnGoUp.addEventListener('click', onGoUp);
//   });
// }

// // Mover archivos: orquestación en renderer
// async function startMoveFilesFlow(files) {
//   if (!Array.isArray(files) || files.length === 0) return;

//   // pedir destino
//   const dest = await openMoveDialog(files);
//   if (!dest) return;

//   // confirmar con el usuario (opcional)
//   const ok = confirm(`Mover ${files.length} archivo(s) a:\n${dest}\n\n¿Continuar?`);
//   if (!ok) return;

//   // Preparar estado: si se está reproduciendo alguno de los archivos, capturamos tiempo/estado
//   const playingIndex = playlist.findIndex(p => p.path === songPath);
//   const playingAffected = files.includes(songPath);
//   let savedTime = 0;
//   let wasPlaying = false;
//   if (playingAffected && wavesurfer) {
//     try { savedTime = wavesurfer.getCurrentTime() || 0; } catch (e) { savedTime = 0; }
//     wasPlaying = wavesurfer.isPlaying();
//   }

//   // disable watchdog para no reaccionar a los events que emite el watcher mientras movemos
//   disableWatchdog = true;

//   // Mostrar barra de progreso global (usar tu showProgressNotification)
//   showProgressNotification('Iniciando movida...', 0);

//   // escuchar progreso y done
//   window.electronAPI.onMoveProgress((prog) => {
//     const percent = (prog.total && prog.current) ? (prog.current / prog.total) : 0;
//     showProgressNotification(prog.message || 'Moviendo...', percent);
//   });

//   // escuhcar si ya acabo
//   window.electronAPI.onMoveDone(async (result) => {
//     // resultado: { success: true, moved: [{oldPath,newPath}, ...] }
//     disableWatchdog = false;

//     if (!result || !result.success) {
//       showProgressNotification(`Error moviendo archivos: ${result && result.error ? result.error : 'error'}`, 1);
//       return;
//     }

//     // const moved = result.moved || [];

//     // // 1) actualizar playlist: quitar archivos movidos (por oldPath) de la playlist actual
//     // const oldSet = new Set(moved.map(m => m.oldPath));
//     // playlist = playlist.filter(p => !oldSet.has(p.path));

//     // // 2) actualizar cache para la carpeta abierta (si aplica)
//     // if (typeof currentOpenFolder === 'string' && currentOpenFolder !== 'xmas-all') {
//     //   // Guardar cache actualizada
//     //   playlistCache[currentOpenFolder] = playlist;
//     //   try { localStorage.setItem('playlistCache', JSON.stringify(playlistCache)); } catch (e) { /* ignore */ }
//     // }

//     // // 3) Si la canción en reproducción fue movida, actualizarla al nuevo path y recargar waveform
//     // if (playingAffected) {
//     //   const mapping = moved.find(m => m.oldPath === songPath);
//     //   if (mapping && mapping.newPath) {
//     //     const newPath = mapping.newPath;
//     //     songPath = newPath;
//     //     // volver a cargar el waveform en la nueva ruta y restaurar posición/estado
//     //     initWaveform(newPath);
//     //     wavesurfer.on('ready', () => {
//     //       try {
//     //         const total = wavesurfer.getDuration() || 0;
//     //         if (total > 0 && savedTime > 0) {
//     //           wavesurfer.seekTo(Math.min(1, savedTime / total));
//     //         }
//     //         if (wasPlaying) wavesurfer.play();
//     //       } catch (e) {}
//     //     });
//     //   } else {
//     //     // si no hay mapping, entonces la canción desapareció: detener
//     //     if (wavesurfer) {
//     //       wavesurfer.stop();
//     //       songPath = null;
//     //       currentSongIndex = -1;
//     //     }
//     //   }
//     // }

//     // updatePlaylistUI();
//     // showProgressNotification(`Movido ${moved.length} archivo(s)`, 1);
//   });

//   // Ejecutar movida (invocar main)
//   const res = await window.electronAPI.moveFiles({ files, dest });
//   if (!res || !res.success) {
//     disableWatchdog = false;
//     showProgressNotification(`Error: ${res && res.error ? res.error : 'No se pudo mover'}`, 1);
//   }
// }

// function _setOpenFolder(pathStr) {
//   currentOpenFolder = pathStr;
// }

  // <!-- Move modal -->
  // <div id="moveModal"
  //   style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); align-items:center; justify-content:center; z-index:9999;">
  //   <div style="background:#fff; padding:12px; border-radius:8px; width:720px; max-height:80vh; overflow:auto;">
  //     <div style="display:flex; justify-content:space-between; align-items:center;">
  //       <strong>Seleccionar carpeta destino</strong>
  //       <button id="moveModalClose">✖</button>
  //     </div>

  //     <div style="margin-top:8px; display:flex; gap:8px;">
  //       <button id="btnGoUp">./</button>
  //       <button id="btnNewFolder">/+</button>
  //       <div style="flex:1; text-align:right; font-size:12px; color:#666;" id="moveModalCurrentPath"></div>
  //     </div>

  //     <hr />

  //     <div id="moveTreeContainer"
  //       style="max-height:50vh; overflow:auto; border:1px solid #eee; padding:8px; margin-bottom:8px;">
  //       <!-- Contenido creado dinámicamente -->
  //     </div>

  //     <div style="display:flex; justify-content:flex-end; gap:8px;">
  //       <button id="moveCancelBtn">Cancelar</button>
  //       <button id="moveConfirmBtn">Mover</button>
  //     </div>
  //   </div>
  // </div>