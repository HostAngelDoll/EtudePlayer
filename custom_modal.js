function customPrompt(message, defaultValue = "") {
  return new Promise((resolve) => {
    const modal = document.getElementById("renameModal");
    const msg = document.getElementById("renameMessage");
    const input = document.getElementById("renameInput");
    const btnOk = document.getElementById("renameOk");
    const btnCancel = document.getElementById("renameCancel");

    msg.textContent = message;
    input.value = defaultValue;
    modal.style.display = "flex";
    input.focus();

    function cleanup() {
      btnOk.removeEventListener("click", onOk);
      btnCancel.removeEventListener("click", onCancel);
      input.removeEventListener("keydown", onKey);
      modal.style.display = "none";
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
