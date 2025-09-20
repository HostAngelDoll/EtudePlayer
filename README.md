# EtudePlayer

## Descripción
EtudePlayer es una aplicación para el estudio de escucha de audio y visualización de video. Está construida principalmente con tecnologías web (HTML, CSS, JavaScript) y cuenta con scripts en Python para tareas auxiliares.

La aplicación permite reproducir y analizar pistas de audio y video con una interfaz gráfica simple y funcional.

## Características principales
- Reproducción y visualización de audio y video.
- Interfaz de usuario basada en tecnologías web.
- Scripts en Python para automatización y sincronización con Git.
- Uso de librerías como WaveSurfer.js para análisis de audio.

## Scripts en Python

El proyecto incluye dos scripts en Python para automatizar tareas comunes:

- **ejecute.py**  
  Este script inicia la aplicación ejecutando `npm start` desde la ruta local del proyecto. Es útil para lanzar la app desde Python sin necesidad de abrir manualmente la terminal.

- **git_sync.py**  
  Automatiza el flujo básico de Git:
  1. Añade todos los cambios al área de staging (`git add .`)
  2. Realiza un commit con un mensaje personalizado.
  3. Hace push de los cambios al repositorio remoto en GitHub.
  
  También se puede activar la línea para hacer `git pull` si es necesario actualizar el repositorio local antes de subir cambios.

> **Nota:** Asegúrate de modificar las rutas y el mensaje del commit según tu entorno y necesidades antes de ejecutar estos scripts.


## Instalación

1. Clona el repositorio:
   ```bash
   git clone https://github.com/HostAngelDoll/EtudePlayer.git
   cd EtudePlayer

## Licencia

Este proyecto está bajo la licencia MIT. Consulta el archivo LICENSE para más detalles.
