import subprocess
import os

# Ruta de tu proyecto (carpeta donde tienes el repositorio Git)
ruta_proyecto = r"E:\__Lab\EtudePlayer"  # Cambia esto a la ruta de tu proyecto

# -------------------------------------------------------
# Mensaje del commit (cambiar antes de ejecutar)

mensaje_commit = "agregado de documentacion 2025-09-17 16:43"  # Cambia este mensaje según lo que necesites

# -------------------------------------------------------

# Función para ejecutar comandos en el terminal
def ejecutar_comando(comando):
    """ Ejecuta un comando en el terminal y devuelve la salida """
    proceso = subprocess.Popen(comando, stdout=subprocess.PIPE, stderr=subprocess.PIPE, shell=True)
    salida, error = proceso.communicate()
    if proceso.returncode != 0:
        print(f"Error: {error.decode()}")
    else:
        print(f"Salida: {salida.decode()}")

# Cambiar al directorio del proyecto
os.chdir(ruta_proyecto)

# 1. Añadir todos los archivos al staging area
print("Añadiendo archivos al staging area...")
ejecutar_comando("git add .")

# 2. Hacer commit de los cambios
print("Haciendo commit...")
comando_commit = f"git commit -m \"{mensaje_commit}\""
ejecutar_comando(comando_commit)

# 3. Hacer push de los cambios al repositorio remoto
print("Haciendo push a GitHub...")
ejecutar_comando("git push")

# 4. (Opcional) Si quieres hacer pull antes para obtener cambios desde el repositorio remoto
# print("Haciendo pull de los cambios...")
# ejecutar_comando("git pull")
