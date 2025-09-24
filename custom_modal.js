function customPrompt(message, defaultValue = "") {
  return new Promise((resolve) => {
    // Crear elementos del DOM

    const modal = document.createElement("div");
    modal.style.display = "flex";
    modal.style.position = "fixed";
    modal.style.top = "0";
    modal.style.left = "0";
    modal.style.width = "100%";
    modal.style.height = "100%";
    modal.style.background = "rgba(0, 0, 0, 0.5)";
    modal.style.justifyContent = "center";
    modal.style.alignItems = "center";
    modal.style.zIndex = "11000";

    const content = document.createElement("div");
    content.style.background = "#fff";
    content.style.padding = "20px";
    content.style.borderRadius = "8px";
    content.style.minWidth = "300px";

    const messageEl = document.createElement("div");
    messageEl.textContent = message;
    messageEl.style.fontSize = "16px";
    messageEl.style.fontWeight = "bold";

    const input = document.createElement("input");
    input.type = "text";
    input.value = defaultValue;
    input.id = "inputNewString"
    input.style.pointerEvents = "auto";
    input.style.width = "100%";
    input.style.marginTop = "10px";
    input.style.zIndex = "11001";
    input.tabIndex = 0;

    const buttons = document.createElement("div");
    buttons.style.marginTop = "15px";
    buttons.style.textAlign = "right";

    const btnCancel = document.createElement("button");
    btnCancel.textContent = "Cancelar";
    btnCancel.style.marginLeft = "10px";
    btnCancel.style.zIndex = "11002";

    const btnOk = document.createElement("button");
    btnOk.textContent = "OK";
    btnOk.style.marginLeft = "10px";
    btnOk.style.zIndex = "11002";

    buttons.appendChild(btnCancel);
    buttons.appendChild(btnOk);

    content.appendChild(messageEl);
    content.appendChild(input);
    content.appendChild(buttons);
    modal.appendChild(content);
    document.body.appendChild(modal);

    // Dar foco al input después de renderizar
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