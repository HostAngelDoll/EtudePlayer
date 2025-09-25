Exactamente ✅, cuando trabajas con **múltiples modales (anidados o encadenados)** en HTML o en una app Electron, **el orden de apertura, foco y cierre es clave** para que:

* La experiencia sea fluida y accesible.
* El usuario no se pierda.
* Las tecnologías asistidas (como lectores de pantalla) no se confundan.

---

## 📋 Orden correcto para trabajar con modales encadenados

### 🟢 1. Abrir el primer modal

```html
<div id="modal1" role="dialog" aria-modal="true" aria-labelledby="modal1Title">
  <h2 id="modal1Title">Modal 1</h2>
  <p>Contenido del primer modal</p>
  <button onclick="openModal2()">Abrir Modal 2</button>
</div>
```

* Solo este modal tiene `aria-modal="true"` al inicio.
* Le das foco al primer botón o elemento interactivo.

---

### 🟢 2. Abrir el segundo modal encima

```html
<div id="modal2" role="dialog" aria-modal="true" aria-labelledby="modal2Title" style="display: none;">
  <h2 id="modal2Title">Modal 2</h2>
  <p>Este aparece encima del primero</p>
  <button onclick="closeModal2()">Cerrar Modal 2</button>
</div>
```

Cuando lo abres:

* Pones `aria-hidden="true"` al primer modal (`modal1`).
* Pones `aria-modal="true"` en el segundo.
* Mueves el foco a `modal2`.

```javascript
function openModal2() {
  const modal1 = document.getElementById('modal1');
  const modal2 = document.getElementById('modal2');

  modal1.setAttribute('aria-hidden', 'true');
  modal2.style.display = 'block';
  modal2.querySelector('button').focus();
}
```

---

### 🔴 3. Cerrar el segundo modal y restaurar el primero

Cuando cierras `modal2`, debes:

* Ocultar `modal2`.
* Quitarle `aria-hidden` a `modal1`.
* Devolverle `aria-modal="true"` si lo quitaste.
* Restaurar el foco a donde estaba.

```javascript
function closeModal2() {
  const modal1 = document.getElementById('modal1');
  const modal2 = document.getElementById('modal2');

  modal2.style.display = 'none';
  modal1.removeAttribute('aria-hidden');
  modal1.querySelector('button').focus();
}
```

---

## 🧠 Clave para recordar

| Paso | Acción                                              |
| ---- | --------------------------------------------------- |
| 1️⃣  | Abre `modal1` con `aria-modal="true"`               |
| 2️⃣  | Abre `modal2`, oculta el anterior con `aria-hidden` |
| 3️⃣  | Cierra `modal2`, restaura `modal1`, y su foco       |

---

## ✅ Bonus: ¿Y si usas múltiples modales regularmente?

Te conviene hacer una **función genérica para gestionar modales** (stack, foco, atributos ARIA). Puedo ayudarte a crearla si quieres una solución reusable.

¿Quieres que te prepare una versión reutilizable en JavaScript vanilla para gestionar múltiples modales en HTML/Electron?
