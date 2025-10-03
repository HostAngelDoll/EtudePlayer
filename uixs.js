// Toggle para mostrar/ocultar el playbackbar
document.getElementById('togglePlayback').addEventListener('click', function () {
    const playbackBar = document.getElementById('playbackBar');
    const mainContent = document.getElementById('main-program');
    playbackBar.classList.toggle('active');

    // Ajustar la altura del contenido principal
    const playbackHeight = playbackBar.classList.contains('active') ? playbackBar.offsetHeight : 0;
    mainContent.style.paddingBottom = playbackHeight.toString() + 'px';

    // Cambiar el icono según el estado
    // const icon = this.querySelector('.icon');
    if (playbackBar.classList.contains('active')) {
        // icon.classList.remove('icon-play');
        // icon.classList.add('icon-play');
        this.innerHTML = '<i class="fa fa-play-circle" aria-hidden="true"></i>';
    } else {
        // icon.classList.remove('icon-pause');
        // icon.classList.add('icon-play');
        this.innerHTML = '<i class="fa fa-play-circle" aria-hidden="true"></i>';
    }

});


// -----------------------------------------------------------------------------------
// Cambiar vista al hacer clic en los elementos de la activitybar
// -----------------------------------------------------------------------------------

const activityItems = document.querySelectorAll('.activitybar-item');
activityItems.forEach(item => {
    item.addEventListener('click', function () {
        // Remover clase active de todos los elementos
        activityItems.forEach(el => el.classList.remove('active'));
        // Agregar clase active al elemento clickeado
        this.classList.add('active');

        // Aquí puedes agregar lógica para cambiar la vista según el data-view
        const view = this.getAttribute('data-view');
        console.log('Cambiando a vista:', view);
    });
});


// -----------------------------------------------------------------------------------
// Sistema de pestañas
// -----------------------------------------------------------------------------------

const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

tabs.forEach(tab => {
    tab.addEventListener('click', function () {
        const tabId = this.getAttribute('data-tab');

        // Remover clase active de todas las pestañas y contenidos
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        // Agregar clase active a la pestaña clickeada y su contenido
        this.classList.add('active');
        document.getElementById(tabId).classList.add('active');
    });

    // Cerrar pestaña
    const closeBtn = tab.querySelector('.tab-close');
    closeBtn.addEventListener('click', function (e) {
        e.stopPropagation(); // Evitar que el click también active la pestaña

        // Si la pestaña está activa, activar otra antes de cerrarla
        // if (tab.classList.contains('active')) {
        //     const allTabs = Array.from(tabs);
        //     const currentIndex = allTabs.indexOf(tab);
        //     const nextTab = allTabs[currentIndex + 1] || allTabs[currentIndex - 1];

        //     if (nextTab) {
        //         nextTab.click();
        //     }
        // }

        // // Eliminar la pestaña y su contenido
        // tab.remove();
        // const tabContent = document.getElementById(tab.getAttribute('data-tab'));
        // if (tabContent) {
        //     tabContent.remove();
        // }
    });
});