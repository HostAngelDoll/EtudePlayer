Object.defineProperty(window, 'alert', {
  value: function() { console.error("alert bloqueado."); },
  writable: false,
  configurable: false,
});

Object.defineProperty(window, 'prompt', {
  value: function() { console.error("prompt bloqueado."); return null; },
  writable: false,
  configurable: false,
});

Object.defineProperty(window, 'confirm', {
  value: function() { console.error("confirm bloqueado."); return false; },
  writable: false,
  configurable: false,
});

/**
 * Muestra un custom prompt con input OKCancel para sustituir Prompt() por bloqueo de ElectronJS
 * @param {string} message 
 * @param {string} defaultValue 
 * @param {boolean} [isSecondary=false] solo si es un modal secundario
 * @returns Regresa un nombre nuevo
 */

function customPrompt(message, defaultValue = "", isSecondary = false) {
  return new Promise((resolve) => {
    // ✅ Cargar el CSS dinámicamente si aún no se ha cargado
    const cssId = 'customPromptCSS';
    if (!document.getElementById(cssId)) {
      const head = document.head;
      const link = document.createElement('link');
      link.id = cssId;
      link.rel = 'stylesheet';
      link.type = 'text/css';
      link.href = 'css/input_modal.css'; // 🔁 Ajusta la ruta según tu estructura
      head.appendChild(link);
    }

    const mainOverlay = document.getElementById("moveModalOverlay");

    if (isSecondary && mainOverlay) {
      mainOverlay.setAttribute("aria-hidden", "true");
      mainOverlay.setAttribute("inert", "");
    }

    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", message);
    modal.className = "custom-prompt-overlay";

    const content = document.createElement("div");
    content.className = "custom-prompt-content";
    content.setAttribute("role", "document");

    const messageEl = document.createElement("div");
    messageEl.className = "custom-prompt-message";
    messageEl.textContent = message;
    messageEl.id = "prompt-message";

    const input = document.createElement("input");
    input.type = "text";
    input.value = defaultValue;
    input.id = "inputNewString";
    input.className = "custom-prompt-input";
    input.spellcheck = false;
    input.setAttribute("aria-labelledby", "prompt-message");
    input.tabIndex = 0;

    const buttons = document.createElement("div");
    buttons.className = "custom-prompt-buttons";

    const btnCancel = document.createElement("button");
    btnCancel.textContent = "Cancelar";

    const btnOk = document.createElement("button");
    btnOk.textContent = "OK";

    buttons.appendChild(btnCancel);
    buttons.appendChild(btnOk);

    content.appendChild(messageEl);
    content.appendChild(input);
    content.appendChild(buttons);
    modal.appendChild(content);
    document.body.appendChild(modal);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        input.focus();
        input.select();
        if (document.activeElement !== input) {
          console.warn("Foco no aplicado, reintentando...");
          setTimeout(() => {
            input.focus();
            input.select();
          }, 100);
        }
      });
    });

    function cleanup() {
      btnOk.removeEventListener("click", onOk);
      btnCancel.removeEventListener("click", onCancel);
      input.removeEventListener("keydown", onKey);
      document.body.removeChild(modal);

      if (mainOverlay && isSecondary) {
        mainOverlay.removeAttribute("aria-hidden");
        mainOverlay.removeAttribute("inert");
      }
    }

    function onOk() {
      const val = input.value.trim();
      cleanup();
      resolve(val || null);
    }

    function onCancel() {
      cleanup();
      resolve(null);
    }

    function onKey(e) {
      if (e.key === "Enter") onOk();
      if (e.key === "Escape") onCancel();
    }

    btnOk.addEventListener("click", onOk);
    btnCancel.addEventListener("click", onCancel);
    input.addEventListener("keydown", onKey);
  });
}