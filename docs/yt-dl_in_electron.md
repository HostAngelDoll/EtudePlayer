# Arquitectura para buscador de videos con Flask y Electron.js

## 1. Servidor Flask (Python)

```python
import flask
from flask import request, jsonify

app = flask.Flask(__name__)

# Variables globales para control de estado
lista_videos_totales = []
consulta_actual = ""
pagina_actual = 1
resultados_por_pagina = 10

def buscar_videos(consulta, pagina):
    # Usar yt-dl.py o API para buscar videos según consulta, página y límite
    videos = obtener_videos_desde_fuente(consulta, pagina, resultados_por_pagina)
    return videos

@app.route('/buscar', methods=['POST'])
def buscar():
    global consulta_actual, pagina_actual, lista_videos_totales
    datos = request.get_json()
    consulta_actual = datos.get("consulta", "")
    pagina_actual = 1
    lista_videos_totales = buscar_videos(consulta_actual, pagina_actual)
    return jsonify(lista_videos_totales)

@app.route('/cargar_mas', methods=['POST'])
def cargar_mas():
    global pagina_actual, lista_videos_totales
    pagina_actual += 1
    nuevos_videos = buscar_videos(consulta_actual, pagina_actual)
    lista_videos_totales.extend(nuevos_videos)
    return jsonify(nuevos_videos)

if __name__ == '__main__':
    app.run(host='localhost', port=5000)
```

---

## 2. Aplicación Electron (JavaScript)

```javascript
const { spawn } = require('child_process');
const axios = require('axios');

let pythonProcess;

// Al iniciar la app, arrancar el servidor Flask
function iniciarServidorPython() {
    pythonProcess = spawn('python', ['ruta/al/script_flask.py']);

    pythonProcess.stdout.on('data', (data) => {
        console.log(`Python: ${data}`);
    });

    pythonProcess.stderr.on('data', (data) => {
        console.error(`Python Error: ${data}`);
    });

    pythonProcess.on('close', (code) => {
        console.log(`Python proceso terminó con código ${code}`);
    });
}

// Función para buscar videos
async function buscarVideos(consulta) {
    try {
        const response = await axios.post('http://localhost:5000/buscar', { consulta });
        mostrarVideos(response.data);
    } catch (error) {
        console.error('Error buscando videos:', error);
    }
}

// Función para cargar más videos
async function cargarMas() {
    try {
        const response = await axios.post('http://localhost:5000/cargar_mas');
        agregarVideos(response.data);
    } catch (error) {
        console.error('Error cargando más videos:', error);
    }
}

// Eventos botones (ejemplo)
document.getElementById('botonBuscar').addEventListener('click', () => {
    const consulta = document.getElementById('inputBusqueda').value;
    buscarVideos(consulta);
});

document.getElementById('botonCargarMas').addEventListener('click', () => {
    cargarMas();
});

// Funciones para mostrar y agregar videos en la UI
function mostrarVideos(videos) {
    // limpiar lista y mostrar nuevos videos
}

function agregarVideos(videos) {
    // agregar videos a la lista existente
}

// Lanza el servidor Python cuando arranca la app
iniciarServidorPython();
```

---

## Flujo general

1. Electron inicia y lanza el servidor Flask (Python).
2. El usuario ingresa la consulta y hace click en "buscar".
3. Electron envía POST a `/buscar` en Flask.
4. Flask devuelve primeros 10 videos.
5. Electron muestra los videos.
6. Usuario hace click en "cargar más".
7. Electron envía POST a `/cargar_mas`.
8. Flask devuelve siguientes 10 videos.
9. Electron agrega los videos a la lista en la UI.

