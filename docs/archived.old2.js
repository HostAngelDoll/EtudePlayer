// Si customPrompt ya existe, lo usa. (No sobreescribe.)
if (typeof customPrompt !== 'function') {
  function customPrompt(message, defaultValue = "") {
    return new Promise((resolve) => {
      const v = window.prompt(message, defaultValue);
      resolve(v);
    });
  }
}

let _moveSelectedFiles = [];
let _moveTree = [];
let _currentSelectedDest = null;
const parentMap = {}; // path -> parentPath (construido al renderizar)

const moveModal = document.getElementById('moveModal');
const moveTreeRoot = document.getElementById('moveTreeRoot');
const moveBtnUp = document.getElementById('moveBtnUp');
const moveBtnNew = document.getElementById('moveBtnNew');
const moveConfirmBtn = document.getElementById('moveConfirmBtn');
const moveCancelBtn = document.getElementById('moveCancelBtn');

function showMoveTooltip(message, percent = 0) {
  const tip = document.getElementById('moveProgressTooltip');
  const msg = document.getElementById('moveProgressMessage');
  const fill = document.getElementById('moveProgressFill');
  msg.textContent = message || 'Moviendo archivos...';
  fill.style.width = `${Math.round(percent)}%`;
  tip.style.display = 'block';
}

function hideMoveTooltip() {
  const tip = document.getElementById('moveProgressTooltip');
  tip.style.display = 'none';
}

// Construir nodo recursivo. Devuelve <li>
function buildNodeElement(node, parentPath = null) {
  const li = document.createElement('li');
  li.dataset.path = node.path;
  li.dataset.canCreate = node.canCreate ? '1' : '0';
  li.dataset.hasChildren = (Array.isArray(node.nodes) && node.nodes.length > 0) ? '1' : '0';

  // expander
  const exp = document.createElement('span');
  exp.className = 'expander';
  exp.textContent = node.nodes && node.nodes.length > 0 ? '▶' : '';
  li.appendChild(exp);

  // label
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = node.name;
  li.appendChild(label);

  // set parent map
  if (parentPath) parentMap[node.path] = parentPath;

  // click handlers
  exp.addEventListener('click', (e) => {
    e.stopPropagation();
    if (node.nodes && node.nodes.length > 0) {
      li.classList.toggle('expanded');
      const childUl = li.querySelector('ul');
      if (childUl) childUl.style.display = childUl.style.display === 'block' ? 'none' : 'block';
    }
  });

  label.addEventListener('click', (e) => {
    e.stopPropagation();
    // seleccionar este nodo (visual)
    moveTreeRoot.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
    li.classList.add('selected');
    _currentSelectedDest = node.path;
    // si tiene children: expandir (comodidad)
    if (node.nodes && node.nodes.length > 0) {
      li.classList.add('expanded');
      const childUl = li.querySelector('ul');
      if (childUl) childUl.style.display = 'block';
    }
  });

  // children
  if (Array.isArray(node.nodes) && node.nodes.length > 0) {
    const childUl = document.createElement('ul');
    childUl.style.display = 'none'; // start collapsed
    for (const ch of node.nodes) {
      const chEl = buildNodeElement(ch, node.path);
      childUl.appendChild(chEl);
    }
    li.appendChild(childUl);
  }

  return li;
}

// Abrir diálogo con archivos seleccionados (array de paths)
async function openMoveDialog(selectedFiles) {
  _moveSelectedFiles = Array.from(selectedFiles || []);
  _moveTree = await window.electronAPI.getMoveTree();

  // limpiar estructura auxiliar
  parentMap = {}; // reinit - but parentMap declared const previously; instead reset keys:
  Object.keys(parentMap).forEach(k => delete parentMap[k]);

  moveTreeRoot.innerHTML = '';
  _currentSelectedDest = null;

  // Render por años, collapsed
  for (const yearNode of _moveTree) {
    const yearWrapper = document.createElement('div');
    yearWrapper.style.marginBottom = '6px';

    const header = document.createElement('div');
    header.className = 'year-header';
    header.textContent = yearNode.year;
    header.addEventListener('click', (e) => {
      e.stopPropagation();
      const yc = yearWrapper.querySelector('.year-children');
      if (yc) yc.classList.toggle('open');
    });
    yearWrapper.appendChild(header);

    const childrenContainer = document.createElement('div');
    childrenContainer.className = 'year-children';
    // build nodes under this year
    if (Array.isArray(yearNode.nodes) && yearNode.nodes.length > 0) {
      const ul = document.createElement('ul');
      for (const n of yearNode.nodes) {
        const li = buildNodeElement(n, yearNode.path);
        ul.appendChild(li);
      }
      childrenContainer.appendChild(ul);
    }
    yearWrapper.appendChild(childrenContainer);
    moveTreeRoot.appendChild(yearWrapper);
  }

  // show modal
  moveModal.style.display = 'flex';
  // scroll top
  const container = document.getElementById('moveTreeContainer');
  if (container) container.scrollTop = 0;
}

// Mover "Up" (./)
moveBtnUp.addEventListener('click', (e) => {
  if (!_currentSelectedDest) return;
  const parent = parentMap[_currentSelectedDest];
  if (!parent) return; // no parent
  _currentSelectedDest = parent;
  // visual highlight
  moveTreeRoot.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
  const match = Array.from(moveTreeRoot.querySelectorAll('li')).find(li => li.dataset.path === parent);
  if (match) {
    match.classList.add('selected');
    // ensure expanded ancestors are open
    let p = match.parentElement;
    while (p && p !== moveTreeRoot) {
      if (p.classList && p.classList.contains('year-children') && !p.classList.contains('open')) p.classList.add('open');
      if (p.tagName.toLowerCase() === 'li') {
        p.classList.add('expanded');
        const childUl = p.querySelector('ul');
        if (childUl) childUl.style.display = 'block';
      }
      p = p.parentElement;
    }
  }
});

// Crear nueva carpeta (/+)
moveBtnNew.addEventListener('click', async () => {
  const targetParent = _currentSelectedDest || (_moveTree[0] && _moveTree[0].path) || null;
  if (!targetParent) {
    alert('Seleccione una carpeta destino o navega hacia una carpeta válida.');
    return;
  }

  const lower = String(targetParent).toLowerCase();
  if (lower.endsWith('.music.main') || lower.endsWith('.music.registry.base') || lower.endsWith('.music.xmas')) {
    alert('No es posible crear carpetas dentro de esta carpeta.');
    return;
  }

  const newName = await customPrompt('Nombre de la nueva carpeta:', 'Nueva carpeta');
  if (!newName) return;

  const res = await window.electronAPI.createFolder({ parentPath: targetParent, folderName: newName });
  if (!res || !res.success) {
    alert('Error creando carpeta: ' + (res && res.error ? res.error : 'desconocido'));
    return;
  }

  // refrescar whole tree and expand parent
  await openMoveDialog(_moveSelectedFiles);
  // try to select new folder if exists
  const createdPath = res.path;
  const newEl = Array.from(moveTreeRoot.querySelectorAll('li')).find(li => li.dataset.path === createdPath);
  if (newEl) {
    newEl.classList.add('selected');
    _currentSelectedDest = createdPath;
  }
});

// Cancelar
moveCancelBtn.addEventListener('click', () => {
  moveModal.style.display = 'none';
});

// Confirmar mover
moveConfirmBtn.addEventListener('click', async () => {
  if (!_currentSelectedDest) {
    alert('Seleccione el destino donde mover los archivos.');
    return;
  }

  // Stop playback if currently playing file is being moved
  const playingPath = songPath;
  const toMove = _moveSelectedFiles;
  if (playingPath && toMove.includes(playingPath)) {
    try { if (wavesurfer) wavesurfer.stop(); } catch (e) { }
    songPath = null;
    clearPlayingStyle();
  }

  // Quitar inmediatamente las entradas de la playlist UI para evitar glitches
  playlist = playlist.filter(p => !toMove.includes(p.path));
  updatePlaylistUI();

  disableWatchdog = true;

  const resp = await window.electronAPI.moveFiles({ files: toMove, destPath: _currentSelectedDest });
  if (resp && resp.success === false) {
    alert('Error iniciando operación de movida: ' + (resp.error || 'desconocido'));
    disableWatchdog = false;
    return;
  }

  moveModal.style.display = 'none';
});

// recibir progreso y fin (ya lo tienes definidos antes, los dejamos iguales)
window.electronAPI.onMoveProgress((payload) => {
  const msg = payload && payload.file ? `Moviendo: ${payload.file}` : 'Moviendo archivos...';
  const pct = payload && payload.percent ? payload.percent : 0;
  showMoveTooltip(msg, pct);
});

window.electronAPI.onMoveComplete(async (payload) => {
  hideMoveTooltip();
  disableWatchdog = false;
  // same logic you already had: actualizar playlistCache, recargar UI si necesario, notificar
  if (!payload || !Array.isArray(payload.moved)) {
    showProgressNotification('Movida completada', 1);
    return;
  }

  const moved = payload.moved;
  const bySrc = {};
  const byDst = {};
  moved.forEach(m => {
    const src = m.oldPath.substring(0, m.oldPath.lastIndexOf('\\'));
    const dst = m.newPath.substring(0, m.newPath.lastIndexOf('\\'));
    bySrc[src] = bySrc[src] || [];
    bySrc[src].push(m.oldPath);
    byDst[dst] = byDst[dst] || [];
    byDst[dst].push(m.newPath);
  });

  // Eliminar entradas del cache de origen
  for (const src of Object.keys(bySrc)) {
    if (playlistCache[src]) {
      playlistCache[src] = playlistCache[src].filter(entry => !bySrc[src].includes(entry.path));
    }
  }

  // Agregar entradas a cache destino (si existe)
  for (const dst of Object.keys(byDst)) {
    const additions = byDst[dst].map(p => {
      return { name: getNameAndYear_forArray(p), path: p, duration: '0:00' };
    });
    if (playlistCache[dst]) {
      playlistCache[dst] = playlistCache[dst].concat(additions);
      playlistCache[dst].sort((a, b) => a.name.localeCompare(b.name));
    } else {
      playlistCache[dst] = additions;
    }
  }

  try { localStorage.setItem('playlistCache', JSON.stringify(playlistCache)); } catch (e) { console.warn('No se pudo guardar playlistCache'); }

  // refrescar UI si la carpeta actual fue afectada
  const currentFolderKey = deriveFolderFromPath(playlist[0] && playlist[0].path);
  if (currentFolderKey && (bySrc[currentFolderKey] || byDst[currentFolderKey])) {
    if (playlistCache[currentFolderKey]) {
      playlist = playlistCache[currentFolderKey];
      updatePlaylistUI();
    }
  }

  showProgressNotification('Movida completada', 1);
});


const save_us_preload = {
  // Move dialog + move ops
  getMoveTree: async (baseRoot) => {
    try { return await ipcRenderer.invoke('get-move-tree', baseRoot); }
    catch (e) { console.error('getMoveTree error', e); return []; }
  },
  createFolder: async (payload) => {
    try { return await ipcRenderer.invoke('create-folder', payload); }
    catch (e) { console.error('createFolder error', e); return { success: false, error: e.message }; }
  },
  moveFiles: async (payload) => {
    try { return await ipcRenderer.invoke('move-files', payload); }
    catch (e) { console.error('moveFiles error', e); return { success: false, error: e.message }; }
  },
  onMoveProgress: (callback) => {
    ipcRenderer.removeAllListeners('move-progress');
    ipcRenderer.on('move-progress', (event, payload) => callback(payload));
  },
  onMoveComplete: (callback) => {
    ipcRenderer.removeAllListeners('move-complete');
    ipcRenderer.on('move-complete', (event, payload) => callback(payload));
  },
}

// Main.js

const suppressedUntil = new Map(); // folderPath -> timestamp (ms)

// Move helper (intento rename; si falla por EXDEV, copia+unlink)
async function moveItem(src, dst) {
  try {
    await fs.rename(src, dst);
    return;
  } catch (err) {
    // fallback cross-device
    if (err && err.code === 'EXDEV') {
      // Usando streams con fs.promises
      const rs = fs.createReadStream(src);
      const ws = fs.createWriteStream(dst);

      return new Promise((resolve, reject) => {
        rs.on('error', reject);
        ws.on('error', reject);
        ws.on('close', async () => {
          try {
            await fs.unlink(src);
            resolve();
          } catch (e) { reject(e); }
        });
        rs.pipe(ws);
      });
    }
    throw err;
  }
}

// Helper: set suppression for a set of folders durante ms milliseconds
function setSuppressionForFolders(folders, ms = 2500) {
  const until = Date.now() + ms;
  for (const f of folders) suppressedUntil.set(f, until);
}

// Helper: check if a folder is currently suppressed
function isSuppressed(folderPath) {
  const until = suppressedUntil.get(folderPath);
  if (!until) return false;
  if (Date.now() > until) {
    suppressedUntil.delete(folderPath);
    return false;
  }
  return true;
}


// -------------------- move dialog / create folder / move files --------------------

ipcMain.handle('get-move-tree', async (event, baseRootArg) => {
  const baseRoot = baseRootArg || ROOT_YEARS_PATH;
  const result = [];
  try {
    const yearDirs = await fs.readdir(baseRoot, { withFileTypes: true });
    const years = yearDirs.filter(d => d.isDirectory() && /^\d{4}$/.test(d.name)).map(d => d.name);
    for (const year of years) {
      const yearPath = path.join(baseRoot, year);
      const id = String(Number(year) - 2003).padStart(2, '0');
      const candidateNames = [
        `${id}. music.main`,
        `${id}. music.registry.album.package`,
        `${id}. music.registry.base`,
        `${id}. music.theme`,
        `${id}. music.xmas`
      ];

      const nodes = [];
      for (const name of candidateNames) {
        const nodePath = path.join(yearPath, name);
        try {
          await fs.access(nodePath);
          // canCreate = false for .main, .registry.base, .xmas
          const canCreate = !(name.endsWith('.main') || name.endsWith('.registry.base') || name.endsWith('.xmas'));
          const childNode = { name, path: nodePath, canCreate, nodes: [] };

          // if album.package or theme -> include subfolders (directories)
          if (name.endsWith('album.package') || name.endsWith('music.theme')) {
            try {
              const subs = await fs.readdir(nodePath, { withFileTypes: true });
              childNode.nodes = subs.filter(s => s.isDirectory()).map(s => ({ name: s.name, path: path.join(nodePath, s.name), canCreate: true, nodes: [] }));
            } catch (e) { }
          }

          nodes.push(childNode);
        } catch (e) {
          // ausencia -> ignorar
        }
      }

      result.push({ year, path: yearPath, nodes });
    }
  } catch (err) {
    console.error('Error construyendo move-tree:', err);
  }
  return result;
});

ipcMain.handle('create-folder', async (event, { parentPath, folderName }) => {
  try {
    // seguridad: no permitir crear dentro de .main / .registry.base / .xmas
    const lower = parentPath.toLowerCase();
    if (lower.endsWith('.music.main') || lower.endsWith('.music.registry.base') || lower.endsWith('.music.xmas')) {
      return { success: false, error: 'Creación no permitida en esta carpeta' };
    }
    const newPath = path.join(parentPath, folderName);
    await fs.mkdir(newPath);
    return { success: true, path: newPath };
  } catch (err) {
    console.error('Error creando carpeta:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('move-files', async (event, { files, destPath }) => {
  try {
    if (!Array.isArray(files) || files.length === 0) {
      return { success: false, error: 'No files provided' };
    }

    // determinar carpetas afectadas
    const affected = new Set(files.map(f => path.dirname(f)));
    affected.add(destPath);

    // suprimir watchers en estas carpetas (duración proporcional)
    const suppressMs = Math.max(2000, files.length * 300);
    setSuppressionForFolders(Array.from(affected), suppressMs);

    const moved = [];
    const total = files.length;
    for (let i = 0; i < total; i++) {
      const src = files[i];
      const filename = path.basename(src);
      const dst = path.join(destPath, filename);
      try {
        await moveItem(src, dst);
        moved.push({ oldPath: src, newPath: dst });
        event.sender.send('move-progress', { current: i + 1, total, file: src, percent: Math.round(((i + 1) / total) * 100) });
      } catch (err) {
        console.error('Error moviendo archivo:', src, err);
        event.sender.send('move-progress', { current: i + 1, total, file: src, error: err.message, percent: Math.round(((i + 1) / total) * 100) });
      }
    }

    // Pequeña espera para asegurar que FS termine
    setTimeout(() => {
      // levantar supresión
      for (const f of affected) suppressedUntil.delete(f);
      // notificar al renderer que la operación terminó
      event.sender.send('move-complete', { moved, affected: Array.from(affected) });
    }, 300);

    return { success: true, moved };
  } catch (err) {
    console.error('Error en move-files:', err);
    return { success: false, error: err.message };
  }
});


// index

//   <!-- Move Dialog Modal (actualizado con treeview y cancel abajo) -->
//   <div id="moveModal"
//     style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); align-items:center; justify-content:center; z-index:1000;">
//     <div
//       style="background:#fff; width:780px; max-height:80vh; overflow:auto; border-radius:8px; padding:12px; box-shadow:0 6px 30px rgba(0,0,0,0.4);">
//       <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
//         <button id="moveBtnUp" title="Subir carpeta">./</button>
//         <button id="moveBtnNew" title="Crear nueva carpeta">/+ Nuevo</button>
//         <div style="flex:1;"></div>
//       </div>

//       <div id="moveTreeContainer"
//         style="border:1px solid #ddd; padding:8px; height:420px; overflow:auto; font-family:system-ui, monospace;">
//         <!-- Tree (llenado por renderer) -->
//         <div id="moveTreeRoot"></div>
//       </div>

//       <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:12px;">
//         <button id="moveCancelBtn">Cancelar</button>
//         <button id="moveConfirmBtn"
//           style="background:#0b74de; color:#fff; border:none; padding:6px 12px; border-radius:4px;">Mover</button>
//       </div>
//     </div>
//   </div>

//   <!-- Move progress tooltip (mantener igual) -->
//   <div id="moveProgressTooltip"
//     style="display:none; position:fixed; right:18px; bottom:18px; background:#222; color:#fff; padding:10px; border-radius:6px; z-index:1100;">
//     <div id="moveProgressMessage">Moviendo archivos...</div>
//     <div style="width:260px; height:8px; background:#444; border-radius:4px; margin-top:8px;">
//       <div id="moveProgressFill" style="width:0%; height:100%; background:#3fb; border-radius:4px;"></div>
//     </div>
//   </div>

//   <!-- Treeview minimal styles (puedes mover a tu CSS) -->
//   <style>
//     /* move dialog tree styles */
//     #moveTreeRoot ul { list-style:none; padding-left:14px; margin:4px 0; }
//     #moveTreeRoot li { padding:4px 6px; cursor:pointer; display:flex; align-items:center; gap:8px; user-select:none; }
//     #moveTreeRoot li .expander { width:16px; display:inline-block; text-align:center; transform-origin:50% 50%; transition: transform .12s; }
//     #moveTreeRoot li[data-has-children="1"] .expander { color: #666; }
//     #moveTreeRoot li.expanded > .expander { transform: rotate(90deg); }
//     #moveTreeRoot li .label { flex:1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
//     #moveTreeRoot li.selected { background:#e6f7ff; border-radius:4px; }
//     #moveTreeRoot .year-header { font-weight:700; padding:6px 4px; cursor:pointer; display:flex; align-items:center; gap:8px; }
//     #moveTreeRoot .year-children { display:none; margin-left:6px; border-left:1px dashed #eee; padding-left:6px; }
//     #moveTreeRoot .year-children.open { display:block; }
//   </style>


// renderer.js 2025-09-24 discontinued

/** Abrir modal (opcionalmente con lista de archivos a mover) */
async function openMoveDialog(files = []) {
  // Elementos del DOM (sólo una vez)
  moveModalOverlay = document.getElementById('moveModalOverlay');
  moveTreeContainer = document.getElementById('moveTreeContainer');
  moveCurrentPathEl = document.getElementById('moveCurrentPath');
  // btnUp = document.getElementById('btnUp');
  // btnNewFolder = document.getElementById('btnNewFolder');
  moveCancelBtn = document.getElementById('moveCancelBtn');
  moveConfirmBtn = document.getElementById('moveConfirmBtn');

  filesToMove = Array.isArray(files) ? files.slice() : [];

  // Mostrar overlay
  moveModalOverlay.style.display = 'flex';
  moveModalOverlay.removeAttribute('aria-hidden');
  moveModalOverlay.removeAttribute('inert');

  moveConfirmBtn.disabled = true;
  selectedMoveNode = null;

  // Cargar estructura desde main (getPlaylists)
  const data = await window.electronAPI.getPlaylists();

  // Construimos un árbol "root" con años
  const rootNodes = (data.playlists || []).map(y => ({
    name: y.year,
    type: 'year',
    path: `${ROOT_YEARS_PATH}\\${y.year}`,
    nodes: y.nodes || []
  }));

  // agregar nodo Xmas al final
  if (data.xmas) {
    rootNodes.push(data.xmas);
  }

  modalTreeData = {
    name: 'root',
    type: 'root',
    path: ROOT_YEARS_PATH,
    nodes: rootNodes
  };

  // Renderizar el árbol
  renderMoveTree(modalTreeData);

  // Setear ruta actual visual
  moveCurrentPathEl.textContent = ROOT_YEARS_PATH;

  // Eventos del modal
  document.getElementById('moveModalCloseBtn').onclick = closeMoveDialog;
  moveCancelBtn.onclick = closeMoveDialog;

  // btnUp.onclick = () => {
  //   if (!selectedMoveNode) return;
  //   const parent = findParentNode(modalTreeData, selectedMoveNode.path);
  //   if (parent) {
  //     const el = findElementByPath(parent.path);
  //     if (el) {
  //       selectMoveNode(parent, el);
  //       // actualizar ruta visual
  //       moveCurrentPathEl.textContent = parent.path || ROOT_YEARS_PATH;
  //     }
  //   }
  // };

  // Creating new folder
  // btnNewFolder.onclick = async (e) => {
  //   e.stopPropagation();
  //   const parentNode = selectedMoveNode || modalTreeData;
  //   const folderSelected = removePrefixFolder(processPath(parentNode.path));

  //   closeMoveDialog();
  //   const folderNameRaw = await customPrompt('Nombre de la nueva carpeta:', '', false); // Nombre nuevo
  //   if (!folderNameRaw) return;

  //   if (!parentNode) {
  //     showProgressNotification('Selecciona una carpeta válida donde crear la nueva carpeta.', 1, true, 3000)
  //     return;
  //   }

  //   // No permitir carpetas de años ni raiz ni carpetas de registro y xmas
  //   const cantTouchThis = [
  //     '_Internal', 'music.main', 'music.xmas', 'music.registry.base',
  //     ...Array.from({ length: 2025 - 2004 + 1 }, (_, i) => (2004 + i).toString())
  //   ];

  //   if (cantTouchThis.some(part => folderSelected.includes(part))) {
  //     showProgressNotification('No se permite crear carpetas en esta ubicación.', 1, true, 3000)
  //     return;
  //   }

  //   // Si el padre es un nodo "year", calcular prefijo XX.
  //   let finalFolderName = folderNameRaw.trim();
  //   if (parentNode.type === 'year') {
  //     // parentNode.name contiene el año
  //     const y = parseInt(parentNode.name, 10);
  //     if (!isNaN(y)) {
  //       const idx = String(y - 2003).padStart(2, '0');
  //       finalFolderName = `${idx}. ${finalFolderName}`;
  //     }
  //   }

  //   // llamar a main para crear carpeta

  //   const res = await window.electronAPI.createFolder({
  //     parentPath: parentNode.path, folderName: finalFolderName
  //   });
  //   if (!res || !res.success) {
  //     showProgressNotification('No se pudo crear la carpeta: ' + (res && res.error ? res.error : 'Error desconocido'), 1, true, 3000)
  //     return;
  //   }

  //   openMoveDialog();
  // };

  // move confirm
  moveConfirmBtn.onclick = (e) => {
    e.stopPropagation();  // Evita que el evento clic siga propagándose
    if (!selectedMoveNode || !selectedMoveNode.path) return;

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

    // por ahora solo console.log como pediste
    console.log('Mover a: "', selectedMoveNode.path, '" files:', filesToMove);

    selectedMoveNode = null;
    filesWhileRenaming = [];
    filesToMove = []
    closeMoveDialog();
  };
}

function _old_createNodeElement(node) {
  const li = document.createElement('div');
  li.className = 'folder-item';
  li.dataset.type = node.type || 'folder';
  if (node.path) {
    li.dataset.path = node.path;
    console.log('Asignado path:', node.path);
  } else {
    console.log('Nodo sin path:', node);
  }

  // toggle (si tiene hijos)
  const toggle = document.createElement('span');
  toggle.className = 'toggle';
  toggle.textContent = (node.nodes && node.nodes.length) ? '▸' : '';
  li.appendChild(toggle);
  if (node.nodes && node.nodes.length) {
    console.log('Nodo con hijos:', node.nodes.length, 'hijos');
  }

  // label
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = node.name || (node.path ? node.path.split(/[\\/]/).pop() : '(no name)');
  li.appendChild(label);
  console.log('Creado label:', label.textContent);

  // disabled style si no tiene path o si está bloqueado para crear
  if (!node.path) {
    li.classList.add('disabled');
    console.log('Nodo marcado como deshabilitado (sin path)');
  }

  // click
  li.addEventListener('click', (e) => {
    e.stopPropagation();
    console.log('Click en nodo:', label.textContent);

    // Si tiene hijos -> togglear expansión
    if (node.nodes && node.nodes.length) {
      const isOpen = li.getAttribute('data-open') === 'true';
      li.setAttribute('data-open', (!isOpen).toString());
      toggle.textContent = (!isOpen) ? '▾' : '▸';
      console.log((!isOpen ? 'Expandiendo' : 'Colapsando') + ' nodo:', label.textContent);

      // mostrar/ocultar contenedor de hijos
      if (!isOpen) {
        if (!li._childContainer) {
          console.log('Creando contenedor de hijos para:', label.textContent);
          const c = document.createElement('div');
          c.style.paddingLeft = '14px';
          node.nodes.forEach(child => {
            console.log('Añadiendo hijo:', child.name || child.path);
            c.appendChild(createNodeElement(child));
          });
          li._childContainer = c;
          li.appendChild(c);
        } else {
          console.log('Mostrando contenedor existente de hijos para:', label.textContent);
          li._childContainer.style.display = 'block';
        }
      } else {
        if (li._childContainer) {
          console.log('Ocultando contenedor de hijos para:', label.textContent);
          li._childContainer.style.display = 'none';
        }
      }
    }

    // Si el nodo tiene path → seleccionar (si no está bloqueado)
    if (node.path) {
      console.log('Seleccionando nodo:', node.path);
      selectMoveNode(node, li);
    }
  });

  // CONTEXT MENU (clic derecho sobre nodo) -> invocar menú nativo en main
  li.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    console.log('Click derecho en nodo (menú contextual):', node.path);
    window.electronAPI.showMoveContextMenu({ path: node.path });
  });

  return li;
}

/** Función robusta: refrescar el modal tree sin cerrar el diálogo */
async function refreshMoveTreePreservingState() {
  if (!moveTreeContainer) return;
  // Guardar estado actual
  const prevExpanded = Array.from(moveTreeState.expandedPaths);
  const prevSelected = moveTreeState.selectedPath;

  // Reconsultar estructura
  const data = await window.electronAPI.getPlaylists();

  const rootNodes = (data.playlists || []).map(y => ({
    name: y.year,
    type: 'year',
    path: `${ROOT_YEARS_PATH}\\${y.year}`,
    nodes: y.nodes || []
  }));
  if (data.xmas) rootNodes.push(data.xmas);

  modalTreeData = { name: 'root', type: 'root', path: ROOT_YEARS_PATH, nodes: rootNodes };

  // Limpiar estado expandidos temporales y re-crear contenedor
  moveTreeState.expandedPaths = new Set();
  moveTreeState.selectedPath = null;
  moveTreeContainer.innerHTML = '';

  // Render inicial (todo colapsado)
  const rootWrapper = document.createElement('div');
  modalTreeData.nodes.forEach(yearNode => {
    const el = createNodeElement(yearNode);
    rootWrapper.appendChild(el);
  });
  moveTreeContainer.appendChild(rootWrapper);

  // Reaplicar expansiones por cada expanded path guardado:
  for (const ep of prevExpanded) {
    if (!ep) continue;
    const chain = getAncestorPathChain(modalTreeData, ep);
    if (chain && chain.length) {
      await expandPathChain(chain);
      // marcar este ep como expandido en el estado
      moveTreeState.expandedPaths.add(ep);
    }
  }

  // Re-aplicar selección
  if (prevSelected) {
    const prevEl = findElementByPath(prevSelected);
    if (prevEl) {
      // seleccionar visualmente (sin cambiar expandedPaths)
      const prev = moveTreeContainer.querySelector('.folder-item.selected');
      if (prev) prev.classList.remove('selected');
      prevEl.classList.add('selected');
      const nodeObj = findNodeByPath(modalTreeData, prevSelected);
      if (nodeObj) {
        selectedMoveNode = nodeObj;
        moveTreeState.selectedPath = prevSelected;
        moveCurrentPathEl.textContent = prevSelected;
        moveConfirmBtn.disabled = !(prevSelected && prevSelected.length > 0);
      }
    } else {
      // si no existe (por ejemplo fue renombrado o eliminado), limpiar selección
      selectedMoveNode = null;
      moveTreeState.selectedPath = null;
      moveConfirmBtn.disabled = true;
    }
  } else {
    moveConfirmBtn.disabled = true;
  }
}

// GESTIÓN de acciones del menú nativo (main -> renderer)
window.electronAPI.onMoveTreeAction(async (action) => {
  if (!action || !action.type) return;
  const { type, path: nodePath } = action;

  if (type === 'createFolder') {
    // prompt para nombre
    // closeMoveDialog();
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

    // Refrescar el árbol en caliente y seleccionar la creada
    await refreshMoveTreePreservingState();
    // intentar seleccionar la creada
    const createdPath = res.path;
    if (createdPath) {
      // expandir ancestros y seleccionar
      const chain = getAncestorPathChain(modalTreeData, createdPath);
      if (chain && chain.length) {
        await expandPathChain(chain);
      }
      const createdEl = findElementByPath(createdPath);
      if (createdEl) {
        createdEl.click(); // selecciona (click se encarga)
      }
    }

    // openMoveDialog(filesWhileRenaming);
    return;
  }

  if (type === 'renameFolder') {
    if (!nodePath) return;
    // sacar nombre actual
    // closeMoveDialog();
    const currentBasename = nodePath.split(/[\\/]/).pop();
    const newName = await customPrompt('Nuevo nombre de carpeta:', currentBasename);
    if (!newName) return;
    const result = await window.electronAPI.renameFolder({ oldPath: nodePath, newName: newName.trim() });
    if (!result || !result.success) {
      showProgressNotification('No se pudo renombrar: ' + (result && result.error ? result.error : 'Error'), 1, true, 4000);
      return;
    }

    // Refrescar y seleccionar el nuevo path
    await refreshMoveTreePreservingState();
    const newPath = result.newPath || result.path;
    if (newPath) {
      // expandir ancestros y seleccionar newPath
      const chain = getAncestorPathChain(modalTreeData, newPath);
      if (chain && chain.length) {
        await expandPathChain(chain);
      }
      const newEl = findElementByPath(newPath);
      if (newEl) newEl.click();
    }
    // openMoveDialog(filesWhileRenaming);
    return;
  }
});


// renderer.js 2025-09-25 19:56:00

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

/**
 * Ejecutar las operaciones preparadas (ETAPA 3) y sincronizar UI/cache.
 */
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
      alert(`Error moviendo archivos: ${res.error}`);
    }
  }

  // // 4) Actualizar playlist local quitando los archivos movidos
  // if (moved.length > 0 && Array.isArray(playlist)) {
  //   const movedSet = new Set(moved.map(normalizePathForCompare));
  //   playlist = playlist.filter(item => !movedSet.has(normalizePathForCompare(item.path || item)));
  //   updatePlaylistUI();
  // }

  // // 5) Actualizar cache de la carpeta actual (si existe)
  // try {
  //   if (currentOpenFolder && typeof currentOpenFolder === 'string') {
  //     const cacheKey = String(currentOpenFolder);
  //     playlistCache[cacheKey] = playlist;
  //     try { localStorage.setItem('playlistCache', JSON.stringify(playlistCache)); } catch (e) {
  //       console.warn('No se pudo guardar playlistCache:', e);
  //     }
  //   }
  // } catch (e) {
  //   console.warn('Error al actualizar cache después del move:', e);
  // }

  // ------------------- reemplazar por este bloque -------------------
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
      await loadPlaylistFromArray(songsArray, currentOpenFolder || null, true, "afterMoving"); // force refresh
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
      if (songsArrayFallback.length) await loadPlaylistFromArray(songsArrayFallback, currentOpenFolder || null, true, "aftherMoveplaylistVoid");
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

  // Opcional: si quieres forzar recarga del folder en UI:
  // if (currentOpenFolder) { await loadPlaylistFromFolder(currentOpenFolder); }

  return { moved, failed };
}


// const copyBtn = document.getElementById('copyBtn');

// copyBtn.addEventListener('click', () => {
//   if (!playlist.length) return;
//   const currentSong = playlist[currentSongIndex];
//   if (!currentSong) return;

//   const filename = currentSong.name.replace(/\.[^/.]+$/, "");  // Extraer nombre sin extensión

//   navigator.clipboard.writeText(filename).then(() => {
//     console.log(`Copied: ${filename}`);
//   });
// });