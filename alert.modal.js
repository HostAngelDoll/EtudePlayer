function customAlert(texto='') {
    // Crear overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay-alert';

    // Crear contenido del modal
    const modal = document.createElement('div');
    modal.className = 'modal-content-alert';

    // Crear textarea solo lectura
    const textarea = document.createElement('textarea');
    textarea.className = 'readonly-textarea-alert';
    textarea.readOnly = true;
    textarea.value = texto;

    // Bloquear escritura y edición
    textarea.addEventListener('keydown', e => e.preventDefault());
    textarea.addEventListener('paste', e => e.preventDefault());
    textarea.addEventListener('cut', e => e.preventDefault());

    // Seleccionar texto al hacer clic
    textarea.addEventListener('click', () => {
        textarea.select();
    });

    // Crear botón OK
    const okButton = document.createElement('button');
    okButton.textContent = 'OK';
    okButton.onclick = () => document.body.removeChild(overlay);

    // Footer para alinear el botón a la derecha
    const footer = document.createElement('div');
    footer.className = 'modal-footer-alert';
    footer.appendChild(okButton);

    // Armar el modal
    modal.appendChild(textarea);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}