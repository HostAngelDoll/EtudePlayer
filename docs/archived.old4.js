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
